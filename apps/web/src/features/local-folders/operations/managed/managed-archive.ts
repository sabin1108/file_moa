import { z } from "zod";
import { MANAGED_LIMITS, parseManagedManifest, type ManagedManifest, type ManagedKind } from "./managed-files";
import { recoveryIdSchema } from "../../recovery/recovery-vault-rules";
import { BackupDirectory } from "../../recovery/backup/recovery-backup-storage";
import { readVaultIdentity } from "../../recovery/recovery-vault";
import { assertVaultLocation } from "../../recovery/recovery-vault-location";
import type { ConnectionOwner, FolderHandle } from "../../types";
import type { ManagedHash } from "./managed-tree";
import { openSourceDirectory } from "../../source-directory";

export type ManagedContext = {
  root: FolderHandle;
  vault: FolderHandle;
  owner: ConnectionOwner;
  check: () => void;
  budget?: {
    bytes: number;
    limit: number
  }
};

export type ManagedArchiveView = Readonly<{
  id: string;
  kind: ManagedKind;
  time: string;
  roots: readonly (readonly string[])[];
  completed: boolean;
  preserved: boolean;
}>;

const preservedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: recoveryIdSchema,
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/u)
});
const stoppedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: recoveryIdSchema,
  phase: z.enum(["completed", "cancelled", "error"]),
  status: z.enum(["not-run", "uncertain", "verified"]),
  copied: z.number().int().min(0).max(500),
  removed: z.number().int().min(0).max(500),
  preserved: z.boolean(),
  issue: z.string().max(80).nullable()
});

export async function assertManagedVault(context: ManagedContext, expectedId?: string) {
  context.check();

  const result = await readVaultIdentity(context.vault, context.owner, context.check);

  if (result.status !== "ready" || (expectedId && result.identity.vaultId !== expectedId)) throw Error("managed-vault-changed");

  await assertVaultLocation(context.vault, [context.root], context.check);
  context.check();

  return result.identity.vaultId;
}

export async function readManagedJson(
  store: BackupDirectory,
  name: string,
  check: () => void,
  budget?: {
    bytes: number;
    limit: number
  }) {
  const { file } = await store.read(name);

  check();

  if (file.size > MANAGED_LIMITS.manifestBytes) throw Error("managed-limit");

  if (budget) {
    if (budget.bytes + file.size > budget.limit) throw Error("managed-list-limit");

    budget.bytes += file.size;
  }

  const bytes = await file.arrayBuffer();

  check();

  if (bytes.byteLength !== file.size) throw Error("managed-changed");

  return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown, file };
}

export async function openManagedArchive(context: ManagedContext, id: string, hash: ManagedHash, requirePreserved = true) {
  if (!recoveryIdSchema.safeParse(id).success) throw Error("managed-archive-invalid");

  const vaultId = await assertManagedVault(context);
  const current = async () => {
    await assertManagedVault(context, vaultId);
  };
  const store = await BackupDirectory.open(context.vault, `moa-managed-${id}`, context.check, current);
  const raw = await readManagedJson(store, "prepared.json", context.check, context.budget);
  const manifest = parseManagedManifest(raw.value);

  if (!manifest || manifest.operationId !== id || manifest.vaultId !== vaultId
    || manifest.owner.userId !== context.owner.userId
    || manifest.owner.workspaceId !== context.owner.workspaceId) throw Error("managed-archive-invalid");

  let preserved = false;

  try {
    const rawMarker = await readManagedJson(store, "item-0000-verified.json", context.check, context.budget);
    const marker = preservedSchema.safeParse(rawMarker.value);

    preserved = marker.success && marker.data.operationId === id && marker.data.manifestSha256 === await hash(raw.file);
    context.check();
  } catch (error) {
    context.check();

    if (!(error instanceof Error && error.name === "NotFoundError")) throw error;
  }

  if (requirePreserved && !preserved) throw Error("managed-archive-incomplete");

  return { store, manifest, preserved, vaultId, current };
}

export async function readManagedArchiveList(context: ManagedContext, hash: ManagedHash) {
  context = { ...context, budget: { bytes: 0, limit: 8 * 1024 * 1024 } };
  await assertManagedVault(context);

  const items: ManagedArchiveView[] = [];
  let scanned = 0;
  let unreadable = 0;
  let truncated = false;

  for await (const entry of context.vault.values()) {
    context.check();

    if (++scanned > 500 || items.length + unreadable >= 100) {
      truncated = true;

      break;
    }

    if (entry.kind !== "directory" || !entry.name.startsWith("moa-managed-")) continue;

    try {
      const id = entry.name.slice("moa-managed-".length);
      const archive = await openManagedArchive(context, id, hash, false);
      let completed = false;

      try {
        const rawStop = await readManagedJson(archive.store, "stopped.json", context.check, context.budget);
        const stop = stoppedSchema.safeParse(rawStop.value);

        completed = stop.success && stop.data.operationId === id && stop.data.phase === "completed"
          && stop.data.status === "verified"
          && stop.data.preserved
          && stop.data.issue === null;

        if (completed) {
          const parent = await openSourceDirectory(context.root, archive.manifest.historyParent, context.check);
          const history = await parent.getDirectoryHandle(".moa-history", { create: false });
          const pair = await BackupDirectory.open(history, `moa-managed-${id}`, context.check, async () => {
            const latestParent = await openSourceDirectory(context.root, archive.manifest.historyParent, context.check);
            const latest = await latestParent.getDirectoryHandle(".moa-history", { create: false });

            if (!await parent.isSameEntry(latestParent) || !await history.isSameEntry(latest)) throw Error("managed-record-changed");

            context.check();
          });

          for (const name of ["prepared.json", "item-0000-verified.json", "stopped.json"]) {
            const left = await readManagedJson(archive.store, name, context.check, context.budget);
            const right = await readManagedJson(pair, name, context.check, context.budget);

            if (JSON.stringify(left.value) !== JSON.stringify(right.value)) completed = false;
          }
        }
      } catch (error) {
        context.check();
        completed = false;

        if (error instanceof Error
          && (["NotAllowedError", "SecurityError", "AbortError"].includes(error.name) || error.message === "managed-list-limit")) throw error;
      }

      items.push({
        id,
        kind: archive.manifest.kind,
        roots: archive.manifest.roots,
        time: archive.manifest.createdAt,
        completed,
        preserved: archive.preserved
      });
    } catch (error) {
      context.check();

      if (error instanceof Error && error.message === "managed-list-limit") {
        truncated = true;

        break;
      }

      if (error instanceof Error && ["NotAllowedError", "SecurityError", "AbortError"].includes(error.name)) throw error;

      unreadable++;
    }
  }

  return { items: items.sort((left, right) => right.time.localeCompare(left.time)), unreadable, truncated };
}

export async function createManagedArchive(context: ManagedContext, manifest: ManagedManifest, historyParentPath: readonly string[]) {
  if (!parseManagedManifest(manifest)) throw Error("managed-archive-invalid");

  const parents = async () => {
    await assertManagedVault(context, manifest.vaultId);
  };
  const store = await BackupDirectory.create(context.vault, `moa-managed-${manifest.operationId}`, context.check, parents);
  const parent = await openSourceDirectory(context.root, historyParentPath, context.check);
  const history = await parent.getDirectoryHandle(".moa-history", { create: true });

  context.check();

  const historyCurrent = async () => {
    await parents();

    const latestParent = await openSourceDirectory(context.root, historyParentPath, context.check);
    const latestHistory = await latestParent.getDirectoryHandle(".moa-history", { create: false });

    if (!await parent.isSameEntry(latestParent) || !await history.isSameEntry(latestHistory)) throw Error("managed-record-changed");

    context.check();
  };
  const paired = await BackupDirectory.create(
    history,
    `moa-managed-${manifest.operationId}`,
    context.check,
    historyCurrent
  );
  const handles: {
    name: string;
    body: Blob;
    handle: FileSystemFileHandle;
    paired?: FileSystemFileHandle
  }[] = [];
  const write = async (name: string, body: Blob) => {
    const handle = await store.write(name, body);
    const second = name.endsWith(".json") ? await paired.write(name, body) : undefined;

    handles.push({ name, body, handle, paired: second });

    return handle;
  };
  const audit = async (hash: ManagedHash, payload?: string) => {
    for (const record of handles) {
      if (record.name.endsWith(".bin") && payload && record.name !== payload) continue;

      const fresh = await store.read(record.name, record.handle);

      context.check();

      if (fresh.file.size !== record.body.size) throw Error("managed-archive-changed");

      if (record.name.endsWith(".bin")) {
        const node = manifest.nodes.find(node => `${node.payload}.bin` === record.name);

        if (!node || await hash(fresh.file) !== node.sha256) throw Error("managed-archive-changed");
      } else if (await fresh.file.text() !== await record.body.text()) throw Error("managed-archive-changed");

      if (record.paired) {
        const second = await paired.read(record.name, record.paired);

        if (second.file.size !== record.body.size || await second.file.text() !== await record.body.text()) throw Error("managed-record-changed");
      }

      context.check();
    }
  };

  return { store, write, audit };
}

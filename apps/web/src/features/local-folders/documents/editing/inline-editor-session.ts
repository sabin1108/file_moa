import { readManagedEdit, prepareManagedOperation, type EditBaseline } from "../../operations/managed/managed-inspection";
import { executeManagedOperation } from "../../operations/managed/managed-execution";
import { assertManagedVault, openManagedArchive, type ManagedContext } from "../../operations/managed/managed-archive";
import { createCopyHasher } from "../../content/copy-hash";
import { encodeEditedText, writeVerifiedText } from "./verified-text-writer";
import { BackupDirectory } from "../../recovery/backup/recovery-backup-storage";
import { openSourceDirectory } from "../../source-directory";
import type { EditorCheckpoint } from "../../workflow/workflow-drafts";

type Proof = {
  baseline: EditBaseline;
  context: ManagedContext;
  backupId?: string;
  payload?: string;
  blocked: boolean
};

export class InlineEditorSession {
  private proof: Proof | null = null;
  private sequence = 0;
  constructor(private readonly context: () => ManagedContext, private readonly busy: () => boolean,
    private readonly setBusy: (value: boolean) => void,
    private readonly isUserActionActive: () => boolean,
    private readonly withWriteLock: (work: () => Promise<void>) => Promise<void>) { }
  invalidate() {
    this.sequence++;
    this.proof = null;
  }
  checkpoint(id: string): EditorCheckpoint | undefined {
    const proof = this.proof;
    const node = proof?.baseline.node;

    if (!proof || !node || proof.blocked || proof.baseline.id !== id) return undefined;

    return {
      handle: node.handle as FileSystemFileHandle,
      size: node.view.size,
      modified: node.view.modified,
      sha256: node.view.sha256!,
      backupId: proof.backupId,
      payload: proof.payload
    };
  }
  async open(
    path: readonly string[],
    signal: AbortSignal,
    saved?: {
      id: string;
      checkpoint?: EditorCheckpoint
    }) {
    if (this.busy()) throw Error("managed-operation-running");

    this.invalidate();

    const sequence = this.sequence;
    const context = this.context();
    const check = () => {
      context.check();

      if (sequence !== this.sequence) throw Error("stale-connection-operation");

      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    };
    const hasher = createCopyHasher(signal);

    try {
      const baseline = await readManagedEdit({ ...context, check }, path, hasher.hash);

      check();

      const previous = saved?.checkpoint;
      const validCheckpoint = previous && typeof previous.handle?.isSameEntry === "function"
        && typeof previous.sha256 === "string"
        && /^[a-f0-9]{64}$/u.test(previous.sha256);
      const blocked = !!saved
        && (!validCheckpoint || !await previous!.handle.isSameEntry(baseline.node.handle)
          || previous!.sha256 !== baseline.node.view.sha256
          || previous!.size !== baseline.node.view.size
          || previous!.modified !== baseline.node.view.modified);

      check();

      if (saved) baseline.id = saved.id;

      this.proof = { baseline, context, blocked, backupId: previous?.backupId, payload: previous?.payload };

      return {
        id: baseline.id,
        path: [...path],
        text: baseline.text,
        hasBackup: !!previous?.backupId,
        conflict: blocked
      };
    } finally {
      hasher.dispose();
    }
  }
  async save(id: string, text: string, signal: AbortSignal, manual: boolean) {
    const proof = this.proof;

    if (!proof || proof.baseline.id !== id || proof.blocked) throw Error("managed-changed");

    if (this.busy()) throw Error("managed-operation-running");

    if (!manual && !proof.backupId) throw Error("editor-first-save");

    proof.context.check();

    if (manual && !this.isUserActionActive()) throw Error("managed-user-action-required");

    const permissions = manual
      ? [proof.context.root.requestPermission({ mode: "readwrite" }), proof.context.vault.requestPermission({ mode: "readwrite" })]
      : [proof.context.root.queryPermission({ mode: "readwrite" }), proof.context.vault.queryPermission({ mode: "readwrite" })];
    const sequence = this.sequence;
    const check = () => {
      proof.context.check();

      if (sequence !== this.sequence || proof !== this.proof) throw Error("stale-connection-operation");

      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    };

    this.setBusy(true);

    const hasher = createCopyHasher(signal);
    let attempted = false;

    try {
      if ((await Promise.all(permissions)).some(value => value !== "granted")) throw new DOMException("permission", "NotAllowedError");

      check();

      if (!proof.backupId) {
        const path = proof.baseline.node.view.path;
        const prepared = await prepareManagedOperation({ ...proof.context, check }, {
          kind: "edit",
          source: path.slice(0, -1),
          names: [path.at(-1)!],
          destination: [],
          text
        }, hasher.hash, proof.baseline);
        const result = await executeManagedOperation(prepared, signal, hasher.hash, value => {
          if (value.status !== "not-run") attempted = true;
        }, this.withWriteLock, permissions);

        check();

        if (result.phase !== "completed" || result.status !== "verified") throw Error(result.issue ?? "managed-failed");

        proof.backupId = result.id;
        proof.payload = prepared.nodes[0].view.payload!;

        const handle = proof.baseline.node.handle as FileSystemFileHandle;
        const current = await handle.getFile();
        const digest = await hasher.hash(current);
        const expected = prepared.edited!;
        const expectedDigest = await hasher.hash(expected);

        check();

        if (current.size !== expected.size || digest !== expectedDigest) throw Error("managed-changed");

        proof.baseline = {
          ...proof.baseline,
          text,
          node: {
            handle,
            view: {
              ...proof.baseline.node.view,
              size: current.size,
              modified: current.lastModified,
              sha256: digest
            }
          }
        };
      } else {
        await this.withWriteLock(async () => {
          const archive = await openManagedArchive({ ...proof.context, check }, proof.backupId!, hasher.hash);
          const source = proof.baseline.node;
          const original = archive.manifest.nodes.find(node => node.payload === proof.payload);

          if (!original || !proof.payload) throw Error("managed-archive-changed");

          const audit = async () => {
            check();
            await assertManagedVault({ ...proof.context, check }, archive.vaultId);

            if (await proof.context.root.queryPermission({ mode: "readwrite" }) !== "granted"
              || await proof.context.vault.queryPermission({ mode: "readwrite" }) !== "granted") throw new DOMException("permission", "NotAllowedError");

            const payload = await archive.store.read(`${proof.payload}.bin`);

            if (payload.file.size !== original.size || await hasher.hash(payload.file) !== original.sha256) throw Error("managed-archive-changed");

            check();
          };

          await audit();

          const value = await encodeEditedText(await (source.handle as FileSystemFileHandle).getFile(), text, check);
          const parent = await openSourceDirectory(proof.context.root, archive.manifest.historyParent, check);
          const history = await parent.getDirectoryHandle(".moa-history", { create: false });
          const pair = await BackupDirectory.open(history, `moa-managed-${proof.backupId}`, check, async () => {
            const latest = await openSourceDirectory(proof.context.root, archive.manifest.historyParent, check);

            if (
              !(await latest.isSameEntry(parent))
              ||
              !(await history.isSameEntry(
                await latest.getDirectoryHandle(".moa-history", { create: false }),
              ))
            )
              throw Error("managed-record-changed");
          });
          let entries = 0;
          const directory = await proof.context.vault.getDirectoryHandle(`moa-managed-${proof.backupId}`, { create: false });

          for await (const entry of directory.values()) {
            check();

            if (++entries > 4000 || !entry) throw Error("managed-limit");
          }

          const revision = crypto.randomUUID();
          const digest = await hasher.hash(value);
          const writeEvent = async (phase: "started" | "verified") => {
            const body = new Blob([JSON.stringify({
              operation: "editor-save",
              revision,
              operationId: proof.backupId,
              phase,
              owner: proof.context.owner,
              path: source.view.path,
              size: value.size,
              sha256: digest,
              time: new Date().toISOString()
            })]);

            for (const store of [archive.store, pair]) {
              const handle = await store.write(`editor-save-${revision}-${phase}.json`, body);
              const fresh = await store.read(`editor-save-${revision}-${phase}.json`, handle);

              if (await fresh.file.text() !== await body.text()) throw Error("managed-record-changed");

              check();
            }
          };

          await writeEvent("started");

          const next = await writeVerifiedText(proof.context.root, {
            handle: source.handle as FileSystemFileHandle,
            path: source.view.path,
            size: source.view.size,
            modified: source.view.modified,
            sha256: source.view.sha256!
          }, value, hasher.hash, check, async () => {
            await audit();
            attempted = true;
          });

          await writeEvent("verified");
          proof.baseline = {
            ...proof.baseline,
            text,
            node: {
              handle: next.handle,
              view: { ...source.view, size: next.size, modified: next.modified, sha256: next.sha256 }
            }
          };
        });
      }

      check();

      return { hasBackup: true, savedAt: new Date().toISOString() };
    } catch (error) {
      if (attempted || (error instanceof Error && error.message === "managed-changed")) proof.blocked = true;

      throw error;
    } finally {
      hasher.dispose();
      this.setBusy(false);
    }
  }
}

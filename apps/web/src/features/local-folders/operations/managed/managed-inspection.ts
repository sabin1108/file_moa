import {
  MANAGED_LIMITS,
  managedNames,
  managedTreePath,
  type ManagedPreview,
  type ManagedRequest,
  type ManagedManifest
} from "./managed-files";
import { restoreDestinationPath, restoreFileName } from "../../recovery/restore/recovery-restore-rules";
import { comparableName } from "../planning/file-change-plan";
import { assertManagedVault, openManagedArchive, readManagedJson, type ManagedContext } from "./managed-archive";
import { captureManagedTree, assertManagedAbsent, type CapturedNode, type ManagedHash } from "./managed-tree";
import { openSourceDirectory } from "../../source-directory";
import { encodeEditedText } from "../../documents/editing/verified-text-writer";

export type PreparedManaged = {
  view: ManagedPreview;
  request: ManagedRequest;
  nodes: CapturedNode[];
  targets: string[][];
  destination: FileSystemDirectoryHandle | null;
  edited: File | null;
  vaultId: string;
  context: ManagedContext;
  recoveryCurrent?: () => Promise<void>;
};

export type EditBaseline = {
  id: string;
  node: CapturedNode;
  text: string
};

export async function readManagedEdit(context: ManagedContext, path: readonly string[], hash: ManagedHash): Promise<EditBaseline> {
  const parts = restoreDestinationPath(path);
  const name = parts.at(-1);

  if (!name || !/\.(md|txt)$/iu.test(name)) throw Error("managed-edit-limit");

  const captured = await captureManagedTree(context.root, parts.slice(0, -1), [name], context.check, hash);
  const node = captured.nodes[0];

  if (captured.nodes.length !== 1 || node.view.kind !== "file" || node.view.size > MANAGED_LIMITS.editBytes) throw Error("managed-edit-limit");

  const file = await (node.handle as FileSystemFileHandle).getFile();
  const bytes = await file.arrayBuffer();

  context.check();

  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

  if (await hash(new File([bytes], name)) !== node.view.sha256) throw Error("managed-changed");

  return { id: crypto.randomUUID(), node, text };
}

export async function prepareManagedOperation(context: ManagedContext, request: ManagedRequest, hash: ManagedHash,
  baseline?: EditBaseline): Promise<PreparedManaged> {
  const fixed = structuredClone(request);

  if (!["copy", "move", "trash", "edit", "recover"].includes(fixed.kind)) throw Error("managed-selection");

  const source = restoreDestinationPath(fixed.source);
  const destinationPath = restoreDestinationPath(fixed.destination);
  const vaultId = await assertManagedVault(context);
  let nodes: CapturedNode[];
  let roots: string[][];
  let skipped = false;
  let recoveryCurrent: (() => Promise<void>) | undefined;

  if (fixed.kind === "recover") {
    const archive = await openManagedArchive(context, fixed.archiveId ?? "", hash);
    const expected = JSON.stringify(archive.manifest);

    recoveryCurrent = async () => {
      const latest = await readManagedJson(archive.store, "prepared.json", context.check);

      if (JSON.stringify(latest.value) !== expected) throw Error("managed-archive-changed");

      await archive.current();
    };
    roots = archive.manifest.roots.map(path => [...path]);
    nodes = [];

    for (const view of archive.manifest.nodes) {
      if (view.kind === "directory") nodes.push({ view, handle: context.vault });
      else {
        const payload = await archive.store.read(`${view.payload}.bin`);

        if (payload.file.size !== view.size || await hash(payload.file) !== view.sha256) throw Error("managed-archive-changed");

        context.check();
        nodes.push({ view, handle: payload.handle });
      }
    }

    await recoveryCurrent();
  } else {
    const names = managedNames(fixed.names);
    const captured = await captureManagedTree(context.root, source, names, context.check, hash, fixed.kind !== "copy");

    nodes = captured.nodes;
    skipped = captured.skipped;
    roots = names.map(name => [...source, name]);

    if (skipped && fixed.kind !== "copy") throw Error("managed-protected");
  }

  let destination: FileSystemDirectoryHandle | null = null;
  let rootNames = roots.map(path => path.at(-1)!);

  if (new Set(rootNames.map(comparableName)).size !== rootNames.length) throw Error("managed-conflict");

  if (["copy", "move", "recover"].includes(fixed.kind)) {
    destination = await openSourceDirectory(context.root, destinationPath, context.check);

    if (fixed.kind !== "recover") {
      const parent = await openSourceDirectory(context.root, source, context.check);

      if (await parent.isSameEntry(destination)) throw Error("managed-nested");

      for (const node of nodes.filter(node => node.view.kind === "directory")) {
        if (await (node.handle as FileSystemDirectoryHandle).resolve(destination) !== null) throw Error("managed-nested");

        context.check();
      }
    } else {
      const existing: string[] = [];

      for await (const entry of destination.values()) {
        context.check();

        if (existing.length >= 1000) throw Error("managed-limit");

        existing.push(entry.name);
      }

      rootNames = rootNames.map(name => {
        const next = restoreFileName(name, existing);

        existing.push(next);

        return next;
      });
    }

    for (const name of rootNames) await assertManagedAbsent(destination, name, context.check);
  }

  let edited: File | null = null;

  if (fixed.kind === "edit") {
    const node = nodes[0];

    if (!baseline || nodes.length !== 1 || node.view.kind !== "file" || !/\.(md|txt)$/iu.test(node.view.path.at(-1)!)
      || typeof fixed.text !== "string"
      || fixed.text.length > MANAGED_LIMITS.editBytes
      || node.view.size > MANAGED_LIMITS.editBytes) throw Error("managed-edit-limit");

    if (!await baseline.node.handle.isSameEntry(node.handle) || baseline.node.view.sha256 !== node.view.sha256
      || JSON.stringify(baseline.node.view.path) !== JSON.stringify(node.view.path)) throw Error("managed-changed");

    edited = await encodeEditedText(await (node.handle as FileSystemFileHandle).getFile(), fixed.text, context.check);
  }

  const targets = nodes.map(node => {
    if (!destination) return [...node.view.path];

    const index = roots.findIndex(path => path.every((part, depth) => node.view.path[depth] === part));

    if (index < 0) throw Error("managed-archive-invalid");

    const target = [...destinationPath, rootNames[index], ...node.view.path.slice(roots[index].length)];

    managedTreePath(target);

    return target;
  });
  const view: ManagedPreview = {
    id: crypto.randomUUID(),
    kind: fixed.kind,
    roots,
    destination: destinationPath,
    files: nodes.filter(node => node.view.kind === "file").length,
    folders: nodes.filter(node => node.view.kind === "directory").length,
    bytes: nodes.reduce((total, node) => total + node.view.size, 0),
    paths: targets,
    skipped,
  };

  return { view, request: fixed, nodes, targets, destination, edited, vaultId, context, recoveryCurrent };
}

export function managedManifest(prepared: PreparedManaged): ManagedManifest {
  return {
    schemaVersion: 1,
    operation: "managed-files",
    operationId: prepared.view.id,
    kind: prepared.view.kind,
    owner: prepared.context.owner,
    vaultId: prepared.vaultId,
    createdAt: new Date().toISOString(),
    roots: prepared.view.roots.map(path => [...path]),
    historyParent: [...(prepared.destination ? prepared.view.destination : prepared.request.source)],
    targets: prepared.targets.map(path => [...path]),
    nodes: prepared.nodes.map(node => ({ ...node.view, path: [...node.view.path] }))
  };
}

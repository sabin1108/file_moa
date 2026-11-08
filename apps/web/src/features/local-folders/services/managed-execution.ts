import type { ManagedResult } from "../lib/managed-files";
import { managedIssue } from "../lib/managed-files";
import { assertManagedVault, createManagedArchive } from "./managed-archive";
import { managedManifest, type PreparedManaged } from "./managed-inspection";
import { assertManagedAbsent, assertManagedTree, captureManagedTree, type CapturedNode, type ManagedHash } from "./managed-tree";
import { openSourceDirectory } from "./source-directory";
import { writeVerifiedText } from "./verified-text-writer";

/** 복사/이동/휴지통/편집/복구가 공유하는 보존→검증→명시 변경 순서다. */
export async function executeManagedOperation(prepared: PreparedManaged, signal: AbortSignal, hash: ManagedHash,
  progress: (value: ManagedResult) => void,
  lock: (work: () => Promise<void>) => Promise<void> = async work => { await navigator.locks.request("moa-folder-creation", work); },
  requestedPermissions?: readonly Promise<PermissionState>[]): Promise<ManagedResult> {
  let recording = false;
  const check = () => {
    prepared.context.check();
    if (signal.aborted && !recording) throw new DOMException("cancelled", "AbortError");
  };
  const context = { ...prepared.context, check };
  let state: ManagedResult = { id: prepared.view.id, phase: "preserving", status: "not-run", copied: 0, removed: 0, preserved: false, issue: null };
  let archive: Awaited<ReturnType<typeof createManagedArchive>> | null = null;
  const publish = (value: Partial<ManagedResult>) => {
    check();
    state = { ...state, ...value };
    progress(state);
  };
  const destinationCurrent = async () => {
    check();
    await assertManagedVault(context, prepared.vaultId);
    if (prepared.destination) {
      const current = await openSourceDirectory(context.root, prepared.view.destination, check);
      if (!await current.isSameEntry(prepared.destination)) throw Error("managed-changed");
    }
    if (await context.root.queryPermission({ mode: "readwrite" }) !== "granted"
      || await context.vault.queryPermission({ mode: "readwrite" }) !== "granted") throw new DOMException("permission", "NotAllowedError");
    check();
  };
  const sourceFile = async (node: CapturedNode) => {
    check();
    let handle = node.handle as FileSystemFileHandle;
    if (prepared.request.kind !== "recover") {
      const parent = await openSourceDirectory(context.root, node.view.path.slice(0, -1), check);
      handle = await parent.getFileHandle(node.view.path.at(-1)!, { create: false });
      if (!await handle.isSameEntry(node.handle)) throw Error("managed-changed");
    } else await prepared.recoveryCurrent!();
    const file = await handle.getFile();
    check();
    if (file.size !== node.view.size || (prepared.request.kind !== "recover" && file.lastModified !== node.view.modified)
      || await hash(file) !== node.view.sha256) throw Error("managed-changed");
    check();
    return file;
  };
  const fixedFiles = new Map<string, File>();
  const targets = new Map<string, FileSystemHandle>();
  const key = (path: readonly string[]) => JSON.stringify(path);
  const verifyTarget = async (path: readonly string[], node: CapturedNode) => {
    await destinationCurrent();
    const parent = await openSourceDirectory(context.root, path.slice(0, -1), check);
    const expected = targets.get(key(path));
    if (!expected) throw Error("managed-changed");
    if (node.view.kind === "directory") {
      const current = await parent.getDirectoryHandle(path.at(-1)!, { create: false });
      if (!await current.isSameEntry(expected)) throw Error("managed-changed");
    } else {
      const current = await parent.getFileHandle(path.at(-1)!, { create: false });
      const file = await current.getFile();
      if (!await current.isSameEntry(expected) || file.size !== node.view.size || await hash(file) !== node.view.sha256) throw Error("managed-changed");
    }
    check();
  };
  const stop = async () => {
    if (!archive) return;
    await archive.write("stopped.json", new Blob([JSON.stringify({ schemaVersion: 1, operationId: state.id,
      phase: state.phase, status: state.status, copied: state.copied, removed: state.removed, preserved: state.preserved, issue: state.issue })]));
  };
  const verifyTargetTree = async () => {
    if (!prepared.destination) return;
    const rootNames = prepared.targets.filter(path => path.length === prepared.view.destination.length + 1).map(path => path.at(-1)!);
    const fresh = await captureManagedTree(context.root, prepared.view.destination, rootNames, check, hash);
    if (fresh.skipped || fresh.nodes.length !== prepared.nodes.length) throw Error("managed-changed");
    for (const current of fresh.nodes) {
      const index = prepared.targets.findIndex(path => key(path) === key(current.view.path));
      const expected = prepared.nodes[index];
      const expectedHandle = targets.get(key(current.view.path));
      if (!expected || !expectedHandle || !await current.handle.isSameEntry(expectedHandle)
        || current.view.kind !== expected.view.kind || current.view.size !== expected.view.size
        || current.view.sha256 !== expected.view.sha256) throw Error("managed-changed");
      check();
    }
  };
  try {
    // 새 실행 클릭의 transient activation 안에서 두 권한 요청을 먼저 시작한다.
    const permissions = requestedPermissions ?? [context.root.requestPermission({ mode: "readwrite" }), context.vault.requestPermission({ mode: "readwrite" })];
    if ((await Promise.all(permissions)).some(value => value !== "granted")) throw new DOMException("permission", "NotAllowedError");
    check();
    await lock(async () => {
      await destinationCurrent();
      if (prepared.request.kind !== "recover") {
        const fresh = await assertManagedTree(context.root, prepared.request.source, prepared.request.names, prepared.nodes, check, hash);
        if (fresh.skipped && prepared.request.kind !== "copy") throw Error("managed-protected");
      } else await prepared.recoveryCurrent!();
      if (prepared.destination) {
        for (const path of prepared.targets.filter(path => path.length === prepared.view.destination.length + 1)) {
          await assertManagedAbsent(prepared.destination, path.at(-1)!, check);
        }
      }
      for (const node of prepared.nodes.filter(node => node.view.kind === "file")) {
        const file = await sourceFile(node);
        const bytes = await file.arrayBuffer();
        check();
        const fixed = new File([bytes], file.name);
        if (fixed.size !== node.view.size || await hash(fixed) !== node.view.sha256) throw Error("managed-changed");
        fixedFiles.set(key(node.view.path), fixed);
      }
      const manifest = managedManifest(prepared);
      archive = await createManagedArchive(context, manifest, prepared.destination ? prepared.view.destination : prepared.request.source);
      const manifestHandle = await archive.write("prepared.json", new Blob([JSON.stringify(manifest)]));
      for (const node of prepared.nodes.filter(node => node.view.kind === "file")) {
        const saved = await archive.write(`${node.view.payload}.bin`, fixedFiles.get(key(node.view.path))!);
        const current = await archive.store.read(`${node.view.payload}.bin`, saved);
        if (current.file.size !== node.view.size || await hash(current.file) !== node.view.sha256) throw Error("managed-archive-changed");
        check();
      }
      await archive.audit(hash);
      const manifestFile = await archive.store.read("prepared.json", manifestHandle);
      await archive.write("item-0000-verified.json", new Blob([JSON.stringify({ schemaVersion: 1, operationId: state.id, manifestSha256: await hash(manifestFile.file) })]));
      await archive.audit(hash);
      publish({ preserved: true });
      if (prepared.request.kind !== "recover") {
        const current = await assertManagedTree(context.root, prepared.request.source, prepared.request.names, prepared.nodes, check, hash);
        if (current.skipped && prepared.request.kind !== "copy") throw Error("managed-protected");
      } else await prepared.recoveryCurrent!();

      if (prepared.request.kind === "edit") {
        const node = prepared.nodes[0];
        await sourceFile(node);
        await destinationCurrent();
        await archive.audit(hash);
        await archive.write("item-0001-target-started.json", new Blob([JSON.stringify({ operationId: state.id, action: "save", path: node.view.path })]));
        publish({ phase: "writing", status: "uncertain" });
        await writeVerifiedText(context.root, { handle: node.handle as FileSystemFileHandle, path: node.view.path,
          size: node.view.size, modified: node.view.modified, sha256: node.view.sha256! }, prepared.edited!, hash, check,
        async () => { await destinationCurrent(); await archive!.audit(hash); });
        await archive.write("item-0001-target-verified.json", new Blob([JSON.stringify({ operationId: state.id, action: "saved" })]));
        publish({ copied: 1 });
      } else if (prepared.destination) {
        publish({ phase: "writing" });
        for (const [index, node] of prepared.nodes.entries()) {
          await destinationCurrent();
          const path = prepared.targets[index];
          const parent = await openSourceDirectory(context.root, path.slice(0, -1), check);
          const parentExpected = path.length === prepared.view.destination.length + 1 ? prepared.destination : targets.get(key(path.slice(0, -1)));
          if (!parentExpected || !await parent.isSameEntry(parentExpected)) throw Error("managed-changed");
          await assertManagedAbsent(parent, path.at(-1)!, check);
          await archive.write(`item-${String(index + 1).padStart(4, "0")}-target-started.json`, new Blob([JSON.stringify({ operationId: state.id, action: "create", path })]));
          publish({ status: "uncertain" });
          if (node.view.kind === "directory") {
            const created = await parent.getDirectoryHandle(path.at(-1)!, { create: true });
            targets.set(key(path), created);
            for await (const entry of created.values()) { check(); if (entry) throw Error("managed-conflict"); }
          } else {
            const target = await parent.getFileHandle(path.at(-1)!, { create: true });
            targets.set(key(path), target);
            const empty = async () => {
              await destinationCurrent();
              const current = await parent.getFileHandle(path.at(-1)!, { create: false });
              if (!await target.isSameEntry(current) || (await current.getFile()).size !== 0) throw Error("managed-conflict");
              check();
            };
            await empty();
            const stream = await target.createWritable({ keepExistingData: false, mode: "exclusive" } as FileSystemCreateWritableOptions);
            try {
              await empty();
              const file = fixedFiles.get(key(node.view.path))!;
              for (let offset = 0; offset < file.size; offset += 65536) {
                await stream.write(file.slice(offset, offset + 65536));
                check();
              }
              await empty();
              await stream.close();
              check();
            } catch (error) { await stream.abort().catch(() => {}); throw error; }
          }
          await verifyTarget(path, node);
          await archive.write(`item-${String(index + 1).padStart(4, "0")}-target-verified.json`, new Blob([JSON.stringify({ operationId: state.id, action: "copied", path })]));
          publish({ copied: state.copied + 1 });
        }
        await verifyTargetTree();
      }

      if (["move", "trash"].includes(prepared.request.kind)) {
        const fresh = await assertManagedTree(context.root, prepared.request.source, prepared.request.names, prepared.nodes, check, hash);
        if (fresh.skipped) throw Error("managed-protected");
        await archive.audit(hash);
        publish({ phase: "removing" });
        for (const [index, node] of [...prepared.nodes.entries()].reverse()) {
          await destinationCurrent();
          if (prepared.destination) await verifyTarget(prepared.targets[index], node);
          await archive.audit(hash, node.view.payload ? `${node.view.payload}.bin` : "directory");
          const parent = await openSourceDirectory(context.root, node.view.path.slice(0, -1), check);
          const name = node.view.path.at(-1)!;
          await archive.write(
            `item-${String(index + 1).padStart(4, "0")}-source-removal-started.json`,
            new Blob([
              JSON.stringify({ operationId: state.id, action: "remove", path: node.view.path }),
            ]),
          );
          if (node.view.kind === "file") await sourceFile(node);
          else {
            const current = await parent.getDirectoryHandle(name, { create: false });
            if (!await current.isSameEntry(node.handle)) throw Error("managed-changed");
            for await (const entry of current.values()) { check(); if (entry) throw Error("managed-changed"); }
          }
          check();
          const latestParent = await openSourceDirectory(context.root, node.view.path.slice(0, -1), check);
          if (!await parent.isSameEntry(latestParent)) throw Error("managed-changed");
          check();
          publish({ status: "uncertain" });
          // recursive 삭제를 사용하지 않아 검사 뒤 추가된 다른 항목을 함께 지우지 않는다.
          await parent.removeEntry(name);
          check();
          const observedParent = await openSourceDirectory(context.root, node.view.path.slice(0, -1), check);
          if (!await parent.isSameEntry(observedParent)) throw Error("managed-changed");
          check();
          for (let observation = 0; observation < 2; observation++) {
            try {
              if (node.view.kind === "file") await parent.getFileHandle(name, { create: false });
              else await parent.getDirectoryHandle(name, { create: false });
              throw Error("managed-changed");
            } catch (error) {
              check();
              if (!(error instanceof Error && error.name === "NotFoundError")) throw error;
            }
          }
          await archive.write(
            `item-${String(index + 1).padStart(4, "0")}-source-removed.json`,
            new Blob([
              JSON.stringify({ operationId: state.id, action: "removed", path: node.view.path }),
            ]),
          );
          publish({ removed: state.removed + 1 });
        }
      }
      await archive.audit(hash);
      await verifyTargetTree();
      publish({ phase: "completed", status: "verified" });
      await stop();
      await archive.audit(hash);
    });
  } catch (error) {
    state = { ...state, phase: signal.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "error",
      status: state.status === "not-run" ? "not-run" : "uncertain", issue: managedIssue(error) };
    if (/(archive|vault|backup|record)/u.test(state.issue ?? "")) state = { ...state, preserved: false };
    recording = true;
    try { prepared.context.check(); await stop(); } catch { /* 연결 상실 시 다른 보관함에 기록하지 않는다. */ }
  }
  return state;
}

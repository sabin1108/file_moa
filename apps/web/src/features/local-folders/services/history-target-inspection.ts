import type { ConnectionOwner, FolderHandle } from "../types";
import type { HistoryGroup } from "../lib/folder-history";
import { readFolderHistory } from "./folder-history";
import { copyFolderPath } from "../lib/folder-path";

export type HistoryTargetInspection = Readonly<{
  path: readonly string[];
  status: "present" | "missing" | "kind-mismatch";
  actualKind: "file" | "directory" | null;
  checkedAt: string;
}>;

/** 기록을 재검증한 뒤 이름/종류만 관측한다. 존재는 과거 작업 성공이나 생성 주체의 증거가 아니다. */

export async function inspectHistoryTarget(
  root: FolderHandle,
  path: readonly string[],
  owner: ConnectionOwner,
  expected: HistoryGroup,
  assertCurrent: () => void): Promise<HistoryTargetInspection> {
  const parentPath = copyFolderPath(path);
  const selected = { ...expected, path: expected.path ? [...expected.path] : null };

  if (selected.status !== "uncertain" || !selected.kind || !selected.path
    || selected.path.length !== parentPath.length + 1
    || !parentPath.every((part, index) => selected.path![index] === part)) {
    throw new Error("history-record-changed");
  }

  const history = await readFolderHistory(root, parentPath, owner, assertCurrent);

  assertCurrent();

  const current = history.groups.find(group => group.id === selected.id);

  if (!current || current.status !== selected.status || current.kind !== selected.kind || current.time !== selected.time
    || current.count !== selected.count
    || JSON.stringify(current.path) !== JSON.stringify(selected.path)) throw new Error("history-record-changed");

  const resolveParent = async () => {
    let parent: FileSystemDirectoryHandle = root;

    for (const part of parentPath) {
      parent = await parent.getDirectoryHandle(part, { create: false });
      assertCurrent();
    }

    return parent;
  };
  const parent = await resolveParent();
  const name = selected.path.at(-1)!;
  const probe = async (directory: FileSystemDirectoryHandle): Promise<FileSystemHandle | null> => {
    assertCurrent();

    try {
      const handle = await directory.getDirectoryHandle(name, { create: false });

      assertCurrent();

      return handle;
    }
    catch (error) {
      assertCurrent();

      if (!(error instanceof DOMException)) throw error;

      if (error.name === "NotFoundError") return null;

      if (error.name !== "TypeMismatchError") throw error;
    }

    try {
      const handle = await directory.getFileHandle(name, { create: false });

      assertCurrent();

      return handle;
    }
    catch (error) {
      assertCurrent();

      if (error instanceof DOMException && ["NotFoundError", "TypeMismatchError"].includes(error.name)) throw new Error("history-target-changed");

      throw error;
    }
  };
  const first = await probe(parent);
  const finalParent = await resolveParent();

  if (!await parent.isSameEntry(finalParent)) throw new Error("history-target-changed");

  assertCurrent();

  const second = await probe(finalParent);

  if (!!first !== !!second || (first && second && (first.kind !== second.kind || !await first.isSameEntry(second)))) throw new Error("history-target-changed");

  assertCurrent();

  const permission = await root.queryPermission({ mode: "read" });

  assertCurrent();

  if (permission !== "granted") throw new DOMException("History target read permission required", "NotAllowedError");

  return {
    path: selected.path,
    status: !second ? "missing" : second.kind === (selected.kind === "folder" ? "directory" : "file") ? "present" : "kind-mismatch",
    actualKind: second?.kind ?? null,
    checkedAt: new Date().toISOString()
  };
}

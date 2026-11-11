import type { ConnectionOwner, FolderKind, FolderHandle } from "../types";

/** session과 브라우저 저장소가 함께 쓰는 연결 경계 검증. 입력 오류를 숨기지 않고 거부한다. */

export function connectionKey(owner: ConnectionOwner, kind: FolderKind): [string, string, FolderKind] {
  if (
    !owner
    ||
    ![owner.userId, owner.workspaceId].every(
      value =>
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 128 &&
        value.trim() === value,
    )
  )
    throw new Error("invalid-connection-owner");

  if (kind !== "source" && kind !== "ai-records" && kind !== "recovery") throw new Error("invalid-folder-kind");

  return [owner.userId, owner.workspaceId, kind];
}

export function validateFolderHandle(handle: FolderHandle): void {
  if (
    !handle ||
    handle.kind !== "directory" ||
    typeof handle.queryPermission !== "function"
    ||
    typeof handle.requestPermission !== "function"
  )
    throw new Error("invalid-folder-handle");
}

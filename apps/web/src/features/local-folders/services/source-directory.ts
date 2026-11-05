import { copyFolderPath } from "../lib/folder-path";
import { VAULT_IDENTITY_NAME } from "../lib/recovery-vault";

/** 식별 파일은 관리 영역의 예약 표식이다. 손상된 표식도 일반 자료로 열지 않는다. */
export async function isRecoveryDirectory(directory: FileSystemDirectoryHandle, check: () => void) {
  check();
  try {
    const marker = await directory.getFileHandle(VAULT_IDENTITY_NAME, { create: false });
    check();
    return marker.name.toLowerCase() === VAULT_IDENTITY_NAME;
  } catch (error) {
    check();
    if (error instanceof Error && error.name === "NotFoundError") return false;
    if (error instanceof Error && error.name === "TypeMismatchError") return true;
    throw error;
  }
}

/** 모든 일반 자료 접근에서 보관함 내부 경로를 차단한다. 보관함 전용 reader는 이 API를 쓰지 않는다. */
export async function openSourceDirectory(root: FileSystemDirectoryHandle, path: readonly string[], check: () => void) {
  const parts = copyFolderPath(path);
  let directory = root;
  if (await isRecoveryDirectory(directory, check)) throw Error("source-vault-protected");
  for (const part of parts) {
    check();
    directory = await directory.getDirectoryHandle(part, { create: false });
    check();
    if (await isRecoveryDirectory(directory, check)) throw Error("source-vault-protected");
  }
  return directory;
}

/**
 * 폴더 연결 기능의 공통 입출력 계약이다. UI에는 FolderConnectionView만, session/저장소에는 핸들 계약을 전달한다.
 * 실행되는 검증 함수는 lib/connection-validation.ts에 있어 타입 선언과 책임을 구분한다.
 */
export type FolderKind = "source" | "ai-records" | "recovery";
export type FolderListEntry = Readonly<{ name: string; kind: "file" | "directory" }>;
export type FolderEntrySelection = (
  parentPath: readonly string[],
  name: string,
  kind: FolderListEntry["kind"],
) => void;
/** Display values only: no handle, account identifier, or file access methods. */
export type FolderConnectionView = Readonly<
  | { status: "disconnected"; folderName: null }
  | { status: "needs-permission" | "connected"; folderName: string }
>;
export type ConnectionOwner = Readonly<{ userId: string; workspaceId: string }>;
/** A named source-folder reference. The handle stays browser-local in IndexedDB. */
export type SourceFolderConnection = Readonly<{
  connectionId: string;
  name: string;
  handle: FolderHandle;
  active: boolean;
}>;
export type FolderHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
};
export interface HandleRepository {
  read(owner: ConnectionOwner, kind: FolderKind): Promise<FolderHandle | undefined>;
  write(owner: ConnectionOwner, kind: FolderKind, handle: FolderHandle): Promise<void>;
  remove(owner: ConnectionOwner, kind: FolderKind): Promise<void>;
}

export interface SourceFolderRepository extends HandleRepository {
  listSource(owner: ConnectionOwner): Promise<readonly SourceFolderConnection[]>;
  readSource(owner: ConnectionOwner, connectionId: string): Promise<FolderHandle | undefined>;
  writeSource(owner: ConnectionOwner, connectionId: string, handle: FolderHandle, name?: string): Promise<void>;
  removeSource(owner: ConnectionOwner, connectionId: string): Promise<void>;
  setActiveSource(owner: ConnectionOwner, connectionId: string): Promise<void>;
}

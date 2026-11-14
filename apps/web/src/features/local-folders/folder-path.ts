/** 브라우저 폴더 API에 넘기기 전에 상대 경로를 복사·검증한다. */
export function copyFolderPath(path: readonly string[]): string[] {
  if (!Array.isArray(path)) throw new Error("invalid-folder-path");

  const snapshot = [...path];

  for (const segment of snapshot) {
    if (typeof segment !== "string" || segment.length === 0 || segment === "." || segment === ".." || /[/\\\0]/.test(segment)) {
      throw new Error("invalid-folder-path");
    }
  }

  return snapshot;
}

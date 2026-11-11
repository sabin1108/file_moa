// v0.3 §7의 임시 한도. 여기서는 MB를 MiB 단위로 해석합니다.
export const DOCUMENT_LIMITS = Object.freeze({
  fileBytes: 2 * 1024 * 1024,
  workspaceDocuments: 500,
  workspaceTextBytes: 50 * 1024 * 1024,
});

export type FileRejection = "unsupported-extension" | "invalid-size" | "too-large";

export function checkDocumentCandidate(name: string, bytes: number): FileRejection | null {
  if (!/\.(md|txt|pdf|png|jpe?g)$/i.test(name)) return "unsupported-extension";

  if (!Number.isSafeInteger(bytes) || bytes < 0) return "invalid-size";

  if (bytes > DOCUMENT_LIMITS.fileBytes) return "too-large";

  return null;
}
// 메타데이터 후보 필터입니다. UTF-8 디코딩·서버 크기·총량·권한 검증을 대신하지 않습니다.

export { isRecordId, parseLocalRecord, canUseMemory, type LocalRecord, type RecordScope } from "./local-record";


/**
 * connection-session이 요청한 파일 하나를 읽는 서비스다. domain의 확장자/크기 정책과 경로/권한 검증을 적용한다.
 * UTF-8 원문과 표시용 정보만 반환하며, SourceDocumentPreview까지 전달되어 HTML 해석 없이 출력된다.
 */
import { checkDocumentCandidate } from "@personal-ai/domain";
import type { FolderHandle } from "../types";
import { copyFolderPath } from "../lib/folder-path";
import { openSourceDirectory } from "./source-directory";
import { createCopyHasher } from "./copy-hash";
import type { SourceFileExpectation } from "../../../shared/grounded-evidence";

export type SourceFilePreview = Readonly<{
  path: readonly string[];
  text: string;
  size: number;
  lastModified: number;
  pdf?: Readonly<{ pages: number; complete: boolean }>;
  referenceVerified?: true;
}>;

/** 명시적으로 선택한 한 파일의 읽기 경계. 권한·크기·UTF-8을 확인하며 쓰거나 저장하지 않는다. */
export async function readSourceFilePreview(
  root: FolderHandle,
  path: readonly string[],
  assertCurrent: () => void,
  signal?: AbortSignal,
  expectation?: SourceFileExpectation,
): Promise<SourceFilePreview> {
  // 호출자가 await 중 경로를 바꿔도 다른 파일을 읽지 않도록 먼저 검증·복사한다.
  const requestedPath = copyFolderPath(path);
  const name = requestedPath.at(-1);
  if (!name) throw new Error("invalid-file-path");
  const extensionIssue = checkDocumentCandidate(name, 0);
  if (extensionIssue) throw new Error(extensionIssue);
  const permission = async () => {
    assertCurrent();
    const value = await root.queryPermission({ mode: "read" });
    assertCurrent();
    if (value !== "granted") throw new DOMException("File read permission required", "NotAllowedError");
  };
  await permission();
  const directory = await openSourceDirectory(root, requestedPath.slice(0, -1), assertCurrent);
  const handle = await directory.getFileHandle(name, { create: false });
  assertCurrent();
  const file = await handle.getFile();
  assertCurrent();
  const sizeIssue = checkDocumentCandidate(name, file.size);
  if (sizeIssue) throw new Error(sizeIssue);
  if (/\.pdf$/iu.test(name) || expectation) {
    const reader = createCopyHasher(signal);
    try {
      const snapshot = await reader.readText(file, "Source preview");
      const text = snapshot.fullText ?? snapshot.excerpt;
      if (expectation && (snapshot.sha256 !== expectation.sha256 || snapshot.size !== expectation.size || !text.includes(expectation.quote))) throw new Error("citation-changed");
      await permission();
      const current = await handle.getFile();
      assertCurrent();
      if (current.size !== file.size || current.lastModified !== file.lastModified) throw new Error("source-changed");
      if (expectation) {
        if (await reader.hash(current) !== expectation.sha256) throw new Error("citation-changed");
        await permission();
      }
      return { path: requestedPath, text, size: snapshot.size, lastModified: file.lastModified, pdf: snapshot.pdf, ...(expectation ? { referenceVerified: true as const } : {}) };
    } finally { reader.dispose(); }
  }
  // arrayBuffer 자체는 중단 API가 없다. 전후 수명 검증으로 늦은 결과의 게시를 막는다.
  // 메모리에 올리기 전에 공통 domain 상한을 적용하고 실제 바이트 수도 다시 확인한다.
  const buffer = await file.arrayBuffer();
  assertCurrent();
  const byteIssue = checkDocumentCandidate(name, buffer.byteLength);
  if (byteIssue) throw new Error(byteIssue);
  if (buffer.byteLength !== file.size) throw new Error("file-size-changed");
  let text: string;
  try {
    // 잘못된 UTF-8을 대체 문자로 조용히 바꾸지 않는다. BOM만 소비하고 공백/개행은 보존한다.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    throw new Error("invalid-utf8");
  }
  await permission();
  return { path: requestedPath, text, size: file.size, lastModified: file.lastModified };
}

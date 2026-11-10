"use client";
import { useState } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { SourceFileRow } from "../listing/SourceFileRow";
import type { FindResult } from "../../lib/document-find";
import styles from "./organization-preparation.module.css";

const reasons: Record<string, string> = {
  "unsupported-extension": "TXT·MD·PDF·PNG·JPEG가 아닌 형식",
  "ocr-disabled": "이미지 글자 읽기 설정이 꺼져 있음",
  "ocr-no-text": "OCR에서 읽을 글자를 찾지 못함",
  "ocr-unavailable": "OCR 엔진·인식 파일 확인 필요",
  "ocr-image-too-large": "이미지600만 픽셀 상한 초과",
  "ocr-image-invalid": "PNG·JPEG 이미지 손상",
  "ocr-timeout": "OCR 처리 시간 상한",
  "ocr-limit": "OCR 쪽수·문자 상한으로 일부만 읽음",
  "pdf-no-text": "이미지 PDF · OCR이 필요함",
  "pdf-encrypted": "암호가 설정된 PDF",
  "pdf-invalid": "PDF를 읽을 수 없음",
  "pdf-text-limit": "PDF 50쪽·200,000자 추출 상한",
  "invalid-utf8": "UTF-8로 읽을 수 없음",
  "too-large": "파일 크기 한도 초과",
  "unreadable-file": "파일 읽기 실패",
  "unreadable-folder": "폴더 읽기 실패",
  "source-changed": "읽는 중 원본 변경",
};

export function DocumentFindResults({
  result,
  folderName,
  onOpenFile,
  selectedPaths,
  onToggle,
}: {
  result: FindResult;
  folderName: string;
  onOpenFile: (path: readonly string[]) => void;
  selectedPaths: readonly (readonly string[])[];
  onToggle: (path: readonly string[]) => void;
}) {
  const [limit, setLimit] = useState(20);
  const confirmed = result.documents.filter(
    (document) => document.finding.kind === "matched",
  );
  const uncertain = result.documents.filter(
    (document) => document.finding.kind !== "matched",
  );
  const visible = [...confirmed, ...uncertain].slice(0, limit);
  return (
    <section data-find-results aria-label="본문 근거 검색 결과">
      <h3>찾은 후보 {result.documents.length}개</h3>
      <p>
        조건에 맞는 후보 {confirmed.length}개 · 날짜 확인 필요{" "}
        {uncertain.length}개
      </p>
      <p className={styles.note}>
        단어·날짜 근거로 찾은 후보입니다. 검색 시점의 내용이므로 원문에서 다시
        확인해 주세요.
      </p>
      {!result.complete && (
        <StatusNotice
          state="attention"
          title="검색 범위 일부만 확인했어요"
          detail="읽기 실패 또는 탐색 한도로 빠진 자료가 있습니다. 범위를 좁혀 다시 검색할 수 있어요."
        />
      )}
      {!result.documents.length && (
        <p>확인한 범위에서 조건에 맞는 후보를 찾지 못했어요.</p>
      )}
      <ul className={styles.findDocuments}>
        {visible.map((document) => (
          <li key={JSON.stringify(document.path)}>
            <SourceFileRow
              name={document.name}
              selected={selectedPaths.some(path => JSON.stringify(path) === JSON.stringify(document.path))}
              previewing={false}
              selecting={true}
              selectionDisabled={false}
              previewDisabled={false}
              onToggle={() => onToggle(document.path)}
              onLongSelect={() => onToggle(document.path)}
              onPreview={() => onOpenFile(document.path)}
            />
            <p className={styles.note}>
              {[folderName, ...document.path].join(" / ")}
              {document.ocr && " · OCR 인식 글 · 원본 대조 필요"}
            </p>
            <p>
              {document.finding.kind === "matched"
                ? "조건에 맞는 본문 근거"
                : document.finding.kind === "date-unknown"
                  ? "날짜 기준 확인 필요"
                  : "기간 안팎의 날짜가 함께 있어 확인 필요"}
              {document.finding.dates.length > 0 &&
                ` · ${document.finding.dates.join(", ")}`}
            </p>
            {document.finding.evidence.slice(0, 2).map((line, index) => (
              <blockquote key={index}>{line}</blockquote>
            ))}
            {document.finding.evidence.length > 2 && (
              <details>
                <summary>근거 더 보기</summary>
                {document.finding.evidence.slice(2).map((line, index) => (
                  <blockquote key={index}>{line}</blockquote>
                ))}
              </details>
            )}
          </li>
        ))}
      </ul>
      {visible.length < result.documents.length && (
        <button
          type="button"
          className={actionClasses("secondary")}
          onClick={() => setLimit(limit + 20)}
        >
          다음 후보 20개 보기
        </button>
      )}
      {result.excluded.length > 0 && (
        <details>
          <summary>제외·읽기 문제 {result.excluded.length}개</summary>
          <ul>
            {result.excluded.map((entry, index) => (
              <li key={index}>
                {entry.path.join(" / ")} ·{" "}
                {reasons[entry.reason] ?? "읽기 또는 탐색 한도 문제"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { SourceFileRow } from "../listing/SourceFileRow";
import type { SnapshotDocument } from "../../lib/source-snapshot";
import styles from "./organization-preparation.module.css";

/** 이미 읽은 선택·발췌만 표시한다. 파일을 다시 읽거나 AI에 보내지 않는다. */

export function OrganizationDocumentsView({
  documents,
  selectedIds,
  candidateIds,
  pending,
  onToggle,
}: {
  documents: readonly SnapshotDocument[];
  selectedIds: readonly string[];
  candidateIds: readonly string[];
  pending: boolean;
  onToggle: (id: string) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <ul className={styles.documents} aria-label="자료별 발췌와 선택">
      {documents.map((document) => (
        <li key={document.id}>
          <SourceFileRow
            name={document.name}
            selected={selectedIds.includes(document.id)}
            previewing={previewId === document.id}
            selecting
            selectionDisabled={pending || !candidateIds.includes(document.id)}
            previewDisabled={false}
            onToggle={() => onToggle(document.id)}
            onLongSelect={() => onToggle(document.id)}
            onPreview={() =>
              setPreviewId(previewId === document.id ? null : document.id)
            }
          />
          <p className={styles.note}>
            {document.path.join(" / ")}
            {document.ocr && " · OCR 인식 글 · 원본 대조 필요"}
            {!candidateIds.includes(document.id) &&
              " · 입력량 한도로 후보 제외"}
          </p>
          {previewId === document.id
            && (
              <div className={styles.excerpt}>
                <h4>{document.name}의 전송 후보 발췌</h4>
                <pre>
                  {document.excerpt || "(빈 문서)"}
                </pre>
                <details>
                  <summary>원본 버전 정보</summary>
                  <p>
                    {document.size}바이트 · 수정 시각{" "}
                    {new Date(document.lastModified).toLocaleString("ko-KR")}
                  </p>
                  <p>전체 SHA256: {document.sha256}</p>
                  <p>발췌 SHA256: {document.excerptHash}</p>
                </details>
              </div>
            )}
        </li>
      ))}
    </ul>
  );
}

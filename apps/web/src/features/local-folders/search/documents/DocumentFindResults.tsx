"use client";

import { useEffect, useRef, useState } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { Icon } from "../../../../components/ui/Icon";
import { SourceFileRow } from "../../browsing/file-list/SourceFileRow";
import type { FindResult } from "./document-find";
import styles from "../../organization/organization-preparation.module.css";
import findStyles from "./document-find.module.css";

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
  const [excludedLimit, setExcludedLimit] = useState(20);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => heading.current?.scrollIntoView({ block: "start" }));

    return () => cancelAnimationFrame(frame);
  }, [result]);
  const confirmed = result.documents.filter(
    (document) => document.finding.kind === "matched",
  );
  const uncertain = result.documents.filter(
    (document) => document.finding.kind !== "matched",
  );
  const visible = [...confirmed, ...uncertain].slice(0, limit);

  return (
    <section data-find-results className={findStyles.results} aria-label="자료 검색 결과">
      {result.notice && <p role="status">{result.notice}</p>}
      {result.documents.length > 0 ? <header className={findStyles.resultHeading}>
        <h3 ref={heading}>찾은 자료 {result.documents.length}개</h3>
        {uncertain.length > 0 && <p>날짜 확인 필요 {uncertain.length}개</p>}
      </header> : <div className={findStyles.empty} role="status">
        <Icon name="search" size={30} />
        <h3 ref={heading}>확인한 자료에서는 찾지 못했어요</h3>
        <p>검색어를 줄이거나 검색 범위를 바꿔 보세요.</p>
      </div>}
      <ul className={styles.findDocuments}>
        {visible.map((document) => (
          <li key={JSON.stringify(document.path)} data-find-candidate data-find-metadata={document.contentAvailable === false ? "true" : undefined}>
            <SourceFileRow
              name={document.name}
              selected={selectedPaths.some(path => JSON.stringify(path) === JSON.stringify(document.path))}
              previewing={false}
              selecting={true}
              selectionDisabled={document.contentAvailable === false}
              previewDisabled={document.contentAvailable === false}
              onToggle={() => onToggle(document.path)}
              onLongSelect={() => onToggle(document.path)}
              onPreview={() => onOpenFile(document.path)}
            />
            <div className={styles.findMeta}>
            {document.retrieval && <p className={styles.findStatus} data-find-semantic>{document.retrieval.lexical ? "단어·의미 검색에서 함께 찾음" : "뜻이 비슷한 후보"} · 필수 조건 확인 · 본문 {document.retrieval.start + 1}~{document.retrieval.end}자{document.retrieval.partial ? " · 일부 본문만 준비됨" : ""}</p>}
            {document.finding.matches && Object.values(document.finding.matches).some(terms => terms.length > 0) && <p className={styles.note} data-find-fields>{[
              document.finding.matches.name.length > 0 && "이름",
              document.finding.matches.path.length > 0 && "폴더 경로",
              document.finding.matches.body.length > 0 && "본문",
            ].filter(Boolean).join(" · ")} 일치</p>}
            {document.contentAvailable === false && <p className={styles.findStatus}>본문 미확인 · 선택 불가</p>}
            {document.finding.relevance?.kind === "related" && <p className={styles.findStatus} data-find-related>관련 자료 · 선호 조건 미확인: {document.finding.relevance.missing.join(", ")}</p>}
            {((document.contentAvailable !== false && document.finding.relevance?.kind !== "related") || document.finding.kind !== "matched" || document.finding.dates.length > 0) && <p className={styles.findStatus} data-verified={document.finding.kind === "matched"}>
              {document.finding.kind === "matched"
                ? document.contentAvailable === false ? "날짜 조건 일치" : document.retrieval ? "필수 조건 확인" : document.finding.relevance?.kind === "related" ? "필수 조건 일치" : "조건 일치"
                : document.finding.kind === "date-unknown"
                  ? "날짜 확인 필요"
                  : "여러 날짜가 있어 확인 필요"}
              {document.finding.dates.length > 0 &&
                ` · ${document.finding.dates.join(", ")}`}
            </p>}
                <details className={styles.findEvidence}>
                  <summary>{document.contentAvailable === false ? "파일 위치와 일치 근거" : "왜 후보인가요? · 근거와 위치"}</summary>
                  <p className={styles.note}>{[folderName, ...document.path].join(" / ")}</p>
                  <p className={styles.note}>{document.contentAvailable === false ? "파일 목록에서 확인한 이름과 경로입니다. 본문은 확인하지 못했습니다." : "검색 시점의 내용입니다. 최종 판단 전에 원문을 확인해 주세요."}{document.ocr && " OCR 인식 글은 원본과 대조해 주세요."}</p>
                  {document.finding.evidence.map((line, index) => (
                    <blockquote key={index}>
                      {line}
                    </blockquote>
                  ))}
                </details>
            </div>
          </li>
        ))}
      </ul>
      {visible.length < result.documents.length
        && (
          <button
            type="button"
            className={actionClasses("secondary")}
            onClick={() => setLimit(limit + 20)}
          >
            다음 후보 20개 보기
          </button>
        )}
      {(!result.complete || result.excluded.length > 0)
        && (
          <details className={findStyles.coverage}>
            <summary><Icon name="warning" size={16} />{result.complete ? "본문을 읽지 못한 항목" : "일부 자료는 확인하지 못했어요"}<span>{result.excluded.length ? `${result.excluded.length}개 · 상세 보기` : "검색 한도 · 상세 보기"}</span></summary>
            <dl>{[...new Set(result.excluded.map(entry => entry.reason))].map(reason => <div key={reason} style={{ display: "contents" }}><dt>{reasons[reason] ?? "읽기 또는 탐색 한도"}</dt><dd>{result.excluded.filter(entry => entry.reason === reason).length}개</dd></div>)}</dl>
            {result.limits.length > 0 && <p>탐색·본문 읽기·결과 수 한도로 일부 범위를 표시하지 못했습니다.</p>}
            <ul>
              {result.excluded.slice(0, excludedLimit).map((entry, index) => (
                <li key={index}>
                  {entry.path.join(" / ")} ·{" "}
                  {reasons[entry.reason] ?? "읽기 또는 탐색 한도 문제"}
                </li>
              ))}
            </ul>
            {excludedLimit < result.excluded.length && <button type="button" className={actionClasses("secondary")} onClick={() => setExcludedLimit(value => value + 20)}>제외 항목 20개 더 보기</button>}
          </details>
        )}
    </section>
  );
}

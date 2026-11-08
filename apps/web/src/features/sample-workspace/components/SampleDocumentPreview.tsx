import type { RefObject } from "react";
import Image from "next/image";
import type { SampleDocument } from "../../../shared/sample-contract";
import { actionClasses } from "../../../components/ui/action-classes";
import styles from "./sample-workspace.module.css";

export function SampleDocumentPreview({ document, headingRef }: { document: SampleDocument; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const asset = `/demo/assets/${encodeURIComponent(document.id)}`;
  return (
    <section className={styles.preview} aria-labelledby="sample-preview-title" id="sample-preview">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="sample-preview-title" ref={headingRef} tabIndex={-1}>
            {document.name}
          </h2>
          <p>{document.format.toUpperCase()} · 준비된 샘플 문서</p>
        </div>
        <a href={asset} download={document.name} className={actionClasses("secondary")}>
          파일 받기
        </a>
      </div>
      {document.format === "pdf" ? (
        <>
          <div className={styles.pdf} aria-label={`${document.name} PDF 페이지 미리보기`}>
            {Array.from({ length: document.pageCount ?? 0 }, (_, index) => (
              <figure key={index}>
                <Image
                  unoptimized
                  src={`${asset}?page=${index + 1}`}
                  width={595}
                  height={842}
                  alt={`${document.name} ${index + 1}쪽`}
                />
                <figcaption>
                  {index + 1} / {document.pageCount}쪽
                </figcaption>
              </figure>
            ))}
          </div>
          <details className={styles.textExcerpt}>
            <summary>분류에 사용한 발췌 읽기</summary>
            <pre className={styles.documentText}>{document.excerpt}</pre>
          </details>
        </>
      ) : document.sheet ? (
        <div className={styles.sheetScroll}>
          <table className={styles.sheet}>
            <caption>{document.sheet.name} · 샘플 파일에서 확인한 셀 · 시간 단위: 시간</caption>
            <thead>
              <tr>
                {document.sheet.rows[0].map((cell, index) => (
                  <th scope="col" key={index}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {document.sheet.rows.slice(1).map((row, index) => (
                <tr key={index}>
                  {row.map((cell, column) => (
                    <td key={column} data-number={typeof cell === "number" || undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className={styles.documentText}>{document.excerpt}</pre>
      )}
    </section>
  );
}

"use client";

import type { OrganizationPreparationState } from "../../store/organization-preparation-controller";
import styles from "./organization-preparation.module.css";

export function OrganizationResultView({
  state,
}: {
  state: OrganizationPreparationState;
}) {
  if (!state.result || !state.snapshot) return null;

  const { organization, model, usage } = state.result;
  const name = (id: string) =>
    state.snapshot?.documents
      .find((document) => document.id === id)
      ?.path.join(" / ") ?? id;

  return (
    <section
      className={styles.snapshot}
      aria-label="AI 정리 제안"
      data-live-result
    >
      <h3>
        {organization.held.length ? "확인이 필요한 자료" : "정리 제안"}
      </h3>
      <p>
        {organization.summary}
      </p>
      <p className={styles.note}>
        이 목록은 AI 제안입니다. 실제 실행 여부는 아래 작업 결과와 보존 기록에서
        확인합니다.
      </p>
      <details>
        <summary>제안 근거·확인 대상 상세</summary>
        <h4>일치 자료 {organization.matches.length}개</h4>
        <ul className={styles.exclusions}>
          {organization.matches.map((match) => (
            <li key={match.documentId}>
              <strong>
                {name(match.documentId)}
              </strong>
              <p>제안 하위 경로: {match.destination.join(" / ")}</p>
              <blockquote>
                {match.evidence}
              </blockquote>
              {match.date && <p>본문 날짜: {match.date}</p>}
            </li>
          ))}
        </ul>
        <h4>확인 필요 {organization.held.length}개</h4>
        <ul className={styles.exclusions}>
          {organization.held.map((item) => (
            <li key={item.documentId}>
              <strong>
                {name(item.documentId)}
              </strong>
              <p>
                {item.reason}
              </p>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          {model} · 입력 {usage.inputTokens} / 출력 {usage.outputTokens} / 합계{" "}
          {usage.totalTokens}
          토큰
        </p>
      </details>
    </section>
  );
}

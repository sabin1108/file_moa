"use client";

import { useState } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import { estimateUsageCost, REVIEWED_TOKEN_PRICES, type UsageSummary } from "../../../shared/ai-usage";
import styles from "./ai-library.module.css";

export function UsageView({ read }: { read: () => Promise<UsageSummary | null> }) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  return <section className={styles.usage} aria-label="AI 사용량">
    <button
      type="button"
      className={actionClasses("secondary")}
      disabled={pending}
      onClick={() => {
        setPending(true);
        void read().then(value => {
          setSummary(value);
          setNotice(value ? "" : "로그인 상태를 확인해 주세요.");
        }, () => setNotice("사용량을 읽지 못했어요.")).finally(() => setPending(false));
      }}
    >
      {pending ? "조회 중" : "현재 사용량 조회"}
    </button>
    {notice && <p role="status">
      {notice}
    </p>}
    {summary && <>
      <div className={styles.usageCount}>
        <strong>
          {summary.used}
          <small> / {summary.limit}회</small>
        </strong>
        <span>최근 1시간 사용</span>
      </div>
      <progress aria-label="최근 1시간 사용량" value={summary.used} max={summary.limit} />
      <p>남은 요청 {Math.max(0, summary.limit - summary.used)}회 · 실패·중지 포함</p>
      <p>
        {summary.retryAfter ? `다시 요청할 수 있을 때까지 약 ${summary.retryAfter}초` : "서버 공유 한도에 따라 더 일찍 제한될 수 있어요."}
      </p>
      {summary.ledger !== "enabled" && <p>
        {summary.ledger === "not-enabled" ? "서버 사용량 원장은 DB 변경을 적용한 뒤 활성화됩니다. 이전 요청의 토큰은 소급 수집하지 않습니다." : "서버 사용량 원장을 읽지 못했어요."}
      </p>}
      <details className={styles.details}>
        <summary>요청별 사용 내역 · {summary.entries.length}개</summary>
        <ul>
          {summary.entries.map(entry => {
            const usage = entry.inputTokens !== null && entry.outputTokens !== null && entry.totalTokens !== null
              ? { inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, totalTokens: entry.totalTokens }
              : null;
            const cost = entry.provider === "openai" || entry.provider === "gemini"
              ? estimateUsageCost(entry.provider, entry.model ?? "", usage, REVIEWED_TOKEN_PRICES)
              : null;

            return <li key={entry.requestId}>{new Date(entry.createdAt).toLocaleString("ko-KR")} · {entry.operation === "chat" ? "대화" : entry.operation === "grounded" ? "자료 질문" : "자료 정리"} · {entry.status === "reserved"
              ? "처리 중 또는 결과 확인 안 됨"
              : entry.status === "unknown"
                ? "사용량 확인 안 됨"
                : `${entry.inputTokens} 입력 / ${entry.outputTokens} 출력 / ${entry.totalTokens} 전체 토큰`} · {entry.model ?? entry.provider} · {cost === null ? "비용 확인 안 됨" : `표준 예상 $${cost.toFixed(6)}`}</li>;
          })}
        </ul>
        <p>예상 비용은 2026-11-09 확인한 표준 텍스트 단가를 사용하며 캐시 할인·지역 추가 요금은 제외합니다. 단가가 등록되지 않은 모델은 계산하지 않습니다. 공급자의 실제 청구서와 다를 수 있습니다.</p>
      </details>
    </>}
  </section>;
}

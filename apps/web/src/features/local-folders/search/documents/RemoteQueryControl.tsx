"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchQueryAction, SearchQueryResult } from "../../../../shared/search-query";
import type { ConnectionOwner } from "../../types";
import type { FindFilters } from "./document-find";
import { applySearchQuerySuggestion } from "./remote-query-suggestion";
import { actionClasses } from "../../../../components/ui/action-classes";
import { LIVE_AI_MESSAGES } from "../../../../shared/live-organization";

export function RemoteQueryControl({ action, owner, question, filters, onApply }: {
  action: SearchQueryAction; owner: ConnectionOwner; question: string; filters: FindFilters; onApply: (filters: Partial<FindFilters>) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState<{ result: Extract<SearchQueryResult, { ok: true }>; key: string } | null>(null);
  const generation = useRef(0);

  useEffect(() => () => { generation.current++; }, []);

  const request = async () => {
    if (!consent || pending) return;

    const current = ++generation.current;
    const key = JSON.stringify(filters);

    setPending(true);
    setProposal(null);
    setNotice("");

    try {
      const result = await action({ requestId: `${Date.now()}:${crypto.randomUUID()}`, owner: { userId: owner.userId, workspaceId: owner.workspaceId }, consent: true, question });

      if (current !== generation.current) return;

      if (!result.ok) setNotice(LIVE_AI_MESSAGES[result.code] + (result.retryAfter ? ` 약 ${result.retryAfter}초 뒤 다시 시도할 수 있어요.` : ""));
      else if (result.question !== question) setNotice("조건 해석을 받지 못했어요. 현재 로컬 검색 조건을 그대로 사용합니다.");
      else {
        applySearchQuerySuggestion(question, result.suggestion, filters);
        setProposal({ result, key });
      }
    } catch {
      if (current === generation.current) setNotice("원문이나 확인한 조건과 맞지 않는 제안은 적용하지 않았어요.");
    } finally { if (current === generation.current) setPending(false); }
  };

  return <details data-remote-query>
    <summary>AI로 질문의 검색 조건 해석</summary>
    <p>아래 질문만 앱 서버와 설정한 AI 공급자에게 보냅니다. 파일 목록·이름·경로·본문·이전 대화는 추가하지 않습니다. AI 사용 한도가 적용됩니다.</p>
    <blockquote>{question}</blockquote>
    <label><input type="checkbox" checked={consent} disabled={pending} onChange={event => setConsent(event.target.checked)} />이 질문 전송에 동의합니다.</label>
    <button type="button" className={actionClasses("secondary")} disabled={!consent || pending} onClick={() => { void request(); }}>질문만 보내 조건 제안 받기</button>
    {pending && <button type="button" onClick={() => { generation.current++; setPending(false); setNotice("응답 대기를 취소했어요. 이미 전송한 요청은 사용 한도에 포함될 수 있습니다."); }}>응답 대기 취소</button>}
    {proposal && <div>
      <p>필수: {[...proposal.result.suggestion.required, ...proposal.result.suggestion.phrases].map(span => span.text).join(" · ")}</p>
      <p>선호: {proposal.result.suggestion.preferred.map(span => span.text).join(" · ") || "없음"} · 제외: {proposal.result.suggestion.excluded.map(span => span.text).join(" · ") || "없음"}</p>
      <button type="button" className={actionClasses("secondary")} disabled={proposal.key !== JSON.stringify(filters)} onClick={() => { onApply(applySearchQuerySuggestion(question, proposal.result.suggestion, filters)); setProposal(null); setConsent(false); setNotice("제안한 조건을 적용했어요. 확인한 뒤 로컬 검색을 시작해 주세요."); }}>이 조건으로 적용</button>
      {proposal.key !== JSON.stringify(filters) && <p>검색 조건이 바뀌었어요. 현재 조건으로 다시 제안을 받아 주세요.</p>}
    </div>}
    <p role="status">{notice}</p>
  </details>;
}

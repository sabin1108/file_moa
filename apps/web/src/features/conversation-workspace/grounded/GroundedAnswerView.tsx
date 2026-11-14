"use client";

import { actionClasses } from "../../../components/ui/action-classes";
import type { useGroundedConversation } from "./useGroundedConversation";
import { useState } from "react";
import type { GroundedEvidence } from "../../../shared/grounded-evidence";
import styles from "./grounded-answer.module.css";

type Grounded = ReturnType<typeof useGroundedConversation>;

export function GroundedConsent({ conversation }: { conversation: Grounded }) {
  return <section aria-label="선택 자료 전송 확인">
    <p>선택한 {conversation.documents.length}개 자료의 파일 이름과 확인한 발췌를 전송합니다. 전체 원문을 읽은 답변으로 취급하지 마세요.</p>
    <label><input
      type="checkbox"
      checked={conversation.consented}
      disabled={conversation.pending}
      onChange={event => conversation.setConsent(event.target.checked)}
    /> 질문·파일 이름·발췌를 현재 AI 공급자에게 보내는 데 동의합니다.</label>
    <details><summary>앱 서버에 전달되는 정보</summary><p>질문과 선택 자료의 이름·발췌·경로·해시·크기·수정 시각을 앱 서버로 보냅니다. AI 공급자에는 질문·파일 이름·발췌를 보냅니다.</p></details>
    {conversation.notice && <p role="status">
      {conversation.notice}
    </p>}
  </section>;
}

export function GroundedAnswerView({ conversation, allowWikiSave = true }: {
  conversation: Grounded;
  allowWikiSave?: boolean
}) {
  const [wikiTarget, setWikiTarget] = useState("");
  const { result, documents } = conversation;

  if (!result) return null;

  return <section aria-label="자료 근거 답변">
    <GroundedCitations
      citations={result.value.citations.flatMap(citation => {
        const document = documents.find(document => document.id === citation.documentId);

        return document ? [{ path: document.path, quote: citation.quote }] : [];
      })}
      onOpen={index => conversation.openCitation(result.value.citations[index].documentId)}
    />
    <button
      type="button"
      className={actionClasses("ghost")}
      disabled={!conversation.canSave}
      onClick={conversation.saveResult}
    >답변·근거를 결과물로 저장</button>
    {result.value.citations.length > 0 && <div className={styles.wikiSave}>
      {conversation.wikiTargets.length > 0 && <label>위키 저장 대상<select
        aria-label="위키 저장 대상"
        value={wikiTarget}
        onChange={event => setWikiTarget(event.target.value)}
      >
        <option value="">새 위키</option>
        {conversation.wikiTargets.map(target => <option key={target.id} value={target.id}>{target.title} · 새 초안 제안</option>)}
      </select></label>}
      <button
        type="button"
        className={actionClasses("secondary")}
        disabled={!conversation.canSave || !allowWikiSave}
        onClick={() => conversation.saveWiki(wikiTarget || undefined)}
      >
        {wikiTarget ? "위키에 새 초안 제안" : "위키로 저장"}
      </button>
    </div>}
    {conversation.notice && <p role="status">
      {conversation.notice}
    </p>}
  </section>;
}

function GroundedCitations({ citations, onOpen, disabled }: {
  citations: readonly {
    path: readonly string[];
    quote: string
  }[];
  onOpen: (index: number) => void;
  disabled?: boolean
}) {
  return citations.length
    ? <ul className={styles.citations}>
      {citations.map((citation, index) => <li key={index}><q>
        {citation.quote}
      </q> · <button
        type="button"
        className={actionClasses("ghost")}
        disabled={disabled}
        onClick={() => onOpen(index)}
      >{citation.path.join(" / ")} 원문 열기</button></li>)}
    </ul>
    : <p>확인할 인용이 없습니다. 발췌에서 답을 찾지 못했을 수 있습니다.</p>;
}

export function SavedGroundedAnswer({ evidence, onOpen, disabled }: {
  evidence: GroundedEvidence;
  onOpen: (evidence: GroundedEvidence, index: number) => Promise<string>;
  disabled: boolean
}) {
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const open = async (index: number) => {
    setPending(true);
    setNotice("");

    try {
      setNotice(await onOpen(evidence, index));
    }
    catch {
      setNotice("근거를 확인하지 못했어요. 자료 폴더와 파일을 확인해 주세요.");
    }
    finally {
      setPending(false);
    }
  };

  return <section aria-label="저장된 자료 근거">
    <GroundedCitations
      citations={evidence.citations}
      onOpen={index => {
        void open(index);
      }}
      disabled={disabled || pending}
    />
    {pending && <p role="status">현재 파일과 저장한 근거를 확인하고 있어요.</p>}
    {notice && <p role="status">
      {notice}
    </p>}
  </section>;
}

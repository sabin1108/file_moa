"use client";

import { useSyncExternalStore } from "react";
import { GuardedLink } from "../../../components/navigation/NavigationGuard";
import { actionClasses } from "../../../components/ui/action-classes";
import { useSharedSourceFolderConnection } from "../../local-folders/SourceFolderProvider";
import { SourceConnectionControl } from "../../local-folders/connection/SourceConnectionControl";
import { OrganizationDocumentsView } from "../../local-folders/organization/OrganizationDocumentsView";
import type { useGroundedConversation } from "./useGroundedConversation";
import { GroundedConsent } from "./GroundedAnswerView";
import styles from "../conversation-options.module.css";

export function GroundedPreparationPanel({ conversation, question, available, disabled, onPrepare, onReprepare, onFind }: {
  conversation: ReturnType<typeof useGroundedConversation>;
  question: string;
  available: boolean;
  disabled: boolean;
  onPrepare: () => void;
  onReprepare: () => void;
  onFind: () => void;
}) {
  const local = useSharedSourceFolderConnection();
  const preparation = useSyncExternalStore(local.organization.subscribe, local.organization.getSnapshot, local.organization.getServerSnapshot);
  const files = useSyncExternalStore(local.listing.subscribe, local.listing.getSnapshot, local.listing.getServerSnapshot);
  const selected = files.phase === "ready" && !files.stale ? files.result?.entries.filter(entry => entry.kind === "file" && files.selectedNames.includes(entry.name)).length ?? 0 : 0;
  const needsSelection = !!preparation.snapshot && !preparation.snapshot.complete && preparation.scope?.kind !== "selected";

  return <section className={styles.sourcePreparation} aria-label="질문할 자료 준비" data-grounded-preparation>
    <strong>{preparation.snapshot ? `질문에 참고할 자료 ${conversation.documents.length}개` : "질문할 자료를 먼저 골라 주세요"}</strong>
    {local.state.view?.status !== "connected" ? <SourceConnectionControl /> : <div className={styles.messageActions}>
        <GuardedLink href="/files" className={actionClasses("secondary")} data-grounded-select>파일에서 고르기</GuardedLink>
        {selected > 0 && <button type="button" data-grounded-read className={actionClasses(preparation.snapshot ? "secondary" : "primary")} disabled={disabled || !question.trim()} onClick={onPrepare}>선택한 {selected}개 자료 읽기</button>}
    </div>}
    {!preparation.snapshot && <>
      <p>파일 목록을 찾고 싶다면 <button type="button" data-grounded-find className={actionClasses("ghost")} disabled={disabled} onClick={onFind}>자료 찾기로 전환</button></p>
      {selected > 0 && !question.trim() && <p>아래에 질문을 입력한 뒤 자료를 읽어 주세요.</p>}
    </>}
    {preparation.issue && <p role="status">{preparation.issue}</p>}
    {preparation.snapshot && question.trim() && !conversation.matchesQuestion && <div>{needsSelection
      ? <p>이전 폴더 범위를 일부만 확인했어요. 파일에서 질문할 자료를 다시 골라 주세요.</p>
      : <><p>질문이 바뀌었어요. 선택한 자료를 현재 질문으로 다시 읽어 주세요.</p><button type="button" data-grounded-reread className={actionClasses("primary")} disabled={disabled || !conversation.documents.length} onClick={onReprepare}>이 질문으로 다시 읽기</button></>}</div>}
    {preparation.snapshot && <details>
      <summary>질문할 자료 {conversation.documents.length}개 · 발췌 확인</summary>
      <OrganizationDocumentsView documents={preparation.snapshot.documents} selectedIds={preparation.selectedIds} candidateIds={preparation.candidateIds} pending={disabled} onToggle={local.organization.toggleDocument} />
    </details>}
    {preparation.snapshot && !preparation.snapshot.complete && <label>
      <input type="checkbox" aria-label="일부 자료만 사용" checked={preparation.partialAccepted} disabled={disabled} onChange={event => local.organization.acceptPartial(event.target.checked)} /> 읽을 수 있었던 일부 자료만 사용합니다.
    </label>}
    {conversation.documents.length > 0 && conversation.matchesQuestion && <GroundedConsent conversation={conversation} />}
    {!available && <p role="status">AI 연결을 사용할 수 없어 질문 전송이 꺼져 있어요.</p>}
  </section>;
}

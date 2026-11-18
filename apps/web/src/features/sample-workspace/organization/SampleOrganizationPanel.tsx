"use client";

import { useState, useSyncExternalStore } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { SelectionWorkspaceDialog } from "../../local-folders/destination-picker/SelectionWorkspaceDialog";
import { DestinationFolderPicker } from "../../local-folders/destination-picker/DestinationFolderPicker";
import { OrganizationConversationView } from "../../local-folders/organization/OrganizationConversationView";
import { OrganizationDocumentsView } from "../../local-folders/organization/OrganizationDocumentsView";
import { OrganizationQuestionsView } from "../../local-folders/organization/OrganizationQuestionsView";
import { organizationConversationPrompt } from "../../local-folders/organization/organization-conversation";
import { hasUnansweredReview } from "../../../shared/live-organization-review";
import { SAMPLE_ORGANIZATION_LIMITS } from "../../../shared/sample-organization";
import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SampleWorkspaceStore } from "../sample-workspace-store";
import { sampleActiveCatalog } from "../sample-state";
import { organizationPathSchema } from "../../../shared/organization";
import { SamplePlanReview } from "./SamplePlanReview";
import styles from "../../local-folders/organization/organization-preparation.module.css";

export function SampleOrganizationPanel({ catalog, store, provider, onReply, onTransmit, disabled }: {
  catalog: SampleCatalog;
  store: SampleWorkspaceStore;
  provider: string | null;
  onReply: (text: string) => void;
  onTransmit: () => void;
  disabled: boolean;
}) {
  const controller = store.organization;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const { state: sample } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const picker = useSyncExternalStore(controller.picker.subscribe, controller.picker.getSnapshot, controller.picker.getServerSnapshot);
  const [selecting, setSelecting] = useState(false);
  const [assignment, setAssignment] = useState("same");
  const [folderIssue, setFolderIssue] = useState<string | null>(null);
  const [acceptedProvider, setAcceptedProvider] = useState<string | null>(null);
  const busy = disabled || ["reading", "checking", "sending"].includes(state.phase);
  const selected = state.snapshot?.documents.filter(document => state.selectedIds.includes(document.id)) ?? [];
  const characters = selected.reduce((sum, document) => sum + document.excerpt.length, 0);
  const selectionIssue = selected.length > SAMPLE_ORGANIZATION_LIMITS.documents || characters > SAMPLE_ORGANIZATION_LIMITS.excerptCharacters;
  const questioning = state.questions.length > 0 && !state.reviewConfirmed;
  const planning = sample.phase === "review" && !sample.organization?.response.held.length && (!state.result || (!questioning && !state.result.organization.held.length));
  const prompt = organizationConversationPrompt(state, provider ?? "외부 AI");
  const tellPrompt = () => store.dispatch({ type: "conversation", author: "assistant", text: `${organizationConversationPrompt(controller.getSnapshot()).title}\n${organizationConversationPrompt(controller.getSnapshot()).text}` });

  return <section data-sample-preparation className={styles.preparation} aria-label="예시 자료 정리">
    <p className={styles.note}>예시 자료와 복구 기능이 준비되어 있어요. 이 체험에서는 샘플만 바뀌며 개인 폴더를 연결하지 않습니다.</p>
    {!planning && !state.snapshot && <form className={styles.basis} onSubmit={event => {
      event.preventDefault();
      const parsed = organizationPathSchema.safeParse([String(new FormData(event.currentTarget).get("folder") ?? "").trim()]);
      if (!parsed.success) { setFolderIssue("폴더 이름은 64자 이내로, 경로 기호 없이 적어 주세요."); return; }
      setFolderIssue(null);
      controller.update({ destination: ["정리한 자료", ...parsed.data] });
      void controller.beginConversation().then(tellPrompt);
    }}><label>정리용 폴더<input name="folder" defaultValue={state.destination?.at(-1) ?? "정리 결과"} maxLength={64} required disabled={busy} /></label>
      <p>정리한 자료 / {state.destination?.at(-1) ?? "정리 결과"} 안에 모읍니다. 검토 후 적용할 때 폴더를 만들어요.</p>
      <button type="submit" className={actionClasses("secondary")} disabled={busy}>정리용 폴더 이름 반영</button>
      {folderIssue && <p role="alert">{folderIssue}</p>}
    </form>}
    {state.issue && <StatusNotice state="attention" title={state.issue} />}
    {state.conversationStep && state.conversationStep !== "scope" && <button type="button" className={actionClasses("ghost")} disabled={busy} onClick={() => {
      controller.backConversation(); tellPrompt();
    }}>이전 질문</button>}
    {!planning && <OrganizationConversationView state={state} folderName="예시 자료"
      files={{ available: true, phase: "idle", result: null, requestedPath: [], stale: false, issue: null, selectedNames: [], query: "", searchOpen: false, selectionOpen: false }}
      onReply={onReply} onChooseFolder={() => void controller.browse(state.conversationStep === "destination" ? "destination" : "scope")} />}
    {questioning && <>
      <OrganizationQuestionsView controller={controller} state={state} assignment={assignment} onAssignment={setAssignment} />
      <button type="button" className={actionClasses("primary")} disabled={busy || hasUnansweredReview(state.questions, state.answers)} onClick={() => {
        controller.confirmReview(); tellPrompt();
      }}>답변 확인 완료</button>
    </>}
    {state.snapshot && !state.conversationStep && !questioning && !planning && sample.phase !== "result" && <section aria-label="전송 전 예시 자료 확인" className={styles.snapshot}>
      <button type="button" className={actionClasses("secondary")} disabled={busy} onClick={() => setSelecting(true)}>자료 선택 · {state.selectedIds.length} / {state.snapshot.documents.length}개 · 발췌 확인</button>
      <p>{provider ?? "외부 AI"}에 선택한 예시 자료의 이름·경로·발췌와 정리 조건을 보냅니다. 발췌 {characters.toLocaleString()}자.</p>
      {selectionIssue && <p role="alert">최대 {SAMPLE_ORGANIZATION_LIMITS.documents}개·{SAMPLE_ORGANIZATION_LIMITS.excerptCharacters.toLocaleString()}자까지 선택해 주세요.</p>}
      <label className={styles.check}><input type="checkbox" data-demo-ai-consent checked={!!state.consentKey && acceptedProvider === provider} disabled={busy || !provider || selectionIssue}
        onChange={event => { controller.consent(event.target.checked); setAcceptedProvider(event.target.checked ? provider : null); }} />선택한 발췌와 정리 조건의 외부 AI 전송에 동의해요.</label>
      <button type="button" className={actionClasses("primary")} disabled={busy || !provider || !state.consentKey || acceptedProvider !== provider || selectionIssue} onClick={onTransmit}>확인한 자료를 AI에 전송</button>
    </section>}
    {planning && <SamplePlanReview catalog={sampleActiveCatalog(catalog, sample)} state={sample} disabled={busy} dispatch={action => {
      store.dispatch(action);
      if (action.type === "back") { controller.backConversation(); tellPrompt(); }
    }} />}
    {sample.phase === "result" && <StatusNotice state="success" title={`${sample.lastApplied?.documentIds.length ?? 0}개 예시 자료 정리 완료`} detail="검토한 변경만 샘플에 적용했어요. 아래에서 되돌릴 수 있습니다." />}
    {sample.lastApplied && sample.phase !== "review" && <button type="button" className={actionClasses("secondary")} disabled={busy} onClick={() => {
      store.dispatch({ type: "undo" }); controller.reset();
    }}>이번 정리 되돌리기</button>}
    {selecting && state.snapshot && <SelectionWorkspaceDialog title="정리 자료 선택과 발췌 확인" onClose={() => setSelecting(false)}>
      <p>선택 {state.selectedIds.length} / {state.snapshot.documents.length}개 · 추천 밖의 자료도 직접 선택할 수 있어요.</p>
      <OrganizationDocumentsView documents={state.snapshot.documents} selectedIds={state.selectedIds} candidateIds={state.candidateIds} pending={busy} onToggle={controller.toggleDocument} showVersionDetails={false} />
    </SelectionWorkspaceDialog>}
    {picker.open && state.picking && <SelectionWorkspaceDialog title={`${state.picking === "scope" ? "정리 범위" : "목적지"} 폴더 선택`} onClose={controller.closePicker}>
      <DestinationFolderPicker controller={controller.picker} state={picker} folderName="예시 자료" purpose={state.picking === "scope" ? "탐색 범위" : "목적지"} hideHeader showFiles allowCreation={false}
        onChoose={() => { controller.chooseFolder(); if (!controller.getSnapshot().picking) tellPrompt(); }} onCancel={controller.closePicker} />
      {state.picking === "answer" && <form className={styles.basis} onSubmit={event => {
        event.preventDefault();
        controller.chooseAnswerFolder(String(new FormData(event.currentTarget).get("destination") ?? "").trim().split("/"));
      }}><label>새 하위 폴더 경로<input name="destination" maxLength={120} required placeholder="예: 영어/웹 개발" /></label><p>지금 만들지 않고 변경 계획에 반영합니다.</p><button type="submit" className={actionClasses("secondary")}>이 경로로 지정</button></form>}
      {state.issue && <p role="alert">{state.issue}</p>}
    </SelectionWorkspaceDialog>}
    {!state.snapshot && !state.conversationStep && !planning && <p>{prompt.text}</p>}
  </section>;
}

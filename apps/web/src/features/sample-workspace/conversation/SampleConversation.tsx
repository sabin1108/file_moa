"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AI_PROVIDER_LABELS, type AiProvider } from "../../../shared/ai-provider";
import Link from "next/link";
import { ConversationWorkspace } from "../../../components/layout/ConversationWorkspace";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import { WorkflowTransition } from "../../../components/ui/WorkflowTransition";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { actionClasses } from "../../../components/ui/action-classes";
import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SampleOrganizationAction } from "../../../shared/sample-organization";
import { sampleActiveCatalog, sampleFolderPath, sampleQuestionSelection } from "../sample-state";
import type { SampleWorkspaceStore } from "../sample-workspace-store";
import { SampleDocumentPreview } from "../files/SampleDocumentPreview";
import { SampleFolderPanel } from "../files/SampleFolderPanel";
import styles from "../sample-workspace.module.css";
import { SampleFolderTree } from "../files/SampleFolderTree";
import { ConversationTaskControls, ConversationTaskIntro, conversationInputPlaceholder } from "../../conversation-workspace/material-work/ConversationTaskControls";
import type { ConversationKind } from "../../../shared/ai-records";
import { SampleLibraryPanel } from "./SampleLibraryPanel";
import { ConversationContextBar, type ConversationPanelView } from "../../conversation-workspace/ConversationContextBar";
import { ConversationSettingsPanel } from "../../conversation-workspace/settings/ConversationSettingsPanel";
import { AI_DAILY_LIMITS } from "../../../shared/ai-daily-limits";
import { replayWorkspaceTour } from "../../onboarding/workspace-tour";
import { useWorkspaceTourRecordView } from "../../onboarding/workspace-tour-view";
import { ConversationPanelNavigation } from "../../conversation-workspace/ConversationPanelNavigation";
import options from "../../conversation-workspace/conversation-options.module.css";
import { SAMPLE_ANSWER_LIMITS, type SampleAnswerAction } from "../../../shared/sample-answer";
import { SampleOrganizationPanel } from "../organization/SampleOrganizationPanel";
import { SampleMaterialPicker } from "./SampleMaterialPicker";
import { organizationConversationPrompt } from "../../local-folders/organization/organization-conversation";

export function SampleConversation({ catalog, store, organizeAction, answerAction, aiProvider = "gemini" }: {
  catalog: SampleCatalog;
  store: SampleWorkspaceStore;
  organizeAction: SampleOrganizationAction;
  answerAction: SampleAnswerAction;
  aiProvider?: AiProvider | null
}) {
  const { state, ready, expired, notice, aiPending, streamText, streamId } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const preparation = useSyncExternalStore(store.organization.subscribe, store.organization.getSnapshot, store.organization.getServerSnapshot);
  const [replying, setReplying] = useState(false);
  const [selectingMaterials, setSelectingMaterials] = useState(false);
  const activeCatalog = sampleActiveCatalog(catalog, state);
  const scope = state.scope;
  const [consent, setConsent] = useState<string | null>(null);
  const [consentProvider, setConsentProvider] = useState(aiProvider);

  if (consentProvider !== aiProvider) {
    setConsentProvider(aiProvider);
    setConsent(null);
  }

  const path = state.path;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const started = state.mode !== null || state.messages.length > 0;
  const mode = state.mode ?? "organize";
  const latestAssistantId = state.messages.filter(message => message.author === "assistant").at(-1)?.id;
  const selectedIds = mode === "grounded" ? sampleQuestionSelection(catalog, state) : state.selected;
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [panelView, setPanelView] = useState<ConversationPanelView>("records");
  const tourRecordKind = useWorkspaceTourRecordView();
  const showingRecords = !!tourRecordKind || recordsOpen;
  const [requestEdit, setRequestEdit] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const transferVersion = useRef(0);
  const scopedDocuments = activeCatalog.documents.filter(document => scope === "all"
    || (scope === "selected"
      ? selectedIds.includes(document.id)
      : path.every((part, index) => sampleFolderPath(activeCatalog, state.locations[document.id])[index] === part)));
  const documentIds = preparation.selectedIds;
  const consentKey = JSON.stringify([aiProvider, mode, state.materialRevision, state.draft.trim(), [...(mode === "grounded" ? selectedIds : mode === "organize" ? documentIds : [])].sort()]);
  const consented = !!aiProvider && (mode === "chat" || consent === consentKey);
  const questionDocuments = activeCatalog.documents.filter(document => selectedIds.includes(document.id));
  const questionScopeIssue = questionDocuments.length > SAMPLE_ANSWER_LIMITS.documents
    ? `질문 자료는 최대 ${SAMPLE_ANSWER_LIMITS.documents}개까지 선택해 주세요.`
    : questionDocuments.reduce((sum, document) => sum + document.excerpt.length, 0) > SAMPLE_ANSWER_LIMITS.excerptCharacters
      ? `질문 자료의 발췌는 합계 ${SAMPLE_ANSWER_LIMITS.excerptCharacters}자까지입니다. 선택을 줄여 주세요.` : null;
  const providerLabel = aiProvider ? AI_PROVIDER_LABELS[aiProvider] : "설정되지 않은 외부 AI";
  const disabled = !ready || expired || aiPending || replying || ["reading", "checking", "sending"].includes(preparation.phase);
  const consentDisabled = disabled || !aiProvider || !state.draft.trim();
  const needsConsent = !consentDisabled && !consented;
  const previewDocument = activeCatalog.documents.find(document => document.id === previewId);

  useEffect(() => {
    if (previewId) heading.current?.focus({ preventScroll: false });
  }, [previewId]);

  useEffect(() => {
    const unfinishedReview = state.phase === "review" && !!state.organization?.response.held.length;
    if (!ready || expired || state.mode !== "organize" || (state.phase !== "select" && !unfinishedReview) || store.organization.getSnapshot().request) return;
    if (unfinishedReview) store.dispatch({ type: "back" });
    store.organization.update({ request: "자료 정리", destination: ["정리한 자료", "정리 결과"] });
    void store.organization.beginConversation().then(() => {
      const prompt = organizationConversationPrompt(store.organization.getSnapshot());
      store.dispatch({ type: "conversation", author: "assistant", text: `${prompt.title}\n${prompt.text}` });
    });
  }, [ready, expired, state.mode, state.phase, state.organization, store]);

  useEffect(() => {
    if (ready && !expired && state.mode === "grounded" && !state.messages.some(message => message.author === "assistant")) {
      store.dispatch({ type: "conversation", author: "assistant", text: "질문할 자료를 선택하고 채팅에 궁금한 내용을 적어 주세요. 전송 전에 선택한 발췌를 확인할 수 있어요." });
    }
  }, [ready, expired, state.mode, state.messages, store]);

  const fill = (value: string) => {
    if (mode === "organize") {
      if (requestEdit !== null) setRequestEdit(value);
      else store.organization.updateReply(value);
    } else store.dispatch({ type: "draft", value });
    setConsent(null);
  };
  const openPreview = (id: string) => {
    panelTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPreviewId(id);
    setPanelOpen(true);
    setRecordsOpen(false);
    setPanelView("sources");
  };
  const openPanel = (view: ConversationPanelView, trigger?: HTMLElement) => {
    if (trigger) panelTrigger.current = trigger;
    setPanelView(view);
    setRecordsOpen(view === "records" || view === "storage");
    setPanelOpen(true);
  };
  const showOrganizationPrompt = () => {
    const prompt = organizationConversationPrompt(store.organization.getSnapshot(), providerLabel);
    store.dispatch({ type: "conversation", author: "assistant", text: `${prompt.title}\n${prompt.text}` });
  };
  const chooseTask = (kind: ConversationKind) => {
    transferVersion.current++;
    if (store.getSnapshot().state.phase === "review") store.dispatch({ type: "back" });
    store.dispatch({ type: "mode", mode: kind });
    setRequestEdit(null);
    setConsent(null);
    setPanelOpen(false);
    if (kind === "organize") {
      store.organization.reset();
      store.organization.update({ request: state.draft.trim() || "자료 정리", destination: ["정리한 자료", "정리 결과"] });
      void store.organization.beginConversation().then(showOrganizationPrompt);
    } else if (kind === "grounded") {
      store.dispatch({ type: "conversation", author: "assistant", text: "어떤 자료로 질문할까요? ‘질문할 자료 선택’에서 파일과 발췌를 살펴본 뒤 채팅에 궁금한 내용을 적어 주세요." });
    }
  };
  const transmitOrganization = async () => {
    if (!aiProvider || expired || !ready || aiPending) return;
    const version = ++transferVersion.current;
    await store.organization.sendPrepared(async prepared => {
      const instruction = prepared.request === "자료 정리" ? prepared.basis : `${prepared.request}\n${prepared.basis}`;
      return await store.requestOrganization(organizeAction, instruction, prepared.selectedIds, {
        reference: prepared.reference ? [...prepared.reference] : null,
        destination: prepared.destination ? [...prepared.destination] : null,
        answers: [...prepared.answers],
      }) ?? { ok: false, code: "unavailable" };
    });
    if (version === transferVersion.current) showOrganizationPrompt();
  };
  const replyOrganization = async (text: string) => {
    if (disabled) return;
    store.dispatch({ type: "conversation", author: "user", text });
    setReplying(true);
    try {
      if (/^(?:자료)?전송에\s*동의(?:해|해요|합니다)[.!?]?$/u.test(text.trim()) && store.organization.getSnapshot().snapshot) {
        store.organization.consent(true);
        await transmitOrganization();
      } else {
        await store.organization.replyToConversation(text, { currentPath: path });
        if (!store.organization.getSnapshot().issue) {
          store.organization.updateReply("");
          if (store.getSnapshot().state.phase === "review" && !store.organization.getSnapshot().result) store.dispatch({ type: "back" });
        }
        showOrganizationPrompt();
      }
    } finally { setReplying(false); }
  };
  const send = () => {
    if (mode === "organize") {
      if (requestEdit !== null) {
        if (state.phase === "review") store.dispatch({ type: "back" });
        store.organization.update({ request: requestEdit.trim() });
        setRequestEdit(null);
        void store.organization.beginConversation().then(showOrganizationPrompt);
      } else void replyOrganization(preparation.replyDraft);
      return;
    }
    panelTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (mode !== "chat") setPanelView("sources");
    if (mode !== "find" && !consented) return;
    setConsent(null);
    if (mode === "find") store.dispatch({ type: "sample-reply", mode, question: state.draft,
      selectedIds: scopedDocuments.map(document => document.id), referenceYear: new Date().getFullYear() });
    else void store.requestAnswer(answerAction, mode);
    if (mode === "find") { setRecordsOpen(false); setPanelOpen(true); }
  };

  return (
    <WorkspaceShell
      title="채팅"
      active="chat"
      mode="sample"
      folderTree={
        <SampleFolderTree
          catalog={activeCatalog}
          path={path}
          onOpen={value => {
            store.dispatch({ type: "scope", scope: "folder", path: value });
            setConsent(null);
          }}
        />
      }
      tools={
        <>
          <Link href="/login" className={actionClasses("ghost")}>
            정식으로 사용
          </Link>
        </>
      }
    >
      <ConversationWorkspace
        messages={[...state.messages.map(message => message.model ? { ...message, status: `${message.model} · AI 응답` } : message),
          ...(aiPending && mode !== "organize" ? [{ id: "sample-pending-question", author: "user" as const, text: state.draft }] : []),
          ...(aiPending || replying ? [{ id: `sample-pending-${streamId ?? "reply"}`, author: "assistant" as const, text: streamText || "", status: streamText ? "생성 중 · 아직 검증 전입니다" : "" }] : [])]}
        showComposer={state.mode !== null}
        focusMessageId={aiPending || replying ? `sample-pending-${streamId ?? "reply"}` : latestAssistantId}
        replyLabel={mode === "organize" ? "현재 안내 · 채팅으로 답해 주세요" : "답변 완료"}
        onChooseTask={() => {
          if (state.phase === "review") store.dispatch({ type: "back" });
          store.organization.reset(); store.dispatch({ type: "mode", mode: null }); setPanelOpen(false); setConsent(null);
        }}
        interaction={state.mode === null && state.messages.length > 0 ? <ConversationTaskIntro mode={null} disabled={disabled} onChoose={chooseTask} /> : undefined}
        messageActions={message => mode === "organize" && state.mode !== null && message.id === latestAssistantId ? <SampleOrganizationPanel
          catalog={catalog} store={store} provider={aiProvider ? providerLabel : null} disabled={disabled} onReply={text => void replyOrganization(text)} onTransmit={() => void transmitOrganization()} />
          : mode === "grounded" && message.id === latestAssistantId ? <section aria-label="질문 자료와 전송 확인">
            <p className={options.sourceSelection}><span>질문 자료 {selectedIds.length}개</span><button type="button" data-action="select-question-sources" className={actionClasses("secondary")} disabled={disabled}
              onClick={() => setSelectingMaterials(true)}>질문할 자료 선택</button></p>
            {questionScopeIssue && <p role="alert">{questionScopeIssue}</p>}
            <div className={options.transmissionConsent} data-consent-required={needsConsent}><label><input type="checkbox" data-demo-ai-consent checked={consented} disabled={consentDisabled}
              onChange={event => setConsent(event.target.checked ? consentKey : null)} /><span>이 질문·최근 대화·선택한 발췌를 {providerLabel}로 보내는 데 동의해요.</span></label></div>
            {state.citations.length > 0 && <p>답변 출처: {state.citations.map(id => <button key={id} type="button" className={actionClasses("ghost")} onClick={() => openPreview(id)}>{activeCatalog.documents.find(document => document.id === id)?.name}</button>)}</p>}
          </section> : undefined}
        draft={mode === "organize" ? requestEdit ?? preparation.replyDraft : state.draft}
        onDraftChange={fill}
        pending={aiPending || replying}
        pendingLabel={aiPending ? streamText ? "답변 생성 중…" : "답변 생성 중 · 자료와 요청을 확인하고 있어요…" : "답변을 반영하고 다음 안내를 준비하고 있어요…"}
        inputLabel="AI에게 질문하기"
        inputPlaceholder={mode === "organize" ? requestEdit !== null ? "최초 정리 요청을 수정하세요" : organizationConversationPrompt(preparation).example : conversationInputPlaceholder(state.mode)}
        onCancel={() => { transferVersion.current++; store.cancelAi(); store.organization.cancelSend(); }}
        panelOpen={panelOpen || !!tourRecordKind}
        panelModal={!tourRecordKind}
        panelTrigger={panelTrigger}
        panelLabel="기록함"
        panelTitle={showingRecords ? "기록함" : panelView === "settings" ? "대화 설정" : "참고 자료"}
        onPanelChange={open => {
          if (open) {
            const plan = panelTrigger.current?.dataset.action === "open-plan";
            setPanelView(plan ? "sources" : "records");
            setRecordsOpen(!plan);
          }
          setPanelOpen(open);
        }}
        planReady={false}
        canSend={!disabled && !!(mode === "organize" ? requestEdit ?? preparation.replyDraft : state.draft).trim() && (mode === "organize" || (state.phase !== "review" && (mode === "find" || (!!aiProvider && consented)) && (mode !== "grounded" || selectedIds.length > 0 && !questionScopeIssue)))}
        onSend={send}
        submitLabel={mode === "organize" ? requestEdit !== null ? "요청 수정 반영" : "답변 반영" : "보내기"}
        intro={<>
          <ConversationTaskIntro mode={state.mode} disabled={disabled || state.phase === "review"} onChoose={chooseTask} />
          <p role="note" className={options.taskDescription}>개인정보나 비밀번호는 입력하지 마세요. 대화는 이 탭에 임시 보관됩니다.</p>
        </>}
        notice={
          <>
            {mode === "organize" && preparation.request && <button type="button" className={actionClasses("ghost")} disabled={disabled} onClick={() => {
              setRequestEdit(requestEdit === null ? preparation.request : null);
            }}>{requestEdit === null ? "최초 정리 요청 수정" : "요청 수정 취소 · 답변으로 돌아가기"}</button>}
            {notice && <StatusNotice state="attention" title="요청 안내" detail={notice} compact={notice.startsWith("이 탭에서 보관한")} />}
            {expired
              && (
                <StatusNotice
                  state="attention"
                  title="샘플 세션이 만료됐어요"
                  action={<a href="/demo/start">새 세션 시작</a>}
                />
              )}
          </>
        }
        scope={
          <div>
            {started && <ConversationTaskControls mode={state.mode} disabled={disabled || state.phase === "review"} onChoose={chooseTask} />}
            <ConversationContextBar temporary status="임시 대화" sourceName="예시 자료" provider={mode === "find" || !aiProvider ? null : providerLabel} onOpen={openPanel} />
            {started && mode === "chat" && <>
              {!aiProvider && <StatusNotice state="attention" title="AI 연결을 사용할 수 없어요." detail="서버 연결 설정을 확인해야 합니다. 준비된 답변으로 대체하지 않습니다." />}
            </>}
          {mode !== "find" ? null : <details className={styles.conversationScope}>
            <summary>샘플 자료 · 범위 {scopedDocuments.length}개</summary>
            <label className={options.modeChoice}>
              {"자료 범위 "}
              <select
                aria-label="대화 자료 범위"
                disabled={disabled || state.phase === "review"}
                value={scope}
                onChange={event => {
                  store.dispatch({ type: "scope", scope: event.target.value as typeof scope });
                  setConsent(null);
                }}
              >
                <option value="all">
                  {"모든 샘플 "}
                  {activeCatalog.documents.length}개
                </option>
                <option value="folder">현재 폴더와 하위 자료</option>
                <option value="selected">
                  {"선택한 자료 "}
                  {selectedIds.length}개
                </option>
              </select>
            </label>
            <p>
              {scope === "folder" && `${path.join(" / ")} · `}
              {"범위 "}
              {scopedDocuments.length}
              개
              {scopedDocuments.length > 100 &&
                " · 요청과 본문으로 후보를 먼저 추립니다. 폴더를 좁히면 빠짐을 줄일 수 있어요."}
            </p>
          </details>}
          </div>
        }
        panel={
          <>
            <ConversationPanelNavigation selected={tourRecordKind ? "records" : panelView} onOpen={openPanel} />
            <div hidden={!showingRecords}><SampleLibraryPanel previewKind={tourRecordKind ?? undefined} state={state} catalog={activeCatalog} disabled={disabled} dispatch={store.dispatch} onPreview={openPreview}
              onReveal={() => { setRecordsOpen(true); setPanelOpen(true); }} /></div>
            <div hidden={!!tourRecordKind || panelView !== "settings"}><ConversationSettingsPanel includeMemory={false} onIncludeMemory={() => {}} projectId={projectId} onProjectId={setProjectId}
              canUseMemory={false} disabled={disabled} provider={aiProvider ? providerLabel : null} temporary dailyLimit={AI_DAILY_LIMITS.demo} storageDescription="이 탭의 샘플 세션 동안 임시 보관합니다. 새로고침해도 복원되며 실제 폴더에는 저장하지 않아요." onStorage={() => openPanel("storage")}
              onReplayTour={() => { setPanelOpen(false); requestAnimationFrame(replayWorkspaceTour); }} /></div>
            <div hidden={showingRecords || panelView === "settings"}>
            {mode === "find" && state.findings.length > 0 && <section aria-label="샘플 검색 결과"><h2>검색 결과 {state.findings.length}개</h2>{state.findings.map(id => <p key={id}>
              <button type="button" onClick={() => openPreview(id)}>{activeCatalog.documents.find(document => document.id === id)?.name}</button></p>)}</section>}
            {mode === "grounded" && state.citations.length > 0 && <section aria-label="답변 출처"><h2>확인한 출처</h2>{state.citations.map(id => <p key={id}><button type="button" onClick={() => openPreview(id)}>{activeCatalog.documents.find(document => document.id === id)?.name}</button></p>)}</section>}
            <WorkflowTransition step={`${state.phase}:${aiPending}`}>
              <SampleFolderPanel
                catalog={activeCatalog}
                state={{ locations: state.locations, selected: selectedIds, phase: state.phase }}
                path={path}
                onOpen={path => store.dispatch({ type: "scope", scope, path })}
                onPreview={openPreview}
                disabled={disabled}
                onToggle={() => {}}
              />
              {previewDocument
                && (
                  <div className={styles.conversationPreview}>
                    <button
                      type="button"
                      className={actionClasses("ghost")}
                      onClick={() => setPreviewId(null)}
                    >
                      미리보기 닫기
                    </button>
                    <SampleDocumentPreview document={previewDocument} headingRef={heading} assetId={state.files?.nodes.find(node => node.id === previewDocument.id)?.assetId} />
                  </div>
                )}
            </WorkflowTransition>
            </div>
          </>
        }
      />
      {selectingMaterials && <SampleMaterialPicker catalog={catalog} store={store} onClose={() => { setSelectingMaterials(false); setConsent(null); }} />}
    </WorkspaceShell>
  );
}

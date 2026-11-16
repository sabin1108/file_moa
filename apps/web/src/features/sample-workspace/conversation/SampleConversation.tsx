"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AI_PROVIDER_LABELS, type AiProvider } from "../../../shared/ai-provider";
import Link from "next/link";
import { ConversationWorkspace } from "../../../components/layout/ConversationWorkspace";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import { WorkflowStepper } from "../../../components/ui/WorkflowStepper";
import { WorkflowTransition } from "../../../components/ui/WorkflowTransition";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { actionClasses } from "../../../components/ui/action-classes";
import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SampleOrganizationAction } from "../../../shared/sample-organization";
import { sampleActiveCatalog, sampleFolderPath } from "../sample-state";
import { selectOrganizationCandidates } from "../organization/organization-candidates";
import type { SampleWorkspaceStore } from "../sample-workspace-store";
import { SamplePlanReview } from "../organization/SamplePlanReview";
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

const steps = [{ id: "select", label: "대화로 요청" }, { id: "review", label: "근거·계획 검토" }, { id: "result", label: "정리 결과" }];

export function SampleConversation({ catalog, store, organizeAction, answerAction, aiProvider = "gemini" }: {
  catalog: SampleCatalog;
  store: SampleWorkspaceStore;
  organizeAction: SampleOrganizationAction;
  answerAction: SampleAnswerAction;
  aiProvider?: AiProvider | null
}) {
  const { state, ready, expired, notice, aiPending } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
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
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [panelView, setPanelView] = useState<ConversationPanelView>("records");
  const tourRecordKind = useWorkspaceTourRecordView();
  const showingRecords = !!tourRecordKind || recordsOpen;
  const [resetting, setResetting] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [projectId, setProjectId] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const scopedDocuments = catalog.documents.filter(document => scope === "all"
    || (scope === "selected"
      ? state.selected.includes(document.id)
      : path.every((part, index) => sampleFolderPath(activeCatalog, state.locations[document.id])[index] === part)));
  const documentIds = selectOrganizationCandidates(scopedDocuments, state.draft).map(document => document.id);
  const consentKey = JSON.stringify([aiProvider, mode, state.draft.trim(), [...(mode === "grounded" ? state.selected : mode === "organize" ? documentIds : [])].sort()]);
  const consented = !!aiProvider && (mode === "chat" || consent === consentKey);
  const questionDocuments = catalog.documents.filter(document => state.selected.includes(document.id));
  const questionScopeIssue = questionDocuments.length > SAMPLE_ANSWER_LIMITS.documents
    ? `질문 자료는 최대 ${SAMPLE_ANSWER_LIMITS.documents}개까지 선택해 주세요.`
    : questionDocuments.reduce((sum, document) => sum + document.excerpt.length, 0) > SAMPLE_ANSWER_LIMITS.excerptCharacters
      ? `질문 자료의 발췌는 합계 ${SAMPLE_ANSWER_LIMITS.excerptCharacters}자까지입니다. 선택을 줄여 주세요.` : null;
  const providerLabel = aiProvider ? AI_PROVIDER_LABELS[aiProvider] : "설정되지 않은 외부 AI";
  const disabled = !ready || expired || aiPending;
  const previewDocument = catalog.documents.find(document => document.id === previewId);

  useEffect(() => {
    if (previewId) heading.current?.focus({ preventScroll: false });
  }, [previewId]);

  const fill = (value: string) => {
    store.dispatch({ type: "draft", value });
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
  const chooseTask = (kind: ConversationKind) => {
    store.dispatch({ type: "mode", mode: kind });
    setConsent(null);
    if (kind === "grounded" && (!state.selected.length || questionScopeIssue)) {
      openPanel("sources", document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
    }
  };
  const send = () => {
    panelTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (mode !== "chat") setPanelView("sources");
    if (mode !== "find" && !consented) return;
    setConsent(null);
    if (mode === "organize") {
      void store.requestOrganization(organizeAction, state.draft.trim(), documentIds);
      setRecordsOpen(false);
      setPanelOpen(true);
      return;
    }
    if (mode === "find") store.dispatch({ type: "sample-reply", mode, question: state.draft,
      selectedIds: scopedDocuments.map(document => document.id), referenceYear: new Date().getFullYear() });
    else void store.requestAnswer(answerAction, mode);
    if (mode !== "chat") { setRecordsOpen(false); setPanelOpen(true); }
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
          <button
            type="button"
            className={actionClasses("ghost")}
            disabled={disabled}
            onClick={() => {
              setResetting(true);
            }}
          >
            처음부터 다시
          </button>
          <Link href="/login" className={actionClasses("ghost")}>
            정식으로 사용
          </Link>
        </>
      }
    >
      <ConversationWorkspace
        messages={state.messages.map(message => message.model ? { ...message, status: `${message.model} · AI 응답` } : message)}
        showComposer={started || state.messages.length > 0}
        draft={state.draft}
        onDraftChange={fill}
        pending={aiPending}
        inputLabel="AI에게 질문하기"
        inputPlaceholder={conversationInputPlaceholder(state.mode)}
        onCancel={store.cancelAi}
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
        planReady={mode === "organize" && (state.phase === "review" || state.phase === "result")}
        canSend={!disabled && state.phase !== "review" && !!state.draft.trim() && (mode === "find" || (!!aiProvider && consented)) && (mode === "chat" || mode === "find" || (mode === "grounded" ? state.selected.length > 0 && !questionScopeIssue : documentIds.length > 0))}
        onSend={send}
        submitLabel="보내기"
        intro={<>
          <ConversationTaskIntro mode={state.mode} disabled={disabled || state.phase === "review"} onChoose={chooseTask} />
          <p role="note" className={options.taskDescription}>개인정보나 비밀번호는 입력하지 마세요. 대화는 이 탭에 임시 보관됩니다.</p>
        </>}
        notice={
          <>
            {resetting && <section role="group" aria-label="샘플 초기화 확인"><p>이 세션의 대화·정리 내역·임시 기록을 처음으로 돌릴까요?</p>
              <button type="button" className={actionClasses("primary")} disabled={disabled} onClick={() => {
                store.dispatch({ type: "reset" }); setConsent(null); setPreviewId(null); setResetVersion(value => value + 1); setResetting(false); setRecordsOpen(false);
              }}>초기화 확인</button><button type="button" className={actionClasses("ghost")} onClick={() => setResetting(false)}>취소</button></section>}
            {notice && <StatusNotice state="attention" title="요청 안내" detail={notice} />}
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
            {started && mode !== "find" && <>
              {!aiProvider && <StatusNotice state="attention" title="AI 연결을 사용할 수 없어요." detail="서버 연결 설정을 확인해야 합니다. 준비된 답변으로 대체하지 않습니다." />}
              {mode !== "chat" && <label><input type="checkbox" data-demo-ai-consent checked={consented} disabled={disabled || !aiProvider || !state.draft.trim()}
                onChange={event => setConsent(event.target.checked ? consentKey : null)} />
                이 질문과 최근 대화{mode === "grounded" ? `, 선택한 예시 자료 ${state.selected.length}개의 발췌` : mode === "organize" ? `, 이번 범위의 예시 자료 ${documentIds.length}개` : ""}를 {providerLabel}로 전송하는 데 동의해요.
              </label>}
            </>}
            {mode === "grounded" && <p role="status">질문에 사용할 자료 {state.selected.length}개 선택 · 선택한 자료의 발췌를 AI에 보내고 답변 출처를 확인합니다.
              <button type="button" className={actionClasses("secondary")} disabled={disabled || state.phase === "review"}
                onClick={event => openPanel("sources", event.currentTarget)}>질문할 자료 선택</button>
            </p>}
            {mode === "grounded" && questionScopeIssue && <p role="alert">{questionScopeIssue}</p>}
          {mode === "chat" ? null : <details className={styles.conversationScope}>
            <summary>샘플 자료 · {mode === "grounded" ? `선택 ${state.selected.length}개` : `범위 ${scopedDocuments.length}개`}</summary>
            {mode === "grounded" && <p>자료 보기에서 체크한 {state.selected.length}개의 발췌만 전송하며, AI가 근거를 확인할 수 없는 내용은 답하지 않도록 요청합니다.</p>}
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
                  {catalog.documents.length}개
                </option>
                <option value="folder">현재 폴더와 하위 자료</option>
                <option value="selected">
                  {"선택한 자료 "}
                  {state.selected.length}개
                </option>
              </select>
            </label>
            <p>
              {scope === "folder" && `${path.join(" / ")} · `}
              {"범위 "}
              {scopedDocuments.length}
              개{mode === "organize" && ` 중 이번 제안 ${documentIds.length}개`}
              {mode === "organize" && scopedDocuments.length > documentIds.length &&
                " · 요청과 본문으로 후보를 먼저 추립니다. 폴더를 좁히면 빠짐을 줄일 수 있어요."}
            </p>
          </details>}
          </div>
        }
        panel={
          <>
            <ConversationPanelNavigation selected={tourRecordKind ? "records" : panelView} onOpen={openPanel} />
            <div hidden={!showingRecords}><SampleLibraryPanel key={resetVersion} previewKind={tourRecordKind ?? undefined} state={state} catalog={catalog} disabled={disabled} dispatch={store.dispatch} onPreview={openPreview}
              onReveal={() => { setRecordsOpen(true); setPanelOpen(true); }} /></div>
            <div hidden={!!tourRecordKind || panelView !== "settings"}><ConversationSettingsPanel includeMemory={false} onIncludeMemory={() => {}} projectId={projectId} onProjectId={setProjectId}
              canUseMemory={false} disabled={disabled} provider={aiProvider ? providerLabel : null} temporary dailyLimit={AI_DAILY_LIMITS.demo} storageDescription="이 탭의 샘플 세션 동안 임시 보관합니다. 새로고침해도 복원되며 실제 폴더에는 저장하지 않아요." onStorage={() => openPanel("storage")}
              onReplayTour={() => { setPanelOpen(false); requestAnimationFrame(replayWorkspaceTour); }} /></div>
            <div hidden={showingRecords || panelView === "settings"}>
            {mode === "grounded" && <section aria-label="질문할 예시 자료 선택">
              <p>아래 파일을 최대 {SAMPLE_ANSWER_LIMITS.documents}개, 발췌 합계 {SAMPLE_ANSWER_LIMITS.excerptCharacters}자까지 선택하세요. 전송에 동의하고 보내면 AI가 답변하며 출처는 최대 {SAMPLE_ANSWER_LIMITS.citations}개 확인할 수 있습니다.</p>
              {questionScopeIssue && <p role="alert">{questionScopeIssue}</p>}
              <button type="button" data-grounded-selection-done className={actionClasses("secondary")} disabled={disabled || !state.selected.length || !!questionScopeIssue}
                onClick={() => {
                  panelTrigger.current = document.getElementById("message-draft");
                  setPanelOpen(false);
                }}>선택한 {state.selected.length}개로 질문하기</button>
            </section>}
            {mode === "find" && state.findings.length > 0 && <section aria-label="샘플 검색 결과"><h2>검색 결과 {state.findings.length}개</h2>{state.findings.map(id => <p key={id}>
              <button type="button" onClick={() => openPreview(id)}>{catalog.documents.find(document => document.id === id)?.name}</button></p>)}</section>}
            {mode === "grounded" && state.citations.length > 0 && <section aria-label="답변 출처"><h2>확인한 출처</h2>{state.citations.map(id => <p key={id}><button type="button" onClick={() => openPreview(id)}>{catalog.documents.find(document => document.id === id)?.name}</button></p>)}</section>}
            {mode === "organize" && <WorkflowStepper steps={steps} current={state.phase} />}
            <WorkflowTransition step={`${state.phase}:${aiPending}`}>
              {mode === "organize" && state.phase === "review"
                && (
                  <>
                    {!state.organization && !state.ai && <p>자료별로 준비된 목적지를 사용한 계획입니다. 입력한 요청을 AI로 해석한 결과가 아니며, 적용 전 목적지와 충돌을 확인해 주세요.</p>}
                    {state.organization
                      && (
                        <div className={styles.evidence}>
                          <h2>내용에서 찾은 근거</h2>
                          {state.organization.response.matches.map(match => (
                            <div key={match.documentId}>
                              <button type="button" onClick={() => openPreview(match.documentId)}>
                                {
                                  catalog.documents.find(document => document.id === match.documentId)
                                    ?.name
                                }
                              </button>
                              <blockquote>
                                {match.evidence}
                              </blockquote>
                              {match.date
                                && (
                                  <p>
                                    {"본문 기준일 "}
                                    {match.date}
                                  </p>
                                )}
                            </div>
                          ))}
                        </div>
                      )}
                    <SamplePlanReview
                      catalog={activeCatalog}
                      state={state}
                      disabled={disabled}
                      dispatch={store.dispatch}
                    />
                  </>
                )}
              {mode === "organize" && state.organization?.response.held.length
                ? (
                  <StatusNotice
                    state="attention"
                    title={`확인이 필요한 자료 ${state.organization.response.held.length}개`}
                    detail={state.organization.response.held
                      .map(
                        item =>
                          `${catalog.documents.find(document => document.id === item.documentId)?.name}: ${item.reason}`,
                      )
                      .join("\n")}
                  />
                )
                : null}
              {mode === "organize" && state.phase === "result"
                && (
                  <StatusNotice
                    state="success"
                    title={`${state.lastApplied?.documentIds.length ?? 0}개 자료 정리 완료`}
                    detail="검토한 계획만 샘플에 적용했어요."
                  />
                )}
              {mode === "organize" && state.lastApplied && state.phase !== "review"
                && (
                  <button
                    type="button"
                    data-action="sample-undo"
                    className={actionClasses("secondary")}
                    disabled={disabled}
                    onClick={() => store.dispatch({ type: "undo" })}
                  >
                    이번 정리 되돌리기
                  </button>
                )}
              <SampleFolderPanel
                selecting={mode === "grounded"}
                catalog={activeCatalog}
                state={state}
                path={path}
                onOpen={path => store.dispatch({ type: "scope", scope, path })}
                onPreview={openPreview}
                disabled={disabled}
                onToggle={id => {
                  setConsent(null);
                  if (mode === "grounded" && store.getSnapshot().state.phase === "result") store.dispatch({ type: "back" });
                  const selected = store.getSnapshot().state.selected;
                  store.dispatch({
                    type: "select",
                    ids: selected.includes(id) ? selected.filter(selected => selected !== id) : [...selected, id],
                  });
                }}
              />
              {state.phase === "review" && <button type="button" className={actionClasses("ghost")} disabled={disabled} onClick={() => store.dispatch({ type: "back" })}>계획 취소하고 작업 선택</button>}
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
                    <SampleDocumentPreview document={previewDocument} headingRef={heading} />
                  </div>
                )}
            </WorkflowTransition>
            </div>
          </>
        }
      />
    </WorkspaceShell>
  );
}

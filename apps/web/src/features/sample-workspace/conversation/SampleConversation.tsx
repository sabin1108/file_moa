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

const steps = [{ id: "select", label: "대화로 요청" }, { id: "review", label: "근거·계획 검토" }, { id: "result", label: "정리 결과" }];

export function SampleConversation({ catalog, store, organizeAction, aiProvider = "gemini" }: {
  catalog: SampleCatalog;
  store: SampleWorkspaceStore;
  organizeAction: SampleOrganizationAction;
  aiProvider?: AiProvider | null
}) {
  const { state, ready, expired, notice, aiPending } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const activeCatalog = sampleActiveCatalog(catalog, state);
  const [scope, setScope] = useState<"all" | "selected" | "folder">("all");
  const [consent, setConsent] = useState<string | null>(null);
  const [consentProvider, setConsentProvider] = useState(aiProvider);

  if (consentProvider !== aiProvider) {
    setConsentProvider(aiProvider);
    setConsent(null);
  }

  const [path, setPath] = useState<string[]>(["받은 자료"]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scopedDocuments = catalog.documents.filter(document => scope === "all"
    || (scope === "selected"
      ? state.selected.includes(document.id)
      : path.every((part, index) => sampleFolderPath(activeCatalog, state.locations[document.id])[index] === part)));
  const documentIds = selectOrganizationCandidates(scopedDocuments, state.draft).map(document => document.id);
  const consentKey = JSON.stringify([aiProvider, state.draft.trim(), [...documentIds].sort()]);
  const consented = !!aiProvider && consent === consentKey;
  const providerLabel = aiProvider ? AI_PROVIDER_LABELS[aiProvider] : "설정되지 않은 외부 AI";
  const disabled = !ready || expired || aiPending;
  const document = catalog.documents.find(document => document.id === previewId);

  useEffect(() => {
    if (previewId) heading.current?.focus({ preventScroll: false });
  }, [previewId]);

  const fill = (value: string) => {
    store.dispatch({ type: "draft", value });
    setConsent(null);
  };
  const openPreview = (id: string) => {
    setPreviewId(id);
    setPanelOpen(true);
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
            setPath([...value]);
            setScope("folder");
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
              store.dispatch({ type: "reset" });
              setConsent(null);
              setPreviewId(null);
              setPath(["받은 자료"]);
              setScope("all");
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
        messages={state.messages}
        draft={state.draft}
        onDraftChange={fill}
        pending={aiPending}
        onCancel={store.cancelAi}
        panelOpen={panelOpen}
        onPanelChange={setPanelOpen}
        planReady={state.phase === "review" || state.phase === "result"}
        canSend={!disabled && consented && documentIds.length > 0}
        onSend={() => {
          setConsent(null);
          setPreviewId(null);
          void store.requestOrganization(organizeAction, state.draft.trim(), documentIds);
        }}
        intro={
          <>
            <h2>어떤 자료를 정리할까요?</h2>
            <p>
              원하는 내용과 정리 방식을 말해 주세요. 자료의 본문을 확인해 관련 파일과 정리 계획을
              함께 보여 드려요.
            </p>
            {[
              "10월달 보고서를 본문 작성일 기준으로 날짜별로 정리해 줘",
              "웹사이트 성능 테스트 자료만 내용으로 찾아 성능 테스트 폴더에 모아 줘",
            ].map(example => (
              <button
                type="button"
                className={actionClasses("secondary")}
                key={example}
                onClick={() => fill(example)}
              >
                {example}
              </button>
            ))}
          </>
        }
        notice={
          <>
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
          <div className={styles.conversationScope}>
            {!aiProvider && <p>이 샘플에서는 AI 전송을 사용할 수 없습니다.</p>}
            <label>
              {"자료 범위 "}
              <select
                aria-label="대화 자료 범위"
                disabled={disabled}
                value={scope}
                onChange={event => {
                  setScope(event.target.value as typeof scope);
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
              {"개 중 이번 분석 "}
              {documentIds.length}개
              {scopedDocuments.length > documentIds.length &&
                " · 요청과 본문으로 후보를 먼저 추립니다. 폴더를 좁히면 빠짐을 줄일 수 있어요."}
            </p>
            <label>
              <input
                type="checkbox"
                data-organization-consent
                checked={consented}
                disabled={disabled || !state.draft.trim() || !aiProvider}
                onChange={event => setConsent(event.target.checked ? consentKey : null)}
              />
              이 요청과 범위의 가상 자료 내용을 {providerLabel}에 전송하는 데 동의해요.
            </label>
            <p>
              선택한 공급자의 데이터 처리 정책이 적용돼요. 개인 파일은 전송하지
              않아요.
            </p>
          </div>
        }
        panel={
          <>
            <WorkflowStepper steps={steps} current={state.phase} />
            <WorkflowTransition step={`${state.phase}:${aiPending}`}>
              {state.phase === "review"
                && (
                  <>
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
              {state.organization?.response.held.length
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
              {state.phase === "result"
                && (
                  <StatusNotice
                    state="success"
                    title={`${state.lastApplied?.documentIds.length ?? 0}개 자료 정리 완료`}
                    detail="검토한 계획만 샘플에 적용했어요."
                  />
                )}
              {state.lastApplied && state.phase !== "review"
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
                catalog={activeCatalog}
                state={state}
                path={path}
                onOpen={setPath}
                onPreview={openPreview}
                disabled={disabled}
                onToggle={id => {
                  setConsent(null);
                  store.dispatch({
                    type: "select",
                    ids: state.selected.includes(id)
                      ? state.selected.filter(selected => selected !== id)
                      : [...state.selected, id],
                  });
                }}
              />
              {document
                && (
                  <div className={styles.conversationPreview}>
                    <button
                      type="button"
                      className={actionClasses("ghost")}
                      onClick={() => setPreviewId(null)}
                    >
                      미리보기 닫기
                    </button>
                    <SampleDocumentPreview document={document} headingRef={heading} />
                  </div>
                )}
            </WorkflowTransition>
          </>
        }
      />
    </WorkspaceShell>
  );
}

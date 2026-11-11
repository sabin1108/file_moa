"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SampleCatalog, SampleSession } from "../../../shared/sample-contract";
import type { SampleAiAction } from "../../../shared/sample-ai";
import type { SampleOrganizationAction } from "../../../shared/sample-organization";
import { WorkflowStepper } from "../../../components/ui/WorkflowStepper";
import { WorkflowTransition } from "../../../components/ui/WorkflowTransition";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { FolderWorkspaceFrame } from "../../local-folders/components/listing/FolderWorkspaceFrame";
import { FilePreviewPane } from "../../local-folders/components/preview/FilePreviewPane";
import { SampleWorkspaceStore } from "../store/sample-workspace-store";
import { sampleActiveCatalog } from "../lib/sample-state";
import { SampleConversation } from "./SampleConversation";
import { SampleDocumentPreview } from "./SampleDocumentPreview";
import { SamplePlanReview } from "./SamplePlanReview";
import { SampleFolderPanel } from "./SampleFolderPanel";
import { SampleFolderTree } from "./SampleFolderTree";
import ui from "../../../styles/workspace-ui.module.css";
import folderStyles from "../../local-folders/components/listing/folder-workspace.module.css";
import styles from "./sample-workspace.module.css";
import { AI_PROVIDER_LABELS, type AiProvider } from "../../../shared/ai-provider";

const steps = [{ id: "select", label: "자료 선택" }, { id: "review", label: "계획 검토" }, { id: "result", label: "적용 결과" }];

export function SampleWorkspace({ catalog: sourceCatalog, session, remainingMs, classifyAction, organizeAction, view = "chat", aiProvider = "gemini" }: {
  catalog: SampleCatalog;
  session: SampleSession;
  remainingMs: number;
  classifyAction: SampleAiAction;
  organizeAction: SampleOrganizationAction;
  view?: "chat" | "files";
  aiProvider?: AiProvider | null;
}) {
  const [store] = useState(() => new SampleWorkspaceStore(sourceCatalog, session, undefined, remainingMs));
  const { state, ready, expired, notice, aiPending } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const catalog = sampleActiveCatalog(sourceCatalog, state);
  const [consent, setConsent] = useState<string | null>(null);
  const [consentProvider, setConsentProvider] = useState(aiProvider);

  if (consentProvider !== aiProvider) {
    setConsentProvider(aiProvider);
    setConsent(null);
  }

  const selectionKey = JSON.stringify([aiProvider, [...state.selected].sort()]);
  const providerLabel = aiProvider ? AI_PROVIDER_LABELS[aiProvider] : "설정되지 않은 외부 AI";
  const [path, setPath] = useState<string[]>(["받은 자료"]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef(state.phase);
  const preview = catalog.documents.find(document => document.id === previewId);
  const disabled = !ready || expired || aiPending;

  useEffect(() => {
    if (previousPhase.current !== state.phase) heading.current?.focus({ preventScroll: true });

    previousPhase.current = state.phase;
  }, [state.phase]);

  if (view === "chat") return <SampleConversation
    catalog={sourceCatalog}
    store={store}
    organizeAction={organizeAction}
    aiProvider={aiProvider}
  />;

  return (
    <div
      className={`${ui.system} ${folderStyles.theme}`}
      data-sample-phase={state.phase}
      data-sample-ready={ready}
    >
      <FolderWorkspaceFrame
        rootName="샘플 자료"
        path={path}
        ancestors={[]}
        disabled={disabled}
        mode="sample"
        onOpen={value => setPath([...value])}
        folderTree={
          <SampleFolderTree catalog={catalog} path={path} onOpen={value => setPath([...value])} />
        }
        onOpenFile={value =>
          setPreviewId(
            catalog.documents.find(document => document.name === value.at(-1))?.id ?? null,
          )
        }
        onSelectPrevious={() => { }}
        footer={
          <span>
            {catalog.documents.length}개 파일 · {state.selected.length}개 선택 · 샘플 체험 중
          </span>
        }
        preview={
          <FilePreviewPane
            open={state.phase === "review" || !!preview}
            onClose={() => {
              if (state.phase === "review") store.dispatch({ type: "back" });

              setPreviewId(null);
            }}
          >
            <WorkflowTransition step={state.phase}>
              {state.phase === "review"
                ? (
                  <>
                    <SamplePlanReview
                      catalog={catalog}
                      state={state}
                      disabled={disabled}
                      dispatch={store.dispatch}
                    />
                    {preview
                      && (
                        <details open className={styles.reviewPreview}>
                          <summary>자료 내용 확인</summary>
                          <SampleDocumentPreview document={preview} headingRef={heading} />
                        </details>
                      )}
                  </>
                )
                : (
                  <>
                    {state.phase === "result"
                      && (
                        <StatusNotice
                          state="success"
                          title={`샘플 ${state.lastApplied?.documentIds.length ?? 0}개를 정리했어요`}
                          detail="검토한 위치만 바꿨어요. 이번 정리는 되돌릴 수 있습니다."
                        />
                      )}
                    {preview && <SampleDocumentPreview document={preview} headingRef={heading} />}
                  </>
                )}
            </WorkflowTransition>
          </FilePreviewPane>
        }
      >
        <div className={styles.fileControls}>
          <WorkflowStepper steps={steps} current={state.phase} />
          <button
            type="button"
            data-action="sample-reset"
            className={actionClasses("ghost")}
            disabled={disabled}
            onClick={() => {
              store.dispatch({ type: "reset" });
              setConsent(null);
              setPath(["받은 자료"]);
            }}
          >
            처음부터 다시
          </button>
          {expired
            && (
              <StatusNotice
                state="attention"
                title="샘플 세션이 만료됐어요"
                action={<a href="/demo/start">새 세션 시작</a>}
              />
            )}
          {notice && <StatusNotice state="attention" title="샘플 안내" detail={notice} />}
          {aiPending
            && (
              <div role="status">
                <p>{providerLabel}에서 제안을 받고 있어요…</p>
                <button type="button" onClick={store.cancelAi}>
                  응답 대기 취소
                </button>
              </div>
            )}
        </div>
        <SampleFolderPanel
          catalog={catalog}
          state={state}
          path={path}
          onOpen={setPath}
          onPreview={setPreviewId}
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
        {state.phase === "select"
          && (
            <>
              <div className={styles.actions}>
                <span>{state.selected.length}개 선택</span>
                <button
                  type="button"
                  className={actionClasses("ghost")}
                  disabled={disabled}
                  onClick={() => {
                    setConsent(null);
                    store.dispatch({
                      type: "select",
                      ids:
                        state.selected.length === catalog.documents.length
                          ? []
                          : catalog.documents.map(document => document.id),
                    });
                  }}
                >
                  {state.selected.length === catalog.documents.length ? "선택 해제" : "모두 선택"}
                </button>
              </div>
              <div className={styles.aiConsent}>
                {!aiProvider && <p>이 샘플에서는 AI 전송을 사용할 수 없습니다. 준비된 제안과 파일 작업을 살펴보세요.</p>}
                <label>
                  <input
                    type="checkbox"
                    checked={!!aiProvider && consent === selectionKey}
                    disabled={disabled || !aiProvider}
                    onChange={event => setConsent(event.target.checked ? selectionKey : null)}
                  />
                  선택한 가상 자료의 이름·내용 발췌를 {providerLabel}로 전송하는 데 동의해요.
                </label>
                <p>
                  선택한 공급자의 데이터 처리 정책이 적용돼요. 내용으로 찾고 정리하는
                  요청은 대화에서 할 수 있어요.
                </p>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  data-action="sample-propose"
                  className={actionClasses("secondary")}
                  disabled={disabled || !state.selected.length}
                  onClick={() => store.dispatch({ type: "propose" })}
                >
                  준비된 제안 보기
                </button>
                <button
                  type="button"
                  data-action="sample-ai"
                  className={actionClasses("primary")}
                  disabled={
                    disabled ||
                    !aiProvider || consent !== selectionKey ||
                    !state.selected.length
                    ||
                    state.selected.length > 10
                  }
                  onClick={() => {
                    void store.requestAi(classifyAction);
                  }}
                >
                  AI로 분류 제안
                </button>
              </div>
            </>
          )}
        {state.lastApplied && state.phase !== "review"
          && (
            <div className={styles.actions}>
              <button
                type="button"
                data-action="sample-undo"
                className={actionClasses("secondary")}
                disabled={disabled}
                onClick={() => store.dispatch({ type: "undo" })}
              >
                이번 정리 되돌리기
              </button>
              <button type="button" onClick={() => store.dispatch({ type: "back" })}>
                다른 자료 선택
              </button>
            </div>
          )}
      </FolderWorkspaceFrame>
    </div>
  );
}

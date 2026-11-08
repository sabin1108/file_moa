"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { InlineEditorController } from "../../store/inline-editor-controller";
import { getAutosaveSeconds, serverAutosaveSeconds, subscribeEditorPreferences } from "../../store/editor-preferences";
import { managedMessages } from "../../lib/managed-files";
import styles from "./source-document-preview.module.css";
import { DocumentWorkspace } from "./DocumentWorkspace";

export function InlineDocumentEditor({ controller, folderName, onClosed, onSaved }: {
  controller: InlineEditorController; folderName: string; onClosed: () => void; onSaved: () => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const seconds = useSyncExternalStore(subscribeEditorPreferences, getAutosaveSeconds, serverAutosaveSeconds);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.id) input.current?.focus({ preventScroll: true });
  }, [state.id]);
  useEffect(() => {
    if (!seconds) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void controller.save(false).then(saved => { if (saved) onSaved(); });
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [controller, seconds, onSaved]);
  const retryable = state.phase === "error" && ["permission", "managed-operation-running"].includes(state.issue ?? "");
  const save = () => { void (retryable ? controller.retrySave() : controller.save(true)).then(saved => { if (saved) onSaved(); }); };
  const close = (discard = false) => {
    if (controller.close(discard)) onClosed();
  };
  return (
    <DocumentWorkspace
      mode="editor"
      blockQuickSwitch={state.phase === "saving" || state.text !== state.savedText}
      phase={state.phase}
      title={state.path.at(-1) ?? "문서 편집"}
      back={
        <button
          type="button"
          className={actionClasses("secondary")}
          disabled={state.phase === "saving"}
          onClick={() => close()}
        >
          미리보기로 돌아가기
        </button>
      }
      actions={
        <button
          type="button"
          className={actionClasses("primary")}
          disabled={
            (!retryable && state.phase !== "ready") ||
            state.text === state.savedText ||
            state.composing
          }
          onClick={save}
        >
          {state.phase === "saving"
            ? "저장 중…"
            : retryable
              ? "권한 확인 후 다시 저장"
              : state.hasBackup
                ? "저장"
                : "원본 보존하고 저장"}
        </button>
      }
      status={
        state.phase === "loading"
          ? "편집 내용을 불러오는 중"
          : state.phase === "saving"
            ? "저장·검증 중"
            : state.text !== state.savedText
              ? "저장하지 않은 변경 · 기기 초안 보관"
              : state.savedAt
                ? `저장됨 · ${new Date(state.savedAt).toLocaleTimeString("ko-KR")}`
                : "편집 준비 완료"
      }
      info={
        <dl>
          <div>
            <dt>보관 위치</dt>
            <dd>{[folderName, ...state.path.slice(0, -1)].join(" / ")}</dd>
          </div>
          <div>
            <dt>저장 방식</dt>
            <dd>
              {seconds ? `직접 저장 + ${seconds}초마다 자동저장` : "직접 저장 · 자동저장 꺼짐"}
              {" · "}
              <Link href="/settings">편집 설정</Link>
            </dd>
          </div>
          <div>
            <dt>원본 보존</dt>
            <dd>{state.hasBackup ? "첫 원본 사본 보존됨" : "처음 저장할 때 한 번 보존"}</dd>
          </div>
        </dl>
      }
      feedback={
        <>
          {state.issue && (
            <StatusNotice
              state="attention"
              role="alert"
              title={
                managedMessages[state.issue] ??
                "저장을 멈췄습니다. 초안을 보관한 뒤 원문을 다시 확인해 주세요."
              }
            />
          )}
          {state.draftIssue && (
            <StatusNotice
              state="attention"
              role="alert"
              title="기기 초안 보관에 실패했습니다. 새로고침 전에 직접 저장해 주세요."
            />
          )}
          {state.closeRequested && (
            <div className={styles.unsavedNotice} role="group" aria-label="저장하지 않은 편집 확인">
              <StatusNotice
                state="attention"
                role="alert"
                title="저장하지 않은 편집 내용이 있습니다."
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={actionClasses("primary")}
                  onClick={controller.continueEditing}
                >
                  계속 편집
                </button>
                <button
                  type="button"
                  className={actionClasses("secondary")}
                  onClick={() => close(true)}
                >
                  편집 내용 버리고 닫기
                </button>
              </div>
            </div>
          )}
        </>
      }
      footer={
        <>
          {seconds ? `직접 저장 + ${seconds}초마다 자동저장` : "직접 저장 · 자동저장 꺼짐"}
          {" · "}
          <Link href="/settings">편집 설정</Link>
          {!state.hasBackup && <p>첫 저장에 원본을 한 번 보존합니다.</p>}
          {state.phase === "error" && (
            <button
              type="button"
              className={actionClasses("secondary")}
              onClick={() => {
                void controller.open(state.path);
              }}
            >
              편집 내용 버리고 원문 다시 읽기
            </button>
          )}
        </>
      }
    >
      <label className="sr-only" htmlFor={`editor-${state.id}`}>
        문서 내용
      </label>
      <textarea
        ref={input}
        id={`editor-${state.id}`}
        className={`${styles.body} ${styles.editorInput}`}
        aria-label="문서 내용"
        value={state.text}
        maxLength={2 * 1024 * 1024}
        disabled={state.phase === "loading" || state.phase === "error"}
        onCompositionStart={() => controller.setComposing(true)}
        onCompositionEnd={() => controller.setComposing(false)}
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (!event.nativeEvent.isComposing) save();
          }
        }}
        onChange={event => controller.setText(event.target.value)}
        spellCheck={false}
      />
    </DocumentWorkspace>
  );
}

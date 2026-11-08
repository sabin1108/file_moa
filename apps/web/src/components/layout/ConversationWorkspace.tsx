"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon, MoaMark } from "../ui/Icon";
import { actionClasses } from "../ui/action-classes";
import composer from "../../styles/composer.module.css";
import styles from "./conversation-workspace.module.css";
import { useDrawerDialog } from "./use-drawer-dialog";

export type ConversationMessage = Readonly<{
  id: string;
  author: "user" | "assistant";
  text: string;
}>;

export function ConversationWorkspace({
  messages,
  draft,
  onDraftChange,
  onSend,
  pending = false,
  onCancel,
  canSend,
  panel,
  scope,
  intro,
  notice,
  panelOpen,
  onPanelChange,
  planReady = false,
  showComposer = true,
  interaction,
  inputLabel = "정리하고 싶은 내용을 입력하세요",
  inputPlaceholder = "어떤 자료를 어떻게 정리할까요?",
  submitLabel = "보내기",
  pendingLabel = "선택한 범위의 내용을 읽고 정리 계획을 만들고 있어요…",
  cancelLabel = "응답 대기 취소",
}: {
  messages: readonly ConversationMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  pending?: boolean;
  onCancel?: () => void;
  canSend: boolean;
  panel: ReactNode;
  scope?: ReactNode;
  intro: ReactNode;
  notice?: ReactNode;
  panelOpen: boolean;
  onPanelChange: (open: boolean) => void;
  planReady?: boolean;
  showComposer?: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  interaction?: ReactNode;
  inputLabel?: string;
  inputPlaceholder?: string;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  const closePanel = () => onPanelChange(false);
  const drawer = useDrawerDialog(panelOpen, (panel) => {
    requestAnimationFrame(() => {
      if (
        (document.activeElement === document.body ||
          panel?.contains(document.activeElement)) &&
        trigger.current?.isConnected
      )
        trigger.current.focus({ preventScroll: true });
    });
  });
  const composing = useRef(false);
  const thread = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const hasInteraction = interaction != null;
  useEffect(() => {
    if (hasInteraction) return;
    if (follow.current && thread.current)
      thread.current.scrollTo({
        top: thread.current.scrollHeight,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [messages.length, pending, hasInteraction]);
  const send = () => {
    if (composing.current || !canSend || pending || !draft.trim()) return;
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    onSend();
  };
  return (
    <div
      className={styles.workspace}
      data-conversation-workspace
      data-panel-open={panelOpen}
    >
      <section className={styles.conversation} aria-label="대화 작업 공간">
        <div className={styles.toolbar}>
          <span>채팅</span>
          {panel && (
            <div>
              <button
                type="button"
                className={actionClasses("ghost")}
                aria-expanded={panelOpen}
                aria-controls="conversation-materials"
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  onPanelChange(true);
                }}
              >
                <Icon name="folder" size={18} />
                자료 보기
              </button>
              {planReady && (
                <button
                  type="button"
                  data-action="open-plan"
                  className={actionClasses("secondary")}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    onPanelChange(true);
                  }}
                >
                  정리 계획 보기
                </button>
              )}
            </div>
          )}
        </div>
        <div
          className={styles.thread}
          ref={thread}
          role="region"
          tabIndex={0}
          aria-label="대화 내용"
          onScroll={() => {
            const node = thread.current;
            if (node)
              follow.current =
                node.scrollHeight - node.scrollTop - node.clientHeight < 100;
          }}
        >
          <div className={styles.threadInner}>
            {messages.length
              ? messages.map((message) => (
                  <article
                    key={message.id}
                    className={
                      message.author === "user"
                        ? styles.userMessage
                        : styles.assistantMessage
                    }
                    aria-label={
                      message.author === "user" ? "나의 메시지" : "모아의 답변"
                    }
                  >
                    {message.author === "assistant" && (
                      <div className={styles.identity}>
                        <MoaMark size={22} />
                        모아
                      </div>
                    )}
                    <p>{message.text}</p>
                  </article>
                ))
              : intro}
            {pending && <p role="status">{pendingLabel}</p>}
            {notice}
            {interaction && (
              <div className={styles.interaction} data-conversation-interaction>
                {interaction}
              </div>
            )}
          </div>
        </div>
        {showComposer && (
          <form
            className={composer.composerRegion}
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            {scope}
            <div className={composer.composer}>
              <label htmlFor="message-draft" className="sr-only">
                {inputLabel}
              </label>
              <textarea
                id="message-draft"
                value={draft}
                maxLength={800}
                rows={hasInteraction ? 2 : 3}
                readOnly={pending}
                placeholder={inputPlaceholder}
                onChange={(event) => onDraftChange(event.target.value)}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!event.nativeEvent.isComposing && event.keyCode !== 229)
                      send();
                  }
                }}
              />
              <div className={composer.composerTools}>
                <span className={composer.sourceHint}>
                  Enter {submitLabel} · Shift+Enter 줄바꿈
                </span>
                {pending ? (
                  <button
                    type="button"
                    className={actionClasses("secondary")}
                    onClick={onCancel}
                  >
                    {cancelLabel}
                  </button>
                ) : (
                  <button
                    type="submit"
                    data-action="organization-send"
                    className={actionClasses("primary")}
                    disabled={!canSend || !draft.trim()}
                  >
                    <Icon name="arrow" size={18} />
                    {submitLabel}
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </section>
      {panel && (
        <dialog
          id="conversation-materials"
          ref={drawer}
          className={styles.materials}
          aria-label="자료 및 정리 계획"
          onCancel={(event) => {
            event.preventDefault();
            closePanel();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              event.preventDefault();
              event.stopPropagation();
              closePanel();
            }
          }}
        >
          <div className={styles.drawerHeading}>
            <h2>{planReady ? "정리 계획" : "자료"}</h2>
            <button
              type="button"
              data-drawer-close
              className={actionClasses("ghost")}
              aria-label="자료 창 닫기"
              onClick={closePanel}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          {panel}
        </dialog>
      )}
    </div>
  );
}

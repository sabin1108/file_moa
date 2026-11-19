"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Icon, MoaMark } from "../ui/Icon";
import { actionClasses } from "../ui/action-classes";
import composer from "../../styles/composer.module.css";
import styles from "./conversation-workspace.module.css";
import { useDrawerDialog } from "./use-drawer-dialog";
import { MoaLoader } from "../ui/feedback/MoaLoader";

export type ConversationMessage = Readonly<{
  id: string;
  author: "user" | "assistant";
  text: string;
  status?: string;
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
  scrollMemoryRef,
  panelLabel = "자료 보기",
  panelTitle,
  messageActions,
  panelTrigger: panelTriggerRef,
  panelModal = true,
  focusMessageId,
  collapseBeforeMessageId,
  onChooseTask,
  replyLabel = "답변 반영 완료 · 다음 안내",
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
  scrollMemoryRef?: {
    current: {
      top: number;
      follow: boolean
    }
  };
  panelLabel?: string;
  panelTitle?: string;
  messageActions?: (message: ConversationMessage) => ReactNode;
  panelTrigger?: RefObject<HTMLElement | null>;
  panelModal?: boolean;
  focusMessageId?: string;
  collapseBeforeMessageId?: string;
  onChooseTask?: () => void;
  replyLabel?: string;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  const closePanel = () => onPanelChange(false);
  const drawer = useDrawerDialog(panelOpen, (_panel, returnFocus) => {
    requestAnimationFrame(() => {
      if (
        returnFocus &&
        (panelTriggerRef?.current ?? trigger.current)?.isConnected
      )
        (panelTriggerRef?.current ?? trigger.current)?.focus({ preventScroll: true });
    });
  }, panelModal);
  const composing = useRef(false);
  const thread = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const hasInteraction = interaction != null;
  const latestTextLength = messages.at(-1)?.text.length;
  const focusIndex = focusMessageId ? messages.findIndex(message => message.id === focusMessageId) : -1;
  const historyIndex = collapseBeforeMessageId ? messages.findIndex(message => message.id === collapseBeforeMessageId) : -1;
  const historyEnd = Math.max(0, historyIndex > 0 && messages[historyIndex - 1].author === "user" ? historyIndex - 1 : historyIndex);

  useEffect(() => {
    if (!scrollMemoryRef || !thread.current) return;

    follow.current = scrollMemoryRef.current.follow;
    thread.current.scrollTop = scrollMemoryRef.current.top;
  }, [scrollMemoryRef]);

  useEffect(() => {
    if (!focusMessageId || !thread.current) return;
    const current = thread.current.querySelector<HTMLElement>('[data-current-reply="true"]');
    if (!current) return;
    const top = current.getBoundingClientRect().top - thread.current.getBoundingClientRect().top + thread.current.scrollTop - 16;
    thread.current.scrollTo({ top, behavior: "instant" });
  }, [focusMessageId, pending]);

  useEffect(() => {
    if (hasInteraction || !messages.length) return;
    if (focusMessageId) return;

    if (follow.current && thread.current)
      thread.current.scrollTo({
        top: thread.current.scrollHeight,
        behavior: pending || matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [messages.length, latestTextLength, pending, hasInteraction, focusMessageId]);

  const send = () => {
    if (composing.current || !canSend || pending || !draft.trim()) return;

    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    onSend();
  };
  const renderMessage = (message: ConversationMessage) => <article key={message.id}
    data-message-author={message.author}
    data-current-reply={message.id === focusMessageId || undefined}
    className={message.author === "user" ? styles.userMessage : styles.assistantMessage}
    aria-label={message.author === "user" ? "나의 메시지" : "모아의 답변"}>
    <div className={styles.identity}>{message.author === "assistant" ? <><MoaMark size={22} />모아</> : "나"}
      {message.id === focusMessageId && <span className={styles.replyStatus} role="status" data-reply-pending={pending}>
        {pending && <MoaLoader size={24} />}{pending ? pendingLabel : replyLabel}
      </span>}
    </div>
    <p>{message.text}</p>
    {message.status && <small>{message.status}</small>}
    {messageActions?.(message)}
  </article>;

  return (
    <div
      className={styles.workspace}
      data-conversation-workspace
      data-panel-open={panelOpen}
      data-focused-task={focusIndex >= 0}
    >
      <section className={styles.conversation} aria-label="대화 작업 공간">
        <div className={styles.toolbar}>
          <div><span>채팅</span>{onChooseTask && <button type="button" disabled={pending} className={actionClasses("ghost")} onClick={onChooseTask}>작업 선택</button>}</div>
          {panel
            && (
              <div>
                <button
                  type="button"
                  className={actionClasses("secondary")}
                  aria-expanded={panelOpen}
                  aria-controls="conversation-materials"
                  data-tour="records"
                  onClick={(event) => {
                    trigger.current = event.currentTarget;

                    if (panelTriggerRef) panelTriggerRef.current = event.currentTarget;

                    onPanelChange(true);
                  }}
                >
                  <Icon name="folder" size={18} />
                  {panelLabel}
                </button>
                {planReady
                  && (
                    <button
                      type="button"
                      data-action="open-plan"
                      className={actionClasses("secondary")}
                      onClick={(event) => {
                        trigger.current = event.currentTarget;

                        if (panelTriggerRef) panelTriggerRef.current = event.currentTarget;

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

            if (node) {
              follow.current =
                node.scrollHeight - node.scrollTop - node.clientHeight < 100;

              if (scrollMemoryRef) scrollMemoryRef.current = { top: node.scrollTop, follow: follow.current };
            }
          }}
        >
          <div className={styles.threadInner}>
            {historyEnd > 0 && <details className={styles.taskSettings}><summary>앞선 대화 {historyEnd}개 보기</summary>{messages.slice(0, historyEnd).map(renderMessage)}</details>}
            {messages.length ? messages.slice(historyEnd).map(renderMessage) : intro}
            {pending && <p role="status">
              {pendingLabel}
            </p>}
            {notice}
            {interaction
              && (
                <div className={styles.interaction} data-conversation-interaction>
                  {interaction}
                </div>
              )}
          </div>
        </div>
        {scope != null && <div className={`${composer.scope} ${composer.contextRegion}`} data-tour="context">
          {focusIndex >= 0 ? <details className={styles.taskSettings}><summary>자료·대화 설정</summary>{scope}</details> : scope}
        </div>}
        {showComposer
          && (
            <form
              data-tour="composer"
              className={composer.composerRegion}
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <div className={composer.composer}>
                <label htmlFor="message-draft" className="sr-only">
                  {inputLabel}
                </label>
                <textarea
                  id="message-draft"
                  value={draft}
                  maxLength={800}
                  rows={focusIndex >= 0 ? 2 : 3}
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
                  {pending
                    ? (
                      <button
                        type="button"
                        className={actionClasses("secondary")}
                        onClick={onCancel}
                      >
                        {cancelLabel}
                      </button>
                    )
                    : (
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
      {panel
        && (
          <dialog
            id="conversation-materials"
            ref={drawer}
            className={styles.materials}
            aria-label={panelTitle ?? "자료 및 정리 계획"}
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
              <h2>
                {panelTitle ?? (planReady ? "정리 계획" : "자료")}
              </h2>
              <button
                type="button"
                data-drawer-close
                className={actionClasses("ghost")}
                aria-label={`${panelTitle ?? "자료"} 창 닫기`}
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

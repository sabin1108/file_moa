"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { AiProvider } from "../../../shared/ai-provider";
import { subscribeAuthScopeRevoked } from "../../../shared/auth-session-events";
import { chatRequestSchema, ChatError, CHAT_LIMITS, type ChatEvent } from "../../../shared/general-chat";
import { chatContext } from "../lib/general-chat-state";
import { useConversationStore } from "../providers/ConversationStateProvider";
import { readChatStream } from "../services/chat-stream";
import { restoreConversation, type ConversationPayload } from "../../../shared/ai-records";
import type { PersonalContext } from "../../../shared/personal-context";
import type { ConversationKind } from "../../../shared/ai-records";
import type { GroundedEvidence } from "../../../shared/grounded-evidence";

type ActiveChat = {
  id: string;
  abort: AbortController;
  frame: number | null;
  received: number;
  revealed: number;
  revealUntil: number;
  lastFrame: number;
  completion: Extract<ChatEvent, { type: "completed" }> | null;
};

function cancelReveal(request: ActiveChat) {
  if (request.frame !== null) cancelAnimationFrame(request.frame);

  request.frame = null;
}

export function useGeneralChat(
  owner: {
    userId: string;
    workspaceId: string
  },
  provider: AiProvider | null,
  readPersonalContext?: () => Promise<PersonalContext | undefined>) {
  const store = useConversationStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const dispatch = store.dispatch;
  const active = useRef<ActiveChat | null>(null);
  const scope = JSON.stringify([owner.userId, owner.workspaceId, provider]);
  const previousScope = useRef(scope);

  useEffect(() => {
    const reset = () => {
      const previous = active.current;

      active.current = null;

      if (previous) {
        cancelReveal(previous);
        previous.abort.abort();
      }

      dispatch({ type: "reset" });
    };

    if (previousScope.current !== scope) {
      reset();
      previousScope.current = scope;
    }

    const unsubscribeRevoked = subscribeAuthScopeRevoked(reset);

    return () => {
      unsubscribeRevoked();

      const previous = active.current;

      active.current = null;

      if (previous) {
        cancelReveal(previous);
        previous.abort.abort();
        dispatch({ type: "stop", id: previous.id });
      }
    };
  }, [scope, dispatch]);

  const stop = () => {
    const previous = active.current;

    if (!previous) return;

    active.current = null;
    cancelReveal(previous);
    previous.abort.abort();
    dispatch({ type: "stop", id: previous.id });
  };

  const send = async () => {
    const question = state.draft.trim();

    if (!question || !provider || active.current) return;

    const id = `${Date.now()}:${crypto.randomUUID()}`;
    const abort = new AbortController();
    const operation: ActiveChat = { id, abort, frame: null, received: 0, revealed: 0, revealUntil: 0, lastFrame: 0, completion: null };

    active.current = operation;
    dispatch({ type: "start", id, question });

    const finish = () => {
      if (active.current !== operation || !operation.completion || operation.revealed < operation.received) return;

      cancelReveal(operation);
      dispatch({ type: "event", event: operation.completion });
      active.current = null;
    };
    const tick = (now: number) => {
      if (active.current !== operation) return;

      operation.frame = null;

      const remaining = operation.received - operation.revealed;
      const elapsed = Math.max(1, now - operation.lastFrame);
      const duration = Math.max(1, operation.revealUntil - operation.lastFrame);

      operation.revealed += Math.min(remaining, Math.max(1, Math.ceil(remaining * elapsed / duration)));
      operation.lastFrame = now;
      dispatch({ type: "reveal", id, characters: operation.revealed });

      if (operation.revealed < operation.received) operation.frame = requestAnimationFrame(tick);
      else finish();
    };

    try {
      const personalContext = await readPersonalContext?.();

      if (active.current !== operation) return;

      const input = chatRequestSchema.parse({
        requestId: id,
        owner,
        provider,
        messages: chatContext(state, question),
        ...(personalContext ? { personalContext } : {})
      });

      if (new TextEncoder().encode(JSON.stringify(input)).byteLength > CHAT_LIMITS.requestBytes) throw new ChatError("input");

      await readChatStream(input, abort.signal, event => {
        if (active.current !== operation) return;

        if (event.type === "completed") {
          operation.completion = event;
          finish();

          return;
        }

        dispatch({ type: "event", event });

        if (event.type === "text_delta") {
          operation.received += event.text.length;
          operation.revealUntil = performance.now() + Math.min(650, Math.max(120, (operation.received - operation.revealed) * 8));

          if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
            cancelReveal(operation);
            operation.revealed = operation.received;
            dispatch({ type: "reveal", id, characters: operation.revealed });
          } else if (operation.frame === null) {
            operation.lastFrame = performance.now();

            if (!operation.revealed) {
              operation.revealed = Math.min(8, operation.received);
              dispatch({ type: "reveal", id, characters: operation.revealed });
            }

            operation.frame = requestAnimationFrame(tick);
          }
        } else if (event.type === "error") cancelReveal(operation);
      });
    } catch (error) {
      cancelReveal(operation);

      if (active.current?.id === id) dispatch({ type: "fail", id, code: error instanceof ChatError ? error.code : "interrupted" });
    } finally {
      if (!operation.completion) {
        cancelReveal(operation);

        if (active.current?.id === id) active.current = null;
      }
    }
  };

  const restore = (payload: ConversationPayload | null) => {
    stop();
    dispatch(payload ? { type: "restore", state: restoreConversation(payload) } : { type: "reset" });
  };
  const recordTask = useCallback((
    kind: Exclude<ConversationKind, "chat">,
    question: string,
    answer: string,
    status: "pending" | "completed" | "stopped" | "error" = "pending") => {
    if (active.current || store.getSnapshot().active) return null;

    const id = `task-${crypto.randomUUID()}`;

    dispatch({ type: "local", id, kind, question, answer, status });

    return id;
  }, [store, dispatch]);
  const updateTask = useCallback(
    (
      id: string,
      answer: string,
      status: "pending" | "completed" | "stopped" | "error",
      evidence?: GroundedEvidence) => dispatch({ type: "local-update", id, answer, status, evidence }),
    [dispatch]
  );

  return {
    state,
    getSnapshot: store.getSnapshot,
    send,
    stop,
    restore,
    recordTask,
    updateTask,
    updateDraft: (value: string) => dispatch({ type: "draft", value })
  };
}

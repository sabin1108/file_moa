"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AI_RECORD_LIMITS, type ConversationPayload } from "../../../shared/ai-records";
import type { useGeneralChat } from "../messaging/useGeneralChat";
import type { ChatState } from "../messaging/general-chat-state";
import type { AiRecordsController } from "../../ai-records/ai-records-controller";
import { useConversationStore } from "../ConversationStateProvider";

function conversationPayload(state: ChatState, selection: { id: string | null; temporary: boolean; projectId: string }): ConversationPayload | null {
  if (selection.temporary || !selection.id || !(state.draft || state.turns.length)) return null;

  return {
    type: "conversation",
    id: selection.id,
    title: (state.turns[0]?.question ?? state.draft).slice(0, 120) || "새 대화",
    updatedAt: new Date().toISOString(),
    draft: state.draft,
    turns: state.turns.map(turn => turn.status === "pending" ? { ...turn, answer: turn.answer.slice(0, turn.visibleLength) } : turn),
    projectId: selection.projectId || null,
  };
}

export function useConversationRecords(
  controller: AiRecordsController,
  chat: ReturnType<typeof useGeneralChat>,
  change?: {
    beforeRestore: () => void;
    assertAvailable: () => void
  }) {
  const library = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const store = useConversationStore();
  const { id, temporary, projectId, status, lastSaved } = useSyncExternalStore(store.subscribe, store.getSelection, store.getServerSelection);
  const latest = useRef<ConversationPayload | null>(null);
  const [needsDiscard, setNeedsDiscard] = useState(false);
  type PendingOpen = {
    payload: ConversationPayload | null;
    temporary: boolean;
    state: ChatState;
    selection: ReturnType<typeof store.getSelection>;
    revision: number;
  };
  const pendingOpen = useRef<PendingOpen | null>(null);
  const content = JSON.stringify({ draft: chat.state.draft, turns: chat.state.turns, projectId: projectId || null });
  const payload = conversationPayload(chat.state, { id, temporary, projectId });

  useEffect(() => {
    latest.current = payload;
  });

  useEffect(() => {
    if (temporary || !id || library.phase !== "ready" || content === lastSaved) return;

    const payload = latest.current;

    if (!payload) return;

    const timer = window.setTimeout(() => {
      if (store.getSelection().id !== id || store.getSelection().temporary) return;

      store.select({ status: "저장 중" });
      void controller.save(payload).then(() => {
        if (store.getSelection().id === id) store.select({ lastSaved: content, status: "로컬 폴더에 저장됨" });
      }, () => {
        if (store.getSelection().id === id) store.select({ status: "미저장 · 화면의 내용을 보관해 주세요" });
      });
    }, chat.state.active ? 2000 : 800);

    return () => window.clearTimeout(timer);
  }, [controller, content, library.phase, temporary, id, chat.state.active, lastSaved, store]);

  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      const current = latest.current;

      if (!current) return;

      const saved = JSON.stringify({ draft: current.draft, turns: current.turns, projectId: current.projectId });

      if (saved !== store.getSelection().lastSaved) {
        event.preventDefault();
      }
    };

    window.addEventListener("beforeunload", leaving);

    return () => {
      window.removeEventListener("beforeunload", leaving);

      const current = latest.current;

      if (!current || controller.getSnapshot().phase !== "ready") return;

      const saved = JSON.stringify({ draft: current.draft, turns: current.turns, projectId: current.projectId });

      if (saved !== store.getSelection().lastSaved) void controller.save(current).then(() => {
        if (store.getSelection().id === current.id) store.select({ lastSaved: saved, status: "로컬 폴더에 저장됨" });
      }).catch(() => undefined);
    };
  }, [controller, store]);

  const persist = async () => {
    const state = store.getSnapshot();
    const selection = store.getSelection();
    const current = conversationPayload(state, selection);
    const content = JSON.stringify({ draft: state.draft, turns: state.turns, projectId: selection.projectId || null });

    if (!current || content === selection.lastSaved) return;

    try {
      await controller.save(current);
      if (store.getSelection().id === current.id) store.select({ lastSaved: content, status: "로컬 폴더에 저장됨" });
    } catch {
      if (store.getSelection().id === current.id) store.select({ status: "미저장 · 다른 대화를 열기 전에 저장을 다시 시도해 주세요" });

      throw new Error("unsaved-conversation");
    }
  };

  const cancelOpen = () => {
    pendingOpen.current = null;
    setNeedsDiscard(false);
  };
  const assertSwitch = (target: PendingOpen) => {
    change?.assertAvailable();
    controller.assertConnectionRevision(target.revision);

    const selection = store.getSelection();

    if (store.getSnapshot() !== target.state || selection.id !== target.selection.id
      || selection.temporary !== target.selection.temporary || selection.projectId !== target.selection.projectId) throw new Error("stale-conversation-confirmation");
  };
  const switchConversation = ({ payload, temporary: temp }: PendingOpen) => {
    change?.beforeRestore();
    cancelOpen();
    latest.current = null;
    chat.restore(payload);
    store.select({
      id: payload?.id ?? `chat-${crypto.randomUUID()}`,
      projectId: payload?.projectId ?? "",
      temporary: temp,
      lastSaved: payload ? JSON.stringify({ draft: payload.draft, turns: payload.turns, projectId: payload.projectId }) : "",
      status: temp ? "임시 대화" : payload ? "로컬 대화 불러옴" : "새 대화 · 입력하면 자동 저장"
    });
  };
  const open = async (payload: ConversationPayload | null, temp = false) => {
    change?.assertAvailable();
    cancelOpen();

    const target: PendingOpen = { payload, temporary: temp, state: store.getSnapshot(), selection: store.getSelection(), revision: controller.getConnectionRevision() };

    try {
      if (target.selection.temporary && (target.state.draft || target.state.turns.length)) throw new Error("unsaved-conversation");

      await persist();
    } catch (error) {
      assertSwitch(target);
      pendingOpen.current = target;
      setNeedsDiscard(true);

      throw error;
    }

    assertSwitch(target);
    if (target.payload?.id === target.selection.id) return;

    switchConversation(target);
  };
  const discardAndOpen = () => {
    const target = pendingOpen.current;

    if (!target) return;

    assertSwitch(target);
    switchConversation(target);
  };

  const enableStorage = async () => {
    if (library.phase !== "ready") return;

    if (store.getSnapshot().turns.length > AI_RECORD_LIMITS.conversationTurns) throw new Error("conversation-turn-limit");

    store.select({ id: id ?? `chat-${crypto.randomUUID()}`, temporary: false, status: "로컬 보관 켜짐 · 현재 대화부터 저장" });
  };

  const detachDeletedConversation = (deletedId: string) => {
    if (store.getSelection().id !== deletedId) return;

    cancelOpen();
    latest.current = null;
    store.select({ id: null, temporary: true, lastSaved: "", status: "저장 기록 삭제됨 · 화면 내용은 임시 대화로 보존" });
  };

  const detachStorage = () => {
    change?.assertAvailable();
    latest.current = null;
    store.select({ id: null, temporary: true, lastSaved: "", status: "임시 대화" });
  };

  return {
    library,
    id,
    temporary,
    projectId,
    setProjectId: (projectId: string) => store.select({ projectId }),
    status,
    persist,
    open,
    needsDiscard,
    cancelOpen,
    discardAndOpen,
    enableStorage,
    detachDeletedConversation,
    detachStorage,
    assertAvailable: () => change?.assertAvailable()
  };
}

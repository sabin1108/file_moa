"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ConversationPayload } from "../../../shared/ai-records";
import type { useGeneralChat } from "../../conversation-workspace/hooks/useGeneralChat";
import type { AiRecordsController } from "../store/ai-records-controller";
import { useConversationStore } from "../../conversation-workspace/providers/ConversationStateProvider";

export function useConversationRecords(controller: AiRecordsController, chat: ReturnType<typeof useGeneralChat>, change?: { beforeRestore: () => void; assertAvailable: () => void }) {
  const library = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const store = useConversationStore();
  const { id, temporary, projectId, status, lastSaved } = useSyncExternalStore(store.subscribe, store.getSelection, store.getServerSelection);
  const latest = useRef<ConversationPayload | null>(null);
  const hasContent = !!(chat.state.draft || chat.state.turns.length);
  const content = JSON.stringify({ draft: chat.state.draft, turns: chat.state.turns, projectId: projectId || null });
  const payload: ConversationPayload | null = !temporary && id && hasContent ? {
    type: "conversation", id, title: (chat.state.turns[0]?.question ?? chat.state.draft).slice(0, 120) || "새 대화",
    updatedAt: new Date().toISOString(), draft: chat.state.draft,
    turns: chat.state.turns.map(turn => turn.status === "pending" ? { ...turn, answer: turn.answer.slice(0, turn.visibleLength) } : turn), projectId: projectId || null,
  } : null;
  useEffect(() => { latest.current = payload; });

  useEffect(() => {
    if (temporary || !id || library.phase !== "ready" || content === lastSaved) return;
    const payload = latest.current;
    if (!payload) return;
    const timer = window.setTimeout(() => {
      store.select({ status: "저장 중" });
      void controller.save(payload).then(() => {
        if (store.getSelection().id === id) store.select({ lastSaved: content, status: "로컬 폴더에 저장됨" });
      }, () => { if (store.getSelection().id === id) store.select({ status: "미저장 · 화면의 내용을 보관해 주세요" }); });
    }, chat.state.active ? 2000 : 800);
    return () => window.clearTimeout(timer);
  }, [controller, content, library.phase, temporary, id, chat.state.active, lastSaved, store]);

  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      const current = latest.current;
      if (!current) return;
      const saved = JSON.stringify({ draft: current.draft, turns: current.turns, projectId: current.projectId });
      if (saved !== store.getSelection().lastSaved) { event.preventDefault(); }
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
    const current = payload;
    if (!current || content === lastSaved) return;
    try {
      await controller.save(current);
      store.select({ lastSaved: content, status: "로컬 폴더에 저장됨" });
    } catch { store.select({ status: "미저장 · 다른 대화를 열기 전에 저장을 다시 시도해 주세요" }); throw new Error("unsaved-conversation"); }
  };

  const open = async (payload: ConversationPayload | null, temp = false) => {
    change?.assertAvailable();
    await persist();
    change?.beforeRestore();
    chat.restore(payload);
    store.select({ id: payload?.id ?? `chat-${crypto.randomUUID()}`, projectId: payload?.projectId ?? "", temporary: temp,
      lastSaved: payload ? JSON.stringify({ draft: payload.draft, turns: payload.turns, projectId: payload.projectId }) : "",
      status: temp ? "임시 대화" : payload ? "로컬 대화 불러옴" : "새 대화 · 입력하면 자동 저장" });
  };

  const enableStorage = async () => {
    if (library.phase !== "ready") return;
    store.select({ id: id ?? `chat-${crypto.randomUUID()}`, temporary: false, status: "로컬 보관 켜짐 · 현재 대화부터 저장" });
  };

  const forget = () => {
    change?.beforeRestore();
    chat.restore(null);
    latest.current = null;
  };

  const detachStorage = () => {
    change?.assertAvailable();
    latest.current = null;
    store.select({ id: null, temporary: true, lastSaved: "", status: "임시 대화" });
  };

  return { library, id, temporary, projectId, setProjectId: (projectId: string) => store.select({ projectId }), status, persist, open, enableStorage, forget, detachStorage, assertAvailable: () => change?.assertAvailable() };
}

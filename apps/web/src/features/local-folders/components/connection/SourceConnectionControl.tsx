"use client";
import { useRef } from "react";
import { useSharedSourceFolderConnection } from "../../providers/SourceFolderProvider";
import { SourceFolderConnection } from "./SourceFolderConnection";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";

/** 실제 선택기는 기존 Provider에서 사용자 클릭 제스처 안에 호출한다. */
export function SourceConnectionControl() {
  const { state, connect, reconnect, disconnect } = useSharedSourceFolderConnection();
  const region = useRef<HTMLDivElement>(null);
  const perform = async () => {
    const completed = await (state.view?.status === "needs-permission" ? reconnect() : connect());
    requestAnimationFrame(() => {
      const treeRoot = document.querySelector<HTMLElement>("[data-folder-tree-root]");
      const target = completed
        ? treeRoot?.checkVisibility()
          ? treeRoot
          : document.querySelector<HTMLElement>("[data-conversation-title]")
        : region.current?.querySelector<HTMLElement>("button");
      target?.focus({ preventScroll: true });
    });
  };
  return <div ref={region}>
    {state.view && <SourceFolderConnection compact view={state.view} disabled={!!state.pending || state.phase === "unsupported" || state.phase === "disconnect-error"}
      onConnect={() => { void perform(); }} onReconnect={() => { void perform(); }} onDisconnect={disconnect} />}
    {state.pending && <p role="status">폴더 연결을 기다리고 있어요…</p>}
    {state.notice && <StatusNotice {...state.notice} />}
    {state.phase === "loading" && <p role="status">연결 상태 확인 중…</p>}
  </div>;
}

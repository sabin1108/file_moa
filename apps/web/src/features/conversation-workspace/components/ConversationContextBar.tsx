"use client";

import type { MouseEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { actionClasses } from "../../../components/ui/action-classes";
import styles from "./conversation-options.module.css";

export type ConversationPanelView = "records" | "storage" | "sources" | "settings";

export function ConversationContextBar({ temporary, status, sourceName, provider, onOpen }: {
  temporary: boolean;
  status: string;
  sourceName: string | null;
  provider: string | null;
  onOpen: (view: ConversationPanelView, trigger: HTMLElement) => void;
}) {
  const open = (view: ConversationPanelView) => (event: MouseEvent<HTMLButtonElement>) => onOpen(view, event.currentTarget);
  let storage = temporary ? "저장 안 함" : "저장 켜짐";
  if (status.includes("미저장")) storage = "저장 확인 필요";
  else if (status === "저장 중") storage = "저장 중";
  else if (status === "로컬 폴더에 저장됨") storage = "저장됨";
  return <div className={styles.context} data-conversation-context>
    <div className={styles.contextActions}>
      <button type="button" className={actionClasses("secondary")} onClick={open("sources")} title={sourceName ?? undefined}>
        <Icon name="attach" /><span>{sourceName ? `자료 · ${sourceName}` : "자료 연결"}</span>
      </button>
      <button type="button" className={actionClasses("secondary")} onClick={open("storage")}>
        <Icon name={temporary ? "folder" : "check"} /><span role="status">{storage}</span>
      </button>
      <button type="button" className={actionClasses("secondary", styles.settingsButton)} onClick={open("settings")} aria-label="대화 설정">
        <Icon name="settings" /><span>설정</span>
      </button>
    </div>
    <span className={styles.transmission}>{provider ? `${provider}로 질문과 최근 대화를 전송합니다.` : "AI 연결 없이 자료를 찾을 수 있어요."}</span>
  </div>;
}

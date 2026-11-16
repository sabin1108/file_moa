"use client";

import { Icon } from "../../components/ui/Icon";
import type { ConversationPanelView } from "./ConversationContextBar";
import styles from "./conversation-options.module.css";

export function ConversationPanelNavigation({ selected, onOpen }: {
  selected: ConversationPanelView; onOpen: (view: ConversationPanelView, trigger: HTMLButtonElement) => void;
}) {
  return <nav className={styles.panelNavigation} aria-label="대화 도구">
    {([["records", "기록", "folder"], ["sources", "자료", "attach"], ["settings", "설정", "settings"]] as const).map(([view, label, icon]) => <button
      type="button" key={view} aria-pressed={view === selected || view === "records" && selected === "storage"}
      onClick={event => onOpen(view, event.currentTarget)}><Icon name={icon} />{label}</button>)}
  </nav>;
}

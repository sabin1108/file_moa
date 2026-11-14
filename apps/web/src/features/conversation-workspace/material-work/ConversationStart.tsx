"use client";

import { Icon, type IconName } from "../../../components/ui/Icon";
import type { WorkspaceRequestKind } from "./workspace-request";
import styles from "../conversation-options.module.css";

export const conversationActions: readonly { kind: WorkspaceRequestKind; label: string; description: string; icon: IconName }[] = [
  { kind: "chat", label: "일반 대화", description: "궁금한 내용을 바로 질문해요", icon: "chat" },
  { kind: "find", label: "자료 찾기", description: "단어와 날짜로 파일을 찾아요", icon: "search" },
  { kind: "organize", label: "자료 정리", description: "정리할 파일과 변경 계획을 검토해요", icon: "folder" },
  { kind: "grounded", label: "자료로 질문", description: "선택한 자료를 참고해 답변받아요", icon: "file" },
];

export function ConversationStart({ onChoose, disabled, modes }: {
  onChoose: (kind: WorkspaceRequestKind) => void;
  disabled: boolean;
  modes?: readonly WorkspaceRequestKind[];
}) {
  return <div className={styles.startActions} data-tour="start" aria-label="시작할 작업 선택">
    {conversationActions.filter(action => !modes || modes.includes(action.kind)).map(action => <button
      type="button"
      key={action.kind}
      data-tour={`task-${action.kind}`}
      disabled={disabled}
      onClick={() => onChoose(action.kind)}
    >
      <Icon name={action.icon} />
      <span><strong>{action.label}</strong><small>{action.description}</small></span>
      <Icon name="chevron" size={16} />
    </button>)}
  </div>;
}

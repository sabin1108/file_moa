"use client";

import { actionClasses } from "../../../components/ui/action-classes";
import { ConversationStart, conversationActions } from "./ConversationStart";
import type { WorkspaceRequestKind } from "./workspace-request";
import styles from "../conversation-options.module.css";

const examples: Record<WorkspaceRequestKind, readonly string[]> = {
  chat: ["보고서를 읽기 쉽게 쓰는 방법을 알려줘"],
  find: ["성능 찾아줘", "회의 찾아줘"],
  grounded: ["선택한 자료의 핵심 내용을 정리해줘"],
  organize: ["선택한 자료를 주제별 폴더로 정리해줘"],
};

type TaskProps = {
  mode: WorkspaceRequestKind | null;
  disabled: boolean;
  onChoose: (kind: WorkspaceRequestKind) => void;
};

export function ConversationTaskIntro({ mode, disabled, onChoose }: TaskProps) {
  const action = conversationActions.find(action => action.kind === mode);
  return <>
    <h2 tabIndex={-1} data-conversation-title>{action ? `${action.label} 시작하기` : "어떤 작업을 시작할까요?"}</h2>
    {action
      ? <p>{action.description}. 아래에 요청을 입력해 주세요.</p>
      : <ConversationStart onChoose={onChoose} disabled={disabled} />}
  </>;
}

export function ConversationTaskControls({ mode, disabled, onChoose, onExample }: TaskProps & { onExample: (value: string) => void }) {
  const action = conversationActions.find(action => action.kind === mode);
  return <section className={styles.taskControls} aria-label="현재 대화 작업">
    <label className={styles.modeChoice}>작업
      <select aria-label="대화 작업" value={mode ?? ""} disabled={disabled} onChange={event => onChoose(event.target.value as WorkspaceRequestKind)}>
        {!mode && <option value="">자동 선택</option>}
        {conversationActions.map(action => <option key={action.kind} value={action.kind}>{action.label}</option>)}
      </select>
    </label>
    {action && <>
      <p className={styles.taskDescription}>{action.description}. 요청을 입력한 뒤 보내세요.</p>
      <details className={styles.taskExamples}>
        <summary>입력 예시</summary>
        <p>예시를 누르면 입력창만 채워요. 자동으로 실행하지 않아요.</p>
        <div className={styles.messageActions}>{examples[action.kind].map(example => <button key={example} type="button"
          className={actionClasses("secondary")} data-task-example={action.kind} disabled={disabled} onClick={() => onExample(example)}>{example}</button>)}</div>
      </details>
    </>}
  </section>;
}

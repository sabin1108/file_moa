"use client";

import { useState } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import { Icon } from "../../../components/ui/Icon";
import type { AiRecordsController } from "../ai-records-controller";
import type { ConversationRecordControls } from "./conversation-record-controls";
import controls from "../../../styles/controls.module.css";
import styles from "./ai-library.module.css";

export function AiStorageSettings({ controller, conversation, locked, onBack, onOpen }: {
  controller: AiRecordsController;
  conversation: ConversationRecordControls;
  locked: boolean;
  onBack: () => void;
  onOpen: () => void;
}) {
  const { library } = conversation;
  const [notice, setNotice] = useState("");
  const perform = async (operation: () => Promise<unknown>) => {
    try {
      conversation.assertAvailable();
      await operation();
      setNotice("");
    }
    catch {
      setNotice("저장을 마치지 못했어요. 응답 상태와 폴더 권한을 확인해 주세요.");
    }
  };
  const disabled = locked || library.pending;

  return <section className={styles.storage} aria-label="기록 저장 위치">
    <button type="button" className={actionClasses("secondary")} onClick={onBack}>
      <Icon name="chevron" />
      기록으로
    </button>
    <div className={styles.storageHeading}>
      <Icon name="folder" size={30} />
      <div>
        <h3>
          {library.folderName ?? "대화를 보관할 폴더"}
        </h3>
        <p>
          {library.phase === "ready" ? "이 기기에 연결됨" : library.folderName ? "연결 확인 필요" : "아직 선택하지 않았어요"}
        </p>
      </div>
    </div>
    <p>선택한 폴더에 대화·결과물·기억을 저장합니다. 원본 자료는 복제하지 않으며 저장 파일은 암호화되지 않습니다.</p>
    <button
      type="button"
      className={actionClasses("primary")}
      disabled={disabled}
      onClick={() => void perform(() => controller.connect())}
    >
      <Icon name="folder" />
      {library.folderName ? "다른 저장 위치 선택" : "저장 폴더 선택"}
    </button>
    {library.folderName && <div className={styles.actions}>
      <button
        type="button"
        className={actionClasses("secondary")}
        disabled={disabled}
        onClick={() => void perform(() => controller.reconnect())}
      >
        <Icon name="retry" />
        권한 확인·다시 읽기
      </button>
      <button
        type="button"
        className={actionClasses("secondary")}
        disabled={disabled}
        onClick={() => void perform(async () => {
          await conversation.persist();
          conversation.assertAvailable();
          conversation.detachStorage();
          await controller.disconnect();
        })}
      >연결 해제</button>
    </div>}
    {locked && <p>응답·편집·삭제 확인을 마친 뒤 저장 위치를 변경할 수 있어요.</p>}
    {(notice || library.notice || conversation.status.includes("미저장")) && <p role="status" className={styles.notice}>
      {notice || library.notice || conversation.status}
    </p>}
    <section className={styles.storageChoice} aria-label="현재 대화 보관">
      <h3>현재 대화</h3>
      <p>
        {conversation.temporary ? "지금은 저장하지 않습니다. 새로고침하면 사라져요." : conversation.status}
      </p>
      {conversation.temporary && library.phase === "ready" && <button
        type="button"
        className={actionClasses("primary")}
        disabled={disabled}
        onClick={() => void perform(async () => {
          await conversation.enableStorage();
          onBack();
        })}
      >이 대화 저장</button>}
      <button
        type="button"
        className={actionClasses("secondary")}
        disabled={disabled}
        onClick={() => void perform(async () => {
          await conversation.open(null, true);
          onOpen();
        })}
      >저장 없이 새 대화</button>
    </section>
    <details className={controls.disclosure}>
      <summary>연결 해제와 저장 파일</summary>
      <p>연결을 해제해도 파일과 현재 대화는 남습니다. 이후 대화는 이 화면에만 남아요. 이 폴더의 앱 기록만 읽고 쓰며 원본 자료는 변경하지 않습니다.</p>
    </details>
  </section>;
}

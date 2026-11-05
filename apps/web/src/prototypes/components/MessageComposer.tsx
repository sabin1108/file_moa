import { PrototypeDialog } from "../demo/PrototypeDialog";
import { Icon } from "../../components/ui/Icon";
import { PreviewButton } from "./PreviewButton";
import styles from "../../styles/composer.module.css";

export function MessageComposer() {
  return (
    <div className={styles.composerRegion}>
      <div className={styles.composer}>
        <label className="sr-only" htmlFor="message-draft">메시지 입력 디자인 미리보기</label>
        <textarea id="message-draft" readOnly rows={1} placeholder="메시지 보내기" />
        <div className={styles.composerTools}>
          <div>
            <PrototypeDialog initial="transfer" label="자료 첨부"><Icon name="plus" size={20} /></PrototypeDialog>
            <span className={styles.sourceHint}><Icon name="folder" size={14} />프론트엔드 공부</span>
          </div>
          <PreviewButton className={styles.sendButton} variant="primary" label="메시지 전송"><Icon name="arrow" size={18} /></PreviewButton>
        </div>
      </div>
      <p className={styles.disclaimer}>디자인 시안 · 예시 대화</p>
    </div>
  );
}

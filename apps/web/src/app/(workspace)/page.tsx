import { WorkspaceShell } from "../../components/layout/WorkspaceShell";
import { UnavailableFeature } from "../../components/ui/feedback/UnavailableFeature";
import styles from "../../styles/workspace-layout.module.css";
import composer from "../../styles/composer.module.css";

export default function Home() {
  return (
    <WorkspaceShell title="대화" active="chat">
      <div className={styles.chatBody}>
        <UnavailableFeature title="대화 기능은 아직 구현되지 않았습니다.">
          AI 응답과 대화 저장은 아직 연결되지 않았습니다. 지금은 메시지를 보낼 수 없습니다.
        </UnavailableFeature>
        <div className={composer.composerRegion}>
          <div className={composer.composer}>
            <label className="sr-only" htmlFor="message-draft">메시지 입력 — 구현 전</label>
            <textarea id="message-draft" disabled rows={1} placeholder="AI 연결 후 메시지를 보낼 수 있습니다." />
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

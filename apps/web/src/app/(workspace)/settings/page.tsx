/**
 * /settings 라우트 진입점이다. 공통 작업면에 SourceFolderSettings를 배치한다.
 * 연결 방식은 features/local-folders/components/connection → store → services 순서로 읽는다.
 */
import { SourceFolderSettings } from "../../../features/local-folders/components/connection/SourceFolderSettings";
import { EditorSettings } from "../../../features/local-folders/components/connection/EditorSettings";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import ui from "../../../styles/workspace-ui.module.css";
import styles from "../../../styles/workspace-layout.module.css";

export default function Page() {
  return (
    <WorkspaceShell title="설정" active="settings">
      <div className={ui.canvas}>
        <div className={`${ui.sheet} ${styles.settingsBody}`} data-layout="reader">
          <header className={styles.settingsHeader}>
            <h2>자료 폴더 연결</h2>
            <p>이 기기의 폴더 한 개를 읽기 전용으로 연결합니다.</p>
          </header>
          <SourceFolderSettings />
          <EditorSettings />
          <p className={styles.implementationNote}>
            계정·답변·데이터 설정은 아직 구현되지 않았습니다.
          </p>
        </div>
      </div>
    </WorkspaceShell>
  );
}

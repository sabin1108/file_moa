import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { PrototypeDialog } from "../demo/PrototypeDialog";
import { RecentActivity } from "./components/RecentActivity";
import { Icon } from "../../components/ui/Icon";
import { LibraryHeader } from "./components/LibraryHeader";
import { FolderCanvas } from "./components/FolderCanvas";
import { FolderToolbar } from "./components/FolderToolbar";
import { MovePlanPreview } from "./components/MovePlanPreview";
import styles from "./styles/library.module.css";

export function FileLibraryPrototype() {
  return (
    <div className={styles.workspace}>
      <a className="skip-link" href="#file-library">폴더 구조로 건너뛰기</a>
      <WorkspaceSidebar active="files" />
      <main id="file-library" className={styles.main + " reading-surface"}>
        <LibraryHeader />
        <div className={styles.content}>
          <div className={styles.pageHeading}>
            <h1>내 폴더</h1>
            <PrototypeDialog initial="connect" variant="secondary"><Icon name="plus" size={17} />폴더 연결</PrototypeDialog>
          </div>
          <div className={styles.workArea}>
            <div className={styles.explorerColumn}><section className={styles.explorer} aria-label="파일 탐색 공간">
              <FolderToolbar />
              <FolderCanvas />
            </section><RecentActivity /></div>
            <MovePlanPreview />
          </div>
          
        </div>
      </main>
    </div>
  );
}

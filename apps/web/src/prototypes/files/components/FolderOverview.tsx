import { Icon } from "../../../components/ui/Icon";
import { PreviewButton } from "../../components/PreviewButton";
import { libraryFiles, portfolioNames } from "../library-data";
import styles from "../styles/library.module.css";

export function FolderOverview() {
  return <nav className={styles.folderSwitcher} aria-label="예시 폴더 선택">
    <PreviewButton className={styles.currentFolder}><Icon name="folder" size={17} />프론트엔드 공부<span>{libraryFiles.length}</span></PreviewButton>
    <PreviewButton><Icon name="folder" size={17} />포트폴리오<span>{portfolioNames.length}</span></PreviewButton>
    <PreviewButton label="폴더 추가"><Icon name="plus" size={17} /></PreviewButton>
  </nav>;
}

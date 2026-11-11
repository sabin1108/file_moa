import { PreviewButton } from "../../components/PreviewButton";
import { Icon } from "../../../components/ui/Icon";
import styles from "../styles/library.module.css";

export function FolderToolbar() {
  return (
    <div className={styles.canvasToolbar}>
      <strong>연결한 폴더</strong>
      <PreviewButton>
        이름순
        <Icon name="down" size={13} />
      </PreviewButton>
    </div>
  );
}

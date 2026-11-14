import { Icon } from "../../../components/ui/Icon";
import styles from "./source-folder-connection.module.css";

/** 실제 브라우저 권한창과 구별되는 짧은 앱 안내다. 추가 승인 동작은 만들지 않는다. */

export function FolderPermissionGuide() {
  return <aside className={styles.permissionGuide} aria-label="폴더 접근 안내">
    <Icon name="folder" size={22} />
    <div>
      <strong>선택한 폴더만 연결합니다</strong>
      <p>다음 브라우저 창에서 폴더 접근을 허용해 주세요.</p>
      <p className={styles.scope}>연결은 읽기 권한으로 시작해요. 파일 변경은 별도 실행 때 확인합니다.</p>
    </div>
  </aside>;
}

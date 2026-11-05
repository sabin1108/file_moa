import { ActionLink } from "../../../components/ui/ActionLink";
import { Icon } from "../../../components/ui/Icon";
import styles from "../styles/library.module.css";

export function LibraryHeader() {
  return <header className={styles.header}><div className={styles.breadcrumb}><span>나의 작업 공간</span><Icon name="chevron" size={12} /><span>내 파일</span></div><div className={styles.headerActions}><ActionLink href="/preview">전체 시안</ActionLink><ActionLink href="/"><Icon name="chat" size={16} />대화로</ActionLink></div></header>;
}

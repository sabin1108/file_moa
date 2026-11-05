import { PrototypeDialog } from "../../demo/PrototypeDialog";
import styles from "../styles/library.module.css";

export function RecentActivity() {
  return (
    <section className={styles.activity} aria-label="예시 작업 기록">
      <div><h2>최근 작업 <span>예시</span></h2><p>문서 3개 이동 · 2개 완료, 1개 확인 필요</p></div>
      <PrototypeDialog initial="move-partial" variant="secondary">기록 보기</PrototypeDialog>
    </section>
  );
}

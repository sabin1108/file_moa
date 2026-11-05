import { ActionLink } from "../ActionLink";
import styles from "../../../styles/workspace-layout.module.css";

/** 미구현과 조회 결과 0건을 구분한다. 합성 데이터나 성공 조작을 만들지 않는다. */
export function UnavailableFeature({ title, children }: { title: string; children: string }) {
  return (
    <section className={styles.unavailable} aria-labelledby="feature-status">
      <h2 id="feature-status">{title}</h2>
      <p>{children}</p>
      <div className={styles.nextAction}>
        <p>지금은 설정에서 자료 폴더 연결·재연결·해제를 사용할 수 있습니다.</p>
        <ActionLink href="/settings" variant="secondary">자료 폴더 연결하기</ActionLink>
      </div>
    </section>
  );
}

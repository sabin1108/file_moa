import { MoaLoader } from "./MoaLoader";
import styles from "./page-loading.module.css";

export function PageLoading({ message = "페이지를 이동하고 있어요.", compact = false }: {
  message?: string;
  compact?: boolean
}) {
  const Container = compact ? "span" : "div";
  const Label = compact ? "span" : "p";

  return <Container
    className={compact ? styles.compact : `${styles.page} reading-surface`}
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <MoaLoader size={compact ? 96 : 256} />
    <Label>
      {message}
    </Label>
    <span className={styles.bar} aria-hidden="true">
      <i />
    </span>
  </Container>;
}

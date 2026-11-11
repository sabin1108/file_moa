import type { ReactNode } from "react";
import { MoaLoader } from "../../components/ui/feedback/MoaLoader";
import styles from "./prototype-feedback.module.css";

type Progress = {
  completed: number;
  total: number
};

/** Omit progress when the caller cannot measure completion. No timer or estimated percentage. */

export function TaskProgress({ label, detail, progress, action }: {
  label: string;
  detail?: string;
  progress?: Progress;
  action?: ReactNode;
}) {
  const measurable = progress && progress.total > 0;

  return <div className={styles.task}>
    <div className={styles.taskHeading}>
      <div role="status" aria-atomic="true">
        <strong>
          {label}
        </strong>
        {detail && <p>
          {detail}
        </p>}
      </div>
      {!measurable && <MoaLoader />}
      {action}
    </div>
    {measurable && <progress
      className={styles.progress}
      value={progress.completed}
      max={progress.total}
      aria-label={label}
    />}
  </div>;
}


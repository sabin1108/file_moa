import type { ReactNode } from "react";
import { Icon } from "../Icon";
import { MoaLoader } from "./MoaLoader";
import styles from "./status-notice.module.css";

export type NoticeState = "pending" | "success" | "attention" | "error";

export type StatusNoticeProps = {
  state: NoticeState;
  title: string;
  detail?: string;
  action?: ReactNode;
  role?: "status" | "alert";
  onDismiss?: () => void;
};

export function StatusNotice({ state, title, detail, action, role = "status", onDismiss }: StatusNoticeProps) {
  return <div className={styles.notice} data-state={state}>
    {state === "pending" ? <MoaLoader /> : <Icon name={state === "success" ? "check" : "warning"} size={22} />}
    <div className={styles.noticeText} role={role} aria-atomic="true">
      <strong>
        {title}
      </strong>
      {detail && <p>
        {detail}
      </p>}
    </div>
    {action && <div className={styles.action}>
      {action}
    </div>}
    {onDismiss && <button type="button" className={styles.dismiss} aria-label="알림 닫기" onClick={onDismiss}>
      <Icon name="close" size={18} />
    </button>}
  </div>;
}

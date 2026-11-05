import type { ReactNode } from "react";
import { StatusNotice } from "../../components/ui/feedback/StatusNotice";
import styles from "./prototype-feedback.module.css";

export type RegionState = "loading" | "refreshing" | "ready" | "error";

/** On refresh/error, children stay mounted so their local state and focus can survive. */
export function LoadingRegion({ state, label, detail, placeholder, children, action }: {
  state: RegionState; label: string; detail?: string; placeholder: ReactNode; children?: ReactNode; action?: ReactNode;
}) {
  const pending = state === "loading" || state === "refreshing";
  return <section className={styles.region} aria-label={label}>
    <StatusNotice state={state === "error" ? "error" : pending ? "pending" : "success"} title={label} detail={detail} action={action} />
    <div aria-busy={pending} className={styles.regionBody}>
      {state === "loading" ? <div aria-hidden="true">{placeholder}</div> : children}
    </div>
  </section>;
}

export function ContentSkeleton({ shape = "list", rows = 3 }: { shape?: "list" | "document"; rows?: number }) {
  return <div className={styles.skeleton} data-shape={shape} aria-hidden="true">{Array.from({ length: rows }, (_, index) => <div className={styles.skeletonRow} key={index}><span /><span /></div>)}</div>;
}

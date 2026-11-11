import type { ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import styles from "./prototype-feedback.module.css";

export type FileIssue = {
  id: string;
  name: string;
  reason: string;
  resolution: string;
  action?: ReactNode
};

export function FileIssueList({ issues }: { issues: readonly FileIssue[] }) {
  return <ul className={styles.issues} aria-label="확인이 필요한 자료">
    {issues.map(issue => <li key={issue.id}>
      <Icon name="warning" size={20} />
      <div>
        <strong>
          {issue.name}
        </strong>
        <span>
          {issue.reason}
        </span>
        <p>
          {issue.resolution}
        </p>
      </div>
      {issue.action}
    </li>)}
  </ul>;
}

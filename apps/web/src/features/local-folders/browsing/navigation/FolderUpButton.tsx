import { actionClasses } from "../../../../components/ui/action-classes";
import styles from "./folder-up-button.module.css";

/** 두 탐색 목록에서 같은 위치/동작을 갖는 상위 이동 행. */

export function FolderUpButton({ parentName, disabled, onClick }: {
  parentName: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={actionClasses("secondary", styles.up)}
      aria-label="상위 폴더"
      title={`${parentName}로 이동`}
      disabled={disabled}
      onClick={onClick}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 19h-7a4 4 0 0 1-4-4V5m-5 5 5-5 5 5" />
      </svg>
      <strong>위 폴더로</strong>
      <span>
        {parentName}
      </span>
    </button>
  );
}

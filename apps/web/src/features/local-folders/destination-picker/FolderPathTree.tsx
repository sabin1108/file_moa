import type { CSSProperties } from "react";
import { Icon } from "../../../components/ui/Icon";
import styles from "../operations/planning/file-change-plan.module.css";

/** 경로 조각마다 한 단계씩 표시한다. 깊은 경로는 들여쓰기 폭을 제한하고 이름을 줄바꿈한다. */

export function FolderPathTree({ folders, fileName, stateLabel, proposed }: {
  folders: readonly string[];
  fileName: string;
  stateLabel: string;
  proposed?: boolean;
}) {
  return <ol className={styles.pathTree} aria-label={[...folders, fileName].join(" / ")}>
    {[...folders, fileName].map((name, depth) => <li
      key={depth}
      data-depth={depth}
      data-file={depth === folders.length}
      data-proposed={depth === folders.length && proposed}
      style={{ "--depth": depth } as CSSProperties}
    >
      <Icon name={depth === folders.length ? "file" : "folder"} size={16} />
      <span>
        {name}
      </span>
      {depth === folders.length && <small>
        {stateLabel}
      </small>}
    </li>)}
  </ol>;
}

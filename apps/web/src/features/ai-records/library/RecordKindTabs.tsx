"use client";

import { Icon } from "../../../components/ui/Icon";
import { recordKinds } from "../../../shared/record-kinds";
import styles from "./ai-library.module.css";

export type RecordKind = typeof recordKinds[number][0];

export function RecordKindTabs({ selected, onChange, counts }: {
  selected: RecordKind; onChange: (kind: RecordKind) => void; counts?: Partial<Record<RecordKind, number>>;
}) {
  return <nav className={styles.tabs} aria-label="보관 기록 종류">
    {recordKinds.map(([kind, label, icon]) => <button type="button" key={kind} data-tour={`record-${kind}`}
      aria-pressed={selected === kind} onClick={() => onChange(kind)}>
      <Icon name={icon} /><span>{label}</span>{counts && <small>{counts[kind] ?? 0}</small>}
    </button>)}
  </nav>;
}

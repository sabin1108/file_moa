"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { PageLoading } from "../ui/feedback/PageLoading";
import styles from "../../styles/workspace-layout.module.css";

const tabs = [{ id: "account", label: "계정과 로그인" }, { id: "folders", label: "폴더 연결" }, { id: "editor", label: "문서 편집" }] as const;

export function SettingsTabs({ current }: { current: "account" | "folders" | "editor" }) {
  const router = useRouter();
  const [selected, select] = useOptimistic(current);
  const [pending, startTransition] = useTransition();

  return <div className={styles.settingsNavigation}>
    <nav className={styles.settingsTabs} aria-label="설정 분류">
      {tabs.map(tab => <Link key={tab.id} href={`/settings?tab=${tab.id}`} aria-current={selected === tab.id ? "page" : undefined}
        onNavigate={event => {
          event.preventDefault();
          startTransition(() => { select(tab.id); router.push(`/settings?tab=${tab.id}`, { scroll: false }); });
        }}>{tab.label}</Link>)}
      <span className={styles.settingsIndicator} aria-hidden="true" style={{ transform: `translateX(${tabs.findIndex(tab => tab.id === selected) * 100}%)` }} />
    </nav>
    {pending && <div className={styles.settingsPending}><PageLoading compact message="설정을 불러오고 있어요." /></div>}
  </div>;
}

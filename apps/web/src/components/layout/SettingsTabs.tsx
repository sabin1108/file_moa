"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import styles from "../../styles/workspace-layout.module.css";

const tabs = [
  { id: "account", label: "계정과 로그인", title: "계정과 로그인", description: "내 계정과 연결된 로그인 수단을 관리합니다." },
  { id: "folders", label: "폴더 연결", title: "자료 폴더와 복구 보관함", description: "이 기기에 저장된 폴더 연결입니다. 연결을 해제해도 원본 파일은 유지됩니다." },
  { id: "editor", label: "문서 편집", title: "문서 편집", description: "이 브라우저에서 문서를 편집하고 저장하는 방식을 정합니다." },
  { id: "controls", label: "화면과 조작", title: "화면과 조작", description: "이 기기의 빠른 전환 메뉴와 단축키를 정합니다." },
] as const;
type SettingsTab = typeof tabs[number]["id"];

export function SettingsTabs({ panels }: { panels: Record<SettingsTab, ReactNode> }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const selected = tabs.find(tab => tab.id === params.get("tab"))?.id ?? "account";

  return <><div className={styles.settingsNavigation}>
    <nav className={styles.settingsTabs} aria-label="설정 분류">
      {tabs.map(tab => <Link key={tab.id} href={`${pathname}?tab=${tab.id}`} prefetch={false} aria-current={selected === tab.id ? "page" : undefined}
        onNavigate={event => {
          event.preventDefault();
          const url = new URL(window.location.href);
          url.searchParams.set("tab", tab.id);
          if (params.get("tab") !== tab.id) window.history.pushState(null, "", url);
        }}>{tab.label}</Link>)}
      <span className={styles.settingsIndicator} aria-hidden="true" style={{ transform: `translateX(${tabs.findIndex(tab => tab.id === selected) * 100}%)` }} />
    </nav>
  </div>{tabs.map(tab => <section key={tab.id} hidden={selected !== tab.id} aria-label={tab.title}>
    <div className={styles.settingsSection}>
      <header className={styles.settingsHeader}><h2>{tab.title}</h2><p>{tab.description}</p></header>
      <div className={styles.settingsPanel}>{panels[tab.id]}</div>
    </div>
  </section>)}</>;
}

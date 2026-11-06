import type { ReactNode } from "react";
import Link from "next/link";
import { MoaMark } from "../ui/Icon";
import { ActionLink } from "../ui/ActionLink";
import styles from "./auth-shell.module.css";

export function AuthShell({ children, preview = false }: { children: ReactNode; preview?: boolean }) {
  return <main className={[styles.page, !preview && styles.live, "reading-surface"].filter(Boolean).join(" ")}>
    <header className={styles.header}>
      <Link href={preview ? "/preview/screens/chat" : "/"} className={styles.brand}><MoaMark size={28} />모아.</Link>
      <ActionLink href={preview ? "/preview" : "/"}>{preview ? "화면 둘러보기" : "모아 홈"}</ActionLink>
    </header>
    <div className={styles.layout}>
      <section className={styles.introduction} aria-label="모아 소개">
        <p className={styles.identity}>나의 자료, 나의 작업 공간</p>
        <p className={styles.tagline}>흩어진 기록을 모아,<br />다음 생각으로.</p>
        <p>폴더에 쌓인 자료를 정리하고,<br />필요한 순간 대화로 이어가세요.</p>
        <div className={styles.folderSketch} aria-hidden="true"><span>공부 노트</span><span>프로젝트 기록</span><span>나의 생각</span></div>
      </section>
      <section className={styles.formSide}>
        {children}
        {preview && <p className={styles.notice}>디자인 시안 · 실제 로그인이나 계정 생성은 없습니다.</p>}
      </section>
    </div>
    <footer className={styles.footer}>
      <span>모아 · 개인 작업 공간</span>
      <ActionLink href={preview ? "/preview/screens/files" : "/login"}>{preview ? "폴더 시안 먼저 보기" : "계정 로그인"}</ActionLink>
    </footer>
  </main>;
}

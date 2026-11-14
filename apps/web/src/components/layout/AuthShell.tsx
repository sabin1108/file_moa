import type { ReactNode } from "react";
import Link from "next/link";
import { MoaMark } from "../ui/Icon";
import { ActionLink } from "../ui/ActionLink";
import { NavigationProgress } from "../ui/feedback/NavigationProgress";
import { MoaLoader } from "../ui/feedback/MoaLoader";
import styles from "./auth-shell.module.css";

export function AuthShell({ children, guest = false }: {
  children: ReactNode;
  guest?: boolean
}) {
  const home = guest ? "/login" : "/";

  return <main
    data-auth-shell
    data-workspace-quick-menu={!guest || undefined}
    className={`${styles.page} ${styles.live} reading-surface`}
  >
    <header className={styles.header}>
      <Link href={home} className={styles.brand}>
        <MoaMark size={28} />
        모아.
        <NavigationProgress />
      </Link>
      <ActionLink href={home}>
        {guest ? "로그인으로" : "모아 홈"}
      </ActionLink>
    </header>
    <div className={styles.layout}>
      <section className={styles.introduction} aria-label="모아 소개">
        <p className={styles.identity}>나의 자료, 나의 작업 공간</p>
        <p className={styles.tagline}>
          흩어진 기록을 모아,
          <br />
          다음 생각으로.
        </p>
        <p>
          폴더에 쌓인 자료를 정리하고,
          <br />
          필요한 순간 대화로 이어가세요.
        </p>
        <div className={styles.folderAnimation} data-auth-illustration aria-hidden="true">
          <div className={styles.folderFallback} data-auth-fallback>
            <MoaLoader size={288} />
          </div>
        </div>
      </section>
      <section className={styles.formSide}>
        {children}
      </section>
    </div>
    <footer className={styles.footer}>
      <span>모아 · 개인 작업 공간</span>
      <ActionLink href="/start">
        모아 알아보기
      </ActionLink>
    </footer>
  </main>;
}

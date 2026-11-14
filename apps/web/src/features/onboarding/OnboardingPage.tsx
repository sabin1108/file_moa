import Link from "next/link";
import { Icon, MoaMark } from "../../components/ui/Icon";
import { FolderScene, MaterialExample, RecordScene } from "./ProductScenes";
import { HeroWorkspace, KnowledgeStory, OrganizationStory } from "./ScrollStories";
import styles from "./onboarding.module.css";
import motion from "./onboarding-motion.module.css";

type OnboardingPageProps = {
  mode?: "live" | "sample";
  initialView?: "files";
};

/** 공개 소개와 공유용 체험 소개는 같은 내용을 표시하고 시작 목적지만 구분한다. */

export function OnboardingPage({ mode = "live", initialView }: OnboardingPageProps) {
  const sample = mode === "sample";
  const destination = sample ? `/demo/start?intro=done${initialView === "files" ? "&view=files" : ""}` : "/welcome";
  const action = sample ? "체험 시작하기" : "모아 시작하기";

  return (
    <div className={styles.page} data-onboarding={mode}>
      <a href="#introduction" className="skip-link">본문으로 건너뛰기</a>
      <header className={styles.header}>
        <Link href={sample ? "/demo/intro" : "/start"} className={styles.brand} aria-label="모아 소개 처음으로">
          <MoaMark size={32} />
          <span>모아.</span>
        </Link>
        <nav aria-label="기능 소개">
          <a href="#find">자료 찾기</a>
          <a href="#organize">파일 정리</a>
          <a href="#records">기록</a>
        </nav>
        <Link
          href={sample ? destination : "/login"}
          className={styles.headerAction}
          prefetch={sample ? false : undefined}
        >
          {sample ? action : "로그인"}
        </Link>
      </header>

      <main id="introduction">
        <section
          className={`${styles.hero} ${motion.hero}`}
          aria-labelledby="intro-heading"
          data-scroll-hero
        >
          <div className={motion.heroPin}>
            <div className={`${styles.heroCopy} ${motion.heroCopy}`}>
              <h1 id="intro-heading">흩어진 자료가<br />생각으로 모이는 곳</h1>
              <p>내 폴더의 자료를 찾고, AI와 정리하고,<br className={styles.desktopBreak} /> 필요한 순간 다시 꺼내 쓰세요.</p>
              <Link href={destination} className={styles.primaryAction} prefetch={sample ? false : undefined}>
                {action}
                <Icon name="chevron" size={18} />
              </Link>
              {sample && <p className={styles.invitationNote}>로그인 없이, 준비된 샘플 자료로 둘러보세요.</p>}
            </div>
            <div className={motion.heroArt}>
              <FolderScene><HeroWorkspace /></FolderScene>
            </div>
            <a className={`${styles.scrollLink} ${motion.scrollCue}`} href="#find">스크롤하며 모아 알아보기<Icon name="down" size={18} /></a>
          </div>
        </section>

        <KnowledgeStory />

        <section className={`${styles.chapter} ${styles.find}`} aria-labelledby="materials-heading">
          <div className={styles.split}>
            <div className={styles.chapterCopy}>
              <h2 id="materials-heading">문서도, 메모도.<br />나의 자료니까.</h2>
              <p>평소에 쓰던 폴더와 자료에서 시작해요. 예시 자료를 골라 내용을 살펴보세요.</p>
            </div>
            <MaterialExample />
          </div>
        </section>

        <OrganizationStory />

        <section
          id="records"
          className={`${styles.chapter} ${styles.records}`}
          aria-labelledby="records-heading"
        >
          <div className={styles.split}>
            <div className={styles.chapterCopy}>
              <h2 id="records-heading">좋은 대화를<br />나의 기록으로.</h2>
              <p>대화에서 얻은 답변을 저장하고, 출처가 연결된 위키로 이어가세요. 다음 생각이 필요할 때 다시 펼쳐볼 수 있어요.</p>
              <p className={styles.detail}>기록을 저장할 로컬 폴더는 직접 선택해요. 편집한 내용과 이전 버전을 구분해 보관해요.</p>
            </div>
            <RecordScene />
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-heading">
          <MoaMark size={64} />
          <h2 id="closing-heading">이제, 나의 자료를 모아.</h2>
          <p>
            {sample ? "직접 연결할 폴더가 없어도 괜찮아요. 샘플 자료로 모아를 만나보세요." : "익숙한 폴더에서 시작하는 새로운 작업 공간."}
          </p>
          <Link href={destination} className={styles.primaryAction} prefetch={sample ? false : undefined}>
            {action}
            <Icon name="chevron" size={18} />
          </Link>
          {sample && <p className={styles.sampleScope}>체험의 파일 변경은 가상 자료에만 적용돼요. AI 기능은 체험 환경의 제공 범위와 사용 한도를 따라요.</p>}
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href={sample ? "/demo/intro" : "/start"} className={styles.brand}>
          <MoaMark size={28} />
          <span>모아.</span>
        </Link>
        <p>나의 자료, 나의 작업 공간.</p>
        <span>이 페이지의 자료와 대화는 기능 소개 예시입니다.</span>
      </footer>
    </div>
  );
}

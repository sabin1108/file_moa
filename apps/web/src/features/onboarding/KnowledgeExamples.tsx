"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoaMark } from "../../components/ui/Icon";
import styles from "./onboarding-motion.module.css";

const steps = [
  { label: "자료 찾기", title: "어디에 뒀더라, 이제 그만.", description: "연결한 폴더의 파일 이름과 본문을 검색해 필요한 자료를 찾아보세요." },
  { label: "원문 확인", title: "찾은 내용은 원문에서 정확하게.", description: "검색한 문장만으로 판단하지 않아도 돼요. 원문에서 앞뒤 맥락을 함께 확인하세요." },
  { label: "자료 대화", title: "자료를 읽고, 생각을 이어가요.", description: "필요한 자료를 골라 질문하고, 답변의 근거를 확인하세요." },
];

export function KnowledgeExamples({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;

    const markers = [...root.current.querySelectorAll<HTMLElement>("[data-folder-step]")];
    const observer = new IntersectionObserver(entries => {
      setReady(true);
      if (!entries.some(entry => entry.isIntersecting)) return;

      const distance = (marker: HTMLElement) => Math.abs(marker.getBoundingClientRect().top - innerHeight * .25);
      const closest = markers.reduce((best, marker) => distance(marker) < distance(best) ? marker : best);
      setActive(Number(closest.dataset.folderStep));
      setEntered(true);
    }, { threshold: [0, .25, .5, .75, 1] });

    markers.forEach(marker => observer.observe(marker));

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} className={styles.sharedFolderStory} data-shared-ready={ready ? "true" : undefined} data-active-feature={active}>
      <div className={styles.sharedFolderTrack} aria-hidden="true">
        {steps.map((step, index) => <div key={step.label} data-folder-step={index} />)}
      </div>
      <div className={styles.sharedFolder} data-feature-folder>
        <div className={styles.sharedFolderNavigation} role="group" aria-label="소개할 기능">
          {steps.map((step, index) => (
            <button key={step.label} type="button" aria-pressed={active === index} onClick={() => { setActive(index); setEntered(true); }}>{step.label}</button>
          ))}
        </div>
        <div className={styles.featureFolderBack} aria-hidden="true" />
        <div className={styles.sharedPapers}>
          <div className={styles.sharedPaper} data-shared-paper="0" data-entered={entered}>
            <article className={styles.knowledgeExample} data-knowledge-example="overview">
              <div className={`${styles.knowledgeCopy} ${styles.stableCopy}`} aria-live="polite" aria-atomic="true">
                <h3>{steps[active].title}</h3>
                <p>{steps[active].description}</p>
                <p className={styles.detail}>외부로 보낼 내용은 먼저 확인해요.</p>
              </div>
              <div className={styles.knowledgeVisual} aria-hidden="true">{children}</div>
            </article>
          </div>
        </div>
        <div className={styles.featureFolderFront} aria-hidden="true">
          <MoaMark size={36} /><span>나의 자료에서 시작하는 생각</span><strong>모아.</strong>
        </div>
      </div>
      <noscript>{steps.map(step => <p key={step.label}>{step.title} {step.description}</p>)}</noscript>
    </div>
  );
}

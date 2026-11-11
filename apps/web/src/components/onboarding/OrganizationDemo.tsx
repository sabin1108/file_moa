"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, MoaMark } from "../ui/Icon";
import styles from "./onboarding-motion.module.css";

const stages = ["before", "review", "after"];

export function OrganizationDemo({ scene }: { scene: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const target = useRef(0);
  const current = useRef(0);
  const moving = useRef(false);
  const [index, setIndex] = useState(0);
  const stage = stages[index];

  const advance = useCallback(() => {
    if (moving.current || target.current === current.current) return;
    moving.current = true;
    current.current += Math.sign(target.current - current.current);
    setIndex(current.current);
  }, []);

  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;

    const markers = [...root.current.querySelectorAll<HTMLElement>("[data-organization-marker]")];
    const observer = new IntersectionObserver(() => {
      const distance = (marker: HTMLElement) => Math.abs(marker.getBoundingClientRect().top - innerHeight * .25);
      const closest = markers.reduce((best, marker) => distance(marker) < distance(best) ? marker : best);
      target.current = stages.indexOf(closest.dataset.organizationMarker ?? "before");
      advance();
    }, { threshold: [0, .25, .5, .75, 1] });

    markers.forEach(marker => observer.observe(marker));

    return () => observer.disconnect();
  }, [advance]);

  useEffect(() => {
    const scene = root.current?.querySelector<HTMLElement>("[data-organization-stage]");
    if (!scene) return;

    let cancelled = false;
    const animations = scene.getAnimations({ subtree: true });
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (cancelled) return;
      moving.current = false;
      advance();
    });

    return () => { cancelled = true; };
  }, [advance, index]);

  return (
    <div ref={root} className={styles.organizationScroll}>
      <div className={styles.organizationScrollSteps} aria-hidden="true">
        {stages.map(name => <div key={name} data-organization-marker={name} />)}
      </div>
      <div className={styles.organizationDemo} data-organization-stage={stage}>
      <div className={styles.organizationBackdrop} aria-hidden="true">
        <div className={styles.backdropPapers}>
          <span><Icon name="file" size={30} /><strong>프로젝트 회의록</strong><small>회의에서 결정한 내용</small></span>
          <span><Icon name="file" size={30} /><strong>리서치 노트</strong><small>다시 찾고 싶은 자료</small></span>
        </div>
        <div className={styles.backdropFolder}>
          <Icon name="folder" size={140} />
          <span>회의 기록</span><span>참고 자료</span><span>나의 생각</span>
        </div>
      </div>
      <div className={styles.organizationPath} aria-hidden="true">
        <div data-plan-node="before"><Icon name="file" size={30} /><span>흩어진 자료</span></div>
        <div data-plan-node="review"><MoaMark size={42} /><span>모아의 정리 계획</span></div>
        <div data-plan-node="after"><Icon name="folder" size={34} /><span>내가 정한 위치로</span></div>
      </div>
      <div className={styles.organizationPreview} aria-hidden="true">{scene}</div>
      </div>
    </div>
  );
}

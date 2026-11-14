"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { actionClasses } from "../../components/ui/action-classes";
import { WORKSPACE_TOUR_EVENT, workspaceTourStore } from "./workspace-tour";
import styles from "./workspace-tour.module.css";

const steps = [
  { selector: '[data-tour="start"], [data-tour="composer"]', title: "먼저 할 일을 선택하세요", text: "일반 대화, 자료 찾기, 정리, 자료로 질문 중 하나를 선택하면 입력창이 열립니다. 작업은 입력창 위에서 바꿀 수 있어요." },
  { selector: '[data-tour="context"]', title: "자료와 저장은 따로 정해요", text: "‘자료 연결’은 읽을 파일의 위치입니다. ‘저장’은 대화와 결과물을 보관하는 기능이에요. 저장을 켜지 않은 대화는 새로고침하면 사라집니다." },
  { selector: '[data-tour="records"]', title: "다시 볼 내용은 기록함에", text: "대화, 결과물, 위키를 모아 볼 수 있어요. 위키는 자료의 출처와 함께 정리한 글입니다." },
  { selector: '[data-tour="settings"]', title: "기억은 내가 승인한 참고 정보예요", text: "자주 설명하는 내용을 기억으로 저장하고 직접 승인할 수 있어요. 대화 설정에서 ‘내 정보 참고’를 켜야 프로필과 승인한 기억을 AI에 함께 보냅니다. 이 안내도 설정에서 다시 볼 수 있어요." },
];

export function WorkspaceTour({ owner, disabled }: { owner: { userId: string; workspaceId: string }; disabled: boolean }) {
  const { userId, workspaceId } = owner;
  const store = useMemo(() => workspaceTourStore({ userId, workspaceId }), [userId, workspaceId]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const disabledRef = useRef(disabled);

  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  useEffect(() => {
    const url = new URL(location.href);
    const requested = url.searchParams.get("guide") === "1";

    if (requested) {
      url.searchParams.delete("guide");
      history.replaceState(history.state, "", url);
    }

    const frame = requestAnimationFrame(() => {
      if (requested || store.read() !== "done") setOpen(true);
    });

    const replay = () => {
      if (disabledRef.current) return;

      setStep(0);
      setOpen(true);
    };

    window.addEventListener(WORKSPACE_TOUR_EVENT, replay);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(WORKSPACE_TOUR_EVENT, replay);
    };
  }, [store]);

  useEffect(() => {
    if (!open || disabled) return;

    const node = dialog.current;

    if (!node) return;

    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node.showModal();
    heading.current?.focus();

    return () => {
      node.close();

      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    };
  }, [open, disabled]);

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const target = [...document.querySelectorAll<HTMLElement>(steps[step].selector)].find(node => node.checkVisibility());

      setRect(target?.getBoundingClientRect() ?? null);
    };

    const frame = requestAnimationFrame(update);
    heading.current?.focus();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step]);

  const close = () => {
    store.write("done");
    setOpen(false);
  };

  return <dialog ref={dialog} className={styles.tour} aria-labelledby="workspace-tour-title" onCancel={event => { event.preventDefault(); close(); }}>
    {rect && <div className={styles.spotlight} aria-hidden="true" style={{ top: rect.top - 4, left: Math.max(4, rect.left - 4), width: rect.width + 8, height: rect.height + 8 }} />}
    <section className={styles.explanation} data-position={rect && rect.top > 240 ? "top" : "bottom"}>
      <p className={styles.progress}>처음 사용하는 모아 · {step + 1} / {steps.length}</p>
      <h2 id="workspace-tour-title" ref={heading} tabIndex={-1}>{steps[step].title}</h2>
      <p>{steps[step].text}</p>
      <div className={styles.actions}>
        <button type="button" className={actionClasses("ghost")} onClick={close}>건너뛰기</button>
        {step > 0 && <button type="button" className={actionClasses("secondary")} onClick={() => setStep(step - 1)}>이전</button>}
        <button type="button" className={actionClasses("primary")} onClick={() => step === steps.length - 1 ? close() : setStep(step + 1)}>{step === steps.length - 1 ? "완료" : "다음"}</button>
      </div>
    </section>
  </dialog>;
}

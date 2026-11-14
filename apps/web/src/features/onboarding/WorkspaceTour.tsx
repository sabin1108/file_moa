"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useNavigationGuard } from "../../components/navigation/NavigationGuard";
import { actionClasses } from "../../components/ui/action-classes";
import { WORKSPACE_TOUR_EVENT } from "./workspace-tour";
import { tourRouteMatches, workspaceTourSteps as steps } from "./workspace-tour-steps";
import { useTourSpotlight } from "./useTourSpotlight";
import ui from "../../styles/workspace-ui.module.css";
import styles from "./workspace-tour.module.css";

export function WorkspaceTour({ claim }: { claim: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const origin = useRef("");
  const firstClaim = useRef<Promise<boolean> | null>(null);
  const automaticStarted = useRef(false);
  const replayRequested = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const guard = useNavigationGuard();
  const current = steps[step];
  const ready = tourRouteMatches(current.route, pathname, params.get("tab"));
  const rect = useTourSpotlight(current.selector, open && !paused && ready);

  useEffect(() => {
    let cancelled = false;
    let waiting: MutationObserver | null = null;
    let beginFrame = 0;
    const url = new URL(location.href);
    const requested = url.searchParams.get("guide") === "1";
    replayRequested.current ||= requested;

    if (requested) {
      url.searchParams.delete("guide");
      history.replaceState(history.state, "", url);
    }

    const begin = () => {
      if ([...document.querySelectorAll("dialog:modal")].some(node => node !== dialog.current)) {
        waiting ??= new MutationObserver(() => {
          cancelAnimationFrame(beginFrame);
          beginFrame = requestAnimationFrame(begin);
        });
        waiting.observe(document.body, { attributes: true, attributeFilter: ["open"], childList: true, subtree: true });
        return;
      }

      waiting?.disconnect();
      waiting = null;

      if (!dialog.current?.open) origin.current = location.pathname + location.search;
      setStep(0);
      setOpen(true);
    };
    const frame = requestAnimationFrame(() => {
      if (replayRequested.current) { replayRequested.current = false; automaticStarted.current = true; begin(); }
    });

    firstClaim.current ??= claim().catch(() => false);
    void firstClaim.current.then(show => {
      if (!cancelled && show && !replayRequested.current && !automaticStarted.current) {
        automaticStarted.current = true;
        begin();
      }
    });
    const replay = () => { automaticStarted.current = true; begin(); };
    window.addEventListener(WORKSPACE_TOUR_EVENT, replay);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(beginFrame);
      waiting?.disconnect();
      window.removeEventListener(WORKSPACE_TOUR_EVENT, replay);
    };
  }, [claim]);

  useEffect(() => {
    if (!open || paused) return;

    const node = dialog.current;

    if (!node) return;

    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node.showModal();
    heading.current?.focus();

    return () => {
      node.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    };
  }, [open, paused]);

  useEffect(() => { if (open) heading.current?.focus({ preventScroll: true }); }, [open, step]);

  const navigate = (destination: string | null, update: () => void) => {
    const changeRoute = destination && destination !== location.pathname + location.search;
    const apply = () => {
      update();
      if (destination && changeRoute) router.replace(destination, { scroll: true });
    };

    if (!changeRoute) { apply(); return; }

    setPaused(true);
    const resume = () => { apply(); setPaused(false); };

    if (!guard.intercept(resume, () => setPaused(false))) resume();
  };
  const close = () => navigate(origin.current || null, () => setOpen(false));
  const move = (next: number) => navigate(steps[next].route, () => setStep(next));
  const last = step === steps.length - 1;

  return <dialog ref={dialog} className={`${ui.system} ${styles.tour}`} aria-labelledby="workspace-tour-title" onCancel={event => { event.preventDefault(); close(); }}>
    {rect && <div className={styles.spotlight} aria-hidden="true" style={rect} />}
    <section className={styles.explanation} data-position={rect && rect.top > 240 ? "top" : "bottom"}>
      <p className={styles.progress}>모아 사용 방법 · {step + 1} / {steps.length}</p>
      <h2 id="workspace-tour-title" ref={heading} tabIndex={-1}>{current.title}</h2>
      <p>{current.text}</p>
      {!ready && <p role="status">화면을 불러오고 있어요.</p>}
      <div className={styles.actions}>
        <button type="button" className={actionClasses("ghost")} onClick={close}>건너뛰기</button>
        {step > 0 && <button type="button" className={actionClasses("secondary")} disabled={!ready} onClick={() => move(step - 1)}>이전</button>}
        <button type="button" className={actionClasses("primary")} disabled={!ready} onClick={() => last ? close() : move(step + 1)}>{last ? "완료" : "다음"}</button>
      </div>
    </section>
  </dialog>;
}

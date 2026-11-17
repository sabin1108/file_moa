"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useNavigationGuard } from "../../components/navigation/NavigationGuard";
import { WORKSPACE_TOUR_EVENT } from "./workspace-tour";
import { tourRouteMatches, workspaceStepsFor } from "./workspace-tour-steps";
import type { WorkspaceMode } from "../../shared/workspace-navigation";
import { WorkspaceTourRecordView } from "./workspace-tour-view";
import { WorkspaceTourOverlay } from "./WorkspaceTourOverlay";
import { SourceFolderSettings } from "../local-folders/connection/SourceFolderSettings";

export function WorkspaceTour({ claim, children, mode = "live" }: { claim: () => Promise<boolean>; children?: ReactNode; mode?: WorkspaceMode }) {
  const steps = workspaceStepsFor(mode);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const origin = useRef("");
  const firstClaim = useRef<Promise<boolean> | null>(null);
  const automaticStarted = useRef(false);
  const replayRequested = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("guide") === "1";
  const guard = useNavigationGuard();
  const current = steps[step];
  const ready = tourRouteMatches(current.route, pathname, params.get("tab"));

  useEffect(() => {
    let cancelled = false;
    let waiting: MutationObserver | null = null;
    let beginFrame = 0;
    const url = new URL(location.href);
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
  }, [claim, requested]);

  const navigate = (destination: string | null, update: () => void) => {
    const changeRoute = destination && destination !== location.pathname + location.search;
    const apply = () => {
      update();
      if (destination && changeRoute) router.replace(destination, { scroll: true });
    };

    if (!changeRoute) { apply(); return; }

    const resume = () => { apply(); setPaused(false); };

    if (guard.intercept(resume, () => setPaused(false))) setPaused(true);
    else apply();
  };
  const close = () => navigate(origin.current || null, () => setOpen(false));
  const move = (next: number) => navigate(steps[next].route, () => setStep(next));

  return <WorkspaceTourRecordView.Provider value={open && !paused && ready ? current.recordKind ?? null : null}>
    {children}
    {open && !paused && <WorkspaceTourOverlay dialog={dialog} current={current} step={step} total={steps.length} ready={ready} onClose={close} onMove={move}
      contextNote={mode === "sample" ? "데모는 준비된 예시 폴더를 사용합니다. 개인 폴더 연결과 영구 저장 대신 이 탭의 자료로 사용 흐름을 확인해요." : undefined}>
      {mode === "live" && current.setup && <SourceFolderSettings preparationOnly onConnected={() => move(step + 1)} />}
    </WorkspaceTourOverlay>}
  </WorkspaceTourRecordView.Provider>;
}

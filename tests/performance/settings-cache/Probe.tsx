"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const storageKey = "moa-settings-measurement";
type BrowserSample = { kind: "browser"; variant: string; run: string; step: number; phase: "home" | "settings"; elapsedMs: number; viewport: number };
type Run = { id: string; step: number; startedAt: number; variant: string; rounds: number; nonce: string; samples: BrowserSample[] };

async function emit(value: object, nonce: string) {
  const response = await fetch("http://127.0.0.1:3037/metric", {
    method: "POST", credentials: "omit", body: JSON.stringify({ ...value, nonce }), keepalive: true,
  });
  if (!response.ok) throw new Error("measurement-collector-unavailable");
}

export function StartMeasurement({ variant }: { variant: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  return <main style={{ padding: 40, color: "#203444", maxWidth: 800 }}>
    <h1>설정 속도 측정 · {variant === "before" ? "캐시 도입 전 조회 방식" : "현재 캐시 방식"}</h1>
    <p>현재 로그인한 계정으로 작업 공간과 계정 설정을 10회 오갑니다. 이 창을 앞에 두고 완료할 때까지 기다려 주세요.</p>
    <p>계정 설정·원본 파일은 변경하지 않습니다. AI 키가 없는 독립 복사본이므로 AI API를 호출하지 않습니다.</p>
    <button disabled={running} onClick={async () => {
      setRunning(true);
      const run: Run = { id: crypto.randomUUID(), step: 0, startedAt: 0, variant, rounds: 10, nonce: new URL(location.href).searchParams.get("token") ?? "", samples: [] };
      try {
        await emit({ kind: "start", variant, run: run.id, rounds: run.rounds }, run.nonce);
        run.startedAt = performance.timeOrigin + performance.now();
        sessionStorage.setItem(storageKey, JSON.stringify(run));
        router.push(`/?__settings_measure=${run.id}&step=0`);
      } catch {
        setRunning(false);
        alert("측정 서버를 준비하지 못했습니다. 결과 화면으로 돌아가 주세요.");
      }
    }}>측정 시작</button>
    <p><a href="http://127.0.0.1:3037">측정 결과 화면</a></p>
  </main>;
}

export function SettingsMeasurementProbe({ variant, phase, run, step }: {
  variant: string; phase: "home" | "settings"; run: string; step: number;
}) {
  const router = useRouter();
  const recorded = useRef("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const key = `${run}:${step}`;
    if (!run || recorded.current === key) return;
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    const state: Run = JSON.parse(saved);
    if (state.id !== run || state.variant !== variant || state.step !== step) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const beganWaiting = performance.now();
    const abort = (reason: string) => {
      recorded.current = key;
      void emit({ kind: "aborted", variant, run, reason }, state.nonce).catch(() => undefined);
      sessionStorage.removeItem(storageKey);
      setStatus("측정을 중단했습니다. 결과 화면에서 원인을 확인해 주세요.");
    };
    const inspect = () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") { abort("background-tab"); return; }
      const current = new URL(location.href);
      if (current.pathname !== (phase === "settings" ? "/settings" : "/") || current.searchParams.get("__settings_measure") !== run || Number(current.searchParams.get("step")) !== step) { abort("route-mismatch"); return; }
      const selector = phase === "settings" ? '[aria-label="계정과 로그인"]' : "[data-conversation-title]";
      const target = document.querySelector<HTMLElement>(selector);
      if (!target || !target.getClientRects().length || getComputedStyle(target).visibility === "hidden" || target.closest("[inert]")) {
        if (performance.now() - beganWaiting > 30_000) { abort("screen-not-ready"); return; }
        timer = setTimeout(inspect, 20);
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (stopped) return;
        if (document.visibilityState !== "visible") { abort("background-tab"); return; }
        recorded.current = key;
        const now = performance.timeOrigin + performance.now();
        const samples: BrowserSample[] = [...state.samples, { kind: "browser", variant, run, step, phase, elapsedMs: now - state.startedAt, viewport: innerWidth }];
        setStatus(`${variant} · ${Math.floor(step / 2) + 1}/${state.rounds} · ${phase === "settings" ? "설정 확인" : "작업 공간 확인"}`);
        if (step + 1 >= state.rounds * 2) {
          void emit({ kind: "batch", variant, run, samples }, state.nonce).catch(() => setStatus("결과 저장에 실패했습니다. 결과 화면에서 확인해 주세요."));
          sessionStorage.removeItem(storageKey);
          setStatus("측정 완료 · 결과 화면으로 돌아가 주세요.");
          return;
        }
        timer = setTimeout(() => {
          const next = step + 1;
          const updated = { ...state, samples, step: next, startedAt: performance.timeOrigin + performance.now() };
          sessionStorage.setItem(storageKey, JSON.stringify(updated));
          const pathname = next % 2 ? "/settings" : "/";
          router.push(`${pathname}?__settings_measure=${run}&step=${next}`);
        }, 250);
      }));
    };
    inspect();
    return () => { stopped = true; clearTimeout(timer); };
  }, [phase, router, run, step, variant]);

  if (!run) return null;
  return <div role="status" style={{ position: "fixed", right: 16, top: 12, zIndex: 100000, padding: "12px 16px", background: "#fff", border: "1px solid #789", color: "#203444" }}>
    {status || `${variant} · 측정 중`} · <a href="http://127.0.0.1:3037">결과</a>
  </div>;
}

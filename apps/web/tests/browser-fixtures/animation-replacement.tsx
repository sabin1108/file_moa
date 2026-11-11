import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthShell } from "../../src/components/layout/AuthShell";
import { AuthScreen } from "../../src/features/auth/components/AuthScreen";
import { PageLoading } from "../../src/components/ui/feedback/PageLoading";
import { LoadingOverlay } from "../../src/components/ui/feedback/LoadingOverlay";
import { StatusNotice } from "../../src/components/ui/feedback/StatusNotice";
import { PaperStepper } from "../../src/components/ui/PaperStepper";
import type { AuthFormAction, CheckAuthSessionAction } from "../../src/shared/auth-contract";
import { SessionBoundary } from "../../src/features/auth/components/SessionBoundary";
import { GuestSessionObserver } from "../../src/features/auth/components/GuestSessionObserver";
import { announceAuthSessionChange } from "../../src/shared/auth-session-events";
import { signupSteps } from "../../src/features/auth/lib/form-config";
import "../../src/styles/globals.css";

declare global {
  interface Window {
    animationProbe: {
      calls: number;
      finish: (() => void) | null;
      sessionChecks: number
    }
  }
}

const probe = window.animationProbe = { calls: 0, finish: null as (() => void) | null, sessionChecks: 0 };
const expiresAt = new Date(Date.now() + 120_000).toISOString();
const checkOwner: CheckAuthSessionAction = async () => {
  probe.sessionChecks++;

  return {
    available: true,
    session: {
      user: { id: 'fixture-owner', emailVerified: true },
      session: { userId: 'fixture-owner', expiresAt }
    }
  };
};
const checkGuest: CheckAuthSessionAction = async () => {
  probe.sessionChecks++;

  return { available: true, session: null };
};
const action: AuthFormAction = async () => {
  probe.calls++;
  await new Promise<void>(resolve => {
    probe.finish = resolve;
  });

  return { status: "error", message: "합성 요청 종료 · 실제 인증 요청 없음" };
};

function Fixture() {
  const [mode, setMode] = useState("signup");
  const [current, setCurrent] = useState("email");
  const [visible, setVisible] = useState(true);
  const [overlay, setOverlay] = useState(false);

  return <>
    <nav aria-label="합성 검증 조작" style={{ padding: 12 }}>
      {["signup", "login", "motion", "loading", "compact", "boundary", "guest"].map(value => <button key={value} data-mode={value} onClick={() => setMode(value)}>
        {value}
      </button>)}
      <button data-session-change onClick={() => announceAuthSessionChange()}>인증 변경 검증</button>
      <button data-mount onClick={() => setVisible(value => !value)}>표시 전환</button>
      <button data-overlay onClick={() => setOverlay(value => !value)}>이동 대기 전환</button>
      {signupSteps.map(step => <button key={step.id} data-step={step.id} onClick={() => setCurrent(step.id)}>
        {step.label}
      </button>)}
    </nav>
    {visible
      && (mode === "boundary"
        ? <SessionBoundary
          userId="fixture-owner"
          initialExpiresAt={expiresAt}
          checkSessionAction={checkOwner}
        >
          <p data-owner-visible>합성 인증 영역</p>
        </SessionBoundary>
        : mode === "guest"
          ? <>
            <GuestSessionObserver checkSessionAction={checkGuest} />
            <p data-guest-visible>합성 게스트 영역</p>
          </>
          : mode === "loading"
            ? <PageLoading message="합성 화면 준비 중" />
            : mode === "compact"
              ? <div className="reading-surface" style={{ padding: 24 }}>
                <PageLoading compact message="합성 요청을 처리하고 있어요." />
                <StatusNotice state="pending" title="자료를 확인하고 있어요." />
              </div>
              : mode === "motion"
                ? <AuthShell guest>
                  <section style={{ padding: 32 }}>
                    <h1>단계 모션 검증</h1>
                    <PaperStepper steps={signupSteps} current={current} label="회원가입 진행 단계" />
                  </section>
                </AuthShell>
                : <AuthShell guest>
                  <AuthScreen key={mode} operation={mode === "login" ? "login" : "signup"} action={action} />
                </AuthShell>)}
    {overlay && <LoadingOverlay message="합성 경로 이동 중" />}
  </>;
}

createRoot(document.getElementById("fixture")!).render(<Fixture />);

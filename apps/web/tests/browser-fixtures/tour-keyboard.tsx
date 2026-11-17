import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceTourOverlay } from "../../src/features/onboarding/WorkspaceTourOverlay";
import "../../src/styles/globals.css";

function Fixture() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(true);
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  return <main><nav aria-label="주 메뉴">폴더 · 채팅</nav>
    <p data-fixture-step>{open ? step + 1 : "완료"}</p>
    {!open && <button type="button" onClick={() => { setStep(0); setOpen(true); }}>다시 보기</button>}
    {open && <WorkspaceTourOverlay dialog={dialog} current={{ route: null, selector: 'nav[aria-label="주 메뉴"]', title: `안내 ${step + 1}`, text: "Enter로 다음 안내를 확인합니다." }}
      step={step} total={3} ready={ready} onMove={setStep} onClose={() => setOpen(false)}>
      <form onSubmit={event => { event.preventDefault(); setSubmitted(count => count + 1); }}>
        <label>폴더 이름<input aria-label="폴더 이름" value={value} onChange={event => setValue(event.target.value)} /></label>
        <label>설명<textarea aria-label="설명" /></label>
        <button type="submit">입력 확인</button><output>{submitted}</output>
      </form>
      <label><input type="checkbox" checked={ready} onChange={event => setReady(event.target.checked)} />화면 준비됨</label>
    </WorkspaceTourOverlay>}
  </main>;
}
createRoot(document.getElementById("fixture")!).render(<Fixture />);

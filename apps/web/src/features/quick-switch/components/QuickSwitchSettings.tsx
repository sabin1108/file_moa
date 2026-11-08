"use client";
import { useState, useSyncExternalStore } from "react";
import { parseQuickPreferences, shortcutFromEvent, type QuickPreferences } from "../lib/quick-switch";
import { readQuickPreferences, saveQuickPreferences, serverQuickPreferences, subscribeQuickPreferences } from "../store/quick-preferences";
import { SettingRow } from "../../../components/ui/SettingRow";
import { QuickSwitchButton } from "../../../components/ui/QuickSwitchButton";

export function QuickSwitchSettings() {
  const value = useSyncExternalStore(subscribeQuickPreferences, readQuickPreferences, serverQuickPreferences);
  const preferences = parseQuickPreferences(value);
  const [unsaved, setUnsaved] = useState(false);
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState("");
  const update = (change: Partial<QuickPreferences>) => setUnsaved(!saveQuickPreferences({ ...preferences, ...change }));
  return <section aria-label="빠른 전환 설정"><h3>퀵메뉴</h3>
    <SettingRow title="메뉴 호출 방식" description="빈 작업 영역에서 왼쪽 버튼을 0.5초 누르거나 단축키로 엽니다.">
      <select aria-label="빠른 전환 호출 방식" value={preferences.trigger} onChange={event => update({ trigger: event.target.value as QuickPreferences["trigger"] })}>
        <option value="both">길게 누르기와 단축키</option><option value="hold">길게 누르기만</option><option value="keyboard">단축키만</option><option value="off">자동 호출 끄기</option>
      </select>
    </SettingRow>
    <SettingRow title="단축키" description="입력란을 누르고 사용할 키를 입력하세요. 브라우저·운영체제가 먼저 사용하는 조합은 받지 못할 수 있어요.">
      <input aria-label="빠른 전환 단축키" readOnly value={recording ? "키를 눌러 주세요…" : preferences.shortcut}
        disabled={preferences.trigger === "hold" || preferences.trigger === "off"}
        onFocus={() => { setRecording(true); setHint(""); }} onBlur={() => setRecording(false)}
        onKeyDown={event => {
          if (event.key === "Tab") return;
          event.preventDefault();
          if (event.key === "Escape") { setRecording(false); event.currentTarget.blur(); return; }
          const shortcut = shortcutFromEvent(event.nativeEvent);
          if (!shortcut) { setHint("문자·숫자·기능키·CapsLock과 조합키를 입력해 주세요."); return; }
          update({ shortcut }); setRecording(false); setHint(`${shortcut} 저장됨`); event.currentTarget.blur();
        }} />
    </SettingRow>
    {hint && <p role="status">{hint}</p>}
    <QuickSwitchButton />
    {unsaved && <p role="status">설정을 이 탭에 적용했지만 저장하지 못했어요. 브라우저를 닫으면 기본값으로 돌아갈 수 있어요.</p>}
  </section>;
}

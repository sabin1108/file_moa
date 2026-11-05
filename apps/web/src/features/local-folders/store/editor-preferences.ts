const key = "moa-editor-autosave-seconds-v1";
const changed = "moa-editor-preferences-changed";
export const editorIntervals = [0, 15, 30, 60, 120] as const;
export function getAutosaveSeconds() {
  try {
    const value = window.localStorage.getItem(key);
    const seconds = value === null ? 30 : Number(value);
    return editorIntervals.some(item => item === seconds) ? seconds : 30;
  } catch { return 30; }
}
export const serverAutosaveSeconds = () => 30;
export function subscribeEditorPreferences(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changed, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(changed, listener); };
}
export function setAutosaveSeconds(seconds: number) {
  if (!editorIntervals.some(item => item === seconds)) return;
  window.localStorage.setItem(key, String(seconds));
  window.dispatchEvent(new Event(changed));
}

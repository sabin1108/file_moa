import { defaultQuickPreferences, parseQuickPreferences, type QuickPreferences } from "../lib/quick-switch";
const key = "moa-quick-switch-v1";
const event = "moa-quick-preferences-changed";
const initial = JSON.stringify(defaultQuickPreferences);
let temporary: string | null = null;
export const serverQuickPreferences = () => initial;
export function readQuickPreferences() {
  if (temporary !== null) return temporary;
  try { return JSON.stringify(parseQuickPreferences(localStorage.getItem(key))); } catch { return initial; }
}
export function subscribeQuickPreferences(listener: () => void) {
  window.addEventListener("storage", listener); window.addEventListener(event, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(event, listener); };
}
export function saveQuickPreferences(preferences: QuickPreferences) {
  const value = JSON.stringify(parseQuickPreferences(JSON.stringify(preferences)));
  let saved = true;
  try { localStorage.setItem(key, value); temporary = null; } catch { temporary = value; saved = false; }
  window.dispatchEvent(new Event(event));
  return saved;
}

import { defaultQuickPreferences, parseQuickPreferences, type QuickPreferences } from "../lib/quick-switch";
import { createBrowserStringStore } from "../../../shared/browser-string-store";
const storage = createBrowserStringStore("moa-quick-switch-v1", () => localStorage);
const initial = JSON.stringify(defaultQuickPreferences);
export const serverQuickPreferences = () => initial;
export function readQuickPreferences() {
  return JSON.stringify(parseQuickPreferences(storage.read()));
}
export const subscribeQuickPreferences = storage.subscribe;
export function saveQuickPreferences(preferences: QuickPreferences) {
  const value = JSON.stringify(parseQuickPreferences(JSON.stringify(preferences)));
  return storage.write(value);
}

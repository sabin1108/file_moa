import { createBrowserStringStore } from "../../../shared/browser-string-store";

const storage = createBrowserStringStore("moa-editor-autosave-seconds-v1", () => localStorage);
export const editorIntervals = [0, 15, 30, 60, 120] as const;

export function getAutosaveSeconds() {
  try {
    const value = storage.read();
    const seconds = value === "" ? 30 : Number(value);

    return editorIntervals.some(item => item === seconds) ? seconds : 30;
  } catch {
    return 30;
  }
}

export const serverAutosaveSeconds = () => 30;
export const subscribeEditorPreferences = storage.subscribe;

export function setAutosaveSeconds(seconds: number) {
  if (!editorIntervals.some(item => item === seconds)) return false;

  return storage.write(String(seconds));
}

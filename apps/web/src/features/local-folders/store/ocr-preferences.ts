import { createBrowserStringStore } from "../../../shared/browser-string-store";

const storage = createBrowserStringStore("moa-local-ocr-v1", () => localStorage);
export const readOcrEnabled = () => storage.read() === "true";
export const serverOcrEnabled = () => false;
export const subscribeOcr = storage.subscribe;
export const saveOcrEnabled = (enabled: boolean) => storage.write(String(enabled));

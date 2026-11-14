import { createBrowserStringStore } from "../../../shared/browser-string-store";

export const authDraftStore = createBrowserStringStore("moa-auth-input", () => sessionStorage);

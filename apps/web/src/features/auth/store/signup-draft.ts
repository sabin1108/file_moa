import { createBrowserStringStore } from "../../../shared/browser-string-store";
import { serializeSignupDraft, type SignupDraft } from "../lib/signup-flow";

export const signupDraftStore = createBrowserStringStore("moa-signup-draft-v1", () => localStorage);
export const clearSignupDraft = () => {
  signupDraftStore.write(null);
};
export const persistSignupDraft = (draft: SignupDraft) => signupDraftStore.write(serializeSignupDraft(draft));

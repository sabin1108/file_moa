import { createBrowserStringStore } from "../../shared/browser-string-store";

export const WORKSPACE_TOUR_EVENT = "moa:workspace-tour";

export function workspaceTourStore(owner: { userId: string; workspaceId: string }) {
  return createBrowserStringStore(`moa:tour:v1:${JSON.stringify([owner.userId, owner.workspaceId])}`, () => localStorage);
}

export function replayWorkspaceTour() {
  window.dispatchEvent(new Event(WORKSPACE_TOUR_EVENT));
}

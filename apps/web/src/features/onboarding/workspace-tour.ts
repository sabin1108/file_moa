export const WORKSPACE_TOUR_EVENT = "moa:workspace-tour";

export function replayWorkspaceTour() {
  window.dispatchEvent(new Event(WORKSPACE_TOUR_EVENT));
}

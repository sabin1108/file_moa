import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useConversationRequests } from "../../src/features/conversation-workspace/hooks/useConversationRequests";

describe("RQ-003: application state at the UI routing boundary", () => {
  it.each(["already-running", "started-after-render"])("blocks requests when file application is %s", scenario => {
    let managedState = { phase: scenario === "already-running" ? "running" : "idle" };
    const actions = { cancel: vi.fn(), update: vi.fn(), prepare: vi.fn(), start: vi.fn(), reset: vi.fn(), close: vi.fn() };
    // Only the public dependencies used by this hook are replaced; no file engine is executed.
    const connection = {
      state: { view: { status: "connected" } },
      organization: { cancel: actions.cancel, update: actions.update, prepare: actions.prepare },
      finding: { start: actions.start, reset: actions.reset },
      preview: { close: actions.close },
      organizationExecution: { managed: { subscribe: () => () => {}, getSnapshot: () => managedState, getServerSnapshot: () => managedState } },
    } as unknown as Parameters<typeof useConversationRequests>[0];
    let routing!: ReturnType<typeof useConversationRequests>;
    function Probe() {
      routing = useConversationRequests(connection, "회의 자료 찾아줘");
      return <button disabled={!routing.canStart}>요청</button>;
    }

    const html = renderToStaticMarkup(<Probe />);
    expect(html.includes("disabled")).toBe(scenario === "already-running");
    managedState = { phase: "running" };
    routing.submitRequest("회의 자료 찾아줘");
    routing.returnToOrganization();
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });
});

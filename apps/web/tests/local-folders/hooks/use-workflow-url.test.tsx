import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock(
  "next/navigation",
  () => ({ usePathname: () => "/files", useSearchParams: () => new URLSearchParams(window.location.search) })
);

import { useWorkflowUrl } from "../../../src/features/local-folders/hooks/use-workflow-url";

afterEach(() => vi.unstubAllGlobals());

it("synchronizes local steps in order without navigation and preserves history and unrelated query", () => {
  const location = { pathname: "/files", search: "?keep=value" };
  const state = { moaFileVisit: "kept", __NA: true };
  const replaceState = vi.fn((_state: unknown, _unused: string, url: string) => {
    location.search = new URL(url, "http://localhost").search;
  });

  vi.stubGlobal("window", { location, history: { state, replaceState } });

  let workflow!: ReturnType<typeof useWorkflowUrl>;

  function Probe() {
    workflow = useWorkflowUrl("managed");

    return null;
  }

  renderToString(<Probe />);

  for (const step of ["preserve", "execute", "result"]) workflow.update(step, "draft-id");

  expect(replaceState.mock.calls.map(call => new URL(call[2], "http://localhost").searchParams.get("step"))).toEqual(["preserve", "execute", "result"]);
  expect(replaceState.mock.calls.every(call => JSON.stringify(call[0]) === JSON.stringify({ moaFileVisit: "kept" }))).toBe(true);
  expect(location.search).toContain("keep=value");
  workflow.update("result", "draft-id");
  expect(replaceState).toHaveBeenCalledTimes(3);
  workflow.update("destination", undefined, true);
  expect(location.search).toBe("?keep=value");
});

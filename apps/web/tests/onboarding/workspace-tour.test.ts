import { afterEach, expect, it, vi } from "vitest";
import { workspaceTourStore } from "../../src/features/onboarding/workspace-tour";

afterEach(() => vi.unstubAllGlobals());

it("keeps first-visit completion separate for each account and workspace", () => {
  const values = new Map<string, string>();

  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });

  const first = workspaceTourStore({ userId: "one", workspaceId: "a" });

  expect(first.read()).toBe("");
  expect(first.write("done")).toBe(true);
  expect(workspaceTourStore({ userId: "one", workspaceId: "a" }).read()).toBe("done");
  expect(workspaceTourStore({ userId: "two", workspaceId: "a" }).read()).toBe("");
  expect(workspaceTourStore({ userId: "one", workspaceId: "b" }).read()).toBe("");
});

it("can finish the guide in this tab when persistent storage is unavailable", () => {
  vi.stubGlobal("localStorage", { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } });

  const store = workspaceTourStore({ userId: "one", workspaceId: "a" });

  expect(store.read()).toBe("");
  expect(store.write("done")).toBe(false);
  expect(store.read()).toBe("done");
});

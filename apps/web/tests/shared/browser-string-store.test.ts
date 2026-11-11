import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBrowserStringStore } from "../../src/shared/browser-string-store";

function storage() {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => values.clear())
  };
}

beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("notifies the same tab once and keeps exact strings without taking over parsing", () => {
  const local = storage();
  const store = createBrowserStringStore("draft", () => local);
  const listener = vi.fn();
  const stop = store.subscribe(listener);

  expect(store.write("not JSON")).toBe(true);
  expect(store.read()).toBe("not JSON");
  expect(listener).toHaveBeenCalledOnce();
  stop();
  store.write(null);
  expect(store.read()).toBe("");
  expect(listener).toHaveBeenCalledOnce();
});

it("preserves updates and clear in this tab when browser storage is blocked", () => {
  const store = createBrowserStringStore("draft", () => {
    throw new Error("blocked storage");
  });
  const listener = vi.fn();
  const stop = store.subscribe(listener);

  expect(store.write("in-memory draft")).toBe(false);
  expect(store.read()).toBe("in-memory draft");
  expect(store.write(null)).toBe(false);
  expect(store.read()).toBe("");
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
});

it("filters another key and storage area, accepts external clear and unsubscribes", () => {
  const local = storage();
  const other = storage();
  const store = createBrowserStringStore("draft", () => local);
  const listener = vi.fn();
  const stop = store.subscribe(listener);
  const external = (key: string | null, storageArea: Storage) => window.dispatchEvent(Object.assign(new Event("storage"), { key, storageArea }));

  external("unrelated", local);
  external("draft", other);
  expect(listener).not.toHaveBeenCalled();
  local.setItem("draft", "other tab");
  external("draft", local);
  expect(store.read()).toBe("other tab");
  external(null, local);
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
  external("draft", local);
  expect(listener).toHaveBeenCalledTimes(2);
});

it("reads without window or usable storage during server rendering", () => {
  vi.stubGlobal("window", undefined);

  const store = createBrowserStringStore("draft", () => {
    throw new Error("not a browser");
  });

  expect(store.read()).toBe("");
});

it("keeps a failed deletion marker even when another tab publishes the same key", () => {
  const local = storage();

  local.setItem("draft", "old email");
  local.removeItem.mockImplementation(() => {
    throw new Error("delete blocked");
  });

  const store = createBrowserStringStore("draft", () => local);
  const stop = store.subscribe(vi.fn());

  expect(store.write(null)).toBe(false);
  window.dispatchEvent(Object.assign(new Event("storage"), { key: "draft", storageArea: local }));
  expect(store.read()).toBe("");
  expect(local.getItem("draft")).toBe("old email");
  stop();
});

it("keeps local and session storage separate even when their keys match", () => {
  const local = storage();
  const session = storage();
  const first = createBrowserStringStore("same", () => local);
  const second = createBrowserStringStore("same", () => session);
  const firstListener = vi.fn();
  const secondListener = vi.fn();
  const stopFirst = first.subscribe(firstListener);
  const stopSecond = second.subscribe(secondListener);

  first.write("local value");
  expect(second.read()).toBe("");
  expect(secondListener).not.toHaveBeenCalled();
  session.setItem("same", "session value");
  window.dispatchEvent(Object.assign(new Event("storage"), { key: "same", storageArea: session }));
  expect(first.read()).toBe("local value");
  expect(second.read()).toBe("session value");
  expect(firstListener).toHaveBeenCalledOnce();
  expect(secondListener).toHaveBeenCalledOnce();
  stopFirst();
  stopSecond();
});

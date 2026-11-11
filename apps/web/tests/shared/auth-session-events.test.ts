import { afterEach, beforeEach, expect, it, vi } from "vitest";

const order: string[] = [];

beforeEach(() => {
  vi.resetModules();
  order.length = 0;
  vi.stubGlobal("localStorage", {
    setItem: () => {
      order.push("storage");
    }
  });
  vi.stubGlobal("BroadcastChannel", class {
    postMessage() {
      order.push("channel");
    }
    close() {
      order.push("close");
    }
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("notifies this tab synchronously before broadcasting to other tabs", async () => {
  const events = await import("../../src/shared/auth-session-events");
  const stop = events.subscribeAuthSessionChange(() => {
    order.push("same tab");
  });

  events.announceAuthSessionChange();
  expect(order).toEqual(["same tab", "storage", "channel", "close"]);
  stop();
});

it("does not reenter this tab when includeCurrent is false", async () => {
  const events = await import("../../src/shared/auth-session-events");
  const listener = vi.fn();
  const stop = events.subscribeAuthSessionChange(listener);

  events.announceAuthSessionChange(false, "fixture-owner");
  expect(listener).not.toHaveBeenCalled();
  expect(order).toEqual(["storage", "channel", "close"]);
  stop();
});

it("revokes all current owners synchronously and releases subscriptions", async () => {
  const events = await import("../../src/shared/auth-session-events");
  const first = vi.fn();
  const second = vi.fn();
  const stop = events.subscribeAuthScopeRevoked(first);
  const stopSecond = events.subscribeAuthScopeRevoked(second);

  events.revokeAuthScope();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  stop();
  stopSecond();
  events.revokeAuthScope();
  expect(first).toHaveBeenCalledOnce();
});

it("a blocked cross-tab channel cannot interrupt local authentication invalidation", async () => {
  vi.stubGlobal("BroadcastChannel", class {
    constructor() {
      throw new Error("blocked channel");
    }
  });

  const events = await import("../../src/shared/auth-session-events");
  const listener = vi.fn();
  const stop = events.subscribeAuthSessionChange(listener);

  expect(() => events.announceAuthSessionChange()).not.toThrow();
  expect(listener).toHaveBeenCalledOnce();
  stop();
});

import { expect, it, vi } from "vitest";
import { createSignal } from "../../src/shared/signal";

it("publishes synchronously and releases each subscription independently", () => {
  const signal = createSignal<number>();
  const listener = vi.fn();
  const first = signal.subscribe(listener);
  const second = signal.subscribe(listener);
  signal.emit(1);
  expect(listener.mock.calls).toEqual([[1], [1]]);
  first(); first();
  signal.emit(2);
  expect(listener.mock.calls).toEqual([[1], [1], [2]]);
  second();
  signal.emit(3);
  expect(listener).toHaveBeenCalledTimes(3);
});

it("skips removed subscriptions and waits until next emission for newly added ones", () => {
  const signal = createSignal<void>();
  const later = vi.fn();
  const replaced = vi.fn();
  let remove = () => {};
  signal.subscribe(() => { remove(); signal.subscribe(later); });
  remove = signal.subscribe(replaced);
  signal.emit();
  expect(replaced).not.toHaveBeenCalled();
  expect(later).not.toHaveBeenCalled();
  signal.emit();
  expect(later).toHaveBeenCalledOnce();
});

it("does not let one failed listener block synchronous security cleanup", () => {
  const queued: VoidFunction[] = [];
  const queue = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => { queued.push(callback); });
  try {
    const signal = createSignal<void>();
    const failure = new Error("fixture listener failure");
    const cleanup = vi.fn();
    signal.subscribe(() => { throw failure; });
    signal.subscribe(cleanup);
    expect(() => signal.emit()).not.toThrow();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toThrow(AggregateError);
  } finally { queue.mockRestore(); }
});

import { afterEach, expect, it, vi } from "vitest";
import { waitForPendingFeedback } from "../../src/features/local-folders/pending-feedback";

afterEach(() => vi.useRealTimers());

it("waits only the remainder and cancels the timer immediately", async () => {
  vi.useFakeTimers();

  const abort = new AbortController();
  const start = Date.now();

  await vi.advanceTimersByTimeAsync(100);

  const finished = vi.fn();
  const pending = waitForPendingFeedback(start, abort.signal).then(finished);

  await vi.advanceTimersByTimeAsync(259);
  expect(finished).not.toHaveBeenCalled();
  abort.abort();
  await pending;
  expect(finished).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("adds no waiting to an already slow read or aborted request", async () => {
  vi.useFakeTimers();

  const abort = new AbortController();
  const start = Date.now();

  await vi.advanceTimersByTimeAsync(500);
  await waitForPendingFeedback(start, abort.signal);
  abort.abort();
  await waitForPendingFeedback(Date.now(), abort.signal);
  expect(vi.getTimerCount()).toBe(0);
});

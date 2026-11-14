/** 빠른 읽기 결과가 한 프레임만 깜빡이지 않도록 UI 완료 공개 시점만 조절한다. */
export const MIN_PENDING_FEEDBACK_MS = 360;

export function waitForPendingFeedback(startedAt: number, signal: AbortSignal): Promise<void> {
  const remaining = MIN_PENDING_FEEDBACK_MS - (Date.now() - startedAt);

  if (signal.aborted || remaining <= 0) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };

    const timer = setTimeout(finish, remaining);

    signal.addEventListener("abort", finish, { once: true });
  });
}

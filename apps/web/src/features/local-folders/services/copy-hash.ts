/** Owns one Worker per inspection, with at most one pending file. Abort releases the Worker immediately. */
export function createCopyHasher(signal?: AbortSignal) {
  let worker: Worker | null = null;
  let pendingReject: ((error: Error) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const dispose = () => {
    disposed = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    worker?.terminate();
    worker = null;
    const reject = pendingReject;
    pendingReject = null;
    reject?.(new DOMException("Copy inspection cancelled", "AbortError"));
  };
  const abort = () => dispose();
  signal?.addEventListener("abort", abort, { once: true });
  const hash = (file: File): Promise<string> => {
    if (signal?.aborted || disposed) return Promise.reject(new DOMException("Copy inspection cancelled", "AbortError"));
    if (pendingReject) return Promise.reject(new Error("hash-already-pending"));
    return new Promise((resolve, reject) => {
      pendingReject = reject;
      const settle = (error?: Error, value?: string) => {
        clearTimeout(timer);
        pendingReject = null;
        if (error) { dispose(); reject(error); }
        else resolve(value!);
      };
      try {
        worker ??= new Worker(new URL("./copy-hash.worker.ts", import.meta.url));
        worker.onmessage = (event: MessageEvent<unknown>) => {
          const data = event.data;
          if (typeof data !== "object" || data === null || !("sha256" in data) || typeof data.sha256 !== "string"
            || !/^[a-f0-9]{64}$/u.test(data.sha256) || !("size" in data) || data.size !== file.size) {
            settle(new Error("hash-read-failed"));
          } else settle(undefined, data.sha256);
        };
        worker.onerror = () => settle(new Error("unsupported-hash"));
        worker.onmessageerror = () => settle(new Error("hash-read-failed"));
        timer = setTimeout(() => settle(new Error("hash-read-failed")), 30_000);
        worker.postMessage(file);
      } catch { settle(new Error("unsupported-hash")); }
    });
  };
  return { hash, dispose };
}

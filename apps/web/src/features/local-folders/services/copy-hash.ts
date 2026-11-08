import {
  isFindEvidence,
  type FindEvidence,
  type FindQuery,
} from "../lib/document-find";
export type TextFileSnapshot = Readonly<{
  sha256: string;
  size: number;
  excerpt: string;
  excerptHash: string;
  finding?: FindEvidence | null;
}>;

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
  const request = (
    file: File,
    instruction?: string,
    find?: FindQuery,
  ): Promise<TextFileSnapshot | { sha256: string; size: number }> => {
    if (signal?.aborted || disposed)
      return Promise.reject(
        new DOMException("Copy inspection cancelled", "AbortError"),
      );
    if (pendingReject) return Promise.reject(new Error("hash-already-pending"));
    return new Promise((resolve, reject) => {
      pendingReject = reject;
      const settle = (
        error?: Error,
        value?: TextFileSnapshot | { sha256: string; size: number },
        fatal = true,
      ) => {
        clearTimeout(timer);
        pendingReject = null;
        if (error) {
          if (fatal) dispose();
          reject(error);
        } else resolve(value!);
      };
      try {
        worker ??= new Worker(
          new URL("./copy-hash.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (event: MessageEvent<unknown>) => {
          const data = event.data;
          if (
            typeof data !== "object" ||
            data === null ||
            !("sha256" in data) ||
            typeof data.sha256 !== "string" ||
            !/^[a-f0-9]{64}$/u.test(data.sha256) ||
            !("size" in data) ||
            data.size !== file.size
          ) {
            settle(new Error("hash-read-failed"));
          } else if (instruction === undefined) {
            settle(undefined, { sha256: data.sha256, size: file.size });
          } else if ("issue" in data && data.issue === "invalid-utf8") {
            settle(new Error("invalid-utf8"), undefined, false);
          } else if (
            "excerpt" in data &&
            typeof data.excerpt === "string" &&
            data.excerpt.length <= 1200 &&
            "excerptHash" in data &&
            typeof data.excerptHash === "string" &&
            /^[a-f0-9]{64}$/u.test(data.excerptHash)
          ) {
            if (
              find &&
              (!("finding" in data) || !isFindEvidence(data.finding))
            ) {
              settle(new Error("hash-read-failed"));
              return;
            }
            settle(undefined, {
              sha256: data.sha256,
              size: file.size,
              excerpt: data.excerpt,
              excerptHash: data.excerptHash,
              ...(find && "finding" in data
                ? { finding: data.finding as FindEvidence | null }
                : {}),
            });
          } else settle(new Error("hash-read-failed"));
        };
        worker.onerror = () => settle(new Error("unsupported-hash"));
        worker.onmessageerror = () => settle(new Error("hash-read-failed"));
        timer = setTimeout(() => settle(new Error("hash-read-failed")), 30_000);
        worker.postMessage(
          instruction === undefined
            ? file
            : { file, instruction, ...(find ? { find } : {}) },
        );
      } catch {
        settle(new Error("unsupported-hash"));
      }
    });
  };
  return {
    hash: async (file: File) => (await request(file)).sha256,
    readText: async (file: File, instruction: string, find?: FindQuery) =>
      (await request(file, instruction, find)) as TextFileSnapshot,
    dispose,
  };
}

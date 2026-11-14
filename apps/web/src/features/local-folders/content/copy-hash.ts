import {
  isFindEvidence,
  type FindEvidence,
  type FindQuery,
} from "../search/documents/document-find";
import { readOcrEnabled } from "./ocr/ocr-preferences";
import { isOcrDetails, OCR_LIMITS } from "./ocr/ocr-image";

export type TextFileSnapshot = Readonly<{
  sha256: string;
  size: number;
  excerpt: string;
  excerptHash: string;
  finding?: FindEvidence | null;
  pdf?: Readonly<{
    pages: number;
    complete: boolean
  }>;
  ocr?: Readonly<{
    pages: number;
    complete: boolean
  }>;
  fullText?: string;
}>;

export type TextIndexContext = Readonly<{
  owner: string;
  workspace: string;
  connection: string;
  path: readonly string[]
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
    index?: TextIndexContext,
    cached?: {
      hash: string;
      text: string
    },
  ): Promise<TextFileSnapshot | {
    sha256: string;
    size: number
  }> => {
    if (signal?.aborted || disposed)
      return Promise.reject(
        new DOMException("Copy inspection cancelled", "AbortError"),
      );

    if (pendingReject) return Promise.reject(new Error("hash-already-pending"));

    return new Promise((resolve, reject) => {
      pendingReject = reject;

      const settle = (
        error?: Error,
        value?: TextFileSnapshot | {
          sha256: string;
          size: number
        },
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
            !("sha256" in data)
            ||
            typeof data.sha256 !== "string"
            ||
            !/^[a-f0-9]{64}$/u.test(data.sha256)
            ||
            !("size" in data)
            ||
            data.size !== file.size
          ) {
            settle(new Error("hash-read-failed"));
          } else if ("ocr" in data && !isOcrDetails(data.ocr)) {
            settle(new Error("hash-read-failed"));
          } else if (instruction === undefined) {
            settle(undefined, { sha256: data.sha256, size: file.size });
          } else if ("issue" in data && typeof data.issue === "string") {
            settle(new Error(data.issue), undefined, false);
          } else if (
            "excerpt" in data &&
            typeof data.excerpt === "string" &&
            data.excerpt.length <= 1200
            &&
            "excerptHash" in data
            &&
            typeof data.excerptHash === "string"
            &&
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
              ...("pdf" in data && data.pdf && typeof data.pdf === "object"
                ? {
                  pdf: data.pdf as {
                    pages: number;
                    complete: boolean
                  }
                }
                : {}),
              ...("ocr" in data && isOcrDetails(data.ocr) ? { ocr: data.ocr } : {}),
              ...("fullText" in data && typeof data.fullText === "string" ? { fullText: data.fullText } : {}),
              ...(find && "finding" in data
                ? { finding: data.finding as FindEvidence | null }
                : {}),
            });
          } else settle(new Error("hash-read-failed"));
        };
        worker.onerror = () => settle(new Error("unsupported-hash"));
        worker.onmessageerror = () => settle(new Error("hash-read-failed"));

        const ocr = instruction !== undefined && readOcrEnabled() && /\.(pdf|png|jpe?g)$/iu.test(file.name);

        timer = setTimeout(
          () => settle(new Error(ocr ? "ocr-timeout" : "hash-read-failed")),
          ocr ? OCR_LIMITS.timeoutMs : 30_000
        );
        worker.postMessage(
          instruction === undefined
            ? file
            : {
              file,
              instruction,
              ...(ocr ? { ocr: true } : {}),
              ...(find ? { find } : {}),
              ...(index ? { index } : {}),
              ...(cached ? { cached } : {})
            },
        );
      } catch {
        settle(new Error("unsupported-hash"));
      }
    });
  };

  return {
    hash: async (file: File) => (await request(file)).sha256,
    readText: async (
      file: File,
      instruction: string,
      find?: FindQuery,
      index?: TextIndexContext,
      cached?: {
        hash: string;
        text: string
      }) =>
      (await request(file, instruction, find, index, cached)) as TextFileSnapshot,
    dispose,
  };
}

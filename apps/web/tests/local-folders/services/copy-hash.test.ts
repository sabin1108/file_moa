import { afterEach, describe, expect, it, vi } from "vitest";
import { createCopyHasher } from "../../../src/features/local-folders/services/copy-hash";

// Models browser delivery/termination, not cryptographic correctness (covered in the real browser).
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(
    _url: URL,
    readonly options: WorkerOptions,
  ) {
    TestWorker.instances.push(this);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  TestWorker.instances = [];
});

describe("copy hash Worker lifetime", () => {
  it("validates search evidence and refuses a missing or malformed search reply", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const find = {
      terms: ["회의"],
      from: null,
      to: null,
      basis: "body" as const,
    };
    for (const finding of [
      undefined,
      { kind: "made-up", dates: [], evidence: [] },
      { kind: "matched", dates: [], evidence: [] },
      { kind: "matched", dates: [], evidence: ["a".repeat(201)] },
    ]) {
      const hasher = createCopyHasher();
      const pending = hasher.readText(new File(["abc"], "a.md"), "회의", find);
      const rejection = expect(pending).rejects.toThrow("hash-read-failed");
      TestWorker.instances.at(-1)!.onmessage!({
        data: {
          sha256: "a".repeat(64),
          size: 3,
          excerpt: "abc",
          excerptHash: "b".repeat(64),
          finding,
        },
      });
      await rejection;
    }
    const hasher = createCopyHasher();
    const pending = hasher.readText(new File(["abc"], "a.md"), "회의", find);
    TestWorker.instances.at(-1)!.onmessage!({
      data: {
        sha256: "a".repeat(64),
        size: 3,
        excerpt: "abc",
        excerptHash: "b".repeat(64),
        finding: null,
      },
    });
    await expect(pending).resolves.toMatchObject({ finding: null });
    hasher.dispose();
  });
  it("supports text snapshots without changing hash(), and invalid UTF8 does not poison the next file", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const hasher = createCopyHasher();
    const file = new File(["abc"], "a.md");
    const rejected = hasher.readText(file, "자료");
    const rejection = expect(rejected).rejects.toThrow("invalid-utf8");
    const worker = TestWorker.instances[0];
    expect(worker.options).toEqual({ type: "module" });
    expect(worker.postMessage).toHaveBeenCalledWith({
      file,
      instruction: "자료",
    });
    worker.onmessage!({
      data: { sha256: "a".repeat(64), size: 3, issue: "invalid-utf8" },
    });
    await rejection;
    expect(worker.terminate).not.toHaveBeenCalled();
    const next = hasher.readText(file, "자료");
    worker.onmessage!({
      data: {
        sha256: "a".repeat(64),
        size: 3,
        excerpt: "abc",
        excerptHash: "b".repeat(64),
      },
    });
    await expect(next).resolves.toMatchObject({
      excerpt: "abc",
      excerptHash: "b".repeat(64),
    });
    hasher.dispose();
  });
  it("INSPECT-003 uses one Worker sequentially and frees it at completion", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const hasher = createCopyHasher();
    const file = new File(["abc"], "a");
    const first = hasher.hash(file);
    const worker = TestWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(file);
    worker.onmessage!({ data: { sha256: "a".repeat(64), size: 3 } });
    await expect(first).resolves.toBe("a".repeat(64));
    const second = hasher.hash(file);
    worker.onmessage!({ data: { sha256: "b".repeat(64), size: 3 } });
    await expect(second).resolves.toBe("b".repeat(64));
    expect(TestWorker.instances).toHaveLength(1);
    hasher.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("INSPECT-005 abort terminates and rejects a pending hash, including pre-abort", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const abort = new AbortController();
    const hasher = createCopyHasher(abort.signal);
    const pending = hasher.hash(new File([], "empty"));
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
    await expect(hasher.hash(new File([], "empty"))).rejects.toMatchObject({
      name: "AbortError",
    });
    const already = createCopyHasher(abort.signal);
    await expect(already.hash(new File([], "empty"))).rejects.toMatchObject({
      name: "AbortError",
    });
    already.dispose();
    expect(TestWorker.instances).toHaveLength(1);
  });
  it("INSPECT-005 rejects malformed responses, Worker errors, and a stalled Worker", async () => {
    vi.stubGlobal("Worker", TestWorker);
    vi.useFakeTimers();
    for (const failure of ["message", "error", "decode", "timeout"] as const) {
      const hasher = createCopyHasher();
      const pending = hasher.hash(new File(["abc"], "a"));
      const rejection = expect(pending).rejects.toThrow();
      const worker = TestWorker.instances.at(-1)!;
      if (failure === "message")
        worker.onmessage!({ data: { sha256: "bad", size: 0 } });
      if (failure === "error") worker.onerror!();
      if (failure === "decode") worker.onmessageerror!();
      if (failure === "timeout") await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      expect(worker.terminate).toHaveBeenCalledOnce();
    }
  });
});

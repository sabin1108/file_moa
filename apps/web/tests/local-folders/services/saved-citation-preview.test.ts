import { expect, it, vi } from "vitest";
import { readSourceFilePreview } from "../../../src/features/local-folders/services/source-file-preview";
import { SourcePreviewController } from "../../../src/features/local-folders/store/source-preview-controller";
import type { FolderHandle } from "../../../src/features/local-folders/types";
import { withAbsentVaultMarker } from "../fixtures/absent-vault-marker";

const dispose = vi.fn();
const readText = vi.fn();
const hash = vi.fn();
vi.mock("../../../src/features/local-folders/services/copy-hash", () => ({ createCopyHasher: () => ({ readText, hash, dispose }) }));
const expectation = { owner: { userId: "A", workspaceId: "A" }, connectionId: "source-a", path: ["a.md"], sha256: "a".repeat(64), size: 28, quote: "verified quoted text" };

function fixture() {
  const file = new File(["prefix: verified quoted text"], "a.md", { lastModified: 123 });
  const getFile = vi.fn(async () => file);
  const root = { queryPermission: vi.fn(async () => "granted"), getFileHandle: vi.fn(async () => ({ getFile })) };
  withAbsentVaultMarker(root);
  readText.mockReset().mockResolvedValue({ sha256: expectation.sha256, size: expectation.size, fullText: "prefix: verified quoted text", excerpt: "prefix: verified quoted text" });
  dispose.mockClear();
  hash.mockReset().mockResolvedValue(expectation.sha256);
  return { root: root as unknown as FolderHandle, getFile };
}

it("verifies full bytes and quote through the existing Worker and rechecks metadata", async () => {
  const { root, getFile } = fixture();
  const result = await readSourceFilePreview(root, ["a.md"], () => {}, undefined, expectation);
  expect(result.referenceVerified).toBe(true);
  expect(result.text).toBe("prefix: verified quoted text");
  expect(getFile).toHaveBeenCalledTimes(2);
  expect(hash).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it("rejects different full content, size, quote and post-read file change", async () => {
  for (const invalid of [{ sha256: "b".repeat(64) }, { size: 29 }, { fullText: "other text" }]) {
    const { root } = fixture();
    readText.mockResolvedValueOnce({ sha256: expectation.sha256, size: expectation.size, fullText: "verified quoted text", ...invalid });
    await expect(readSourceFilePreview(root, ["a.md"], () => {}, undefined, expectation)).rejects.toThrow("citation-changed");
    expect(dispose).toHaveBeenCalledOnce();
  }
  const { root, getFile } = fixture();
  getFile.mockResolvedValueOnce(new File(["prefix: verified quoted text"], "a.md", { lastModified: 1 }));
  await expect(readSourceFilePreview(root, ["a.md"], () => {}, undefined, expectation)).rejects.toThrow("source-changed");
  const replaced = fixture();
  hash.mockResolvedValueOnce("b".repeat(64));
  await expect(readSourceFilePreview(replaced.root, ["a.md"], () => {}, undefined, expectation)).rejects.toThrow("citation-changed");
});

it("aborting citation navigation discards a pending preview read without affecting a newer read", async () => {
  let release!: (value: { path: string[]; text: string; size: number; lastModified: number }) => void;
  const read = vi.fn(() => new Promise<{ path: string[]; text: string; size: number; lastModified: number }>(resolve => { release = resolve; }));
  const controller = new SourcePreviewController(read, () => {});
  controller.reset(true);
  const navigation = new AbortController();
  const pending = controller.open(["a.md"], expectation, navigation.signal);
  navigation.abort();
  release({ path: ["a.md"], text: "late old body", size: 13, lastModified: 1 });
  expect(await pending).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({ phase: "idle", path: null, result: null });
  const staleSignal = new AbortController();
  const older = controller.open(["a.md"], expectation, staleSignal.signal);
  const olderRelease = release;
  const newer = controller.open(["b.md"]);
  staleSignal.abort();
  release({ path: ["b.md"], text: "new body", size: 8, lastModified: 2 });
  olderRelease({ path: ["a.md"], text: "old body", size: 8, lastModified: 1 });
  expect(await older).toBe(false);
  expect(await newer).toBe(true);
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", path: ["b.md"], result: { text: "new body" } });
});

it("retains verification on refresh and never shows an old body after a failed citation read", async () => {
  const read = vi.fn(async () => ({ path: ["a.md"], text: "old", size: 3, lastModified: 1 }));
  const controller = new SourcePreviewController(read, () => {});
  controller.reset(true);
  expect(await controller.open(["a.md"])).toBe(true);
  read.mockRejectedValueOnce(new Error("citation-changed"));
  expect(await controller.open(["a.md"], expectation)).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({ phase: "error", issue: "changed", result: null });
  await controller.refresh();
  expect(read).toHaveBeenLastCalledWith(["a.md"], expect.any(AbortSignal), expectation);
});

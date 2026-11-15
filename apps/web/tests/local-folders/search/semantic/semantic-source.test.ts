import { afterEach, expect, it, vi } from "vitest";
import { LocalTextIndex } from "../../../../src/features/local-folders/search/documents/local-text-index";
import { prepareSemanticSource } from "../../../../src/features/local-folders/search/semantic/semantic-source";
import { SEMANTIC_MODEL } from "../../../../src/features/local-folders/search/semantic/model-assets";
import { semanticRecordId } from "../../../../src/features/local-folders/search/semantic/semantic-record";
import { SemanticModelController } from "../../../../src/features/local-folders/search/semantic/semantic-model-controller";
import { DocumentFindController } from "../../../../src/features/local-folders/search/documents/document-find-controller";

afterEach(() => vi.restoreAllMocks());
const scope = { owner: "a", workspace: "w", connection: "c" };
const epoch = { scope: "scope-before", model: "model-before" };
const document = { id: "doc", name: "note.md", path: ["note.md"], sha256: "a".repeat(64), size: 4, lastModified: 1, excerpt: "text", excerptHash: "a".repeat(64) };
const snapshot = { documents: [document], complete: true, excluded: [], limits: [], discoveredFiles: 1, directories: 1, bytes: 4 };

it("SEM-06 marks cache-write losses as partial preparation", async () => {
  vi.spyOn(LocalTextIndex.prototype, "readPath").mockResolvedValue(undefined);
  vi.spyOn(LocalTextIndex.prototype, "search").mockRejectedValue(new Error("whole-connection-read-forbidden"));
  vi.spyOn(LocalTextIndex.prototype, "semanticRecords").mockResolvedValue([]);
  vi.spyOn(LocalTextIndex.prototype, "semanticEpoch").mockResolvedValue(epoch);
  const result = await prepareSemanticSource(scope, snapshot, epoch, new SemanticModelController(), new AbortController().signal, () => {}, () => {});
  expect(result).toEqual({ prepared: 0, scanned: 0, partial: true });
});

it("SEM-07 rejects deletion during a fully reused preparation without writing new records", async () => {
  const vector = new Float32Array(384); vector[0] = 1;
  const value = { ...scope, path: document.path, pathKey: JSON.stringify(document.path), hash: document.sha256, parserVersion: 2, model: SEMANTIC_MODEL.version };
  vi.spyOn(LocalTextIndex.prototype, "readPath").mockResolvedValue({ ...value, id: "cache", text: "text", updatedAt: 1, metadata: { format: "text", size: 4, lastModified: 1, ocrEnabled: false } });
  vi.spyOn(LocalTextIndex.prototype, "search").mockRejectedValue(new Error("whole-connection-read-forbidden"));
  vi.spyOn(LocalTextIndex.prototype, "semanticRecords").mockResolvedValue([{ ...value, id: semanticRecordId(value), epoch, textLength: 4, complete: true, chunks: [{ start: 0, end: 4, vector }], updatedAt: 1 }]);
  vi.spyOn(LocalTextIndex.prototype, "semanticEpoch").mockResolvedValue({ ...epoch, model: "model-after-delete" });
  const put = vi.spyOn(LocalTextIndex.prototype, "putSemantic");
  await expect(prepareSemanticSource(scope, snapshot, epoch, new SemanticModelController(), new AbortController().signal, () => {}, () => {})).rejects.toThrow("storage-changed");
  expect(put).not.toHaveBeenCalled();
});

it("SEM-04 resets confirmation when filters or scope change and never searches without confirmation", async () => {
  const read = vi.fn();
  const controller = new DocumentFindController(read);
  controller.start("빵이 커지는 이유");
  controller.configure({ terms: "", month: "all" });
  controller.configureSemantic({ enabled: true, confirmed: true });
  controller.configure({ formats: "md" });
  expect(controller.getSnapshot().semantic.confirmed).toBe(false);
  await controller.search();
  expect(read).not.toHaveBeenCalled();
  controller.configureSemantic({ confirmed: true });
  controller.setScope(["조리"]);
  expect(controller.getSnapshot().semantic.confirmed).toBe(false);
});

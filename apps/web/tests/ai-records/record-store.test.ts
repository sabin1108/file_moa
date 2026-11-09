import { describe, expect, it, vi } from "vitest";
import { loadLatest, saveRevision } from "../../src/features/ai-records/services/record-store";

type Node = { kind: "directory"; name: string; children: Map<string, Node | FileNode> } | FileNode;
type FileNode = { kind: "file"; name: string; text: string };
function directory(name = "records") {
  const root: Node = { kind: "directory", name, children: new Map() };
  const api = (node: Node): unknown => node.kind === "file" ? {
    kind: "file", name: node.name,
    getFile: async () => ({ size: new TextEncoder().encode(node.text).byteLength, arrayBuffer: async () => new TextEncoder().encode(node.text).buffer, text: async () => node.text }),
    createWritable: async () => ({ write: async (value: string) => { node.text = value; }, close: async () => {}, abort: async () => {} }),
  } : {
    kind: "directory", name: node.name,
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const child = node.children.get(name);
      if (child?.kind === "file") return api(child);
      if (options?.create) { const created: FileNode = { kind: "file", name, text: "" }; node.children.set(name, created); return api(created); }
      throw new DOMException("missing", "NotFoundError");
    },
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      const child = node.children.get(name);
      if (child?.kind === "directory") return api(child);
      if (options?.create) { const created: Node = { kind: "directory", name, children: new Map() }; node.children.set(name, created); return api(created); }
      throw new DOMException("missing", "NotFoundError");
    },
    values: async function* () { for (const child of node.children.values()) yield api(child); },
    removeEntry: async (name: string) => { if (!node.children.delete(name)) throw new DOMException("missing", "NotFoundError"); },
  };
  return api(root) as FileSystemDirectoryHandle;
}
const input = (revisionId: string, parentRevisionId: string | null) => ({ recordId: "chat-a", revisionId, parentRevisionId, kind: "conversation" as const, scope: { type: "global" as const }, state: "draft" as const, createdAt: "2026-11-09T03:00:00.000Z" });

describe("AI record revision store", () => {
  it("rejects a second writer with a stale parent and preserves the current head", async () => {
    vi.stubGlobal("navigator", { locks: { request: async (_name: string, work: () => Promise<unknown>) => work() } });
    const root = directory();
    const first = await saveRevision(root, input("rev-a", null), "first");
    await expect(saveRevision(root, input("rev-b", null), "second")).rejects.toThrow("stale-revision");
    expect((await loadLatest(root, "chat-a"))?.body).toBe("first");
    expect(first?.metadata.revisionId).toBe("rev-a");
  });

  it("does not publish a revision when the current assertion is revoked", async () => {
    vi.stubGlobal("navigator", { locks: { request: async (_name: string, work: () => Promise<unknown>) => work() } });
    const root = directory(); let valid = true;
    await expect(saveRevision(root, input("rev-a", null), "first", { assertCurrent: () => { if (!valid) throw new Error("stale-connection-operation"); }, beforeWrite: async () => { valid = false; } })).rejects.toThrow("stale-connection-operation");
    expect(await loadLatest(root, "chat-a")).toBeNull();
  });
});

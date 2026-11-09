import { describe, expect, it, vi } from "vitest";
import { AiRecordRepository } from "../../src/features/ai-records/services/ai-record-repository";
import type { ConnectionOwner } from "../../src/features/local-folders/types";

type FileNode = { kind: "file"; name: string; text: string };
type DirNode = { kind: "directory"; name: string; children: Map<string, FileNode | DirNode> };
function fakeRoot() {
  const root: DirNode = { kind: "directory", name: "root", children: new Map() };
  const wrap = (node: FileNode | DirNode): unknown => node.kind === "file" ? {
    kind: "file", name: node.name, getFile: async () => ({ size: new TextEncoder().encode(node.text).byteLength, arrayBuffer: async () => new TextEncoder().encode(node.text).buffer, text: async () => node.text }),
    createWritable: async () => ({ write: async (value: string) => { node.text = value; }, close: async () => {}, abort: async () => {} }),
  } : { kind: "directory", name: node.name,
    getFileHandle: async (name: string, options?: { create?: boolean }) => { const child = node.children.get(name); if (child?.kind === "file") return wrap(child); if (options?.create) { const file: FileNode = { kind: "file", name, text: "" }; node.children.set(name, file); return wrap(file); } throw new DOMException("missing", "NotFoundError"); },
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => { const child = node.children.get(name); if (child?.kind === "directory") return wrap(child); if (options?.create) { const dir: DirNode = { kind: "directory", name, children: new Map() }; node.children.set(name, dir); return wrap(dir); } throw new DOMException("missing", "NotFoundError"); },
    values: async function* () { for (const child of node.children.values()) yield wrap(child); },
    removeEntry: async (name: string) => { if (!node.children.delete(name)) throw new DOMException("missing", "NotFoundError"); },
  };
  return wrap(root) as FileSystemDirectoryHandle;
}
const owner: ConnectionOwner = { userId: "user-a", workspaceId: "workspace-a" };
const payload = { type: "artifact" as const, id: "artifact-a", title: "draft", updatedAt: "2026-11-09T03:00:00.000Z", markdown: "hello", status: "draft" as const, sourceConversationId: null };
function setup() { vi.stubGlobal("navigator", { locks: { request: async (_name: string, work: () => Promise<unknown>) => work() } }); const root = fakeRoot(); let valid = true; const repo = new AiRecordRepository(async () => ({ directory: root, owner, assertCurrent: () => { if (!valid) throw new Error("stale-connection-operation"); } })); return { root, repo, revoke: () => { valid = false; } }; }

describe("AI record repository", () => {
  it("rejects a late derived artifact after cascading conversation deletion", async () => {
    const { repo } = setup();
    await repo.initialize();
    await repo.save({ type: "conversation", id: "chat-parent", title: "대화", updatedAt: payload.updatedAt, draft: "", projectId: null, turns: [] }, null);
    await repo.remove("conversation", "chat-parent", true);
    await expect(repo.save({ ...payload, sourceConversationId: "chat-parent" }, null)).rejects.toThrow("record-deleted");
    expect(await repo.list()).toEqual([]);
  });
  it("initializes, saves, reads, lists and preserves revisions", async () => { const { repo } = setup(); await repo.initialize(); const saved = await repo.save(payload, null); expect((await repo.read("artifact", payload.id)).revisionId).toBe(saved.revisionId); expect((await repo.list()).map(item => item.payload.id)).toEqual([payload.id]); });
  it("writes a tombstone and rejects later save and read", async () => { const { repo } = setup(); await repo.initialize(); await repo.save(payload, null); await repo.remove("artifact", payload.id); await expect(repo.read("artifact", payload.id)).rejects.toThrow("record-deleted"); await expect(repo.save({ ...payload, updatedAt: "2026-11-09T03:01:00.000Z" }, null)).rejects.toThrow("record-deleted"); expect(await repo.list()).toEqual([]); });
  it("does not publish after owner access is revoked", async () => { const { repo, revoke } = setup(); await repo.initialize(); revoke(); await expect(repo.save(payload, null)).rejects.toThrow("stale-connection-operation"); });
});

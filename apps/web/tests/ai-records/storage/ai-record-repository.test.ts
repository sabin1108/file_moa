import { describe, expect, it, vi } from "vitest";
import { AiRecordRepository } from "../../../src/features/ai-records/storage/ai-record-repository";
import type { ConnectionOwner } from "../../../src/features/local-folders/types";
import { makeWikiDraft, proposeWikiUpdate } from "../../../src/features/ai-records/wiki/wiki";
import { encodeRecord } from "../../../src/features/ai-records/storage/record-codec";
import { digest } from "../../../src/features/ai-records/storage/record-store";

type FileNode = {
  kind: "file";
  name: string;
  text: string
};

type DirNode = {
  kind: "directory";
  name: string;
  children: Map<string, FileNode | DirNode>
};

type StorageFaults = {
  removeId?: string;
  read?: { name: string; error: Error };
  invalidUtf8Name?: string;
};

function fakeRoot(faults: StorageFaults) {
  const root: DirNode = { kind: "directory", name: "root", children: new Map() };
  const wrap = (node: FileNode | DirNode): unknown => node.kind === "file"
    ? {
      kind: "file",
      name: node.name,
      getFile: async () => {
        if (faults.read?.name === node.name) throw faults.read.error;

        return {
          size: new TextEncoder().encode(node.text).byteLength,
          arrayBuffer: async () => faults.invalidUtf8Name === node.name ? new Uint8Array([0xff]).buffer : new TextEncoder().encode(node.text).buffer,
          text: async () => node.text
        };
      },
      createWritable: async () => ({
        write: async (value: string) => {
          node.text = value;
        },
        close: async () => { },
        abort: async () => { }
      }),
    }
    : {
      kind: "directory",
      name: node.name,
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        const child = node.children.get(name);

        if (child?.kind === "file") return wrap(child);

        if (options?.create) {
          const file: FileNode = { kind: "file", name, text: "" };

          node.children.set(name, file);

          return wrap(file);
        }

        throw new DOMException("missing", "NotFoundError");
      },
      getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
        const child = node.children.get(name);

        if (child?.kind === "directory") return wrap(child);

        if (options?.create) {
          const dir: DirNode = { kind: "directory", name, children: new Map() };

          node.children.set(name, dir);

          return wrap(dir);
        }

        throw new DOMException("missing", "NotFoundError");
      },
      values: async function* () {
        for (const child of node.children.values()) yield wrap(child);
      },
      removeEntry: async (name: string) => {
        if (name === faults.removeId) throw new DOMException("fixture removal failed", "NoModificationAllowedError");

        if (!node.children.delete(name)) throw new DOMException("missing", "NotFoundError");
      },
    };

  return wrap(root) as FileSystemDirectoryHandle;
}

const owner: ConnectionOwner = { userId: "user-a", workspaceId: "workspace-a" };
const payload = {
  type: "artifact" as const,
  id: "artifact-a",
  title: "draft",
  updatedAt: "2026-11-09T03:00:00.000Z",
  markdown: "hello",
  status: "draft" as const,
  sourceConversationId: null
};

async function seedRecords(root: FileSystemDirectoryHandle, count: number) {
  const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts", { create: true });

  for (let index = 0; index < count; index++) {
    const input = { ...payload, id: `artifact-limit-${index}` };
    const body = encodeRecord(input);
    const directory = await parent.getDirectoryHandle(input.id, { create: true });
    const metadata = {
      schemaVersion: 1, recordId: input.id, revisionId: "rev-fixture", parentRevisionId: null,
      kind: "artifact", scope: { type: "global" }, state: "draft", createdAt: input.updatedAt,
      contentFile: "rev-fixture.md", contentSha256: await digest(body)
    };

    for (const [name, text] of [["rev-fixture.md", body], ["rev-fixture.json", JSON.stringify(metadata)]]) {
      const writer = await (await directory.getFileHandle(name, { create: true })).createWritable();

      await writer.write(text);
      await writer.close();
    }
  }
}

function setup() {
  vi.stubGlobal(
    "navigator",
    { locks: { request: async (_name: string, work: () => Promise<unknown>) => work() } }
  );

  const faults: StorageFaults = {};
  const root = fakeRoot(faults);
  let valid = true;
  const repo = new AiRecordRepository(async () => ({
    directory: root,
    owner,
    assertCurrent: () => {
      if (!valid) throw new Error("stale-connection-operation");
    }
  }));

  return {
    root,
    repo,
    faults,
    revoke: () => {
      valid = false;
    }
  };
}

async function seedTombstone(root: FileSystemDirectoryHandle, id: string, type?: "conversation" | "artifact", cascade = true) {
  const deleted = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("deleted", { create: true });
  const writer = await (await deleted.getFileHandle(`${id}.json`, { create: true })).createWritable();

  await writer.write(JSON.stringify({ version: 1, id, deletedAt: "2026-11-13T00:00:00.000Z", cascade, ...(type ? { type } : {}) }));
  await writer.close();
}

const conversation = (id: string) => ({ type: "conversation" as const, id, title: "대화", updatedAt: payload.updatedAt, draft: "보존할 대화", projectId: null, turns: [] });

describe("AI record repository", () => {
  it("rejects creating a record whose ID already belongs to another kind", async () => {
    const { root, repo } = setup();

    await repo.initialize();
    await repo.save(conversation(payload.id), null);
    await expect(repo.save(payload, null)).rejects.toThrow("record-id-collision");
    expect((await repo.read("conversation", payload.id)).payload).toMatchObject({ draft: "보존할 대화" });

    const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts").catch(() => null);

    if (parent) await expect(parent.getDirectoryHandle(payload.id)).rejects.toThrow();
  });

  it("serializes same-ID creation across different record kinds", async () => {
    const { repo } = setup();

    await repo.initialize();

    const locks = new Map<string, Promise<unknown>>();

    vi.stubGlobal("navigator", { locks: { request: (name: string, work: () => Promise<unknown>) => {
      const result = (locks.get(name) ?? Promise.resolve()).catch(() => undefined).then(work);

      locks.set(name, result);

      return result;
    } } });

    const results = await Promise.allSettled([repo.save(conversation(payload.id), null), repo.save(payload, null)]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { message: "record-id-collision" } });
    expect((await repo.list()).records).toHaveLength(1);
  });

  it.each(["none", "typed", "legacy"])("preserves both existing duplicate kinds with %s deletion metadata", async marker => {
    const { root, repo } = setup();
    const id = "artifact-limit-0";

    await repo.initialize();
    await repo.save(conversation(id), null);
    await seedRecords(root, 1);
    if (marker !== "none") await seedTombstone(root, id, marker === "typed" ? "conversation" : undefined);

    const result = await repo.list();

    expect(result.records).toEqual([]);
    expect(result.pendingDeletes).toEqual([]);
    expect(result.conflicts).toEqual([{ type: "conversation", id }, { type: "artifact", id }]);
    await expect(repo.remove("conversation", id)).rejects.toThrow("record-id-collision");
    await expect(repo.resumeDelete({ type: "artifact", id })).rejects.toThrow("record-id-collision");

    for (const name of ["conversations", "artifacts"]) expect(await (await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle(name)).getDirectoryHandle(id)).toBeDefined();
  });

  it.each(["conversation", "legacy"] as const)("does not apply a %s tombstone to a surviving artifact of the same ID", async type => {
    const { root, repo } = setup();
    const id = "artifact-limit-0";

    await repo.initialize();
    await seedRecords(root, 1);
    await seedTombstone(root, id, type === "conversation" ? type : undefined);

    const result = await repo.list();

    expect(result.pendingDeletes).toEqual([]);
    expect(result.records).toEqual([]);
    await expect(repo.resumeDelete({ type: "artifact", id })).rejects.toThrow(type === "conversation" ? "record-id-collision" : "ambiguous-record-tombstone");
    expect(await (await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts")).getDirectoryHandle(id)).toBeDefined();
  });

  it("does not cascade a legacy untyped source marker", async () => {
    const { root, repo } = setup();

    await repo.initialize();
    await repo.save({ ...payload, sourceConversationId: "chat-legacy" }, null);
    await seedTombstone(root, "chat-legacy");
    const result = await repo.list();

    expect(result.pendingDeletes).toEqual([]);
    expect(result.unreadable).toEqual([{ type: "artifact", id: payload.id }]);
    await expect(repo.resumeDelete({ type: "artifact", id: payload.id, sourceId: "chat-legacy" })).rejects.toThrow("ambiguous-record-tombstone");
  });

  it("quarantines a typed non-conversation source marker even without cascade intent", async () => {
    const { root, repo } = setup();
    await repo.initialize();
    await repo.save({ ...payload, sourceConversationId: "source-other-kind" }, null);
    await seedTombstone(root, "source-other-kind", "artifact", false);

    const result = await repo.list();
    expect(result.records).toEqual([]);
    expect(result.pendingDeletes).toEqual([]);
    expect(result.conflicts).toEqual([{ type: "artifact", id: payload.id }]);
  });

  it("keeps derived records visible after a legacy conversation-only deletion without guessing cascade intent", async () => {
    const { root, repo } = setup();
    await repo.initialize();
    await repo.save({ ...payload, sourceConversationId: "chat-legacy" }, null);
    await seedTombstone(root, "chat-legacy", undefined, false);

    const result = await repo.list();
    expect(result.records).toHaveLength(1);
    expect(result.pendingDeletes).toEqual([]);
    expect(result.unreadable).toEqual([]);
  });

  it("reports deletion commitment only after the typed marker is readable, before physical cleanup", async () => {
    const { root, repo, faults } = setup();

    await repo.initialize();
    await repo.save(payload, null);
    const committed = vi.fn();

    faults.read = { name: "owner.json", error: new DOMException("denied", "NotAllowedError") };
    await expect(repo.remove("artifact", payload.id, false, committed)).rejects.toThrow();
    expect(committed).not.toHaveBeenCalled();
    faults.read = undefined;
    faults.removeId = payload.id;
    await expect(repo.remove("artifact", payload.id, false, committed)).rejects.toThrow();
    expect(committed).toHaveBeenCalledOnce();

    const marker = await (await (await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("deleted")).getFileHandle(`${payload.id}.json`)).getFile();

    expect(JSON.parse(await marker.text())).toMatchObject({ id: payload.id, type: "artifact", cascade: false });
  });

  it("rejects a 501st new record before creating its directory and still updates existing records", async () => {
    const { root, repo } = setup();

    await repo.initialize();
    await seedRecords(root, 500);
    await expect(repo.save(payload, null)).rejects.toThrow("record-count-limit");

    const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts");

    await expect(parent.getDirectoryHandle(payload.id)).rejects.toThrow();
    const updated = await repo.save({ ...payload, id: "artifact-limit-0", markdown: "updated" }, "rev-fixture");

    expect(updated.revisions).toBe(2);
    expect((await repo.list()).records).toHaveLength(500);
  }, 15_000);

  it("reserves exactly one remaining slot when two new records are saved concurrently", async () => {
    const { root, repo } = setup();

    await repo.initialize();
    await seedRecords(root, 499);

    const locks = new Map<string, Promise<unknown>>();

    vi.stubGlobal("navigator", { locks: { request: (name: string, work: () => Promise<unknown>) => {
      const result = (locks.get(name) ?? Promise.resolve()).catch(() => undefined).then(work);

      locks.set(name, result);

      return result;
    } } });

    const results = await Promise.allSettled([repo.save(payload, null), repo.save({ ...payload, id: "artifact-other" }, null)]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { message: "record-count-limit" } });
    expect((await repo.list()).records).toHaveLength(500);
  });

  it.each([501, 503])("reads a bounded recovery window for %s legacy records and permits explicit cleanup", async count => {
    const { root, repo } = setup();

    await repo.initialize();
    await seedRecords(root, count);

    const result = await repo.list();

    expect(result.records).toHaveLength(501);
    expect(result.overLimit).toBe(true);
    await repo.save({ ...payload, id: "artifact-limit-0" }, "rev-fixture");
    await expect(repo.save(payload, null)).rejects.toThrow("record-count-limit");

    for (let index = 0; index < count - 499; index++) await repo.remove("artifact", `artifact-limit-${index}`);

    expect((await repo.list()).overLimit).toBe(false);
    await repo.save(payload, null);
    expect((await repo.list()).records).toHaveLength(500);
  }, 15_000);

  it("does not release a slot until a pending directory deletion actually completes", async () => {
    const { root, repo, faults } = setup();

    await repo.initialize();
    await seedRecords(root, 500);
    faults.removeId = "artifact-limit-0";
    await expect(repo.remove("artifact", "artifact-limit-0")).rejects.toThrow();
    await expect(repo.save(payload, null)).rejects.toThrow("record-count-limit");
    faults.removeId = undefined;
    await repo.resumeDelete((await repo.list()).pendingDeletes[0]);
    await repo.save(payload, null);
    expect((await repo.list()).records).toHaveLength(500);
  });

  it("round trips wiki metadata and rejects late updates from any cascading source conversation", async () => {
    const { repo } = setup();

    await repo.initialize();

    const input = {
      id: "wiki-a",
      title: "위키",
      markdown: "합성 요약",
      evidence: {
        owner,
        connectionId: "source-a",
        citations: [{ path: ["note.md"], sha256: "a".repeat(64), size: 100, quote: "위키를 위한 합성 원문 인용입니다." }]
      },
      model: "fixture",
      sourceConversationId: "chat-a",
      now: payload.updatedAt
    };
    const wiki = makeWikiDraft(input);
    const saved = await repo.save(wiki, null);

    expect((await repo.read("artifact", wiki.id)).payload).toEqual(wiki);

    const proposed = proposeWikiUpdate(
      { ...wiki, markdown: "사용자 수정" },
      { ...input, sourceConversationId: "chat-b", markdown: "새 초안" }
    );

    await repo.remove("conversation", "chat-b", true);
    await expect(repo.save(proposed, saved.revisionId)).rejects.toThrow("record-deleted");
    expect((await repo.read("artifact", wiki.id)).payload).toEqual(wiki);
    await expect(repo.save(
      {
        ...wiki,
        id: "wiki-other",
        wiki: { ...wiki.wiki, evidence: { ...wiki.wiki.evidence, owner: { ...owner, userId: "other" } } }
      },
      null
    )).rejects.toThrow("ai-record-owner-mismatch");
  });
  it("rejects a late derived artifact after cascading conversation deletion", async () => {
    const { repo } = setup();

    await repo.initialize();
    await repo.save(
      {
        type: "conversation",
        id: "chat-parent",
        title: "대화",
        updatedAt: payload.updatedAt,
        draft: "",
        projectId: null,
        turns: []
      },
      null
    );
    await repo.remove("conversation", "chat-parent", true);
    await expect(repo.save({ ...payload, sourceConversationId: "chat-parent" }, null)).rejects.toThrow("record-deleted");
    expect((await repo.list()).records).toEqual([]);
  });
  it("initializes, saves, reads, lists and preserves revisions", async () => {
    const { repo } = setup();

    await repo.initialize();

    const saved = await repo.save(payload, null);

    expect((await repo.read("artifact", payload.id)).revisionId).toBe(saved.revisionId);
    expect((await repo.list()).records.map(item => item.payload.id)).toEqual([payload.id]);
  });
  it("writes a tombstone and rejects later save and read", async () => {
    const { repo } = setup();

    await repo.initialize();
    await repo.save(payload, null);
    await repo.remove("artifact", payload.id);
    await expect(repo.read("artifact", payload.id)).rejects.toThrow("record-deleted");
    await expect(repo.save({ ...payload, updatedAt: "2026-11-09T03:01:00.000Z" }, null)).rejects.toThrow("record-deleted");
    expect((await repo.list()).records).toEqual([]);
  });
  it("does not publish after owner access is revoked", async () => {
    const { repo, revoke } = setup();

    await repo.initialize();
    revoke();
    await expect(repo.save(payload, null)).rejects.toThrow("stale-connection-operation");
  });

  it.each(["empty directory", "empty metadata", "invalid metadata", "changed body", "invalid UTF-8", "missing body"])(
    "keeps healthy records and preserves an unreadable record with %s",
    async corruption => {
      const { root, repo, faults } = setup();

      await repo.initialize();
      await repo.save(payload, null);

      const broken = { ...payload, id: "artifact-incomplete" };
      const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts");
      const directory = await parent.getDirectoryHandle(broken.id, { create: true });

      if (corruption !== "empty directory") {
        const saved = await repo.save(broken, null);
        const metadata = await (await directory.getFileHandle(`${saved.revisionId}.json`)).getFile();
        const metadataValue = JSON.parse(await metadata.text()) as { contentFile: string };
        if (corruption === "invalid UTF-8") faults.invalidUtf8Name = `${saved.revisionId}.json`;
        else if (corruption === "missing body") await directory.removeEntry(metadataValue.contentFile);
        else {
          const name = corruption === "changed body" ? metadataValue.contentFile : `${saved.revisionId}.json`;
          const writer = await (await directory.getFileHandle(name)).createWritable();

          await writer.write(corruption === "empty metadata" ? "" : corruption === "invalid metadata" ? "{}" : "changed");
          await writer.close();
        }
      }

      const result = await repo.list();

      expect(result.records.map(record => record.payload.id)).toEqual([payload.id]);
      expect(result.unreadable).toEqual([{ type: "artifact", id: broken.id }]);
      expect(result.pendingDeletes).toEqual([]);
      expect((await repo.read("artifact", payload.id)).payload).toEqual(payload);
      expect(await parent.getDirectoryHandle(broken.id)).toBeDefined();
    }
  );

  it.each(["owner", "invalid owner metadata", "permission", "stale", "unknown I/O"])("does not isolate a whole-storage %s failure", async kind => {
    const { root, repo, faults, revoke } = setup();

    await repo.initialize();
    const saved = await repo.save(payload, null);

    if (kind === "owner" || kind === "invalid owner metadata") {
      const writer = await (await (await root.getDirectoryHandle(".moa-ai-v1")).getFileHandle("owner.json")).createWritable();

      await writer.write(JSON.stringify(kind === "owner" ? { version: 1, owner: { ...owner, userId: "other-user" } } : {}));
      await writer.close();
    }

    if (kind === "permission") faults.read = { name: `${saved.revisionId}.json`, error: new DOMException("denied", "NotAllowedError") };
    if (kind === "unknown I/O") faults.read = { name: `${saved.revisionId}.json`, error: new Error("fixture-unknown-io") };
    if (kind === "stale") revoke();

    await expect(repo.list()).rejects.toThrow();
  });

  it("resumes a tombstoned record whose directory removal failed, including repeated retries", async () => {
    const { root, repo, faults } = setup();

    await repo.initialize();
    await repo.save(payload, null);
    faults.removeId = payload.id;
    await expect(repo.remove("artifact", payload.id)).rejects.toThrow("fixture removal failed");

    const interrupted = await repo.list();

    expect(interrupted.records).toEqual([]);
    expect(interrupted.pendingDeletes).toEqual([{ type: "artifact", id: payload.id }]);
    faults.removeId = undefined;
    await repo.resumeDelete(interrupted.pendingDeletes[0]);
    await repo.resumeDelete(interrupted.pendingDeletes[0]);
    expect((await repo.list()).pendingDeletes).toEqual([]);

    const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts");

    await expect(parent.getDirectoryHandle(payload.id)).rejects.toThrow();
  });

  it.each([false, true])("only resumes derived deletion for cascade=%s", async cascade => {
    const { repo, faults } = setup();

    await repo.initialize();
    const derived = { ...payload, sourceConversationId: "chat-parent" };

    await repo.save(derived, null);
    await repo.remove("conversation", "chat-parent", cascade);

    const result = await repo.list();

    if (!cascade) {
      expect(result.records.map(record => record.payload)).toEqual([derived]);
      expect(result.pendingDeletes).toEqual([]);

      return;
    }

    expect(result.records).toEqual([]);
    expect(result.pendingDeletes).toEqual([{ type: "artifact", id: payload.id, sourceId: "chat-parent" }]);
    faults.removeId = payload.id;
    await expect(repo.resumeDelete(result.pendingDeletes[0])).rejects.toThrow("fixture removal failed");
    faults.removeId = undefined;
    await repo.resumeDelete((await repo.list()).pendingDeletes[0]);
    expect((await repo.list()).pendingDeletes).toEqual([]);
    await expect(repo.read("artifact", payload.id)).rejects.toThrow("record-deleted");
  });

  it("preserves a record detached from its source after the cleanup list was read", async () => {
    const { repo } = setup();

    await repo.initialize();

    const saved = await repo.save({ ...payload, sourceConversationId: "chat-parent" }, null);

    await repo.remove("conversation", "chat-parent", true);

    const pending = (await repo.list()).pendingDeletes[0];

    await repo.save(payload, saved.revisionId);
    await repo.resumeDelete(pending);
    expect((await repo.read("artifact", payload.id)).payload).toEqual(payload);
    expect((await repo.list()).records.map(record => record.payload.id)).toEqual([payload.id]);
  });

  it("does not delete a derived record whose source deletion metadata is malformed", async () => {
    const { root, repo } = setup();

    await repo.initialize();
    await repo.save({ ...payload, sourceConversationId: "chat-parent" }, null);
    await repo.remove("conversation", "chat-parent", true);

    const marker = await (await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("deleted")).getFileHandle("chat-parent.json");
    const writer = await marker.createWritable();

    await writer.write("{}");
    await writer.close();

    const result = await repo.list();

    expect(result.unreadable).toEqual([{ type: "artifact", id: payload.id }]);
    expect(result.pendingDeletes).toEqual([]);
    await expect(repo.resumeDelete({ type: "artifact", id: payload.id, sourceId: "chat-parent" })).rejects.toThrow();
    expect((await repo.read("artifact", payload.id)).payload.id).toBe(payload.id);
  });

  it("does not silently change an already confirmed deletion scope", async () => {
    const { repo, faults } = setup();

    await repo.initialize();
    await repo.save(payload, null);
    faults.removeId = payload.id;
    await expect(repo.remove("artifact", payload.id, false)).rejects.toThrow();
    faults.removeId = undefined;
    await expect(repo.remove("artifact", payload.id, true)).rejects.toThrow("record-delete-mode-changed");
    await repo.resumeDelete((await repo.list()).pendingDeletes[0]);
    expect((await repo.list()).pendingDeletes).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { backupFilesystem, backupOwner } from "../../fixtures/backup-filesystem";
import { InlineEditorSession } from "../../../../src/features/local-folders/documents/editing/inline-editor-session";
import { FolderConnectionSession } from "../../../../src/features/local-folders/connection-session";

vi.mock("../../../../src/features/local-folders/content/copy-hash", () => ({
  createCopyHasher: () => ({
    dispose: () => { },
    hash: async (file: File) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
      .map(value => value.toString(16).padStart(2, "0")).join("")
  })
}));
afterEach(() => vi.unstubAllGlobals());

async function fixture(active = () => true, afterLock = (_count: number) => {}) {
  const fs = backupFilesystem();
  let busy = false;
  let current = true;
  let depth = 0;
  let maximumDepth = 0;
  let locks = 0;
  const trace: string[] = [];
  const lock = vi.fn(async (work: () => Promise<void>) => {
    trace.push("lock");
    maximumDepth = Math.max(maximumDepth, ++depth);
    try { await work(); }
    finally { depth--; trace.push("unlock"); }
    afterLock(++locks);
  });
  const editor = new InlineEditorSession(() => ({
    root: fs.root,
    vault: fs.vault,
    owner: backupOwner,
    check: () => {
      if (!current) throw Error("stale-connection-operation");
    }
  }), () => busy, value => {
    busy = value;
  }, active, lock);
  const loaded = await editor.open(["from", "a.txt"], fs.abort.signal);

  return {
    ...fs,
    editor,
    loaded,
    lock,
    trace,
    lockDepth: () => depth,
    maximumDepth: () => maximumDepth,
    invalidate: () => {
      current = false;
    }
  };
}

describe("inline editor one preservation and repeated verified saves", () => {
  it.each(["manual", "automatic"])("rejects the first baseline after an external write and blocks the next %s save", async next => {
    const f = await fixture(() => true, count => {
      if (count === 1) f.bytes.set("source/from/a.txt", new File(["other"], "a.txt", { lastModified: 2 }));
    });
    // Equal byte count and mtime require checking the expected bytes, not metadata alone.
    await expect(f.editor.save(f.loaded.id, "first", f.abort.signal, true)).rejects.toThrow("managed-changed");
    expect(f.editor.checkpoint(f.loaded.id)).toBeUndefined();
    const writes = f.writes.length;
    await expect(f.editor.save(f.loaded.id, "later", f.abort.signal, next === "manual")).rejects.toThrow("managed-changed");
    expect(await f.bytes.get("source/from/a.txt")!.text()).toBe("other");
    expect(f.writes).toHaveLength(writes);
    expect(f.lock).toHaveBeenCalledTimes(1);
    expect(f.lockDepth()).toBe(0);
    expect([...f.directories.keys()].filter(path => /^vault\/moa-managed-[^/]+$/u.test(path))).toHaveLength(1);
  });
  it("keeps the encoded BOM and CRLF baseline through first and automatic saves", async () => {
    const f = await fixture();
    f.bytes.set("source/from/a.txt", new File([new Uint8Array([239, 187, 191]), "old\r\ntext\r\n"], "a.txt", { lastModified: 10 }));
    const loaded = await f.editor.open(["from", "a.txt"], f.abort.signal);
    await f.editor.save(loaded.id, "new\ntext\n", f.abort.signal, true);
    await f.editor.save(loaded.id, "next\ntext\n", f.abort.signal, false);
    const saved = f.bytes.get("source/from/a.txt")!;
    expect([...new Uint8Array(await saved.arrayBuffer()).slice(0, 3)]).toEqual([239, 187, 191]);
    expect(await saved.text()).toBe("next\r\ntext\r\n");
    expect(f.editor.checkpoint(loaded.id)?.sha256).toBe(await f.hash(saved));
    expect(f.lock).toHaveBeenCalledTimes(2);
  });
  it.each([undefined, true, false])("uses the product session activation callback with API value %s", async active => {
    const fs = backupFilesystem();
    const lock = vi.fn(async (_name: string, work: () => Promise<void>) => work());
    vi.stubGlobal("navigator", { locks: { request: lock }, ...(active === undefined ? {} : { userActivation: { isActive: active } }) });
    const session = new FolderConnectionSession({ read: vi.fn(), write: vi.fn(), remove: vi.fn() });
    await session.switchOwner(backupOwner);
    await session.select("source", async () => fs.root);
    await session.selectRecovery(async () => fs.vault, false);
    const opened = await session.openInlineEditor(["from", "a.txt"], fs.abort.signal);
    vi.mocked(fs.root.requestPermission).mockClear();
    vi.mocked(fs.vault.requestPermission).mockClear();
    const saved = session.saveInlineEditor(opened.id, "session-save", fs.abort.signal, true);
    if (active === false) {
      await expect(saved).rejects.toThrow("managed-user-action-required");
      expect(fs.root.requestPermission).not.toHaveBeenCalled();
      expect(fs.vault.requestPermission).not.toHaveBeenCalled();
      expect(lock).not.toHaveBeenCalled();
    } else {
      await saved;
      expect(await fs.bytes.get("source/from/a.txt")!.text()).toBe("session-save");
      expect(lock).toHaveBeenCalledExactlyOnceWith("moa-folder-creation", expect.any(Function));
    }
  });
  it("uses the injected activation check before starting permissions or a lock", async () => {
    const f = await fixture(() => false);
    await expect(f.editor.save(f.loaded.id, "blocked", f.abort.signal, true)).rejects.toThrow("managed-user-action-required");
    expect(f.root.requestPermission).not.toHaveBeenCalled();
    expect(f.vault.requestPermission).not.toHaveBeenCalled();
    expect(f.lock).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(0);
  });
  it("starts manual permissions synchronously and holds one lock for each save", async () => {
    const f = await fixture(() => { f.trace.push("active"); return true; });
    vi.mocked(f.root.requestPermission).mockImplementation(async () => { f.trace.push("root"); return "granted"; });
    vi.mocked(f.vault.requestPermission).mockImplementation(async () => { f.trace.push("vault"); return "granted"; });
    f.onWrite(() => { expect(f.lockDepth()).toBe(1); });
    const first = f.editor.save(f.loaded.id, "first", f.abort.signal, true);
    expect(f.trace).toEqual(["active", "root", "vault"]);
    await first;
    await f.editor.save(f.loaded.id, "second", f.abort.signal, true);
    const requests = vi.mocked(f.root.requestPermission).mock.calls.length;
    await f.editor.save(f.loaded.id, "third", f.abort.signal, false);
    expect(f.root.requestPermission).toHaveBeenCalledTimes(requests);
    expect(f.lock).toHaveBeenCalledTimes(3);
    expect(f.maximumDepth()).toBe(1);
    expect(f.lockDepth()).toBe(0);
    expect(f.trace.filter(step => step === "unlock")).toHaveLength(3);
  });
  it.each(["owner", "abort"])("rejects a %s change while permissions are pending", async change => {
    const f = await fixture();
    let finish!: (value: PermissionState) => void;
    vi.mocked(f.root.requestPermission).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const saving = f.editor.save(f.loaded.id, "late", f.abort.signal, true);
    const rejected = expect(saving).rejects.toThrow(change === "owner" ? "stale-connection-operation" : "cancelled");
    if (change === "owner") f.invalidate();
    else f.abort.abort();
    finish("granted");
    await rejected;
    expect(f.lock).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(0);
  });
  it("uses supplied activation and lock capabilities without reading navigator", async () => {
    const f = await fixture();
    vi.stubGlobal("navigator", undefined);
    await f.editor.save(f.loaded.id, "first", f.abort.signal, true);
    await f.editor.save(f.loaded.id, "second", f.abort.signal, true);
    expect(await f.bytes.get("source/from/a.txt")!.text()).toBe("second");
  });
  it("preserves once, then manually and periodically saves without additional backup or permission prompts", async () => {
    const f = await fixture();

    await f.editor.save(f.loaded.id, "version1", f.abort.signal, true);
    await f.editor.save(f.loaded.id, "version2", f.abort.signal, true);

    const requests = vi.mocked(f.root.requestPermission).mock.calls.length;

    await f.editor.save(f.loaded.id, "version3", f.abort.signal, false);
    expect(await f.bytes.get("source/from/a.txt")!.text()).toBe("version3");

    const roots = [...f.directories.keys()].filter(path => /^vault\/moa-managed-[^/]+$/u.test(path));

    expect(roots).toHaveLength(1);

    const savedPayload = [...f.bytes.keys()].find(path => path.startsWith(roots[0] + "/") && path.endsWith(".bin"))!;

    expect(await f.bytes.get(savedPayload)!.text()).toBe("NEW_a.txt");
    expect(f.root.requestPermission).toHaveBeenCalledTimes(requests);
    expect([...f.bytes.keys()].filter(path => path.startsWith(roots[0]) && path.includes("editor-save-") && path.endsWith("verified.json"))).toHaveLength(2);
  });
  it("requires the first manual save and pauses when another app edits the file", async () => {
    const f = await fixture();

    await expect(f.editor.save(f.loaded.id, "draft", f.abort.signal, false)).rejects.toThrow("editor-first-save");
    await f.editor.save(f.loaded.id, "version1", f.abort.signal, true);
    f.bytes.set("source/from/a.txt", new File(["external"], "a.txt"));
    await expect(f.editor.save(f.loaded.id, "draft", f.abort.signal, false)).rejects.toThrow("managed-changed");
    expect(await f.bytes.get("source/from/a.txt")!.text()).toBe("external");
  });
  it("resumes an existing backup only when the saved file checkpoint still matches", async () => {
    const f = await fixture();

    await f.editor.save(f.loaded.id, "version1", f.abort.signal, true);

    const checkpoint = f.editor.checkpoint(f.loaded.id)!;
    const loaded = await f.editor.open(["from", "a.txt"], f.abort.signal, { id: f.loaded.id, checkpoint });

    expect(loaded).toMatchObject({ conflict: false, hasBackup: true });
    await f.editor.save(loaded.id, "version2", f.abort.signal, false);
    expect([...f.directories.keys()].filter(path => /^vault\/moa-managed-[^/]+$/u.test(path))).toHaveLength(1);
    f.bytes.set("source/from/a.txt", new File(["outside"], "a.txt"));
    expect(await f.editor.open(["from", "a.txt"], f.abort.signal, { id: f.loaded.id, checkpoint })).toMatchObject({ conflict: true });
    await expect(f.editor.save(f.loaded.id, "draft", f.abort.signal, true)).rejects.toThrow("managed-changed");
  });
  it("blocks automatic writes after permission loss or preservation corruption", async () => {
    const f = await fixture();

    await f.editor.save(f.loaded.id, "version1", f.abort.signal, true);

    const checkpoint = f.editor.checkpoint(f.loaded.id)!;
    const payload = `vault/moa-managed-${checkpoint.backupId}/${checkpoint.payload}.bin`;

    f.bytes.set(payload, new File(["corrupt"], "payload.bin"));
    await expect(f.editor.save(f.loaded.id, "version2", f.abort.signal, false)).rejects.toThrow("managed-archive-changed");
    expect(f.lockDepth()).toBe(0);
    expect(f.trace.at(-1)).toBe("unlock");
    expect(await f.bytes.get("source/from/a.txt")!.text()).toBe("version1");
    f.deny();
    await expect(f.editor.save(f.loaded.id, "version2", f.abort.signal, false)).rejects.toMatchObject({ name: "NotAllowedError" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { backupFilesystem, backupOwner } from "../fixtures/backup-filesystem";
import { InlineEditorSession } from "../../../src/features/local-folders/services/inline-editor-session";

vi.mock("../../../src/features/local-folders/services/copy-hash", () => ({ createCopyHasher: () => ({ dispose: () => {},
  hash: async (file: File) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
    .map(value => value.toString(16).padStart(2, "0")).join("") }) }));
afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  const fs = backupFilesystem();
  let busy = false;
  let current = true;
  const editor = new InlineEditorSession(() => ({ root: fs.root, vault: fs.vault, owner: backupOwner,
    check: () => { if (!current) throw Error("stale-connection-operation"); } }), () => busy, value => { busy = value; });
  const loaded = await editor.open(["from", "a.txt"], fs.abort.signal);
  return { ...fs, editor, loaded, invalidate: () => { current = false; } };
}
describe("inline editor one preservation and repeated verified saves", () => {
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
    expect(await f.bytes.get("source/from/a.txt")!.text()).toBe("version1");
    f.deny();
    await expect(f.editor.save(f.loaded.id, "version2", f.abort.signal, false)).rejects.toMatchObject({ name: "NotAllowedError" });
  });
});

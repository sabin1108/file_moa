import { z } from "zod";
import { recoveryIdSchema } from "../lib/recovery-vault";
import type { ConnectionOwner, FolderHandle } from "../types";
import { restoreDestinationPath } from "../lib/recovery-restore";

const path = z.array(z.string()).max(32).refine(value => {
  try {
    restoreDestinationPath(value);

    return true;
  } catch {
    return false;
  }
});
const draftSchema = z.strictObject({
  id: recoveryIdSchema,
  flow: z.enum(["copy", "managed", "edit", "restore", "browse"]),
  source: path,
  names: z.array(z.string()).max(100),
  destination: path,
  kind: z.enum(["copy", "move", "trash", "recover"]).optional(),
  archiveId: z.string().max(150).optional(),
  text: z.string().max(2 * 1024 * 1024).optional(),
  interrupted: z.boolean(),
  destinationConfirmed: z.boolean().optional(),
  choosing: z.boolean().optional(),
  pickerPath: path.optional(),
  outcome: z.strictObject({
    id: recoveryIdSchema,
    phase: z.enum(["completed", "cancelled", "error"]),
    status: z.enum(["not-run", "uncertain", "verified"]),
    copied: z.number().int().min(0).max(500),
    removed: z.number().int().min(0).max(500),
    preserved: z.boolean(),
    issue: z.string().max(80).nullable()
  }).optional(),
  restoreOutcome: z.strictObject({
    id: recoveryIdSchema,
    phase: z.enum(["completed", "cancelled", "error"]),
    status: z.enum(["not-run", "uncertain", "verified"]),
    path,
    issue: z.string().max(80).nullable(),
    journalComplete: z.boolean()
  }).optional(),
});

export type WorkflowDraft = z.infer<typeof draftSchema>;

export type EditorCheckpoint = {
  handle: FileSystemFileHandle;
  size: number;
  modified: number;
  sha256: string;
  backupId?: string;
  payload?: string;
};

type StoredDraft = {
  version: 1;
  owner: ConnectionOwner;
  root: FolderHandle;
  value: WorkflowDraft;
  editor?: EditorCheckpoint
};

/** URL에는 ID만 둔다. 파일명/초안/핸들은 이 브라우저의 IndexedDB에만 저장한다. */

export class WorkflowDraftRepository {
  private async open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("moa-workflow-drafts-v1", 1);

      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error("draft-storage-blocked"));
    });
  }
  async write(owner: ConnectionOwner, root: FolderHandle, value: WorkflowDraft, editor?: EditorCheckpoint) {
    const parsed = draftSchema.parse(value);
    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");

        transaction.objectStore("drafts").put(
          { version: 1, owner: { ...owner }, root, value: parsed, editor } satisfies StoredDraft,
          parsed.id
        );
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? Error("draft-storage-failed"));
        transaction.onerror = () => reject(transaction.error);
      });
      // 페이지 이탈 직전의 임시 사본이 최신 DB 초안을 덮지 않도록 정리한다.
      // 저장을 기다리는 동안 더 새 입력이 생겼다면 그 임시 사본은 유지한다.

      if (parsed.flow === "edit") {
        try {
          const key = `moa-editor-emergency-${parsed.id}`;
          const fallback: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");

          if (fallback && typeof fallback === "object" && "text" in fallback && fallback.text === parsed.text) {
            sessionStorage.removeItem(key);
          }
        } catch { /* DB 초안 저장에는 성공했다. */ }
      }
    } finally {
      db.close();
    }
  }
  async read(owner: ConnectionOwner, root: FolderHandle, id: string) {
    if (!recoveryIdSchema.safeParse(id).success) return null;

    const db = await this.open();

    try {
      const raw: unknown = await new Promise((resolve, reject) => {
        const transaction = db.transaction("drafts", "readonly");
        const request = transaction.objectStore("drafts").get(id);

        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });

      if (!raw || typeof raw !== "object" || !("version" in raw) || raw.version !== 1
        || !("owner" in raw)
        || !("root" in raw)
        || !("value" in raw)) return null;

      const stored = raw as StoredDraft;
      const parsed = draftSchema.safeParse(stored.value);

      if (!parsed.success || parsed.data.id !== id || stored.owner?.userId !== owner.userId
        || stored.owner.workspaceId !== owner.workspaceId
        || typeof stored.root?.isSameEntry !== "function"
        || !await root.isSameEntry(stored.root)) return null;

      if (parsed.data.flow === "edit") {
        try {
          const fallback: unknown = JSON.parse(sessionStorage.getItem(`moa-editor-emergency-${id}`) ?? "null");

          if (fallback && typeof fallback === "object" && "text" in fallback && typeof fallback.text === "string"
            && fallback.text.length <= 2 * 1024 * 1024) parsed.data.text = fallback.text;
        } catch { /* IndexedDB에 저장한 초안은 그대로 복원한다. */ }
      }

      return { ...stored, value: parsed.data };
    } finally {
      db.close();
    }
  }
  async remove(id: string) {
    if (!recoveryIdSchema.safeParse(id).success) return;

    try {
      sessionStorage.removeItem(`moa-editor-emergency-${id}`);
    } catch { /* 기기 저장소가 막혀도 DB 삭제를 시도한다. */ }

    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");

        transaction.objectStore("drafts").delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }
}

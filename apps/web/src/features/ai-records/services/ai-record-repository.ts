import { z } from "zod";
import { isRecordId, parseLocalRecord, type LocalRecord } from "@personal-ai/domain";
import { aiRecordPayloadSchema, recordConversationSources, type AiRecordPayload } from "../../../shared/ai-records";
import type { ConnectionOwner } from "../../local-folders/types";
import { decodeRecord, encodeRecord } from "../lib/record-codec";
import { digest, loadLatest, saveRevision } from "./record-store";

export type AiRecordAccess = {
  directory: FileSystemDirectoryHandle;
  owner: ConnectionOwner;
  assertCurrent: () => void
};

export type SavedAiRecord = {
  payload: AiRecordPayload;
  revisionId: string;
  revisions: number
};

const folders = { conversation: "conversations", artifact: "artifacts", memory: "memories", profile: "profiles" } as const;
const manifestSchema = z.strictObject({
  version: z.literal(1),
  owner: z.strictObject({ userId: z.string().min(1), workspaceId: z.string().min(1) })
});
const tombstoneSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().refine(isRecordId),
  deletedAt: z.iso.datetime(),
  cascade: z.boolean().optional()
});
const missing = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

async function readJson(directory: FileSystemDirectoryHandle, name: string) {
  const file = await (await directory.getFileHandle(name)).getFile();

  if (file.size > 16_384) throw new Error("record-metadata-too-large");

  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())) as unknown;
}

async function writeNewJson(directory: FileSystemDirectoryHandle, name: string, value: unknown, assertCurrent: () => void) {
  assertCurrent();

  try {
    await directory.getFileHandle(name);

    throw new Error("record-metadata-exists");
  }
  catch (error) {
    if (!missing(error)) throw error;
  }

  assertCurrent();

  const handle = await directory.getFileHandle(name, { create: true });
  const writer = await handle.createWritable({ mode: "exclusive" } as FileSystemCreateWritableOptions);

  try {
    assertCurrent();
    await writer.write(JSON.stringify(value, null, 2));
    assertCurrent();
    await writer.close();
    assertCurrent();
  } catch (error) {
    await writer.abort().catch(() => undefined);

    throw error;
  }
}

/** Owner-checked revisions inside a dedicated AI directory, never a source-document writer. */

export class AiRecordRepository {
  constructor(private readonly access: () => Promise<AiRecordAccess>) { }

  async initialize() {
    const context = await this.access();

    return navigator.locks.request(`moa-ai-folder:${context.owner.workspaceId}`, async () => {
      context.assertCurrent();

      const directory = await context.directory.getDirectoryHandle(".moa-ai-v1", { create: true });

      try {
        await this.checkOwner(directory, context);
      }
      catch (error) {
        if (!missing(error)) throw error;

        for await (const entry of directory.values()) {
          if (entry) throw new Error("unowned-ai-directory");
        }

        await writeNewJson(directory, "owner.json", { version: 1, owner: context.owner }, context.assertCurrent);
      }
    });
  }

  private async checkOwner(directory: FileSystemDirectoryHandle, context: AiRecordAccess) {
    const manifest = manifestSchema.parse(await readJson(directory, "owner.json"));

    context.assertCurrent();

    if (manifest.owner.userId !== context.owner.userId || manifest.owner.workspaceId !== context.owner.workspaceId) throw new Error("ai-record-owner-mismatch");
  }

  private async root() {
    const context = await this.access();
    const directory = await context.directory.getDirectoryHandle(".moa-ai-v1");

    await this.checkOwner(directory, context);

    return { ...context, root: directory };
  }

  private async assertNotDeleted(root: FileSystemDirectoryHandle, id: string) {
    try {
      const deleted = await root.getDirectoryHandle("deleted");
      const tombstone = tombstoneSchema.parse(await readJson(deleted, `${id}.json`));

      if (tombstone.id !== id) throw new Error("invalid-record-tombstone");

      throw new Error("record-deleted");
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }

  private async assertSourceRetained(root: FileSystemDirectoryHandle, payload: AiRecordPayload) {
    for (const sourceId of recordConversationSources(payload)) try {
      const deleted = await root.getDirectoryHandle("deleted");
      const tombstone = tombstoneSchema.parse(await readJson(deleted, `${sourceId}.json`));

      if (tombstone.id !== sourceId) throw new Error("invalid-record-tombstone");

      if (tombstone.cascade) throw new Error("record-deleted");
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }

  async list(): Promise<SavedAiRecord[]> {
    const context = await this.root();
    const output: SavedAiRecord[] = [];

    for (const type of Object.keys(folders) as (keyof typeof folders)[]) {
      let parent: FileSystemDirectoryHandle;

      try {
        parent = await context.root.getDirectoryHandle(folders[type]);
      }
      catch (error) {
        if (missing(error)) continue;

        throw error;
      }

      for await (const entry of parent.values()) {
        context.assertCurrent();

        if (entry.kind !== "directory" || !isRecordId(entry.name)) continue;

        if (output.length >= 500) throw new Error("record-list-too-large");

        try {
          context.assertCurrent();
          output.push(await this.read(type, entry.name));
          context.assertCurrent();
        }
        catch (error) {
          if (error instanceof Error && error.message === "record-deleted") continue;

          throw error;
        }
      }
    }

    context.assertCurrent();

    return output.sort((a, b) => b.payload.updatedAt.localeCompare(a.payload.updatedAt));
  }

  async read(type: AiRecordPayload["type"], id: string): Promise<SavedAiRecord> {
    if (!isRecordId(id)) throw new Error("invalid-record-id");

    const context = await this.root();

    await this.assertNotDeleted(context.root, id);

    const parent = await context.root.getDirectoryHandle(folders[type]);
    const directory = await parent.getDirectoryHandle(id);
    const loaded = await loadLatest(directory, id, { assertCurrent: context.assertCurrent, maxRevisions: 1000 });

    if (!loaded) throw new Error("record-not-found");

    const payload = decodeRecord(loaded.body, loaded.metadata);

    if (payload.type !== type) throw new Error("record-kind-mismatch");

    context.assertCurrent();

    return { payload, revisionId: loaded.metadata.revisionId, revisions: loaded.revisionCount };
  }

  async save(input: AiRecordPayload, parentRevisionId: string | null): Promise<SavedAiRecord> {
    const payload = aiRecordPayloadSchema.parse(input);
    const context = await this.root();

    if (payload.type === "artifact" && payload.wiki) {
      for (const evidence of [payload.wiki.evidence, payload.wiki.proposal?.evidence]) {
        if (evidence && (evidence.owner.userId !== context.owner.userId || evidence.owner.workspaceId !== context.owner.workspaceId)) throw new Error("ai-record-owner-mismatch");
      }
    }

    await this.assertNotDeleted(context.root, payload.id);
    await this.assertSourceRetained(context.root, payload);

    const parent = await context.root.getDirectoryHandle(folders[payload.type], { create: true });

    context.assertCurrent();

    const directory = await parent.getDirectoryHandle(payload.id, { create: true });
    const state = payload.type === "conversation" ? "draft" : payload.type === "profile" ? "approved" : payload.status;
    const write = () => saveRevision(directory, {
      recordId: payload.id,
      revisionId: `rev-${crypto.randomUUID()}`,
      parentRevisionId,
      kind: payload.type === "profile" ? "memory" : payload.type,
      scope: payload.type === "memory" ? payload.scope : { type: "global" },
      state,
      createdAt: payload.updatedAt,
    }, encodeRecord(payload), {
      assertCurrent: context.assertCurrent,
      maxRevisions: 1000,
      beforeWrite: async () => {
        await this.assertNotDeleted(context.root, payload.id);
        await this.assertSourceRetained(context.root, payload);
      },
    });
    const sourceIds = recordConversationSources(payload).sort();

    if (sourceIds.includes(payload.id)) throw new Error("invalid-source-record");

    let lockedWrite = write;

    for (const sourceId of [...sourceIds].reverse()) {
      const next = lockedWrite;

      lockedWrite = async () => await navigator.locks.request(`moa-record-save:${sourceId}`, next);
    }

    const metadata = await lockedWrite();

    if (!metadata) throw new Error("record-write-not-verified");

    return { payload, revisionId: metadata.metadata.revisionId, revisions: metadata.revisionCount };
  }

  async remove(type: AiRecordPayload["type"], id: string, cascade = false) {
    if (!isRecordId(id)) throw new Error("invalid-record-id");

    const context = await this.root();

    await navigator.locks.request(`moa-record-save:${id}`, async () => {
      context.assertCurrent();

      const deleted = await context.root.getDirectoryHandle("deleted", { create: true });

      try {
        await writeNewJson(
          deleted,
          `${id}.json`,
          { version: 1, id, deletedAt: new Date().toISOString(), cascade },
          context.assertCurrent
        );
      }
      catch (error) {
        if (!(error instanceof Error && error.message === "record-metadata-exists")) throw error;
      }

      try {
        const parent = await context.root.getDirectoryHandle(folders[type]);

        context.assertCurrent();
        await parent.removeEntry(id, { recursive: true });
      } catch (error) {
        if (!missing(error)) throw error;
      }

      context.assertCurrent();
    });
  }

  async revisions(type: AiRecordPayload["type"], id: string): Promise<{
    metadata: LocalRecord;
    payload: AiRecordPayload
  }[]> {
    if (!isRecordId(id)) throw new Error("invalid-record-id");

    const context = await this.root();

    await this.assertNotDeleted(context.root, id);

    const parent = await context.root.getDirectoryHandle(folders[type]);
    const directory = await parent.getDirectoryHandle(id);

    await loadLatest(directory, id, { assertCurrent: context.assertCurrent, maxRevisions: 1000 });

    const result = [];

    for await (const entry of directory.values()) {
      context.assertCurrent();

      if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;

      const metadata = parseLocalRecord(await readJson(directory, entry.name));

      if (metadata.recordId !== id || entry.name !== `${metadata.revisionId}.json`) throw new Error("record-identity-mismatch");

      const file = await (await directory.getFileHandle(metadata.contentFile)).getFile();

      if (file.size > 2 * 1024 * 1024) throw new Error("record-too-large");

      const body = await file.text();

      if (await digest(body) !== metadata.contentSha256) throw new Error("content-hash-mismatch");

      const payload = decodeRecord(body, metadata);

      context.assertCurrent();

      if (payload.type !== type || payload.id !== id) throw new Error("record-kind-mismatch");

      result.push({ metadata, payload });
    }

    return result.sort((a, b) => b.metadata.createdAt.localeCompare(a.metadata.createdAt));
  }
}

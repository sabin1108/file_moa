import { beforeEach, expect, it, vi } from "vitest";

const repository = { list: vi.fn(), initialize: vi.fn(), remove: vi.fn(), resumeDelete: vi.fn(), save: vi.fn(), revisions: vi.fn() };

import { AiRecordsController } from "../../src/features/ai-records/ai-records-controller";
import type { AiRecordListResult, SavedAiRecord } from "../../src/features/ai-records/storage/ai-record-repository";

const payload = {
  id: "same-record",
  type: "artifact",
  title: "A의 기록",
  markdown: "합성 본문",
  status: "draft",
  sourceConversationId: null,
  updatedAt: "2026-11-09T00:00:00.000Z"
} as const;

const listing = (records: SavedAiRecord[], pendingDeletes: AiRecordListResult["pendingDeletes"] = []): AiRecordListResult => ({
  records,
  unreadable: [],
  pendingDeletes,
  overLimit: false,
  conflicts: []
});
const record = { payload, revisionId: "revision-a", revisions: 1 };

function setup() {
  let folder = "A";
  const session = {
    aiRecordAccess: vi.fn(),
    view: () => ({ status: "connected", folderName: folder }),
    select: vi.fn(async () => {
      folder = "B";
    }),
    reconnect: vi.fn(),
    disconnect: vi.fn()
  };
  const controller = new AiRecordsController(
    session as unknown as ConstructorParameters<typeof AiRecordsController>[0],
    vi.fn(),
    repository
  );

  return { controller, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.initialize.mockResolvedValue(undefined);
  repository.list.mockResolvedValue(listing([record]));
  repository.remove.mockResolvedValue(undefined);
  repository.resumeDelete.mockReset().mockResolvedValue(undefined);
});

it("loads and saves through the injected storage without constructing a browser repository", async () => {
  const { controller } = setup();

  await controller.load();

  const saved = { payload, revisionId: "revision-next", revisions: 2 };

  repository.save.mockResolvedValue(saved);
  expect(await controller.save(payload)).toBe(saved);
  expect(repository.save).toHaveBeenCalledWith(payload, "revision-a");
  expect(controller.getSnapshot().records).toEqual([saved]);
});

it("rejects a deletion confirmed in A after switching to B with the same record id", async () => {
  const { controller } = setup();

  await controller.load();

  const confirmation = controller.getConnectionRevision();

  repository.list.mockResolvedValue(listing([{ payload: { ...payload, title: "B의 같은 ID 기록" }, revisionId: "revision-b", revisions: 1 }]));
  await controller.connect();
  await expect(controller.remove(payload.id, true, confirmation)).rejects.toThrow("stale-record-confirmation");
  expect(repository.remove).not.toHaveBeenCalled();
  expect(controller.getSnapshot().records[0].payload.title).toBe("B의 같은 ID 기록");
});

it("clears published storage state before an asynchronous disconnect and stays disconnected on failure", async () => {
  const { controller, session } = setup();

  await controller.load();

  let fail!: (error: Error) => void;

  session.disconnect.mockReturnValue(new Promise((_resolve, reject) => {
    fail = reject;
  }));

  const work = controller.disconnect();

  expect(controller.getSnapshot()).toMatchObject({ phase: "disconnected", records: [], folderName: null });
  fail(new Error("fixture removal failure"));
  await expect(work).rejects.toThrow("fixture removal failure");
  expect(controller.getSnapshot()).toMatchObject({ phase: "disconnected", records: [], folderName: null });
  expect(controller.getSnapshot().notice).toBeTruthy();
});

it("publishes healthy records with an unreadable-record warning", async () => {
  const { controller } = setup();

  repository.list.mockResolvedValue({ ...listing([record]), unreadable: [{ type: "artifact", id: "broken-record" }] });
  await controller.load();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", records: [record], pending: false });
  expect(controller.getSnapshot().notice).toContain("1개");
  expect(controller.getSnapshot().notice).toContain("읽지 못한");
});

it("keeps an overflow recovery listing ready and warns that new records cannot be created", async () => {
  const { controller } = setup();

  repository.list.mockResolvedValue({ ...listing([record]), overLimit: true });
  await controller.load();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", records: [record] });
  expect(controller.getSnapshot().notice).toContain("500");
});

it("keeps ID conflicts visible as a preservation warning and never resumes them", async () => {
  const { controller } = setup();

  repository.list.mockResolvedValue({ ...listing([record]), conflicts: [{ type: "artifact", id: "same-id" }, { type: "conversation", id: "same-id" }] });
  await controller.load();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", records: [record] });
  expect(controller.getSnapshot().notice).toContain("충돌");
  expect(repository.resumeDelete).not.toHaveBeenCalled();
});

it("continues physical cleanup after a committed delete fails, while notifying the caller once", async () => {
  const { controller } = setup();
  await controller.load();
  const committed = vi.fn();
  repository.remove.mockImplementationOnce(async (_type, _id, _cascade, onCommitted) => {
    onCommitted?.();
    throw new Error("physical cleanup failed");
  });
  repository.list.mockResolvedValueOnce(listing([], [{ type: record.payload.type, id: record.payload.id }])).mockResolvedValueOnce(listing([]));

  await controller.remove(record.payload.id, false, controller.getConnectionRevision(), committed);
  expect(committed).toHaveBeenCalledOnce();
  expect(repository.resumeDelete).toHaveBeenCalledOnce();
});

it("ignores a delete callback from an invalidated connection", async () => {
  const { controller } = setup();
  await controller.load();
  const committed = vi.fn();
  repository.remove.mockImplementationOnce(async (_type, _id, _cascade, onCommitted) => {
    controller.stop();
    onCommitted?.();
  });

  await controller.remove(record.payload.id, false, controller.getConnectionRevision(), committed);
  expect(committed).not.toHaveBeenCalled();
});

it("does not report commitment when deletion fails before the marker exists", async () => {
  const { controller } = setup();
  const committed = vi.fn();

  await controller.load();
  repository.remove.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
  await expect(controller.remove(payload.id, false, controller.getConnectionRevision(), committed)).rejects.toThrow();
  expect(committed).not.toHaveBeenCalled();
  expect(controller.getSnapshot().records).toEqual([record]);
});

it("keeps an unresolved storage warning after autosave and clears it only after a clean reread", async () => {
  const { controller } = setup();
  const unreadable = [{ type: "artifact" as const, id: "broken-record" }];

  repository.list.mockResolvedValue({ ...listing([record]), unreadable });
  await controller.load();

  const warning = controller.getSnapshot().notice;
  const saved = { ...record, revisionId: "revision-next", revisions: 2 };

  repository.save.mockResolvedValue(saved);
  await controller.save(payload);
  expect(controller.getSnapshot().records).toEqual([saved]);
  expect(controller.getSnapshot().notice).toBe(warning);
  expect(unreadable).toEqual([{ type: "artifact", id: "broken-record" }]);
  expect(repository.list).toHaveBeenCalledOnce();

  repository.list.mockResolvedValue(listing([saved]));
  await controller.load();
  expect(controller.getSnapshot().notice).toBeNull();
  await controller.save(payload);
  expect(controller.getSnapshot().notice).toBeNull();
});

it("clears a transient save error after a successful retry when storage has no warning", async () => {
  const { controller } = setup();

  await controller.load();
  repository.save.mockRejectedValueOnce(new Error("fixture-save-failure"));
  await expect(controller.save(payload)).rejects.toThrow("fixture-save-failure");
  expect(controller.getSnapshot().notice).toBeTruthy();

  const saved = { ...record, revisionId: "revision-retry", revisions: 2 };

  repository.save.mockResolvedValue(saved);
  await controller.save(payload);
  expect(controller.getSnapshot().records).toEqual([saved]);
  expect(controller.getSnapshot().notice).toBeNull();
});

it("keeps the current storage warning when choosing another folder is cancelled", async () => {
  const { controller, session } = setup();

  repository.list.mockResolvedValue({ ...listing([record]), unreadable: [{ type: "artifact", id: "broken-record" }] });
  await controller.load();

  const warning = controller.getSnapshot().notice;

  session.select.mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
  await controller.connect();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", records: [record], pending: false, notice: warning });
});

it("retries derived deletion after the parent has already left the visible list", async () => {
  const { controller } = setup();
  const parent: SavedAiRecord = {
    payload: { type: "conversation", id: "chat-parent", title: "대화", updatedAt: payload.updatedAt, draft: "", projectId: null, turns: [] },
    revisionId: "revision-parent",
    revisions: 1
  };
  const pending = { type: "artifact" as const, id: "derived-record", sourceId: parent.payload.id };
  let parentExists = true;
  let derivedExists = true;
  let fail = true;

  repository.list.mockImplementation(async () => listing(
    parentExists ? [parent, record] : [record],
    !parentExists && derivedExists ? [pending] : []
  ));
  repository.remove.mockImplementation(async () => {
    parentExists = false;
  });
  repository.resumeDelete.mockImplementation(async () => {
    if (fail) throw new Error("fixture-derived-remove");

    derivedExists = false;
  });
  await controller.load();

  const revision = controller.getConnectionRevision();

  await expect(controller.remove(parent.payload.id, true, revision)).rejects.toThrow("record-delete-incomplete");
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", records: [record], pending: false });
  expect(controller.getSnapshot().notice).toContain("삭제");
  fail = false;
  await controller.remove(parent.payload.id, true, revision);
  expect(repository.resumeDelete).toHaveBeenCalledTimes(2);
  expect(repository.remove).toHaveBeenCalledTimes(1);
  expect(derivedExists).toBe(false);
  expect(controller.getSnapshot().notice).toBeNull();
});

it("resumes persisted deletion on a new controller after reconnect, without hiding healthy records on a failure", async () => {
  const pending = { type: "artifact" as const, id: "derived-record", sourceId: "chat-parent" };
  let remaining = true;

  repository.list.mockImplementation(async () => listing([record], remaining ? [pending] : []));
  repository.resumeDelete.mockRejectedValueOnce(new DOMException("write permission denied", "NotAllowedError"));

  const first = setup();

  await first.controller.load();
  expect(first.controller.getSnapshot()).toMatchObject({ phase: "ready", records: [record], pending: false });
  expect(first.controller.getSnapshot().notice).toContain("삭제");

  repository.resumeDelete.mockImplementation(async () => {
    remaining = false;
  });

  const second = setup();

  await second.controller.reconnect();
  expect(second.session.reconnect).toHaveBeenCalledOnce();
  expect(second.controller.getSnapshot()).toMatchObject({ phase: "ready", records: [record], notice: null });
  expect(remaining).toBe(false);
});

it("does not continue pending deletion after the active connection stops", async () => {
  const { controller } = setup();
  let finish!: () => void;

  repository.list.mockResolvedValue(listing([record], [
    { type: "artifact", id: "first", sourceId: "chat-parent" },
    { type: "artifact", id: "second", sourceId: "chat-parent" }
  ]));
  repository.resumeDelete.mockImplementationOnce(() => new Promise<void>(resolve => {
    finish = resolve;
  }));

  const work = controller.load();

  await vi.waitFor(() => expect(repository.resumeDelete).toHaveBeenCalledOnce());
  controller.stop();
  finish();
  await work;
  expect(repository.resumeDelete).toHaveBeenCalledOnce();
  expect(controller.getSnapshot()).toMatchObject({ phase: "disconnected", records: [] });
});

it("clears protected records if ownership validation fails while refreshing after deletion", async () => {
  const { controller } = setup();

  await controller.load();
  repository.list.mockRejectedValueOnce(new Error("ai-record-owner-mismatch"));
  await expect(controller.remove(payload.id, false, controller.getConnectionRevision())).rejects.toThrow("ai-record-owner-mismatch");
  expect(controller.getSnapshot()).toMatchObject({ phase: "error", records: [] });
});

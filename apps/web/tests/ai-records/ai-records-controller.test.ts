import { beforeEach, expect, it, vi } from "vitest";

const repository = { list: vi.fn(), initialize: vi.fn(), remove: vi.fn(), save: vi.fn(), revisions: vi.fn() };

import { AiRecordsController } from "../../src/features/ai-records/store/ai-records-controller";

const payload = {
  id: "same-record",
  type: "artifact",
  title: "A의 기록",
  markdown: "합성 본문",
  status: "draft",
  sourceConversationId: null,
  updatedAt: "2026-11-09T00:00:00.000Z"
} as const;

function setup() {
  let folder = "A";
  const session = {
    aiRecordAccess: vi.fn(),
    view: () => ({ status: "connected", folderName: folder }),
    select: vi.fn(async () => {
      folder = "B";
    }),
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
  repository.list.mockResolvedValue([{ payload, revisionId: "revision-a", revisions: 1 }]);
  repository.remove.mockResolvedValue(undefined);
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

  repository.list.mockResolvedValue([{ payload: { ...payload, title: "B의 같은 ID 기록" }, revisionId: "revision-b", revisions: 1 }]);
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

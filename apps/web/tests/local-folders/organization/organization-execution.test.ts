import { expect, it, vi } from "vitest";
import { OrganizationPreparationController } from "../../../src/features/local-folders/organization/organization-preparation-controller";
import { OrganizationExecutionController } from "../../../src/features/local-folders/organization/organization-execution-controller";
import type { FolderConnectionSession } from "../../../src/features/local-folders/connection-session";

const document = {
  id: "document-1",
  name: "a.md",
  path: ["회사", "a.md"],
  excerpt: "성능 결과를 확인했습니다",
  size: 30,
  lastModified: 42,
  sha256: "a".repeat(64),
  excerptHash: "b".repeat(64)
};

async function setup() {
  const source = new OrganizationPreparationController(
    async () => ({
      documents: [document],
      excluded: [],
      complete: true,
      limits: [],
      bytes: 30,
      directories: 1,
      discoveredFiles: 1
    }),
    vi.fn(),
    vi.fn(),
    async () => ({ userId: "A", workspaceId: "A" })
  );

  source.update({ request: "성능 정리", scope: { kind: "all" } });
  await source.prepare();
  source.consent(true);
  await source.send(async () => ({
    ok: true,
    organization: {
      summary: "제안",
      matches: [
        { documentId: document.id, destination: ["성능"], evidence: document.excerpt, date: null }
      ],
      held: []
    },
    questions: [],
    model: "fixture",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
  }));

  const session = {
    readManagedDestination: vi.fn(),
    openManagedEditor: vi.fn(),
    prepareManaged: vi.fn(),
    prepareOrganizationManaged: vi.fn(async () => ({
      id: "fixture",
      kind: "copy",
      roots: [document.path],
      destination: ["정리", "성능"],
      files: 1,
      folders: 0,
      bytes: 30,
      paths: [["정리", "성능", document.name]],
      skipped: false
    })),
    executeManaged: vi.fn<FolderConnectionSession["executeManaged"]>(async () => ({
      id: "fixture",
      phase: "completed",
      status: "verified",
      copied: 1,
      removed: 0,
      preserved: true,
      issue: null
    })),
    readManagedArchives: vi.fn(),
    discardManaged: vi.fn()
  };
  const controller = new OrganizationExecutionController(
    source,
    session as unknown as FolderConnectionSession
  );

  return { source, session, controller };
}

it("requires operation and base confirmation, then reuses the managed review and explicit execution", async () => {
  const { controller, session } = await setup();

  controller.review();
  expect(controller.getSnapshot().batches).toHaveLength(0);
  controller.setOperation("copy");
  controller.setBase(["정리"]);
  controller.review();
  expect(session.prepareOrganizationManaged).not.toHaveBeenCalled();
  await controller.openBatch(controller.getSnapshot().batches[0].key);
  await controller.managed.review();
  expect(session.prepareOrganizationManaged).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "copy" }),
    [document],
    expect.any(String),
    expect.any(AbortSignal)
  );
  expect(session.executeManaged).not.toHaveBeenCalled();
  await controller.managed.start();
  expect(controller.getSnapshot().outcomes[0].result.phase).toBe("completed");
  await controller.openBatch(controller.getSnapshot().batches[0].key);
  expect(session.executeManaged).toHaveBeenCalledOnce();
});
it("invalidates the reviewed plan on condition changes and cannot run an old prepared approval", async () => {
  const { controller, source, session } = await setup();

  controller.setOperation("move");
  controller.setBase([]);
  controller.review();
  await controller.openBatch(controller.getSnapshot().batches[0].key);
  await controller.managed.review();
  source.update({ basis: "다른 기준" });
  await controller.managed.start();
  expect(session.executeManaged).not.toHaveBeenCalled();
  expect(controller.getSnapshot().batches).toHaveLength(0);
});

it("retains failed outcomes but blocks every old batch after an execution detects changed source", async () => {
  const { controller, session } = await setup();

  session.executeManaged.mockResolvedValueOnce({
    id: "fixture",
    phase: "error",
    status: "not-run",
    copied: 0,
    removed: 0,
    preserved: false,
    issue: "managed-changed"
  });
  controller.setOperation("copy");
  controller.setBase([]);
  controller.review();

  const key = controller.getSnapshot().batches[0].key;

  await controller.openBatch(key);
  await controller.managed.review();
  await controller.managed.start();
  expect(controller.getSnapshot()).toMatchObject({
    stale: true,
    outcomes: [{ result: { phase: "error" } }]
  });
  controller.setOperation("move");
  controller.review();
  expect(controller.getSnapshot()).toMatchObject({
    stale: true,
    outcomes: [{ result: { phase: "error" } }]
  });
  expect(session.executeManaged).toHaveBeenCalledOnce();
});

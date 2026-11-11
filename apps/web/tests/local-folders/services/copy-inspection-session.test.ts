import { describe, expect, it, vi } from "vitest";
import { FolderConnectionSession } from "../../../src/features/local-folders/services/connection-session";
import { inspectCopyPlan } from "../../../src/features/local-folders/services/copy-inspection";
import type { CopyInspection } from "../../../src/features/local-folders/lib/copy-inspection";
import type { FileChangePlan } from "../../../src/features/local-folders/lib/file-change-plan";
import type { FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";

vi.mock(
  "../../../src/features/local-folders/services/copy-inspection",
  () => ({ inspectCopyPlan: vi.fn() })
);

const plan: FileChangePlan = { operation: "copy", rows: [], conflictCount: 0, directoriesToCreate: [] };
const result: CopyInspection = { files: [], totalBytes: 0 };

async function setup() {
  const repository: HandleRepository = { read: vi.fn(), write: vi.fn(), remove: vi.fn() };
  const session = new FolderConnectionSession(repository);
  const root = {
    name: "fixture",
    kind: "directory",
    queryPermission: async () => "granted",
    requestPermission: vi.fn(async () => "granted")
  } as unknown as FolderHandle;

  await session.switchOwner({ userId: "A", workspaceId: "fixture" });
  await session.select("source", async () => root);
  vi.mocked(inspectCopyPlan).mockReset();

  return session;
}

describe("copy inspection connection boundary", () => {
  it("INSPECT-005 does not return a late result after owner replacement or disconnect", async () => {
    for (const disconnect of [false, true]) {
      const session = await setup();
      let finish!: (result: CopyInspection) => void;

      vi.mocked(inspectCopyPlan).mockImplementationOnce(() => new Promise(resolve => {
        finish = resolve;
      }));

      const pending = session.inspectSourceCopy(plan);

      if (disconnect) await session.disconnect("source"); else await session.switchOwner({ userId: "B", workspaceId: "fixture" });

      finish(result);
      await expect(pending).rejects.toThrow("stale-connection-operation");
    }
  });
  it("INSPECT-005 current permission failure revokes connection but old failure cannot", async () => {
    const session = await setup();

    vi.mocked(inspectCopyPlan).mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await expect(session.inspectSourceCopy(plan)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(session.state("source")).toBe("needs-permission");

    const current = await setup();
    let fail!: (error: Error) => void;

    vi.mocked(inspectCopyPlan).mockImplementationOnce(() => new Promise((_, reject) => {
      fail = reject;
    }));

    const pending = current.inspectSourceCopy(plan);

    await current.reconnect("source");
    fail(new DOMException("old", "NotAllowedError"));
    await expect(pending).rejects.toThrow("stale-connection-operation");
    expect(current.state("source")).toBe("connected");
  });
});

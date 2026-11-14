import { describe, expect, it, vi } from "vitest";
import { OrganizationPreparationController } from "../../../src/features/local-folders/organization/organization-preparation-controller";
import type { SourceSnapshot } from "../../../src/features/local-folders/organization/source-snapshot-rules";
import type { LiveOrganizationAction } from "../../../src/shared/live-organization";

const snapshot: SourceSnapshot = {
  documents: [
    {
      id: "document-1",
      name: "memo.md",
      path: ["memo.md"],
      excerpt: "성능 실측 결과입니다.",
      sha256: "a".repeat(64),
      excerptHash: "b".repeat(64),
      size: 30,
      lastModified: 42
    }
  ],
  excluded: [],
  complete: true,
  limits: [],
  discoveredFiles: 1,
  directories: 1,
  bytes: 30
};
const response = {
  ok: true as const,
  organization: { summary: "검토 제안입니다", matches: [], held: [] },
  model: "fixture",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
};

async function prepared() {
  // The session recheck replaces only disk/owner access; the actual controller lifecycle runs.
  const recheck = vi.fn(async () => ({ userId: "A", workspaceId: "workspace-A" }));
  const controller = new OrganizationPreparationController(
    vi.fn(async () => snapshot),
    vi.fn(),
    vi.fn(),
    recheck
  );

  controller.update({ request: "성능 자료 정리", scope: { kind: "all" } });
  await controller.prepare();

  return { controller, recheck, action: vi.fn<LiveOrganizationAction>(async () => response) };
}

describe("LT-T07/08/10: explicit live transfer lifecycle", () => {
  it("stores answers without an automatic request and invalidates the old proposal/consent", async () => {
    const { controller, action } = await prepared();

    action.mockResolvedValueOnce({
      ...response,
      organization: {
        summary: "확인 필요",
        matches: [],
        held: [{ documentId: "document-1", reason: "혼합 자료입니다" }]
      },
      questions: [
        {
          id: "document-1:destination",
          documentId: "document-1",
          kind: "destination",
          reason: "혼합 자료입니다",
          dates: []
        }
      ]
    });
    controller.consent(true);
    await controller.send(action);
    controller.consent(true);
    expect(controller.getSnapshot().consentKey).toBeNull();
    controller.answer({ documentId: "document-1", destination: ["성능"] });
    expect(controller.getSnapshot()).toMatchObject({
      result: null,
      consentKey: null,
      phase: "ready"
    });
    expect(action).toHaveBeenCalledOnce();
    controller.consent(true);
    await controller.send(action);
    expect(action.mock.calls[1][0].answers).toEqual([
      { documentId: "document-1", destination: ["성능"] }
    ]);
    controller.update({ basis: "다른 기준" });
    expect(controller.getSnapshot().answers).toEqual([]);
  });

  it("applies only unambiguous inferred fields and preserves explicit cleared conditions", async () => {
    const infer = vi.fn(async () => ({
      scope: { kind: "folder" as const, path: ["회사"] },
      reference: ["보고서"]
    }));
    const read = vi.fn(async () => snapshot);
    const controller = new OrganizationPreparationController(
      read,
      vi.fn(),
      vi.fn(),
      undefined,
      infer
    );

    controller.update({ request: "회사에서 보고서 기준으로", reference: null });
    await controller.prepare();
    expect(controller.getSnapshot()).toMatchObject({
      scope: { kind: "folder", path: ["회사"] },
      reference: null
    });
    controller.update({ request: "다른 범위 요청" });
    expect(controller.getSnapshot().scope).toBeNull();
    controller.update({ scope: { kind: "all" } });
    await controller.prepare();
    expect(controller.getSnapshot().scope).toEqual({ kind: "all" });
  });

  it("does not recheck or transmit without consent and never auto-transmits on consent", async () => {
    const { controller, recheck, action } = await prepared();

    await controller.send(action);
    expect(recheck).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    controller.consent(true);
    expect(action).not.toHaveBeenCalled();
    await controller.send(action);
    expect(recheck).toHaveBeenCalledWith(
      snapshot.documents,
      expect.any(String),
      expect.any(AbortSignal)
    );
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0][0]).toMatchObject({
      owner: { userId: "A", workspaceId: "workspace-A" },
      documents: snapshot.documents
    });
    expect(controller.getSnapshot()).toMatchObject({
      phase: "review",
      consentKey: null,
      result: response
    });
    await controller.send(action);
    expect(action).toHaveBeenCalledOnce();
  });

  it("invalidates the snapshot and consent when the original or permission changed", async () => {
    const { controller, recheck, action } = await prepared();

    controller.consent(true);
    recheck.mockRejectedValueOnce(Error("source-changed"));
    await controller.send(action);
    expect(action).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      phase: "error",
      snapshot: null,
      consentKey: null,
      result: null
    });
  });

  it.each(["cancel", "conditions", "selection", "consent", "partial", "reset"])(
    "discards late rechecks after %s before any action",
    async change => {
      const { controller, recheck, action } = await prepared();
      let done!: (value: {
        userId: string;
        workspaceId: string
      }) => void;

      recheck.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            done = resolve;
          })
      );
      controller.consent(true);

      const pending = controller.send(action);

      if (change === "conditions") controller.update({ basis: "다른 기준" });

      if (change === "selection") controller.toggleDocument("document-1");

      if (change === "consent") controller.consent(false);

      if (change === "partial") controller.acceptPartial(false);

      if (change === "cancel") controller.cancel();

      if (change === "reset") controller.reset();

      done({ userId: "A", workspaceId: "workspace-A" });
      await pending;
      expect(action).not.toHaveBeenCalled();
      expect(controller.getSnapshot().result).toBeNull();
    }
  );

  it("allows one in-flight request and ignores its late reply after cancel", async () => {
    const { controller, action } = await prepared();
    let done!: (value: typeof response) => void;

    action.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          done = resolve;
        })
    );
    controller.consent(true);

    const pending = controller.send(action);

    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
    await controller.send(action);
    controller.cancel();
    done(response);
    await pending;
    expect(action).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().result).toBeNull();
    expect(controller.getSnapshot().issue).toContain("사용량");
  });

  it("does not retry errors, and requires a new consent and new explicit request", async () => {
    const { controller, action } = await prepared();

    action.mockRejectedValueOnce(Error("lost response"));
    controller.consent(true);
    await controller.send(action);
    await controller.send(action);
    expect(action).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      phase: "ready",
      consentKey: null,
      result: null
    });
    controller.consent(true);
    await controller.send(action);
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[0][0].requestId).not.toBe(action.mock.calls[1][0].requestId);
    controller.reset();
    expect(controller.getSnapshot()).toMatchObject({ request: "", snapshot: null, result: null });
  });

  it("clears private drafts, excerpts and consent if the server reports a changed or expired session", async () => {
    const { controller, action } = await prepared();

    action.mockResolvedValueOnce({ ok: false, code: "session" });
    controller.consent(true);
    await controller.send(action);
    expect(controller.getSnapshot()).toMatchObject({
      request: "",
      snapshot: null,
      consentKey: null,
      result: null
    });
    expect(controller.getSnapshot().issue).toContain("로그인");
  });
});

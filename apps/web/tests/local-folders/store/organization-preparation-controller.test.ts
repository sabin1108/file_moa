import { describe, expect, it, vi } from "vitest";
import { OrganizationPreparationController } from "../../../src/features/local-folders/store/organization-preparation-controller";
import type { SourceSnapshot } from "../../../src/features/local-folders/lib/source-snapshot";

function snapshot(complete = true): SourceSnapshot {
  return {
    documents: [
      {
        id: "document-1",
        name: "memo.md",
        path: ["회사", "memo.md"],
        excerpt: "성능 보고",
        size: 10,
        lastModified: 42,
        sha256: "a".repeat(64),
        excerptHash: "b".repeat(64)
      }
    ],
    excluded: [],
    complete,
    limits: complete ? [] : ["listing-limit"],
    discoveredFiles: 1,
    directories: 1,
    bytes: 10
  };
}

describe("local organization preparation and consent", () => {
  it("asks for scope before reading and keeps reference/destination independent", async () => {
    const read = vi.fn(async () => snapshot());
    const controller = new OrganizationPreparationController(read, vi.fn());

    controller.update({ request: "회사 전체에서 보고서 폴더 기준으로 정리" });
    await controller.prepare();
    expect(controller.getSnapshot().phase).toBe("scope");
    expect(read).not.toHaveBeenCalled();
    controller.update({ scope: { kind: "all" }, reference: ["보고서"], destination: ["정리"] });
    await controller.prepare();
    expect(read).toHaveBeenCalledWith(
      { kind: "all" },
      expect.any(String),
      expect.any(AbortSignal),
      ["보고서"]
    );
    expect(controller.getSnapshot()).toMatchObject({
      scope: { kind: "all" },
      reference: ["보고서"],
      destination: ["정리"],
      phase: "ready",
      consentKey: null
    });
  });

  it("binds consent to the actual preview and invalidates it on every relevant condition change", async () => {
    for (const change of [
      { request: "다른 요청" },
      { basis: "보고일 기준" },
      { reference: ["다른 기준"] },
      { destination: ["다른 목적지"] },
      { scope: { kind: "folder" as const, path: ["회사"] } }
    ]) {
      const controller = new OrganizationPreparationController(
        vi.fn(async () => snapshot()),
        vi.fn()
      );

      controller.update({ request: "성능 보고", scope: { kind: "all" } });
      await controller.prepare();
      controller.consent(true);
      expect(controller.getSnapshot().consentKey).toBeTruthy();
      controller.update(change);
      expect(controller.getSnapshot().consentKey).toBeNull();
      expect(controller.getSnapshot().snapshot).toBeNull();
    }
  });

  it("requires explicit acknowledgement for partial scope and revokes consent on document exclusion", async () => {
    const controller = new OrganizationPreparationController(
      vi.fn(async () => snapshot(false)),
      vi.fn()
    );

    controller.update({ request: "성능 보고", scope: { kind: "all" } });
    await controller.prepare();
    controller.consent(true);
    expect(controller.getSnapshot().consentKey).toBeNull();
    controller.acceptPartial(true);
    controller.consent(true);
    expect(controller.getSnapshot().consentKey).toBeTruthy();
    controller.toggleDocument("document-1");
    expect(controller.getSnapshot().consentKey).toBeNull();
  });

  it("never publishes an old response after cancel, condition change or owner/connection reset", async () => {
    for (const action of ["cancel", "update", "reset"] as const) {
      let resolve!: (value: SourceSnapshot) => void;
      const read = vi.fn(
        () =>
          new Promise<SourceSnapshot>(done => {
            resolve = done;
          })
      );
      const controller = new OrganizationPreparationController(read, vi.fn());

      controller.update({ request: "성능 보고", scope: { kind: "all" } });

      const pending = controller.prepare();

      if (action === "update") controller.update({ basis: "다른 기준" });
      else controller[action]();

      resolve(snapshot());
      await pending;
      expect(controller.getSnapshot().snapshot).toBeNull();
      expect(controller.getSnapshot().consentKey).toBeNull();

      if (action === "reset") expect(controller.getSnapshot().request).toBe("");
    }
  });

  it("re-reading a changed version cannot retain previous consent and errors are not empty success", async () => {
    const read = vi.fn(async () => snapshot());
    const controller = new OrganizationPreparationController(read, vi.fn());

    controller.update({ request: "성능 보고", scope: { kind: "all" } });
    await controller.prepare();
    controller.consent(true);
    read.mockRejectedValueOnce(Error("read-failed"));
    await controller.prepare();
    expect(controller.getSnapshot()).toMatchObject({
      phase: "error",
      snapshot: null,
      consentKey: null
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { createDemoVisitor, DEMO_VISITOR_COOKIE } from "../../../src/server/demo/demo-access";
import { createSampleSession, SAMPLE_COOKIE } from "../../../src/server/demo/sample-session";
import { getSampleCatalog, getSampleAsset, getSamplePageAsset } from "../../../src/server/demo/sample-catalog";
import { GET as start } from "../../../src/app/demo/start/route";
import { GET as asset } from "../../../src/app/demo/assets/[documentId]/route";
import { createSampleState, sampleChangePlan, transitionSampleState } from "../../../src/features/sample-workspace/sample-state";

vi.mock("server-only", () => ({}));

const { cookie } = vi.hoisted(() => ({ cookie: { value: undefined as string | undefined, visitor: undefined as string | undefined } }));

vi.mock(
  "next/headers",
  () => ({ cookies: async () => ({ get: (name: string) => {
    const value = name === DEMO_VISITOR_COOKIE ? cookie.visitor : cookie.value;
    return value ? { value } : undefined;
  } }) })
);
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "sample-route-fixture-secret-with-at-least-32-characters");
  vi.stubEnv("DEMO_ACCESS_TOKEN", "a".repeat(64));
  cookie.visitor = createDemoVisitor().token;
  cookie.value = undefined;
});
afterEach(() => vi.unstubAllEnvs());

function sampleRequest(url: string, options?: { headers: Record<string, string> }) {
  const headers = new Headers(options?.headers);
  headers.set("cookie", `${DEMO_VISITOR_COOKIE}=${cookie.visitor}; ${headers.get("cookie") ?? ""}`);
  return new NextRequest(url, { headers });
}

describe("public sample routes keep their own scope", () => {
  it("independently denies start and assets without an invitation, even with a valid sample session", async () => {
    cookie.value = createSampleSession().token;
    cookie.visitor = undefined;
    const headers = { cookie: `${SAMPLE_COOKIE}=${cookie.value}` };
    expect(start(new NextRequest("https://fixture.invalid/demo/start?intro=done", { headers })).status).toBe(404);
    const response = await asset(new Request("https://fixture.invalid/demo/assets/sample-pdf"), { params: Promise.resolve({ documentId: "sample-pdf" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toBe("application/pdf");
  });
  it("requests the existing tour on explicit entry without replacing an existing sample session", () => {
    const { token } = createSampleSession();
    const response = start(sampleRequest("https://fixture.invalid/demo/start?intro=done", {
      headers: { cookie: `${SAMPLE_COOKIE}=${token}` },
    }));
    expect(response.headers.get("location")).toBe("/demo?guide=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("shows the introduction before creating a sample session", () => {
    const response = start(sampleRequest("https://fixture.invalid/demo/start"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/demo/intro");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("preserves the files destination through the introduction", () => {
    const introduction = start(sampleRequest("https://fixture.invalid/demo/start?view=files"));
    const entry = start(sampleRequest("https://fixture.invalid/demo/start?intro=done&view=files"));

    expect(introduction.headers.get("location")).toBe("/demo/intro?view=files");
    expect(entry.headers.get("location")).toBe("/demo/files?guide=1");
    expect(entry.headers.get("set-cookie")).toContain(SAMPLE_COOKIE);
  });

  it("SAMPLE-001 starts a sample cookie without replacing production authentication", () => {
    const response = start(sampleRequest(
      "https://fixture.invalid/demo/start?intro=done",
      { headers: { cookie: "better-auth.session_token=production-sentinel" } }
    ));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/demo?guide=1");

    const saved = response.headers.get("set-cookie")!;

    expect(saved).toContain(SAMPLE_COOKIE);
    expect(saved).toContain("HttpOnly");
    expect(saved).toContain("Secure");
    expect(saved).toContain("Path=/demo");
    expect(saved).not.toContain("better-auth");
    expect(saved).not.toContain("production-sentinel");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("SAMPLE-001 retains a valid sample identity and fails closed without configuration", () => {
    const { token } = createSampleSession();

    expect(start(sampleRequest(
      "https://fixture.invalid/demo/start?intro=done",
      { headers: { cookie: `${SAMPLE_COOKIE}=${token}` } }
    )).headers.get("set-cookie")).toBeNull();
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(start(sampleRequest("https://fixture.invalid/demo/start?intro=done")).status).toBe(404);
  });

  it("SAMPLE-006 serves only registered assets in a valid sample session", async () => {
    const context = { params: Promise.resolve({ documentId: "sample-pdf" }) };

    expect((await asset(new Request("https://fixture.invalid/demo/assets/sample-pdf"), context)).status).toBe(401);
    cookie.value = createSampleSession().token;

    const response = await asset(new Request("https://fixture.invalid/demo/assets/sample-pdf"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new TextDecoder().decode((await response.arrayBuffer()).slice(0, 5))).toBe("%PDF-");

    const page = await asset(new Request("https://fixture.invalid/demo/assets/sample-pdf?page=1"), context);

    expect(page.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array((await page.arrayBuffer()).slice(0, 4))]).toEqual([137, 80, 78, 71]);
    expect((await asset(new Request("https://fixture.invalid/demo/assets/sample-pdf?page=99"), context)).status).toBe(404);
    expect((await asset(
      new Request("https://fixture.invalid/demo/assets/private"),
      { params: Promise.resolve({ documentId: "private" }) }
    )).status).toBe(404);
    expect(getSampleAsset("../../private")).toBeNull();
  });

  it("SAMPLE-006 exports 84 public synthetic samples without evaluation metadata", () => {
    const dataset = JSON.parse(readFileSync("tests/fixtures/classification/v1/dataset.json", "utf8")) as {
      documents: {
        id: string;
        publicDemo: boolean;
        sha256: string
      }[];
    };
    const catalog = getSampleCatalog();
    const added = [...JSON.parse(readFileSync("apps/web/src/server/demo/sample-data/organization-documents.json", "utf8")),
    ...JSON.parse(readFileSync("apps/web/src/server/demo/sample-data/business-documents.json", "utf8"))] as {
      id: string;
      sha256: string
    }[];

    expect(catalog.documents).toHaveLength(84);
    expect(catalog.documents.map(document => document.id).sort()).toEqual([...dataset.documents.filter(document => document.publicDemo), ...added].map(document => document.id).sort());
    expect(JSON.stringify(catalog)).not.toMatch(/holdout|allowedFolderIds|reviewStatus|assetBase64|sha256/);

    for (const document of catalog.documents) {
      const bytes = getSampleAsset(document.id)!.bytes;

      expect(createHash("sha256").update(bytes).digest("hex")).toBe([...dataset.documents, ...added].find(candidate => candidate.id === document.id)!.sha256);
    }
  });

  it("SAMPLE-003 runs the real public catalog through proposal, review and application", () => {
    const catalog = getSampleCatalog();
    const selected = transitionSampleState(
      catalog,
      createSampleState(catalog),
      { type: "select", ids: catalog.documents.map(document => document.id) }
    );
    const review = transitionSampleState(catalog, selected, { type: "propose" });

    expect(review.targets["text-015"]).toBeNull();

    let resolved = review;

    for (const [id, target] of Object.entries(review.targets)) if (target === null) resolved = transitionSampleState(catalog, resolved, { type: "destination", id, folderId: "travel" });

    expect(sampleChangePlan(catalog, resolved).conflictCount).toBe(0);

    const result = transitionSampleState(catalog, resolved, { type: "apply" });

    expect(result.lastApplied?.documentIds).toHaveLength(84);
  });

  it("SAMPLE-006 locks every rendered PDF page to its checked source asset", () => {
    const manifest = JSON.parse(readFileSync("tests/fixtures/classification/v1/pdf-pages.json", "utf8")) as {
      documentId: string;
      sourceSha256: string;
      pages: string[]
    };

    expect(createHash("sha256").update(getSampleAsset(manifest.documentId)!.bytes).digest("hex")).toBe(manifest.sourceSha256);
    expect(getSampleCatalog().documents.find(document => document.id === manifest.documentId)?.pageCount).toBe(manifest.pages.length);

    for (const [index, hash] of manifest.pages.entries()) {
      expect(createHash("sha256").update(getSamplePageAsset(manifest.documentId, index + 1)!.bytes).digest("hex")).toBe(hash);
    }
  });
});

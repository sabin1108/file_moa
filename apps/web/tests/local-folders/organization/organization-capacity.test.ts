import { expect, it } from "vitest";
import { organizationBatches, organizationSelectionIssue } from "../../../src/shared/live-organization-limits";
import { OrganizationPreparationController } from "../../../src/features/local-folders/organization/organization-preparation-controller";

it("covers 200 documents and 50,000 characters exactly once in bounded planned batches", () => {
  const documents = Array.from({ length: 200 }, (_, id) => ({ id, excerpt: "가".repeat(250) }));
  expect(organizationSelectionIssue(documents)).toBeNull();
  const batches = organizationBatches(documents);
  expect(batches).toHaveLength(10);
  expect(batches.flat()).toEqual(documents);
  expect(batches.every(batch => batch.length <= 20 && batch.reduce((sum, doc) => sum + doc.excerpt.length, 0) <= 10000)).toBe(true);
  expect(organizationSelectionIssue(Array.from({ length: 501 }, () => ({ excerpt: "" })))).toBeTruthy();
  expect(organizationSelectionIssue([{ excerpt: "가".repeat(50001) }])).toBeTruthy();
});

it("lets the user select an already-read document outside automatic recommendations", async () => {
  const documents = Array.from({ length: 70 }, (_, index) => ({ id: `document-${index + 1}`, name: `${index}.md`, path: [`${index}.md`], excerpt: "가".repeat(1200), excerptHash: "a".repeat(64), sha256: "b".repeat(64), size: 3600, lastModified: 0 }));
  const controller = new OrganizationPreparationController(async () => ({ documents, complete: true, excluded: [], limits: [], discoveredFiles: 70, directories: 1, bytes: 252000 }), async () => { throw Error("not used"); });
  controller.update({ request: "자료 정리", scope: { kind: "all" } });
  await controller.prepare();
  const last = documents.at(-1)!.id;
  expect(controller.getSnapshot().candidateIds).not.toContain(last);
  controller.toggleDocument(last);
  expect(controller.getSnapshot().selectedIds).toContain(last);
  for (const document of documents) {
    if (!controller.getSnapshot().selectedIds.includes(document.id)) controller.toggleDocument(document.id);
  }
  controller.consent(true);
  expect(controller.getSnapshot().consentKey).toBeNull();
  expect(controller.getSnapshot().issue).toContain("50,000");
});

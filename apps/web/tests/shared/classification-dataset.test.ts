import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseClassificationRequest, parseClassificationResponse } from "../../src/shared/ai-classification";
import { checkDocumentCandidate } from "@personal-ai/domain";

const datasetSchema = z.strictObject({
  version: z.literal("1"),
  seed: z.literal("manual-v1"),
  source: z.literal("synthetic-assistant-authored"),
  reviewStatus: z.literal("unreviewed"),
  folders: z.array(z.strictObject({ id: z.string(), label: z.string() })),
  documents: z.array(z.strictObject({
    id: z.string(),
    family: z.string(),
    specIds: z.array(z.string().regex(/^AIC-00[1-8]$/u)).min(1),
    split: z.enum(["development", "holdout"]),
    file: z.string(),
    format: z.enum(["md", "txt", "pdf", "xlsx"]),
    excerpt: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    expected: z.strictObject({ allowedFolderIds: z.array(z.string()), reviewRequired: z.boolean() }),
    forbidden: z.array(z.string()).min(1),
    publicDemo: z.boolean(),
    evidence: z.strictObject({
      kind: z.enum(["curated-page-text", "curated-cell-values"]),
      locations: z.array(z.string()).min(1),
      quotes: z.array(z.string()).min(1)
    }).optional(),
  })),
});

const root = path.resolve("tests/fixtures/classification/v1");
const dataset = datasetSchema.parse(JSON.parse(readFileSync(path.join(root, "dataset.json"), "utf8")));
const documentInput = (document: typeof dataset.documents[number]) => ({
  id: document.id,
  name: path.basename(document.file),
  excerpt: document.excerpt,
});

describe("classification fixture integrity (not model accuracy)", () => {
  it("contains original text documents and real PDF/XLSX sample files", () => {
    expect(dataset.documents).toHaveLength(34);
    expect(Object.fromEntries(["md", "txt", "pdf", "xlsx"].map(format => [format, dataset.documents.filter(d => d.format === format).length])))
      .toEqual({ md: 16, txt: 16, pdf: 1, xlsx: 1 });
    expect(new Set(dataset.documents.map(document => document.id)).size).toBe(dataset.documents.length);

    const folders = new Set(dataset.folders.map(folder => folder.id));

    for (const document of dataset.documents) {
      const file = path.resolve(root, document.file);

      expect(file.startsWith(root + path.sep)).toBe(true);
      expect(document.file.startsWith(document.split + "/")).toBe(true);
      expect(path.extname(file)).toBe(`.${document.format}`);

      const bytes = readFileSync(file);

      expect(createHash("sha256").update(bytes).digest("hex")).toBe(document.sha256);

      for (const folder of document.expected.allowedFolderIds) expect(folders.has(folder)).toBe(true);

      if (document.expected.allowedFolderIds.length !== 1 || !document.excerpt.trim()) {
        expect(document.expected.reviewRequired).toBe(true);
      }

      if (document.format === "md" || document.format === "txt") {
        expect(bytes.toString("utf8")).toContain(document.excerpt);
      } else {
        expect(bytes.subarray(0, document.format === "pdf" ? 5 : 2).toString()).toBe(document.format === "pdf" ? "%PDF-" : "PK");
        expect(document.evidence).toBeDefined();
      }
    }
  });

  it("keeps final evaluation families out of public samples and development", () => {
    const developmentFamilies = new Set(dataset.documents.filter(d => d.split === "development").map(d => d.family));
    const holdout = dataset.documents.filter(d => d.split === "holdout");

    expect(holdout).toHaveLength(8);

    for (const document of holdout) {
      expect(document.publicDemo).toBe(false);
      expect(developmentFamilies.has(document.family)).toBe(false);
    }

    expect(dataset.documents.filter(d => d.publicDemo)).toHaveLength(10);
  });

  it("checks draft reference results against the real response contract", () => {
    for (const document of dataset.documents) {
      const input = documentInput(document);
      const request = parseClassificationRequest({ documents: [input], folders: dataset.folders },
        document.format === "md" || document.format === "txt"
          ? { mode: "live", folders: dataset.folders }
          : { mode: "sample", documents: [input], folders: dataset.folders });
      const reference = {
        proposals: [{
          documentId: document.id,
          folderId: document.expected.allowedFolderIds[0] ?? null,
          reason: "사람의 검토 전인 테스트 기대값 초안입니다.",
          reviewRequired: document.expected.reviewRequired
        }]
      };

      expect(parseClassificationResponse(reference, request)).toEqual(reference);
    }
  });

  it("keeps sample binary support separate from the production document reader", () => {
    for (const document of dataset.documents.filter(d => d.format === "pdf" || d.format === "xlsx")) {
      expect(checkDocumentCandidate(
        path.basename(document.file),
        readFileSync(path.join(root, document.file)).length
      )).toBe(document.format === "pdf" ? null : "unsupported-extension");
      expect(() => parseClassificationRequest(
        { documents: [documentInput(document)], folders: dataset.folders },
        { mode: "live", folders: dataset.folders }
      )).toThrow();
    }
  });

  it("includes ambiguity, insufficient evidence and instruction-bearing data", () => {
    expect(dataset.documents.some(d => d.expected.allowedFolderIds.length > 1 && d.expected.reviewRequired)).toBe(true);
    expect(dataset.documents.some(d => !d.excerpt.trim() && d.expected.reviewRequired)).toBe(true);
    expect(dataset.documents.some(d => d.forbidden.includes("execute-document-instruction") && d.publicDemo)).toBe(true);
  });
});

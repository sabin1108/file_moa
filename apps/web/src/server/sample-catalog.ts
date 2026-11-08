import "server-only";

import { z } from "zod";
import type { SampleCatalog } from "../shared/sample-contract";
import data from "./sample-data/catalog.json";
import organizationDocuments from "./sample-data/organization-documents.json";
import businessDocuments from "./sample-data/business-documents.json";
import { parseClassificationRequest, parseClassificationResponse } from "../shared/ai-classification";

const catalog = z.strictObject({
  version: z.literal("1"),
  folders: z.array(z.strictObject({ id: z.string(), label: z.string() })),
  documents: z.array(z.strictObject({
    id: z.string(), name: z.string(), format: z.enum(["md", "txt", "pdf", "xlsx"]), excerpt: z.string(), sourceFolderId: z.string().optional(),
    proposal: z.strictObject({ folderId: z.string().nullable(), reason: z.string(), reviewRequired: z.boolean() }),
    assetBase64: z.string(), sha256: z.string(),
    pages: z.array(z.string()).min(1).max(10).optional(),
    sheet: z.strictObject({ name: z.string(), rows: z.array(z.array(z.union([z.string(), z.number()])).min(1)).min(2) }).optional(),
  })),
}).parse({ ...data, documents: [...data.documents, ...organizationDocuments, ...businessDocuments], folders: [...data.folders,
  { id: "source-team", label: "받은 자료/팀 공유/업무" }, { id: "source-mail", label: "받은 자료/메일 첨부" },
  { id: "source-download", label: "받은 자료/다운로드" }, { id: "source-dev", label: "받은 자료/개발 노트" },
  { id: "source-personal", label: "받은 자료/생활 기록" },
  { id: "source-company", label: "받은 자료/기업 자료/재무와 운영" },
  { id: "source-research", label: "받은 자료/학교와 연구/논문" },
  { id: "source-statistics", label: "받은 자료/데이터 분석/통계" },
  { id: "source-visits", label: "받은 자료/웹서비스/방문 분석" },
  { id: "source-study", label: "받은 자료/개인 학습/강의와 복습" },
  { id: "source-webdocs", label: "받은 자료/개발/웹사이트 문서" },
] });

for (let index = 0; index < catalog.documents.length; index += 20) {
  const documents = catalog.documents.slice(index, index + 20);
  const validated = parseClassificationRequest({ documents: documents.map(({ id, name, excerpt }) => ({ id, name, excerpt })), folders: catalog.folders },
    { mode: "sample", documents: catalog.documents, folders: catalog.folders });
  parseClassificationResponse({ proposals: documents.map(document => ({ documentId: document.id, ...document.proposal })) }, validated);
}
for (const document of catalog.documents) {
  if (document.sourceFolderId && !catalog.folders.some(folder => folder.id === document.sourceFolderId)) throw new Error("invalid-sample-source");
  if ((document.format === "xlsx") !== !!document.sheet || (document.sheet && document.sheet.rows.some(row => row.length !== document.sheet!.rows[0].length))
    || (document.format === "pdf") !== !!document.pages) throw new Error("invalid-sample-preview");
}

export function getSampleCatalog(): SampleCatalog {
  const rank = (document: { id: string; format: string }) => document.id === catalog.documents[0].id ? 0 : document.format === "pdf" ? 1 : document.format === "xlsx" ? 2 : 3;
  return {
    version: catalog.version,
    folders: catalog.folders,
    documents: catalog.documents
      .map(document => ({
        id: document.id,
        name: document.name,
        format: document.format,
        excerpt: document.excerpt,
        proposal: document.proposal,
        ...(document.sourceFolderId ? { sourceFolderId: document.sourceFolderId } : {}),
        ...(document.sheet ? { sheet: document.sheet } : {}),
        ...(document.pages ? { pageCount: document.pages.length } : {}),
      }))
      .sort((first, second) => rank(first) - rank(second)),
  };
}

export function getSamplePageAsset(id: string, page: number) {
  const document = catalog.documents.find(candidate => candidate.id === id);
  if (!document || !Number.isInteger(page) || page < 1 || !document.pages?.[page - 1]) return null;
  return { name: `${document.name}-${page}.png`, format: "png" as const, contentType: "image/png", bytes: Buffer.from(document.pages[page - 1], "base64") };
}

export function getSampleAsset(id: string) {
  const document = catalog.documents.find(candidate => candidate.id === id);
  if (!document) return null;
  const contentTypes = { md: "text/plain; charset=utf-8", txt: "text/plain; charset=utf-8", pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  return { name: document.name, format: document.format, contentType: contentTypes[document.format], bytes: Buffer.from(document.assetBase64, "base64") };
}

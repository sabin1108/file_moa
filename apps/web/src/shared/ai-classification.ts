import { z } from "zod";

export const CLASSIFICATION_LIMITS = Object.freeze({
  documents: 20,
  folders: 30,
  excerptCharacters: 2000,
  totalExcerptCharacters: 20000,
  reasonCharacters: 240,
});

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u);

const documentSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(255).refine(name => !/[\\/\u0000-\u001f]/u.test(name)),
  excerpt: z.string().max(CLASSIFICATION_LIMITS.excerptCharacters),
});

const folderSchema = z.strictObject({ id: idSchema, label: z.string().trim().min(1).max(120) });

const requestSchema = z.strictObject({
  documents: z.array(documentSchema).min(1).max(CLASSIFICATION_LIMITS.documents),
  folders: z.array(folderSchema).min(1).max(CLASSIFICATION_LIMITS.folders),
});

export const classificationResponseSchema = z.strictObject({
  proposals: z.array(z.strictObject({
    documentId: idSchema,
    folderId: idSchema.nullable(),
    reason: z.string().trim().min(1).max(CLASSIFICATION_LIMITS.reasonCharacters),
    reviewRequired: z.boolean(),
  })).min(1).max(CLASSIFICATION_LIMITS.documents),
});

export type ClassificationDocument = z.infer<typeof documentSchema>;

export type ClassificationFolder = z.infer<typeof folderSchema>;

export type ClassificationRequest = z.infer<typeof requestSchema>;

export type ClassificationResponse = z.infer<typeof classificationResponseSchema>;

// The server must establish this scope from authorization; it is never a request field.

export type ClassificationScope = Readonly<{ folders: readonly ClassificationFolder[] }> & (
  | Readonly<{ mode: "live" }>
  | Readonly<{
    mode: "sample";
    documents: readonly ClassificationDocument[]
  }>
);

export function parseClassificationRequest(value: unknown, scope: ClassificationScope): ClassificationRequest {
  const request = requestSchema.parse(value);

  if (new Set(request.documents.map(document => document.id)).size !== request.documents.length
    || new Set(request.folders.map(folder => folder.id)).size !== request.folders.length) {
    throw new Error("duplicate-classification-id");
  }

  for (const folder of request.folders) {
    if (!scope.folders.some(allowed => allowed.id === folder.id && allowed.label === folder.label)) {
      throw new Error("unauthorized-classification-folder");
    }
  }

  if (request.documents.reduce((total, document) => total + document.excerpt.length, 0)
    > CLASSIFICATION_LIMITS.totalExcerptCharacters) {
    throw new Error("classification-content-too-large");
  }

  for (const document of request.documents) {
    const extension = /\.([a-z0-9]+)$/iu.exec(document.name)?.[1].toLowerCase();
    const allowed = scope.mode === "live" ? ["md", "txt"] : ["md", "txt", "pdf", "xlsx"];

    if (!allowed.includes(extension ?? "")) throw new Error("unsupported-classification-format");

    if (scope.mode === "sample") {
      const sample = scope.documents.find(candidate => candidate.id === document.id);

      if (!sample || sample.name !== document.name || sample.excerpt !== document.excerpt) {
        throw new Error("unregistered-classification-sample");
      }
    }
  }

  return request;
}

export function parseClassificationResponse(value: unknown, request: ClassificationRequest): ClassificationResponse {
  const response = classificationResponseSchema.parse(value);
  const documents = new Map(request.documents.map(document => [document.id, document]));
  const folders = new Set(request.folders.map(folder => folder.id));
  const seen = new Set<string>();

  for (const proposal of response.proposals) {
    const document = documents.get(proposal.documentId);

    if (!document || seen.has(proposal.documentId)) throw new Error("invalid-classification-document");

    seen.add(proposal.documentId);

    if (proposal.folderId !== null && !folders.has(proposal.folderId)) {
      throw new Error("invalid-classification-folder");
    }

    if ((proposal.folderId === null || !document.excerpt.trim()) && !proposal.reviewRequired) {
      throw new Error("classification-review-required");
    }
  }

  if (seen.size !== documents.size) throw new Error("missing-classification-document");

  return response;
}

import { z } from "zod";
import type { SampleCatalog } from "./sample-contract";

export const SAMPLE_MATERIAL_LIMITS = { documents: 100, characters: 50_000, requestBytes: 262_144 } as const;
const name = z.string().min(1).max(255).refine(value => value === value.trim()
  && !/[\\/\u0000-\u001f<>:"|?*]/u.test(value) && !/[. ]$/.test(value)
  && ![".", "..", ".moa-history"].includes(value.toLowerCase())
  && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value));
export const sampleMaterialSchema = z.strictObject({
  id: z.string().min(1).max(64), name,
  excerpt: z.string().max(SAMPLE_MATERIAL_LIMITS.characters),
  sourcePath: z.array(name).min(1).max(20),
});
export const sampleMaterialsSchema = z.array(sampleMaterialSchema).max(SAMPLE_MATERIAL_LIMITS.documents).superRefine((documents, context) => {
  const paths = documents.map(document => JSON.stringify([...document.sourcePath, document.name].map(part => part.normalize("NFC").toLocaleLowerCase("en-US"))));
  if (new Set(documents.map(document => document.id)).size !== documents.length
    || new Set(paths).size !== paths.length
    || documents.reduce((sum, document) => sum + document.excerpt.length, 0) > SAMPLE_MATERIAL_LIMITS.characters) {
    context.addIssue({ code: "custom", message: "invalid sample material selection" });
  }
});
export type SampleMaterial = z.infer<typeof sampleMaterialSchema>;

/** 탭의 발췌는 사용자 입력이다. ID를 서버 파일/DB 권한으로 해석하지 않는다. */
export function resolveSampleMaterials(ids: readonly string[], supplied: readonly SampleMaterial[] | undefined, catalog: SampleCatalog): SampleMaterial[] {
  const documents = sampleMaterialsSchema.parse(supplied ?? ids.map(id => {
    const document = catalog.documents.find(document => document.id === id);
    if (!document) throw Error("invalid-sample-material");
    const source = catalog.folders.find(folder => folder.id === document.sourceFolderId)?.label;
    return { id, name: document.name, excerpt: document.excerpt, sourcePath: source?.split("/") ?? ["받은 자료"] };
  }));
  if (new Set(ids).size !== ids.length || documents.length !== ids.length
    || documents.some(document => !ids.includes(document.id))) throw Error("invalid-sample-material");
  return ids.map(id => documents.find(document => document.id === id)!);
}

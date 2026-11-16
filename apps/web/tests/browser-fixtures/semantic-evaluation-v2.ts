import fixture from "../../../../tests/fixtures/local-rag-search-v2.json";
import { confirmFindQuery, findTextEvidence, inferFindRequest, type FindDocument, type FindQuery } from "../../src/features/local-folders/search/documents/document-find";
import { mergeFindDocuments, rankFindDocuments } from "../../src/features/local-folders/search/documents/document-find-ranking";
import { confirmSemanticQuery, SEMANTIC_MIN_SCORE, semanticEvidence } from "../../src/features/local-folders/search/semantic/semantic-query";
import type { SemanticModelController } from "../../src/features/local-folders/search/semantic/semantic-model-controller";
import type { SemanticChunk } from "../../src/features/local-folders/search/semantic/semantic-record";

export async function evaluateSemanticFixture(model: SemanticModelController, dataset: typeof fixture, passageMode: "metadata" | "body-only" = "metadata") {
  const abort = new AbortController();
  const docs = dataset.documents.map(doc => ({ ...doc, name: doc.path.at(-1)!, metadataOnly: "metadataOnly" in doc && doc.metadataOnly }));
  const passages: { doc: typeof docs[number]; chunks: readonly SemanticChunk[] }[] = [];
  const started = performance.now();
  for (const doc of docs.filter(doc => !doc.metadataOnly && doc.text.trim())) {
    passages.push({ doc, chunks: (await model.document(doc.text, passageMode === "body-only" ? "" : doc.name, passageMode === "body-only" ? "" : doc.path.slice(0, -1).join("/"), abort.signal)).chunks });
  }
  const indexMs = performance.now() - started;
  const id = (path: readonly string[]) => docs.find(doc => JSON.stringify(doc.path) === JSON.stringify(path))!.id;
  const rows: (typeof fixture.queries[number] & { localError: string; local: string[]; optional: string[]; selectableOptional: string[]; elapsedMs: number; scores: { id: string; score: number }[] })[] = [];
  for (const item of dataset.queries) {
    const filters = inferFindRequest(item.raw, 2026);
    let baseline: FindQuery | null = null;
    let localError = "";
    try { baseline = confirmFindQuery(filters, false, 2026); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "invalid-find-terms") throw error;
      localError = error.message;
    }
    const literal = (query: FindQuery): FindDocument[] => docs.flatMap(doc => {
      const finding = findTextEvidence(doc.metadataOnly ? "" : doc.text, query, 1, { name: doc.name, path: doc.path });
      return finding ? [{ name: doc.name, path: doc.path, finding, contentAvailable: !doc.metadataOnly }] : [];
    });
    const query = confirmSemanticQuery({ ...filters, ...(item.meaningOnly ? { terms: "" } : {}) }, item.raw, true, 2026);
    const lexical = query.semantic.lexical ? literal(query.semantic.lexical) : [];
    const semantic: FindDocument[] = [];
    const begin = performance.now();
    const scores = await model.score(item.raw, passages.map(value => value.chunks), abort.signal);
    for (const score of scores) {
      const { doc } = passages[score.index];
      const finding = semanticEvidence(doc.text, query, 1, { name: doc.name, path: doc.path }, score.score, score.start, score.end);
      if (finding) semantic.push({ name: doc.name, path: doc.path, finding, contentAvailable: true, retrieval: { kind: "semantic", ...score, partial: false } });
    }
    const combined = mergeFindDocuments(lexical, semantic);
    const ranked = (values: FindDocument[]) => rankFindDocuments(values).slice(0, 5).map(value => id(value.path));
    rows.push({ ...item, localError, local: baseline ? ranked(literal(baseline)) : [], optional: ranked(combined), selectableOptional: ranked(combined.filter(value => value.contentAvailable)), elapsedMs: performance.now() - begin, scores: scores.map(score => ({ id: passages[score.index].doc.id, score: score.score })) });
  }
  const metrics = (key: "local" | "optional") => Object.fromEntries(["dev", "holdout"].map(split => {
    const samples = rows.filter(row => row.split === split);
    const positives = samples.filter(row => row.relevant.length);
    return [split, { queries: samples.length, positiveQueries: positives.length, recallAt5: positives.reduce((sum, row) => sum + row[key].filter(id => row.relevant.includes(id)).length / row.relevant.length, 0) / positives.length, mrr: positives.reduce((sum, row) => { const rank = row[key].findIndex(id => row.relevant.includes(id)); return sum + (rank < 0 ? 0 : 1 / (rank + 1)); }, 0) / positives.length, forbidden: samples.reduce((sum, row) => sum + row[key].filter(id => row.forbidden.includes(id)).length, 0), emptyFalsePositives: samples.filter(row => !row.relevant.length).reduce((sum, row) => sum + row[key].length, 0) }];
  }));
  return { seed: dataset.seed, passageMode, threshold: SEMANTIC_MIN_SCORE, indexMs, modelExecution: "actual browser Worker/WASM; authored PDF text passed directly, no PDF extraction or source freshness validation in this evaluator", comparison: "same corpus/raw request/protected conditions; meaningOnly explicitly freezes user confirmation clearing ordinary required terms, baseline retains literal terms", metrics: { local: metrics("local"), optional: metrics("optional") }, rows };
}

export const evaluateSemanticV2 = (model: SemanticModelController) => evaluateSemanticFixture(model, fixture);

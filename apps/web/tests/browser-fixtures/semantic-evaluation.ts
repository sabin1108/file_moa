import fixture from "../../../../tests/fixtures/local-rag-search-v1.json";
import { confirmFindQuery, findTextEvidence, inferFindRequest, type FindDocument } from "../../src/features/local-folders/search/documents/document-find";
import { rankFindDocuments } from "../../src/features/local-folders/search/documents/document-find-ranking";
import { confirmSemanticQuery, semanticEvidence } from "../../src/features/local-folders/search/semantic/semantic-query";
import type { SemanticModelController } from "../../src/features/local-folders/search/semantic/semantic-model-controller";

export async function evaluateSemantic(model: SemanticModelController) {
  const abort = new AbortController();
  const docs = fixture.documents.map(doc => ({ ...doc, name: doc.path.at(-1)!, metadataOnly: "metadataOnly" in doc && doc.metadataOnly }));
  const passages = [];
  const start = performance.now();
  for (const doc of docs.filter(doc => !doc.metadataOnly && doc.text.trim())) {
    passages.push({ doc, chunks: (await model.document(doc.text, doc.name, doc.path.slice(0, -1).join("/"), abort.signal)).chunks });
  }
  const indexMs = performance.now() - start;
  const id = (path: readonly string[]) => docs.find(doc => JSON.stringify(doc.path) === JSON.stringify(path))!.id;
  const rows: (typeof fixture.queries[number] & { local: string[]; optional: string[]; elapsedMs: number })[] = [];
  for (const item of fixture.queries) {
    const filters = inferFindRequest(item.raw, 2026);
    const baselineQuery = confirmFindQuery(filters);
    const literal = (query: typeof baselineQuery) => docs.flatMap(doc => {
      const finding = findTextEvidence(doc.metadataOnly ? "" : doc.text, query, 1, { name: doc.name, path: doc.path });
      return finding ? [{ name: doc.name, path: doc.path, finding, contentAvailable: !doc.metadataOnly }] : [];
    });
    // Authored confirmation choices are frozen by scenario ID, not learned from holdout scores.
    const meaningOnly = item.id === "dev-semantic" || item.id.includes("-meaning") || item.id === "dev-empty" || item.id === "holdout-unrelated";
    const query = confirmSemanticQuery({ ...filters, ...(meaningOnly ? { terms: "" } : {}) }, item.raw, true);
    const base: FindDocument[] = query.semantic.lexical ? literal(query.semantic.lexical) : [];
    const begin = performance.now();
    const scores = await model.score(item.raw, passages.map(value => value.chunks), abort.signal);
    for (const score of scores) {
      const { doc } = passages[score.index];
      const finding = semanticEvidence(doc.text, query, 1, { name: doc.name, path: doc.path }, score.score, score.start, score.end);
      if (finding && !base.some(value => id(value.path) === doc.id)) base.push({ name: doc.name, path: doc.path, finding, contentAvailable: true, retrieval: { kind: "semantic", ...score, partial: false } });
    }
    rows.push({ ...item, local: rankFindDocuments(literal(baselineQuery)).slice(0, 5).map(value => id(value.path)), optional: rankFindDocuments(base).slice(0, 5).map(value => id(value.path)), elapsedMs: performance.now() - begin });
  }
  const metrics = (key: "local" | "optional") => Object.fromEntries(["dev", "holdout"].map(split => {
    const samples = rows.filter(row => row.split === split);
    const positives = samples.filter(row => row.relevant.length);
    return [split, { queries: samples.length, recallAt5: positives.reduce((sum, row) => sum + row[key].filter(id => row.relevant.includes(id)).length / row.relevant.length, 0) / positives.length, mrr: positives.reduce((sum, row) => { const rank = row[key].findIndex(id => row.relevant.includes(id)); return sum + (rank < 0 ? 0 : 1 / (rank + 1)); }, 0) / positives.length, forbidden: samples.reduce((sum, row) => sum + row[key].filter(id => row.forbidden.includes(id)).length, 0), emptyFalsePositives: samples.filter(row => !row.relevant.length).reduce((sum, row) => sum + row[key].length, 0) }];
  }));
  return { seed: fixture.seed, modelExecution: "actual browser Worker/WASM; PDF text authored fixture directly passed to Worker for retrieval comparison, not PDF extraction verification", indexMs, metrics: { local: metrics("local"), optional: metrics("optional") }, rows };
}

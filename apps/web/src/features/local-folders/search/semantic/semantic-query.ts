import { confirmFindQuery, findTextEvidence, inferFindRequest, type FindFilters, type FindQuery } from "../documents/document-find";
import { parseDocumentQueryPlan, queryPlanInput } from "../documents/document-query-plan";
import type { FindSource } from "../documents/document-field-match";
import { queryDateRanges } from "../../../../shared/search-query-dates";

// Frozen from dev: relevant meaning .852, unrelated query maximum .839. Holdout does not tune this.
export const SEMANTIC_MIN_SCORE = 0.85;
export type SemanticFindQuery = FindQuery & { semantic: NonNullable<FindQuery["semantic"]> };

export function confirmSemanticQuery(filters: FindFilters, meaning: string, confirmed: boolean): SemanticFindQuery {
  if (!confirmed || !meaning.trim() || meaning.length > 300) throw new Error("semantic-conditions-unconfirmed");

  const hard = confirmFindQuery(filters, true);
  const original = parseDocumentQueryPlan(filters.originalRequest ?? "");
  const protectedClauses = original.clauses.filter(clause => clause.explicit || ["phrase", "exclude", "format", "folder"].includes(clause.role));

  if (protectedClauses.some(clause => !hard.plan?.clauses.some(current => current.role === clause.role && current.value === clause.value))) throw new Error("semantic-protected-condition");

  if (queryDateRanges(filters.originalRequest ?? "").length) {
    const inferred = inferFindRequest(filters.originalRequest!);
    if ((["year", "month", "basis", "window", "endMonth"] as const).some(key => inferred[key] && inferred[key] !== filters[key])) throw new Error("semantic-protected-period");
  }

  let lexical: FindQuery | null = null;
  const description = parseDocumentQueryPlan(meaning);

  if (!description.issues.length) {
    const terms = queryPlanInput(description);
    try { lexical = confirmFindQuery({ ...filters, terms: `${filters.terms} ${terms.terms} ${terms.preferred}`.trim() }); }
    catch { /* A long description can still use semantic retrieval without a literal companion. */ }
  }

  return { ...hard, semantic: { meaning: meaning.trim(), confirmed: true, lexical } };
}

export function semanticEvidence(text: string, query: SemanticFindQuery, lastModified: number, source: FindSource, score: number, start: number, end: number) {
  if (!Number.isFinite(score) || score < SEMANTIC_MIN_SCORE || score > 1.0001 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length) return null;

  const evidence = findTextEvidence(text, query, lastModified, source, true);
  if (!evidence) return null;

  return { ...evidence, evidence: [...new Set([text.slice(start, Math.min(end, start + 200)).trim(), ...evidence.evidence])].filter(Boolean).slice(0, 12) };
}

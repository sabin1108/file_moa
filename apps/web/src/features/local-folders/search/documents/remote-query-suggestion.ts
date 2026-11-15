import { validateSearchQuerySuggestion, type SearchQuerySuggestion } from "../../../../shared/search-query";
import type { FindFilters } from "./document-find";
import { parseDocumentQueryPlan } from "./document-query-plan";

export function applySearchQuerySuggestion(question: string, value: SearchQuerySuggestion, current: FindFilters): Partial<FindFilters> {
  const suggestion = validateSearchQuerySuggestion(value, question);
  const original = parseDocumentQueryPlan(question);
  const required = [...suggestion.required, ...suggestion.phrases].map(span => span.text);
  const excluded = suggestion.excluded.map(span => span.text);

  for (const clause of original.clauses) {
    if ((clause.role === "phrase" || clause.explicit) && !required.includes(clause.value)) throw new Error("query-protected-target");
    if (clause.role === "exclude" && !excluded.includes(clause.value)) throw new Error("query-protected-exclusion");
  }

  const confirmed = parseDocumentQueryPlan(current.terms, "confirmed").clauses.filter(clause => clause.role === "must" || clause.role === "phrase");

  if (confirmed.some(clause => !required.includes(clause.value))) throw new Error("query-confirmed-target");

  const literal = (value: string) => /\s/u.test(value) ? `"${value}"` : value;
  const protectedPhrases = new Set([...original.clauses, ...confirmed].filter(clause => clause.role === "phrase").map(clause => clause.value));

  return {
    terms: [...suggestion.required.map(span => protectedPhrases.has(span.text) ? `"${span.text}"` : literal(span.text)), ...suggestion.phrases.map(span => `"${span.text}"`)].join(" "),
    preferred: suggestion.preferred.map(span => span.text).join(" "),
    excluded: [...new Set([...suggestion.excluded.map(span => literal(span.text)), ...(current.excluded ? [current.excluded] : [])])].join(" "),
  };
}

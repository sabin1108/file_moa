import { z } from "zod";
import { chatRequestSchema } from "./general-chat";
import { queryDateRanges } from "./search-query-dates";

export const searchQueryRequestSchema = z.strictObject({
  requestId: chatRequestSchema.shape.requestId,
  owner: chatRequestSchema.shape.owner,
  consent: z.literal(true),
  question: z.string().trim().min(1).max(800),
});

const span = z.strictObject({ text: z.string().min(1).max(64), start: z.number().int().min(0).max(799), end: z.number().int().min(1).max(800) });
export const searchQuerySuggestionSchema = z.strictObject({
  required: z.array(span).max(8), preferred: z.array(span).max(8), phrases: z.array(span).max(8), excluded: z.array(span).max(8),
}).refine(value => value.required.length + value.phrases.length > 0 && value.required.length + value.preferred.length + value.phrases.length <= 8);

export type SearchQuerySuggestion = z.infer<typeof searchQuerySuggestionSchema>;
export type SearchQueryResult = Readonly<{ ok: true; question: string; suggestion: SearchQuerySuggestion; model: string }>
  | Readonly<{ ok: false; code: "origin" | "session" | "input" | "limit" | "timeout" | "unavailable" }>;
export type SearchQueryAction = (input: unknown) => Promise<SearchQueryResult>;

export function compileSearchQuerySuggestion(value: unknown, question: string): SearchQuerySuggestion {
  const terms = z.array(z.string().min(1).max(64)).max(8);
  const parsed = z.strictObject({ required: terms, preferred: terms, phrases: terms, excluded: terms }).parse(value);
  const phrases = [...new Set(parsed.phrases)];
  const required = [...new Set(parsed.required)].filter(text => !phrases.includes(text));
  const preferred = [...new Set(parsed.preferred)].filter(text => !required.includes(text) && !phrases.includes(text));
  const excluded = [...new Set(parsed.excluded)];

  if (excluded.some(text => required.includes(text) || phrases.includes(text))) throw new Error("query-conflicting-condition");
  const locate = (text: string) => {
    const start = question.indexOf(text);

    if (start < 0 || question.indexOf(text, start + 1) >= 0) throw new Error("query-source-ambiguous");

    return { text, start, end: start + text.length };
  };

  return validateSearchQuerySuggestion({ required: required.map(locate), preferred: preferred.map(locate), phrases: phrases.map(locate), excluded: excluded.map(locate) }, question);
}

export function validateSearchQuerySuggestion(value: unknown, question: string): SearchQuerySuggestion {
  const result = searchQuerySuggestionSchema.parse(value);
  const spans = [...result.required, ...result.preferred, ...result.phrases, ...result.excluded];
  const dates = queryDateRanges(question);

  if (spans.some(span => span.start >= span.end || question.slice(span.start, span.end) !== span.text)) throw new Error("query-source-mismatch");
  if (spans.some(span => dates.some(([left, right]) => span.start < right && span.end > left))) throw new Error("query-date-as-content");
  if (new Set(spans.map(span => `${span.start}:${span.end}`)).size !== spans.length) throw new Error("query-duplicate-condition");

  return result;
}

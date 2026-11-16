import { parseDocumentQueryPlan, queryPlanInput, type DocumentQueryPlan } from "./document-query-plan";
import { contentDates } from "../../../../shared/content-dates";
import type { SourceSnapshot } from "../../organization/source-snapshot-rules";
import { findDateBasisPatterns, findRelativeYear } from "./document-find-reply";
import { isFieldMatches, matchDocumentFields, type FindFieldMatches, type FindSource } from "./document-field-match";

export type FindFilters = Readonly<{
  terms: string;
  year: string;
  month: string;
  basis: string;
  window: string;
  endMonth?: string;
  preferred?: string;
  excluded?: string;
  formats?: string;
  folder?: string;
  originalRequest?: string;
}>;

export type FindQuery = Readonly<{
  terms: readonly string[];
  from: string | null;
  to: string | null;
  basis: "meeting" | "written" | "body" | "modified";
  plan?: DocumentQueryPlan;
  semantic?: Readonly<{ meaning: string; confirmed: true; lexical: FindQuery | null }>;
}>;

export type FindEvidence = Readonly<{
  kind: "matched" | "date-unknown" | "date-conflict";
  dates: readonly string[];
  evidence: readonly string[];
  matches?: FindFieldMatches;
  relevance?: Readonly<{ kind: "all" | "related"; missing: readonly string[]; phraseBoost: number }>;
}>;

export type FindDocument = Readonly<{
  name: string;
  path: readonly string[];
  finding: FindEvidence;
  ocr?: boolean;
  contentAvailable?: boolean;
  retrieval?: Readonly<{ kind: "semantic"; score: number; start: number; end: number; partial: boolean; lexical?: true }>;
}>;

export type FindResult = Readonly<{
  documents: readonly FindDocument[];
  complete: boolean;
  excluded: SourceSnapshot["excluded"];
  limits: readonly string[];
  discoveredFiles: number;
  notice?: string;
}>;

export type FindableSnapshot = SourceSnapshot & {
  findings?: readonly FindDocument[];
};

export function isFindRequest(request: string) {
  return (
    /찾아|찾기|검색/u.test(request) &&
    !/정리|모아|이동|복사|분류|찾지|검색하지/u.test(request)
  );
}

export function inferFindRequest(request: string, referenceYear?: number): FindFilters {
  const dateRequest = request.replace(/"[^"\n]*"/gu, value => " ".repeat(value.length));
  const bases = Object.entries(findDateBasisPatterns).filter(([, pattern]) => pattern.test(dateRequest));
  const negated = /(?:20\d{2}\s*년?|\d{1,2}\s*월(?:말|초)?|회의일|작성일|수정일|본문\s*날짜)\s*(?:말고|제외|빼고|아닌|아니고)/u.test(dateRequest);
  const years = [
    ...new Set(
      [...dateRequest.matchAll(/(?<![a-zA-Z0-9_.])(20\d{2})(?![a-zA-Z0-9_.])/gu)].map(
        (match) => match[1],
      ),
    ),
  ];
  const months = [
    ...new Set(
      [...dateRequest.matchAll(/(?<!\d)(1[0-2]|0?[1-9])\s*월/gu)].map((match) =>
        String(Number(match[1])),
      ),
    ),
  ];
  const lexical = queryPlanInput(parseDocumentQueryPlan(request));
  const monthRange = dateRequest.match(/(?<!\d)(1[0-2]|0?[1-9])\s*월?\s*(?:부터|~|에서|-)\s*(1[0-2]|0?[1-9])\s*월(?:까지)?/u);
  const relativeYear = findRelativeYear(dateRequest, referenceYear);

  return {
    ...lexical,
    originalRequest: request,
    year: negated ? "" : years.length === 1 && !relativeYear ? years[0] : !years.length ? relativeYear : "",
    month: negated
      ? ""
      : monthRange && +monthRange[1] <= +monthRange[2]
        ? String(+monthRange[1])
        : months.length === 1
          ? months[0]
          : years.length || /월|재작년|작년|올해/u.test(dateRequest)
            ? ""
            : "all",
    basis:
      negated || bases.length !== 1 ? "" : bases[0][0],
    window: monthRange ? "months" : /월\s*말/u.test(dateRequest) ? "late" : /쯤|전후|무렵|월\s*(?:초|중순)/u.test(dateRequest) ? "" : "month",
    endMonth: monthRange ? String(+monthRange[2]) : "",
  };
}

export function confirmFindQuery(filters: FindFilters, allowEmptyTerms: boolean, referenceYear: number): FindQuery {
  const input = [filters.terms,
    ...(filters.preferred?.trim().split(/\s+/u).filter(Boolean).map(term => `~${term}`) ?? []),
    ...(filters.excluded?.match(/"[^"]+"|[^\s]+/gu)?.map(term => `-${term}`) ?? []),
    ...(filters.formats ? [`ext:${filters.formats.replace(/\s/gu, "")}`] : []),
    ...(filters.folder ? [`path:"${filters.folder}"`] : []),
  ].join(" ");
  const parsedPlan = parseDocumentQueryPlan(input, "confirmed");
  const original = filters.originalRequest ? parseDocumentQueryPlan(filters.originalRequest) : null;
  const plan: DocumentQueryPlan = { ...parsedPlan, originalRequest: filters.originalRequest ?? input,
    clauses: parsedPlan.clauses.map(clause => original?.clauses.find(previous => previous.value === clause.value && previous.role === clause.role) ?? clause),
  };
  const terms = plan.clauses.filter(clause => clause.role === "must" || clause.role === "phrase").map(clause => clause.value);

  if (plan.issues.length || !allowEmptyTerms && !terms.length || terms.length > 8) throw Error("invalid-find-terms");

  const withPeriod = (from: string | null, to: string | null, basis: FindQuery["basis"]) => {
    const inferred = filters.originalRequest ? inferFindRequest(filters.originalRequest, referenceYear) : null;
    const unchanged = inferred && (["year", "month", "basis", "window", "endMonth"] as const).every(key => (inferred[key] ?? "") === (filters[key] ?? ""));
    const text = unchanged ? filters.originalRequest! : [filters.year, filters.month, filters.endMonth, filters.basis, filters.window].join(" ");

    return { ...plan, period: { from, to, basis, source: { kind: unchanged ? "request" as const : "confirmed" as const, text, start: 0, end: text.length } } };
  };

  if (filters.month === "all")
    return { terms, from: null, to: null, basis: "body", plan: withPeriod(null, null, "body") };

  if (
    !/^20\d{2}$/u.test(filters.year) ||
    !/^(?:[1-9]|1[0-2])$/u.test(filters.month)
    ||
    !["meeting", "written", "body", "modified"].includes(filters.basis)
    ||
    !["month", "around", "late", "months"].includes(filters.window)
    ||
    filters.window === "months"
    && (!/^(?:[1-9]|1[0-2])$/u.test(filters.endMonth ?? "") || Number(filters.endMonth) < Number(filters.month))
  )
    throw Error("unconfirmed-find-period");

  const year = Number(filters.year),
    month = Number(filters.month);
  const padding = filters.window === "around" ? 7 : 0;
  const from = new Date(Date.UTC(year, month - 1, filters.window === "late" ? 21 : 1 - padding))
    .toISOString()
    .slice(
      0,
      10
    );
  const to = new Date(Date.UTC(year, filters.window === "months" ? Number(filters.endMonth) : month, padding))
    .toISOString()
    .slice(
      0,
      10
    );

  if (!from.startsWith("20") || !to.startsWith("20"))
    throw Error("unsupported-find-period");

  return { terms, from, to, basis: filters.basis as FindQuery["basis"], plan: withPeriod(from, to, filters.basis as FindQuery["basis"]) };
}

export function findTextEvidence(
  text: string,
  query: FindQuery,
  lastModified?: number,
  source?: FindSource,
  allowEmptyTerms = false,
): FindEvidence | null {
  const match = matchDocumentFields(text, query.terms, source, query.plan, allowEmptyTerms);

  if (!match) return null;

  const snippet = (position: number, length = 40) =>
    text
      .slice(Math.max(0, position - 50), position + Math.min(length, 100) + 50)
      .trim();
  const evidence = [...match.evidence, ...match.positions.map(position => snippet(position))];
  const fields = { ...(source ? { matches: match.matches } : {}), ...(match.relevance ? { relevance: match.relevance } : {}) };

  if (!query.from || !query.to) return { kind: "matched", dates: [], evidence, ...fields };

  if (query.basis === "modified") {
    if (lastModified === undefined || !Number.isFinite(lastModified)) return { kind: "date-unknown", dates: [], evidence, ...fields };

    const modified = new Date(lastModified);

    if (!Number.isFinite(modified.getTime())) return { kind: "date-unknown", dates: [], evidence, ...fields };
    const date = `${modified.getFullYear()}-${String(modified.getMonth() + 1).padStart(2, "0")}-${String(modified.getDate()).padStart(2, "0")}`;

    if (date < query.from || date > query.to) return null;

    return { kind: "matched", dates: [date], evidence, ...fields };
  }

  const datePattern =
    "(?<!\\d)20\\d{2}\\s*(?:[-/.]|년)\\s*\\d{1,2}\\s*(?:[-/.]|월)\\s*\\d{1,2}(?:일)?(?!\\d)";
  const label =
    query.basis === "meeting"
      ? "회의\\s*(?:일시|날짜|일)"
      : "작성\\s*(?:일시|날짜|일)";
  const pattern = new RegExp(
    query.basis === "body"
      ? datePattern
      : `(?:${label})\\s*[*_:：=-]*\\s*${datePattern}`,
    "gu",
  );
  const dates = new Set<string>();
  const inside = new Set<string>();
  let insideEvidence: string | null = null;

  for (const match of text.matchAll(pattern)) {
    const date = contentDates(match[0])[0];

    if (!date) continue;

    dates.add(date);

    if (date >= query.from && date <= query.to) {
      inside.add(date);
      insideEvidence ??= snippet(match.index, match[0].length);
    }

    if (evidence.length < 12)
      evidence.push(snippet(match.index, match[0].length));
  }

  if (!dates.size) return { kind: "date-unknown", dates: [], evidence, ...fields };

  if (!inside.size) return null;

  return {
    ...fields,
    kind: inside.size === dates.size ? "matched" : "date-conflict",
    dates: [...new Set(inside.size === dates.size ? [...inside] : [[...inside][0], [...dates].find(date => !inside.has(date))!, ...inside, ...dates])].slice(0, 4),
    evidence: [
      ...new Set([...(insideEvidence ? [insideEvidence] : []), ...evidence]),
    ].slice(0, 12),
  };
}

export function isFindEvidence(value: unknown, query?: FindQuery): value is FindEvidence | null {
  if (value === null) return true;

  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;

  return (
    ["matched", "date-unknown", "date-conflict"].includes(String(item.kind)) &&
    Array.isArray(item.dates)
    &&
    item.dates.length <= 4
    &&
    item.dates.every(
      (date) => typeof date === "string" && contentDates(date).includes(date),
    )
    &&
    Array.isArray(item.evidence)
    &&
    item.evidence.length > 0
    &&
    item.evidence.length <= 12
    &&
    item.evidence.every(
      (line) => typeof line === "string" && line.length <= 200,
    ) && (item.matches === undefined || isFieldMatches(item.matches))
    && (item.relevance === undefined || isFindRelevance(item.relevance))
    && (!query?.plan || isFindRelevance(item.relevance) && matchesPlanRelevance(item.relevance, query, item.matches))
    && (!query || matchesQueryDates(item as FindEvidence, query))
  );
}

function matchesPlanRelevance(value: NonNullable<FindEvidence["relevance"]>, query: FindQuery, fields: unknown) {
  const preferred = query.plan!.clauses.filter(clause => clause.role === "preferred").map(clause => clause.value);
  const phrases = query.plan!.clauses.filter(clause => clause.role === "phrase").length;

  if (value.phraseBoost !== phrases || value.missing.some(term => !preferred.includes(term)) || new Set(value.missing).size !== value.missing.length) return false;

  if (!isFieldMatches(fields)) return false;

  const matched = [...fields.name, ...fields.path, ...fields.body];
  const allowed = [...query.terms, ...preferred];

  if (query.terms.some(term => !matched.includes(term)) || matched.some(term => !allowed.includes(term))) return false;
  const missing = preferred.filter(term => !matched.includes(term));

  return missing.length === value.missing.length && missing.every(term => value.missing.includes(term));
}

function matchesQueryDates(value: FindEvidence, query: FindQuery) {
  if (!query.from || !query.to) return value.kind === "matched" && value.dates.length === 0;
  if (value.kind === "date-unknown") return value.dates.length === 0;

  const inside = value.dates.filter(date => date >= query.from! && date <= query.to!);

  return inside.length > 0 && (value.kind === "matched" ? inside.length === value.dates.length : inside.length < value.dates.length);
}

function isFindRelevance(value: unknown): value is NonNullable<FindEvidence["relevance"]> {
  if (typeof value !== "object" || value === null) return false;

  const item = value as Record<string, unknown>;

  return ["all", "related"].includes(String(item.kind)) && Array.isArray(item.missing) && item.missing.length <= 8
    && item.missing.every(term => typeof term === "string" && term.length > 0 && term.length <= 64)
    && typeof item.phraseBoost === "number" && Number.isSafeInteger(item.phraseBoost) && item.phraseBoost >= 0 && item.phraseBoost <= 8
    && (item.kind === "related" ? item.missing.length > 0 : item.missing.length === 0);
}

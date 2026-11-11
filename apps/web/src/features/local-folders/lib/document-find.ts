import { contentDates } from "../../../shared/content-dates";
import type { SourceSnapshot } from "./source-snapshot";
import { findRelativeYear } from "./document-find-reply";

export type FindFilters = Readonly<{
  terms: string;
  year: string;
  month: string;
  basis: string;
  window: string;
  endMonth?: string;
}>;

export type FindQuery = Readonly<{
  terms: readonly string[];
  from: string | null;
  to: string | null;
  basis: "meeting" | "written" | "body";
}>;

export type FindEvidence = Readonly<{
  kind: "matched" | "date-unknown" | "date-conflict";
  dates: readonly string[];
  evidence: readonly string[];
}>;

export type FindDocument = Readonly<{
  name: string;
  path: readonly string[];
  finding: FindEvidence;
  ocr?: boolean;
}>;

export type FindResult = Readonly<{
  documents: readonly FindDocument[];
  complete: boolean;
  excluded: SourceSnapshot["excluded"];
  limits: readonly string[];
  discoveredFiles: number;
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
  const written = /작성\s*(?:일시|날짜|일)(?=\s|[은는을를로:：]|$)/u.test(
    request,
  );
  const meeting = /회의\s*(?:일시|날짜|일)(?=\s|[은는을를로:：]|$)/u.test(
    request,
  );
  const negated = /말고|제외|빼고|아닌|아니고|않|하지\s*마/u.test(request);
  const years = [
    ...new Set(
      [...request.matchAll(/(?<!\d)(20\d{2})(?!\d)/gu)].map(
        (match) => match[1],
      ),
    ),
  ];
  const months = [
    ...new Set(
      [...request.matchAll(/(?<!\d)(1[0-2]|0?[1-9])\s*월/gu)].map((match) =>
        String(Number(match[1])),
      ),
    ),
  ];
  const words =
    request
      .replace(/재작년|작년|올해/gu, " ")
      .replace(/20\d{2}\s*년?/gu, " ")
      .replace(
        /\d{1,2}\s*월?\s*(?:부터|~|에서|-)\s*\d{1,2}\s*월(?:까지)?/gu,
        " "
      )
      .replace(
        /\d{1,2}\s*월(?:쯤|경|초|말|무렵)?/gu,
        " "
      )
      .match(/[가-힣a-zA-Z0-9]+/gu) ?? [];
  const generic = new Set([
    "내가",
    "제가",
    "한",
    "있는",
    "있는데",
    "있어",
    "그것",
    "그것좀",
    "그거",
    "좀",
    "주세요",
    "줄래",
    "해줘",
    "해",
    "쯤",
    "기준",
    "기준으로",
  ]);
  const terms = [
    ...new Set(
      words
        .map((word) =>
          word.replace(/(?:자료|문서|파일)(?:[은는이가을를])?$/u, ""),
        )
        .filter(
          (word) =>
            word.length >= 2 &&
            !generic.has(word) &&
            !/^(?:찾|검색)/u.test(word)
            &&
            !/^(?:(?:정리|분류|이동|복사)(?:해(?:줘|주세요)?|하기|하자)|모아(?:줘|주세요))$/u.test(word),
        ),
    ),
  ].slice(
    0,
    8
  );
  const monthRange = request.match(/(?<!\d)(1[0-2]|0?[1-9])\s*월?\s*(?:부터|~|에서|-)\s*(1[0-2]|0?[1-9])\s*월(?:까지)?/u);
  const relativeYear = findRelativeYear(request, referenceYear);

  return {
    terms: terms.join(" "),
    year: negated ? "" : years.length === 1 && !relativeYear ? years[0] : !years.length ? relativeYear : "",
    month: negated
      ? ""
      : monthRange && +monthRange[1] <= +monthRange[2]
        ? String(+monthRange[1])
        : months.length === 1
          ? months[0]
          : years.length || /월|재작년|작년|올해/u.test(request)
            ? ""
            : "all",
    basis:
      negated || written === meeting ? "" : written ? "written" : "meeting",
    window: monthRange ? "months" : /월\s*말/u.test(request) ? "late" : /쯤|전후|무렵|월\s*(?:초|중순)/u.test(request) ? "" : "month",
    endMonth: monthRange ? String(+monthRange[2]) : "",
  };
}

export function confirmFindQuery(filters: FindFilters): FindQuery {
  const terms = [
    ...new Set(filters.terms.trim().split(/\s+/u).filter(Boolean)),
  ];

  if (
    !terms.length ||
    terms.length > 8 ||
    terms.some((term) => term.length < 2 || term.length > 64)
  )
    throw Error("invalid-find-terms");

  if (filters.month === "all")
    return { terms, from: null, to: null, basis: "body" };

  if (
    !/^20\d{2}$/u.test(filters.year) ||
    !/^(?:[1-9]|1[0-2])$/u.test(filters.month)
    ||
    !["meeting", "written", "body"].includes(filters.basis)
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

  return { terms, from, to, basis: filters.basis as FindQuery["basis"] };
}

export function findTextEvidence(
  text: string,
  query: FindQuery,
): FindEvidence | null {
  const lower = text.toLocaleLowerCase("ko");
  const positions = query.terms.map((term) =>
    lower.indexOf(term.toLocaleLowerCase("ko")),
  );

  if (positions.some((position) => position < 0)) return null;

  const snippet = (position: number, length = 40) =>
    text
      .slice(Math.max(0, position - 50), position + Math.min(length, 100) + 50)
      .trim();
  const evidence = positions.map((position) => snippet(position));

  if (!query.from || !query.to) return { kind: "matched", dates: [], evidence };

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

  if (!dates.size) return { kind: "date-unknown", dates: [], evidence };

  if (!inside.size) return null;

  return {
    kind: inside.size === dates.size ? "matched" : "date-conflict",
    dates: [...new Set([...inside, ...dates])].slice(0, 4),
    evidence: [
      ...new Set([...(insideEvidence ? [insideEvidence] : []), ...evidence]),
    ].slice(0, 12),
  };
}

export function isFindEvidence(value: unknown): value is FindEvidence | null {
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
    )
  );
}

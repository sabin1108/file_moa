import { queryDateRanges } from "../../../../shared/search-query-dates";

export type QueryClause = Readonly<{
  value: string;
  role: "must" | "preferred" | "phrase" | "exclude" | "format" | "folder";
  explicit?: boolean;
  source: Readonly<{ kind: "request" | "confirmed"; text: string; start: number; end: number }>;
}>;

export type DocumentQueryPlan = Readonly<{
  version: 1;
  originalRequest: string;
  clauses: readonly QueryClause[];
  issues: readonly string[];
  period?: Readonly<{ from: string | null; to: string | null; basis: string; source: QueryClause["source"] }>;
}>;

// These are document-type preferences, never discarded stop words or invented synonyms.
const documentKinds = new Set(["자료", "문서", "파일", "보고서", "연구보고", "연구보고서", "회의록", "이력서", "자기소개서", "양식", "계약서", "설계서", "매뉴얼", "논문", "노트", "메모"]);
const grammar = new Set(["내가", "제가", "한", "있는", "있는데", "있어", "그것", "그것좀", "그거", "좀", "주세요", "줄래", "해줘", "해", "쯤", "기준", "기준으로"]);
const blank = (value: string) => " ".repeat(value.length);

export function parseDocumentQueryPlan(request: string, kind: QueryClause["source"]["kind"] = "request"): DocumentQueryPlan {
  const clauses: QueryClause[] = [];
  const issues: string[] = [];
  const add = (value: string, role: QueryClause["role"], start: number, explicit = false) => {
    if (!value.length || value.length > 64) issues.push("검색 조건은 각각64자 안으로 적어 주세요.");
    else if (!clauses.some(clause => clause.value === value && clause.role === role)) clauses.push({ value, role, ...(explicit ? { explicit: true } : {}), source: { kind, text: request, start, end: start + value.length } });
  };
  const quotes = [...request.matchAll(/"[^"\n]*"/gu)].map(match => [match.index, match.index + match[0].length]);
  const mask = (value: string, pattern: RegExp) => value.replace(pattern, (matched: string, ...args: unknown[]) => {
    const offset = args.at(-2) as number;

    return quotes.some(([start, end]) => offset >= start && offset < end) ? matched : blank(matched);
  });
  const characters = request.split("");

  for (const [start, end] of queryDateRanges(request)) characters.fill(" ", start, end);

  let text = characters.join("");

  for (const pattern of [
    /(?:찾아(?:줄래|주세요|줘)|찾기|검색(?:해\s*줘|해줘|해주세요|하기)?|보여\s*줘)[.!?]*\s*$/u,
    /(?:찾아서\s*)?(?:(?:정리|분류|이동|복사)(?:해(?:줘|주세요)?|하기|하자)|모아(?:줘|주세요))[.!?]*\s*$/u,
  ]) text = mask(text, pattern);

  if ((text.match(/"/gu)?.length ?? 0) % 2) issues.push("따옴표를 닫아 주세요.");
  if (request.length > 800) issues.push("검색 요청은800자 안으로 적어 주세요.");

  for (const match of text.matchAll(/(?:(ext|type|path):)?([+~\-]?)(?:"([^"\n]+)"|([^\s"]+))/gu)) {
    let token = match[3] ?? match[4];
    if (!match[1] && match[3] === undefined) token = token.replace(/[,;!?]+$/u, "");
    const start = match.index + (match[1] ? match[1].length + 1 : 0) + match[2].length + (match[3] !== undefined ? 1 : 0);

    if (match[1]) {
      if (match[1] === "path") add(token, "folder", start);
      else if (!/^[a-zA-Z0-9]+(?:,[a-zA-Z0-9]+)*$/u.test(token)) issues.push("확장자는 ext:pdf,md 형식으로 적어 주세요.");
      else add(token, "format", start);

      continue;
    }

    if (match[3] !== undefined) {
      add(token, match[2] === "-" ? "exclude" : "phrase", start);
      continue;
    }

    const particle = kind === "request" && token.match(/^(.+?)(?:은|는|이|가|을|를)$/u);

    if (particle && documentKinds.has(particle[1])) token = particle[1];

    if (grammar.has(token)) continue;

    if (["말고", "제외", "제외하고", "빼고"].includes(token)) {
      const previous = clauses.at(-1);

      if (!previous || previous.role !== "must") issues.push("제외할 단어를 확인해 주세요.");
      else clauses[clauses.length - 1] = { ...previous, role: "exclude" };

      continue;
    }

    if (token.includes(":")) { issues.push("확인하지 못한 검색 조건이 있어요. 정확한 문구는 따옴표로 묶어 주세요."); continue; }

    const role = match[2] === "-" ? "exclude" : match[2] === "~" ? "preferred" : "must";
    const compound = kind === "request" && !match[2] && token.match(/^(.{2,})(자료|문서|파일)$/u);

    if (compound) {
      add(compound[1], "must", start);
      add(compound[2], "preferred", start + compound[1].length);
    } else add(token, role, start, match[2] === "+");
  }

  const specific = clauses.some(clause => clause.role === "must" && !documentKinds.has(clause.value));

  if (kind === "request" && specific) {
    clauses.forEach((clause, index) => {
      if (clause.role === "must" && !clause.explicit && documentKinds.has(clause.value)) clauses[index] = { ...clause, role: "preferred" };
    });
  }

  if (!clauses.some(clause => clause.role === "must" || clause.role === "phrase")) {
    clauses.forEach((clause, index) => { if (clause.role === "preferred") clauses[index] = { ...clause, role: "must" }; });
  }

  if (clauses.filter(clause => ["must", "preferred", "phrase"].includes(clause.role)).length > 8 || clauses.length > 24) issues.push("검색 조건 수가 많아요. 핵심 조건8개 이내로 나누어 주세요.");
  if (clauses.filter(clause => clause.role === "folder").length > 1) issues.push("폴더 조건은 한 번에 하나만 지정해 주세요.");

  return { version: 1, originalRequest: request, clauses, issues: [...new Set(issues)] };
}

export function queryPlanInput(plan: DocumentQueryPlan) {
  if (plan.issues.length) return { terms: plan.originalRequest, preferred: "" };

  const values = (role: QueryClause["role"]) => plan.clauses.filter(clause => clause.role === role).map(clause => clause.value);

  return {
    terms: [...values("must"), ...values("phrase").map(value => `"${value}"`)].join(" "),
    preferred: values("preferred").join(" "),
    excluded: values("exclude").map(value => value.includes(" ") ? `"${value}"` : value).join(" "),
    formats: values("format").join(","),
    folder: values("folder").join(" / "),
  };
}

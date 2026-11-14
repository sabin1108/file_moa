import type { FindFilters } from "./document-find";

export const findDateBasisPatterns = {
  meeting: /회의\s*(?:일시|날짜|일)(?=\s|[은는을를로:：]|$)/u,
  written: /작성\s*(?:일시|날짜|일)(?=\s|[은는을를로:：]|$)/u,
  modified: /(?:파일(?:을)?\s*)?(?:마지막(?:으로)?\s*)?수정(?:한|된)?\s*(?:파일\s*)?(?:일시|날짜|일)(?=\s|[은는을를로:：]|$)/u,
  body: /본문(?:에)?\s*(?:기록된|적힌)?\s*(?:파일\s*)?날짜(?:\s*전체)?/u,
} as const;

type FindReply = Readonly<{
  kind: "apply";
  filters: Partial<FindFilters>
}> | Readonly<{ kind: "invalid" }> | Readonly<{ kind: "none" }>;

export function findRelativeYear(text: string, referenceYear?: number): string {
  const relatives = [...new Set(text.match(/재작년|작년|올해/gu) ?? [])];

  if (relatives.length !== 1 || !referenceYear) return "";

  return String(referenceYear - (relatives[0] === "재작년" ? 2 : relatives[0] === "작년" ? 1 : 0));
}

/** 지원하는 조건만 전부 해석한다. 남은 문구가 있으면 일부 조건도 반영하지 않는다. */

export function parseFindReply(reply: string, referenceYear: number): FindReply {
  if (!/20\d{2}|작년|올해|\d+\s*월|전체\s*기간|해당\s*월|앞뒤\s*7일/u.test(reply)
    && !Object.values(findDateBasisPatterns).some(pattern => pattern.test(reply))) return { kind: "none" };

  if (reply.length > 200 || /말고|제외|빼고|아닌|아니고|않|또는|혹은/u.test(reply)) return { kind: "invalid" };

  let rest = reply.trim();
  const filters: { -readonly [Key in keyof FindFilters]?: FindFilters[Key] } = {};
  const take = (pattern: RegExp, apply: (match: RegExpMatchArray) => void) => {
    const matches = [...rest.matchAll(pattern)];

    if (matches.length > 1) return false;

    if (matches[0]) {
      apply(matches[0]);
      rest = rest.replace(pattern, " ");
    }

    return true;
  };
  let year = "";

  if (!take(/(?<!\d)(20\d{2})\s*년(?:이고)?|재작년|작년|올해/gu, match => {
    year = match[1] ?? findRelativeYear(match[0], referenceYear);
  })) return { kind: "invalid" };

  if (year) filters.year = year;

  const range = rest.match(/(?<!\d)(\d{1,2})\s*월?\s*(?:부터|~|에서|-)\s*(\d{1,2})\s*월(?:까지)?/u);

  if (range) {
    if (+range[1] < 1 || +range[2] > 12 || +range[1] > +range[2]) return { kind: "invalid" };

    Object.assign(filters, { month: String(+range[1]), endMonth: String(+range[2]), window: "months" });
    rest = rest.replace(range[0], " ");
  } else if (!take(/(?<!\d)(\d{1,2})\s*월\s*(말)?/gu, match => {
    Object.assign(
      filters,
      { month: String(+match[1]), endMonth: "", ...(match[2] ? { window: "late" } : {}) }
    );
  })) return { kind: "invalid" };

  if (filters.month && (+filters.month < 1 || +filters.month > 12)) return { kind: "invalid" };

  for (const [basis, pattern] of Object.entries(findDateBasisPatterns)) {
    if (!pattern.test(rest)) continue;

    if (filters.basis || !take(new RegExp(pattern.source, "gu"), () => { filters.basis = basis; })) return { kind: "invalid" };
  }

  if (/전체\s*기간/u.test(rest)) {
    if (filters.month || filters.year) return { kind: "invalid" };

    Object.assign(filters, { month: "all", endMonth: "" });
    rest = rest.replace(/전체\s*기간/u, " ");
  }

  if (/해당\s*월만|앞뒤\s*7일(?:도)?(?:\s*포함)?/u.test(rest)) {
    if (filters.window) return { kind: "invalid" };

    const around = /앞뒤/u.test(rest);

    filters.window = around ? "around" : "month";
    rest = rest.replace(/해당\s*월만|앞뒤\s*7일(?:도)?(?:\s*포함)?/u, " ");
  }

  rest = rest.replace(/기준으로|기준|으로|이고|입니다|이에요|예요|해주세요|해줘|해\s*줘|로|에|[\s,.!?·]/gu, "");

  return rest || !Object.keys(filters).length ? { kind: "invalid" } : { kind: "apply", filters };
}

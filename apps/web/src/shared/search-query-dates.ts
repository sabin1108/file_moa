export const searchDateBasisPatterns = {
  meeting: /회의\s*(?:일시|날짜|일)(?=\s|[은는을를로:：]|$)/u,
  written: /작성\s*(?:일시|날짜|일)(?=\s|[은는을를로:：]|$)/u,
  modified: /(?:파일(?:을)?\s*)?(?:마지막(?:으로)?\s*)?수정(?:한|된)?\s*(?:파일\s*)?(?:일시|날짜|일)(?=\s|[은는을를로:：]|$)/u,
  body: /본문(?:에)?\s*(?:기록된|적힌)?\s*(?:파일\s*)?날짜(?:\s*전체)?/u,
} as const;

/** Unquoted date expressions are filters, never model-generated content terms. */
export function queryDateRanges(question: string): readonly (readonly [number, number])[] {
  const quoted = [...question.matchAll(/"[^"\n]*"/gu)].map(match => [match.index, match.index + match[0].length]);
  const ranges: [number, number][] = [];

  for (const pattern of [
    ...Object.values(searchDateBasisPatterns).map(pattern => new RegExp(pattern.source, "gu")),
    /재작년|작년|올해|(?<![A-Za-z0-9_.])20\d{2}\s*년?/gu,
    /\d{1,2}\s*월?\s*(?:부터|~|에서|-)\s*\d{1,2}\s*월(?:까지)?/gu,
    /\d{1,2}\s*월(?:쯤|경|초|말|무렵)?/gu,
  ]) {
    for (const match of question.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;

      if (!quoted.some(([left, right]) => start < right && end > left)) ranges.push([start, end]);
    }
  }

  return ranges;
}

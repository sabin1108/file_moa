/** 본문에 적힌 실제 달력 날짜만 정규화한다. 파일 시각은 사용하지 않는다. */
export function contentDates(text: string): string[] {
  const dates = new Set<string>();

  for (const match of text.matchAll(
    /(20\d{2})\s*(?:[-/.]|년)\s*(\d{1,2})\s*(?:[-/.]|월)\s*(\d{1,2})(?:일)?/gu,
  )) {
    const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    const parsed = new Date(date + "T00:00:00Z");

    if (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    )
      dates.add(date);
  }

  return [...dates];
}

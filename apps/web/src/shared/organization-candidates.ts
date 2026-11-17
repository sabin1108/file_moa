type Candidate = Readonly<{
  id: string;
  name: string;
  excerpt: string
}>;

// This only bounds provider input; the AI still decides relevance and must quote the body.

function organizationTerms(instruction: string) {
  const words = instruction.toLocaleLowerCase("ko").match(/[가-힣a-z0-9]+/gu) ?? [];
  const generic = new Set([
    "자료",
    "내용",
    "본문",
    "파일",
    "기준",
    "기준으로",
    "정리",
    "정리해",
    "찾아",
    "모아",
    "주세요"
  ]);
  const terms = new Set(
    words
      .flatMap(word => [word, word.replace(/(으로|에서|처럼|만|을|를|의|에|별로|별)$/u, "")])
      .filter(word => word.length >= 2 && !generic.has(word))
  );
  const topics = [
    ["성능", "lcp", "inp", "cls", "long task", "번들", "네트워크"],
    ["매출", "영업", "수익", "판매"],
    ["방문", "유입", "전환", "세션"],
    ["논문", "연구", "초록", "가설"],
    ["통계", "표본", "평균", "분산"],
    ["공부", "학습", "강의", "복습"]
  ];

  for (const topic of topics)
    if (topic.some(term => instruction.toLowerCase().includes(term)))
      for (const term of topic) terms.add(term);

  return terms;
}

/** A bounded body window, not a semantic relevance decision. Runs in the file Worker. */

export function organizationExcerpt(text: string, instruction: string): string {
  const lower = text.toLocaleLowerCase("ko");
  const positions = [...organizationTerms(instruction)]
    .map(term => lower.indexOf(term))
    .filter(index => index >= 0);
  const start = positions.length ? Math.max(0, Math.min(...positions) - 180) : 0;

  return text.slice(start, start + 1200);
}

export function selectOrganizationCandidates<T extends Candidate>(
  documents: readonly T[],
  instruction: string,
  limits: { documents: number; excerptCharacters: number } = { documents: 40, excerptCharacters: 6000 },
): T[] {
  const terms = organizationTerms(instruction);
  const month = instruction.match(/(1[0-2]|0?[1-9])월/u)?.[1];
  const ranked = documents
    .map((document, index) => {
      const body = document.excerpt.toLocaleLowerCase("ko");
      const title = document.name.toLocaleLowerCase("ko");
      const monthScore =
        month &&
          (body.includes(`-${month.padStart(2, "0")}-`) || body.includes(`${Number(month)}월`))
          ? 8
          : 0;
      const score =
        monthScore +
        [...terms].reduce(
          (sum, term) => sum + (body.includes(term) ? 4 : 0) + (title.includes(term) ? 1 : 0),
          0
        );

      return { document, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: T[] = [];
  let characters = instruction.length;

  for (const { document } of ranked) {
    const cost =
      JSON.stringify({ id: document.id, name: document.name, excerpt: document.excerpt }).length +
      100;

    if (characters + cost > limits.excerptCharacters) continue;

    selected.push(document);
    characters += cost;

    if (selected.length === limits.documents) break;
  }

  return selected;
}

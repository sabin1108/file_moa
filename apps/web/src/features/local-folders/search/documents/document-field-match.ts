export type FindSource = Readonly<{
  name: string;
  path: readonly string[];
}>;

export type FindFieldMatches = Readonly<{
  name: readonly string[];
  path: readonly string[];
  body: readonly string[];
}>;

export function matchDocumentFields(text: string, terms: readonly string[], source?: FindSource) {
  const body = text.toLocaleLowerCase("ko");
  const name = source?.name ?? "";
  const path = source?.path.slice(0, -1).join(" / ") ?? "";
  const lowerName = name.toLocaleLowerCase("ko");
  const lowerPath = path.toLocaleLowerCase("ko");
  const positions = terms.map(term => body.indexOf(term.toLocaleLowerCase("ko")));
  const matches: FindFieldMatches = {
    name: terms.filter(term => lowerName.includes(term.toLocaleLowerCase("ko"))),
    path: terms.filter(term => lowerPath.includes(term.toLocaleLowerCase("ko"))),
    body: terms.filter((_, index) => positions[index] >= 0),
  };

  if (!terms.length || terms.some((term, index) => positions[index] < 0 && !matches.name.includes(term) && !matches.path.includes(term))) return null;

  const evidence: string[] = [];

  for (const [label, value, matched] of [["파일 이름", name, matches.name], ["폴더 경로", path, matches.path]] as const) {
    if (!matched.length) continue;

    const position = value.toLocaleLowerCase("ko").indexOf(matched[0].toLocaleLowerCase("ko"));

    evidence.push(`${label}: ${value.slice(Math.max(0, position - 50), position + matched[0].length + 50)}`);
  }

  return { positions: positions.filter(position => position >= 0), matches, evidence };
}

export function isFieldMatches(value: unknown): value is FindFieldMatches {
  if (!value || typeof value !== "object") return false;

  const fields = value as Record<string, unknown>;

  return ["name", "path", "body"].every(key => Array.isArray(fields[key])
    && fields[key].length <= 8
    && fields[key].every(term => typeof term === "string" && term.length >= 2 && term.length <= 64));
}

import type { DocumentQueryPlan } from "./document-query-plan";

export type FindSource = Readonly<{
  name: string;
  path: readonly string[];
}>;

export type FindFieldMatches = Readonly<{
  name: readonly string[];
  path: readonly string[];
  body: readonly string[];
}>;

export function matchesDocumentMetadata(source: FindSource, plan: DocumentQueryPlan) {
  const normalize = (value: string) => value.toLocaleLowerCase("ko").replaceAll("\\", "/").split("/").map(part => part.trim()).join("/");
  const parent = normalize(source.path.slice(0, -1).join("/"));
  const fields = [source.name.toLocaleLowerCase("ko"), parent];
  const formats = plan.clauses.filter(clause => clause.role === "format").flatMap(clause => clause.value.toLowerCase().split(","));
  const extension = source.name.match(/\.([^.]+)$/u)?.[1].toLowerCase();

  return (!formats.length || !!extension && formats.includes(extension))
    && plan.clauses.every(clause => clause.role !== "folder" || parent.includes(normalize(clause.value)))
    && plan.clauses.every(clause => clause.role !== "exclude" || !fields.some(field => field.includes(clause.value.toLocaleLowerCase("ko"))));
}

export function matchDocumentFields(text: string, terms: readonly string[], source?: FindSource, plan?: DocumentQueryPlan) {
  const body = text.toLocaleLowerCase("ko");
  const name = source?.name ?? "";
  const path = source?.path.slice(0, -1).join(" / ") ?? "";
  const lowerName = name.toLocaleLowerCase("ko");
  const lowerPath = path.toLocaleLowerCase("ko");
  const fields = [lowerName, lowerPath, body];
  const has = (term: string) => fields.some(field => field.includes(term.toLocaleLowerCase("ko")));
  const clauses = plan?.clauses ?? [];

  if (plan && source && !matchesDocumentMetadata(source, plan)) return null;

  if (clauses.some(clause => clause.role === "exclude" && has(clause.value))) return null;

  const formats = clauses.filter(clause => clause.role === "format").flatMap(clause => clause.value.toLowerCase().split(","));

  const extension = source?.name.match(/\.([^.]+)$/u)?.[1].toLowerCase();

  if (formats.length && (!extension || !formats.includes(extension))) return null;
  if (!source && clauses.some(clause => clause.role === "folder")) return null;

  const preferred = clauses.filter(clause => clause.role === "preferred").map(clause => clause.value);
  const matchingTerms = [...new Set([...terms, ...preferred.filter(has)])];
  const positions = matchingTerms.map(term => body.indexOf(term.toLocaleLowerCase("ko")));
  const matches: FindFieldMatches = {
    name: matchingTerms.filter(term => lowerName.includes(term.toLocaleLowerCase("ko"))),
    path: matchingTerms.filter(term => lowerPath.includes(term.toLocaleLowerCase("ko"))),
    body: matchingTerms.filter((_, index) => positions[index] >= 0),
  };

  if (!terms.length || terms.some(term => !has(term))) return null;

  const evidence: string[] = [];

  for (const [label, value, matched] of [["파일 이름", name, matches.name], ["폴더 경로", path, matches.path]] as const) {
    if (!matched.length) continue;

    const position = value.toLocaleLowerCase("ko").indexOf(matched[0].toLocaleLowerCase("ko"));

    evidence.push(`${label}: ${value.slice(Math.max(0, position - 50), position + matched[0].length + 50)}`);
  }

  const missing = preferred.filter(term => !has(term));

  return { positions: positions.filter(position => position >= 0), matches, evidence,
    ...(plan ? { relevance: { kind: missing.length ? "related" as const : "all" as const, missing, phraseBoost: clauses.filter(clause => clause.role === "phrase" && has(clause.value)).length } } : {}),
  };
}

export function isFieldMatches(value: unknown): value is FindFieldMatches {
  if (!value || typeof value !== "object") return false;

  const fields = value as Record<string, unknown>;

  return ["name", "path", "body"].every(key => Array.isArray(fields[key])
    && fields[key].length <= 8
    && fields[key].every(term => typeof term === "string" && term.length >= 1 && term.length <= 64));
}

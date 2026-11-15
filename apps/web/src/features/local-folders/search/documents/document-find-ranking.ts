import type { FindDocument } from "./document-find";

function fieldScore(document: FindDocument) {
  const matches = document.finding.matches;

  if (!matches) return 0;

  // Baseline weights express field priority; corpus evaluation must precede statistical ranking.
  const terms = new Set([...matches.name, ...matches.path, ...matches.body]);
  let score = 0;

  for (const term of terms) {
    if (matches.name.includes(term)) score += 4;
    else if (matches.path.includes(term)) score += 2;
    else score += 1;
  }

  return score;
}

export function compareFindDocuments(left: FindDocument, right: FindDocument) {
  const dateOrder = Number(right.finding.kind === "matched") - Number(left.finding.kind === "matched");

  if (dateOrder) return dateOrder;

  const completeness = Number(right.finding.relevance?.kind !== "related") - Number(left.finding.relevance?.kind !== "related");

  if (completeness) return completeness;

  const retrievalOrder = Number(!!left.retrieval && !left.retrieval.lexical) - Number(!!right.retrieval && !right.retrieval.lexical);
  if (retrievalOrder) return retrievalOrder;
  if (left.retrieval && right.retrieval && !left.retrieval.lexical && !right.retrieval.lexical) return right.retrieval.score - left.retrieval.score || JSON.stringify(left.path).localeCompare(JSON.stringify(right.path), "ko");

  const scoreOrder = (fieldScore(right) + (right.finding.relevance?.phraseBoost ?? 0) * 8) - (fieldScore(left) + (left.finding.relevance?.phraseBoost ?? 0) * 8);

  if (scoreOrder) return scoreOrder;

  return JSON.stringify(left.path).localeCompare(JSON.stringify(right.path), "ko");
}

export function rankFindDocuments(documents: readonly FindDocument[]): FindDocument[] {
  return [...documents].sort(compareFindDocuments);
}

export function mergeFindDocuments(literal: readonly FindDocument[], semantic: readonly FindDocument[]): FindDocument[] {
  const byPath = new Map(semantic.map(document => [JSON.stringify(document.path), document]));
  const paths = new Set(literal.map(document => JSON.stringify(document.path)));
  const merged = literal.map(document => {
    const other = byPath.get(JSON.stringify(document.path));
    if (!other?.retrieval || document.contentAvailable === false) return document;

    const additional = other.finding.evidence.filter(line => !document.finding.evidence.includes(line));
    // Reserve both retrieval reasons before applying the shared evidence limit.
    const evidence = [...document.finding.evidence.slice(0, 1), ...additional.slice(0, 1), ...document.finding.evidence.slice(1), ...additional.slice(1)];
    return {
      ...document,
      finding: { ...document.finding, evidence: [...new Set(evidence)].slice(0, 12) },
      retrieval: { ...other.retrieval, lexical: true as const },
    };
  });
  return [...merged, ...semantic.filter(document => !paths.has(JSON.stringify(document.path)))];
}

export function retainFindCandidate(documents: FindDocument[], candidate: FindDocument, limit: number): boolean {
  let start = 0;
  let end = documents.length;

  while (start < end) {
    const middle = Math.floor((start + end) / 2);

    if (compareFindDocuments(documents[middle], candidate) <= 0) start = middle + 1;
    else end = middle;
  }

  documents.splice(start, 0, candidate);

  if (documents.length <= limit) return false;

  documents.pop();

  return true;
}

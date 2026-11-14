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

  const scoreOrder = fieldScore(right) - fieldScore(left);

  if (scoreOrder) return scoreOrder;

  return JSON.stringify(left.path).localeCompare(JSON.stringify(right.path), "ko");
}

export function rankFindDocuments(documents: readonly FindDocument[]): FindDocument[] {
  return [...documents].sort(compareFindDocuments);
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

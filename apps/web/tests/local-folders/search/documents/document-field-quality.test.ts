import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findTextEvidence, inferFindRequest, type FindDocument, type FindQuery } from "../../../../src/features/local-folders/search/documents/document-find";
import { rankFindDocuments } from "../../../../src/features/local-folders/search/documents/document-find-ranking";

describe("FIND-008/009: reproducible field omission comparison", () => {
  it("compares body-only and combined-field retrieval without tuning on user examples", () => {
    const seed = 20261114;
    let randomState = seed;
    let bodyHits = 0;
    let combinedHits = 0;
    let falsePositives = 0;
    const topics = ["계약", "프로세스", "설문", "예산", "악보", "조리법", "법률", "디자인", "운영체제", "촬영"];

    for (let index = 0; index < 80; index++) {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      const target = `n${randomState.toString(36)}`;
      const topic = topics[index % topics.length];
      const terms = [target, topic];
      const query: FindQuery = { terms, from: null, to: null, basis: "body" };
      const corpus = [
        { path: [`${target} ${topic}.md`], text: "기록", relevant: true },
        { path: [target, "note.md"], text: topic, relevant: true },
        { path: ["body.md"], text: `${target} ${topic}`, relevant: true },
        { path: [`other ${topic}.md`], text: `other ${topic}`, relevant: false },
        { path: [`${target} unrelated.md`], text: "다른 주제", relevant: false },
      ];

      expect(inferFindRequest(`${target} ${topic} 찾아줘`).terms).toBe(terms.join(" "));
      const candidates: FindDocument[] = [];

      for (const entry of corpus) {
        if (findTextEvidence(entry.text, query)) bodyHits++;

        const name = entry.path.at(-1)!;
        const finding = findTextEvidence(entry.text, query, undefined, { name, path: entry.path });

        if (finding) {
          if (entry.relevant) combinedHits++;
          else falsePositives++;

          candidates.push({ name, path: entry.path, finding, contentAvailable: true });
        }
      }

      expect(rankFindDocuments(candidates).map(candidate => candidate.path)).toEqual(corpus.slice(0, 3).map(entry => entry.path));
    }

    expect({ bodyHits, combinedHits, falsePositives }).toEqual({ bodyHits: 80, combinedHits: 240, falsePositives: 0 });
    mkdirSync(".omx/verification/search-fields-20261114", { recursive: true });
    writeFileSync(".omx/verification/search-fields-20261114/quality.json", JSON.stringify({
      seed, queries: 80, documents: 400, expectedRelevant: 240, bodyHits, combinedHits, falsePositives,
      condition: "generated field-location regression; not independent natural-language holdout, personal corpus, semantic recall or a library benchmark",
    }, null, 2));
  });
});

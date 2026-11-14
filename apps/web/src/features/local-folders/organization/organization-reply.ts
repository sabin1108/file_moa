import {
  validateReviewAnswers,
  type ReviewAnswer,
  type ReviewQuestion,
} from "../../../shared/live-organization-review";
import type { OrganizationDocument } from "../../../shared/organization";

const compact = (value: string) => value.normalize("NFC").replace(/\s+/gu, "");
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

function documentPrefix(
  text: string,
  documents: readonly OrganizationDocument[],
) {
  const matches = documents.flatMap((document) => {
    const aliases = [
      [...document.sourcePath, document.name].join("/"),
      document.name,
      document.name.replace(/\.(md|txt)$/iu, ""),
    ];

    return aliases.flatMap((alias) => {
      const pattern = [...compact(alias)].map(escapePattern).join("\\s*");
      const match = text.match(
        new RegExp(
          `^["']?${pattern}["']?(?:\\s*(?:은|는|을|를|:)\\s*|\\s+|$)`,
          "u",
        ),
      );

      return match
        ? [{ documentId: document.id, length: match[0].length }]
        : [];
    });
  });

  if (!matches.length) return { text, documentId: null };

  const length = Math.max(...matches.map((match) => match.length));
  const ids = [
    ...new Set(
      matches
        .filter((match) => match.length === length)
        .map((match) => match.documentId),
    ),
  ];

  if (ids.length !== 1) throw Error("ambiguous-review-document");

  return { text: text.slice(length), documentId: ids[0] };
}

/** 현재 질문의 근거와 명시 경로만 해석한다. 미지원 문장은 일부 반영하지 않는다. */

export function parseOrganizationReply(
  text: string,
  questions: readonly ReviewQuestion[],
  documents: readonly OrganizationDocument[],
): ReviewAnswer[] {
  if (!text.trim() || text.length > 800) throw Error("invalid-review-reply");

  const targets = documents.filter((document) =>
    questions.some((question) => question.documentId === document.id),
  );
  const clauses = text
    .normalize("NFC")
    .split(/[,;\n]+|\s+그리고\s+|\s+하고\s+/u)
    .map((clause) => clause.trim())
    .filter(Boolean);

  if (!clauses.length || clauses.length > 80)
    throw Error("invalid-review-reply");

  const answers = new Map<string, ReviewAnswer>();

  for (const clause of clauses) {
    const target = documentPrefix(clause, targets);
    const value = target.text
      .replace(
        /\s*(?:정리해\s*줘|정리해\s*주세요|해\s*주세요|해\s*줘|하고)\s*[.!]?$/u,
        "",
      )
      .trim();
    const available = questions.filter(
      (question) =>
        !target.documentId || question.documentId === target.documentId,
    );
    const dateChoices = available
      .filter((question) => question.kind === "date")
      .flatMap<ReviewAnswer>((question) => {
        if (compact(value) === "날짜로나누지않기")
          return [{ documentId: question.documentId, date: null }];

        return question.dates
          .filter((date) =>
            [
              date.label,
              date.date,
              `${date.label}(${date.date})`,
              `${date.label}${date.date}`,
            ].some((choice) =>
              new RegExp(
                `^${escapePattern(compact(choice))}(?:[을를]?기준)?(?:으로|로)?$`,
                "u",
              ).test(compact(value)),
            ),
          )
          .map((date) => ({
            documentId: question.documentId,
            date: date.date,
            dateLabel: date.label,
          }));
      });
    let candidates: ReviewAnswer[] = dateChoices;

    if (!candidates.length) {
      if (compact(value) === "제외" || compact(value) === "이번정리에서제외") {
        candidates = [
          ...new Set(available.map((question) => question.documentId)),
        ].map((documentId) => ({ documentId, exclude: true }));
      } else {
        const destination = value
          .match(/^(.+?)\s*폴더(?:으로|로)$/u)?.[1]
          .trim();

        if (destination && target.documentId) {
          const quoted = /^"[^"]+"$|^'[^']+'$/u.test(destination);

          if (!quoted && /\s/u.test(destination))
            throw Error("unsupported-review-destination");

          const path = destination
            .replace(/^"(.*)"$/u, "$1")
            .replace(/^'(.*)'$/u, "$1")
            .split("/");

          candidates = available
            .filter((question) => question.kind === "destination")
            .map((question) => ({
              documentId: question.documentId,
              destination: path,
            }));
        }
      }
    }

    if (candidates.length !== 1)
      throw Error("ambiguous-or-unsupported-review-reply");

    const answer = candidates[0];
    const previous = answers.get(answer.documentId);

    if (previous) {
      for (const key of [
        "date",
        "dateLabel",
        "destination",
        "exclude",
      ] as const) {
        if (
          previous[key] !== undefined &&
          answer[key] !== undefined
          &&
          JSON.stringify(previous[key]) !== JSON.stringify(answer[key])
        )
          throw Error("conflicting-review-reply");
      }
    }

    answers.set(answer.documentId, { ...previous, ...answer });
  }

  return validateReviewAnswers([...answers.values()], documents);
}

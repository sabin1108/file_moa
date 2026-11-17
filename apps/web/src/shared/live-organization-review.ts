import { z } from "zod";
import { LIVE_ORGANIZATION_LIMITS } from "./live-organization-limits";
import {
  contentDates,
  isImportanceOnlyRequest,
  organizationPathSchema,
  organizationResponseSchema,
  parseOrganizationResponse,
  type OrganizationRequest,
  type OrganizationResponse
} from "./organization";

export const reviewAnswerSchema = z
  .strictObject({
    documentId: z.string().min(1).max(64),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable()
      .optional(),
    dateLabel: z.string().min(1).max(80).optional(),
    destination: organizationPathSchema.optional(),
    exclude: z.literal(true).optional()
  })
  .refine(answer =>
    answer.exclude
      ? answer.date === undefined && !answer.destination && !answer.dateLabel
      : answer.date !== undefined || !!answer.destination
  );

export type ReviewAnswer = z.infer<typeof reviewAnswerSchema>;

export type DateCandidate = Readonly<{
  id: string;
  date: string;
  label: string;
  evidence: string
}>;

export type ReviewQuestion = Readonly<{
  id: string;
  documentId: string;
  kind: "date" | "destination";
  reason: string;
  dates: readonly DateCandidate[];
}>;

const questionSchema = z.strictObject({
  documentId: z.string().min(1).max(64),
  kind: z.enum(["date", "destination"])
});

export function hasUnansweredReview(
  questions: readonly ReviewQuestion[],
  answers: readonly ReviewAnswer[]
) {
  return questions.some(
    question =>
      !answers.some(
        answer =>
          answer.documentId === question.documentId
          &&
          (answer.exclude ||
            (question.kind === "date" ? answer.date !== undefined : !!answer.destination))
      )
  );
}

function dateCandidates(document: OrganizationRequest["documents"][number]): DateCandidate[] {
  const result: DateCandidate[] = [];

  for (const line of document.excerpt.split(/\r?\n/u)) {
    for (const date of contentDates(line)) {
      const literal = [
        ...line.matchAll(/20\d{2}\s*(?:[-/.]|년)\s*\d{1,2}\s*(?:[-/.]|월)\s*\d{1,2}(?:일)?/gu)
      ].find(match => contentDates(match[0]).includes(date));

      if (!literal) continue;

      const label =
        line
          .slice(0, literal.index)
          .replace(/^[#\s*-]+|[:：\s]+$/gu, "")
          .trim()
          .slice(-80)
        || "본문 날짜";
      const evidence = line
        .slice(Math.max(0, literal.index - 60), literal.index + literal[0].length + 60)
        .trim();

      if (!result.some(candidate => candidate.date === date && candidate.label === label))
        result.push({ id: `${document.id}-date-${result.length + 1}`, date, label, evidence });
    }
  }

  return result;
}

export function validateReviewAnswers(
  value: unknown,
  documents: OrganizationRequest["documents"]
): ReviewAnswer[] {
  const answers = z.array(reviewAnswerSchema).max(LIVE_ORGANIZATION_LIMITS.documents).parse(value);
  const seen = new Set<string>();

  for (const answer of answers) {
    const document = documents.find(document => document.id === answer.documentId);

    if (!document || seen.has(answer.documentId)) throw Error("invalid-review-answer");

    seen.add(answer.documentId);

    if (answer.date !== undefined && answer.date !== null) {
      if (
        !dateCandidates(document).some(
          candidate =>
            candidate.date === answer.date &&
            (!answer.dateLabel || candidate.label === answer.dateLabel)
        )
      )
        throw Error("ungrounded-review-date");
    } else if (answer.dateLabel) throw Error("invalid-review-date-label");
  }

  return answers;
}

export function buildReviewQuestions(
  response: OrganizationResponse,
  request: OrganizationRequest,
  value: unknown
): ReviewQuestion[] {
  const definitions = z.array(questionSchema).max(LIVE_ORGANIZATION_LIMITS.documents * 2).parse(value);
  const seen = new Set<string>();
  const questions = definitions.map(question => {
    const held = response.held.find(item => item.documentId === question.documentId);
    const document = request.documents.find(document => document.id === question.documentId);
    const id = `${question.documentId}:${question.kind}`;

    if (!held || !document || seen.has(id)) throw Error("invalid-review-question");

    seen.add(id);

    return {
      ...question,
      id,
      reason: held.reason,
      dates: question.kind === "date" ? dateCandidates(document) : []
    };
  });

  if (
    response.held.some(item => !questions.some(question => question.documentId === item.documentId))
  )
    throw Error("missing-review-question");

  return questions;
}

export function parseLiveOrganizationResponse(
  value: unknown,
  request: OrganizationRequest,
  answers: readonly ReviewAnswer[]
) {
  const importanceOnly = isImportanceOnlyRequest(request);
  const parsed = z
    .strictObject({
      ...organizationResponseSchema.shape,
      ...(importanceOnly ? { matches: z.array(organizationResponseSchema.shape.matches.element.extend({ date: z.null().default(null) })).max(LIVE_ORGANIZATION_LIMITS.documents) } : {}),
      questions: z.array(questionSchema).max(LIVE_ORGANIZATION_LIMITS.documents * 2).optional()
    })
    .parse(value);
  if (importanceOnly) {
    // 분류가 빠진 자료는 숨기거나 임의로 등급을 매기지 않고 사용자 확인으로 돌린다.
    const seen = new Set([...parsed.matches, ...parsed.held, ...answers.filter(answer => answer.exclude)].map(item => item.documentId));
    parsed.held.push(...request.documents.filter(document => !seen.has(document.id)).map(document => ({ documentId: document.id, reason: "AI가 이 자료의 등급을 제시하지 않았어요. 목적지를 정하거나 이번 정리에서 제외해 주세요." })));
  }
  const dateSelections = Object.fromEntries(
    answers
      .filter(answer => answer.date !== undefined)
      .map(answer => [answer.documentId, answer.date!])
  ) as Record<string, string | null>;
  const destinationSelections = Object.fromEntries(
    answers
      .filter(answer => answer.destination)
      .map(answer => [answer.documentId, answer.destination!])
  ) as Record<string, readonly string[]>;
  const organization = parseOrganizationResponse(
    { summary: parsed.summary, matches: parsed.matches, held: parsed.held },
    {
      ...request,
      context: {
        reference: null,
        destination: null,
        ...request.context,
        dateSelections,
        destinationSelections
      }
    }
  );
  const definitions = parsed.questions ?? [];
  const questions = buildReviewQuestions(
    organization,
    request,
    [...definitions, ...organization.held.filter(item => !definitions.some(question => question.documentId === item.documentId))
      .map(item => ({ documentId: item.documentId, kind: "destination" as const }))]
  );

  for (const answer of validateReviewAnswers(answers, request.documents)) {
    if (
      answer.exclude
      &&
      [...organization.matches, ...organization.held].some(
        item => item.documentId === answer.documentId
      )
    )
      throw Error("ignored-review-exclusion");

    const match = organization.matches.find(item => item.documentId === answer.documentId);

    if (
      match &&
      answer.destination &&
      JSON.stringify(match.destination) !== JSON.stringify(answer.destination)
    )
      throw Error("ignored-review-destination");

    if (
      questions.some(
        question =>
          question.documentId === answer.documentId
          &&
          ((question.kind === "date" && answer.date !== undefined)
            ||
            (question.kind === "destination" && answer.destination))
      )
    )
      throw Error("repeated-review-question");
  }

  return { organization, questions };
}

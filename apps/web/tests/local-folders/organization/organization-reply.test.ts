import { describe, expect, it, vi } from "vitest";
import { parseOrganizationReply } from "../../../src/features/local-folders/organization/organization-reply";
import { buildReviewQuestions } from "../../../src/shared/live-organization-review";
import { OrganizationPreparationController } from "../../../src/features/local-folders/organization/organization-preparation-controller";
import type { SourceSnapshot } from "../../../src/features/local-folders/organization/source-snapshot-rules";

const documents = [
  {
    id: "date",
    name: "날짜보고.md",
    sourcePath: [],
    excerpt: "작성일: 2026-10-01\n검토 기준일: 2026-10-15\n성능 결과입니다.",
  },
  {
    id: "mixed",
    name: "혼합자료.txt",
    sourcePath: ["회사"],
    excerpt: "성능 결과와 학습 노트입니다.",
  },
];
const organization = {
  summary: "질문",
  matches: [],
  held: documents.map((document) => ({
    documentId: document.id,
    reason: "기준 확인",
  })),
};
const questions = buildReviewQuestions(
  organization,
  { instruction: "성능 정리", documents },
  [
    { documentId: "date", kind: "date" },
    { documentId: "mixed", kind: "destination" },
  ],
);

describe("CF-003: grounded local chat replies", () => {
  it("maps a combined reply to real date evidence and an explicit relative destination", () => {
    expect(
      parseOrganizationReply(
        "검토 기준일로 하고, 혼합 자료는 학습 폴더로",
        questions,
        documents,
      ),
    ).toEqual([
      { documentId: "date", date: "2026-10-15", dateLabel: "검토 기준일" },
      { documentId: "mixed", destination: ["학습"] },
    ]);
  });

  it("uses exact file or path references and preserves spaces in a destination", () => {
    expect(
      parseOrganizationReply(
        '날짜보고.md는 2026-10-15로\n회사/혼합자료.txt는 "개인 학습/성능" 폴더로 해 줘',
        questions,
        documents,
      ),
    ).toEqual([
      { documentId: "date", date: "2026-10-15", dateLabel: "검토 기준일" },
      { documentId: "mixed", destination: ["개인 학습", "성능"] },
    ]);
  });

  it("supports explicit exclusion and choosing not to split by date", () => {
    expect(
      parseOrganizationReply("혼합자료는 제외해 줘", questions, documents),
    ).toEqual([{ documentId: "mixed", exclude: true }]);
    expect(
      parseOrganizationReply(
        "날짜보고는 날짜로 나누지 않기",
        questions,
        documents,
      ),
    ).toEqual([{ documentId: "date", date: null }]);
  });

  it.each([
    "작성일 말고 검토 기준일로",
    "검토 기준일로, 혼합자료는 어디든 알아서",
    "검토 기준일로 하지 마",
    "검토 기준일로, 작성일로",
    "혼합자료는 제외, 혼합자료는 학습 폴더로",
    "외부문서는 학습 폴더로",
    "외부문서는학습폴더로",
    "혼합자료는 학습 말고 업무 폴더로",
    "2026-12-01로",
    "혼합자료는 ../학습 폴더로",
    "혼합자료는 C:/학습 폴더로",
    "혼합자료는 CON 폴더로",
    " ",
    "가".repeat(801),
  ])(
    "refuses the entire unsupported, conflicting or unsafe reply: %s",
    (text) => {
      expect(() =>
        parseOrganizationReply(text, questions, documents),
      ).toThrow();
    },
  );

  it("does not choose between duplicate names, shared labels, or one date with different meanings", () => {
    const duplicate = {
      ...documents[0],
      id: "other",
      sourcePath: ["다른 폴더"],
    };
    const duplicatedQuestions = [
      ...questions,
      { ...questions[0], documentId: "other", id: "other:date" },
    ];

    expect(() =>
      parseOrganizationReply("검토 기준일로", duplicatedQuestions, [
        ...documents,
        duplicate,
      ]),
    ).toThrow();
    expect(() =>
      parseOrganizationReply("날짜보고는 검토 기준일로", duplicatedQuestions, [
        ...documents,
        duplicate,
      ]),
    ).toThrow();
    expect(
      parseOrganizationReply(
        "다른 폴더/날짜보고.md는 검토 기준일로",
        duplicatedQuestions,
        [...documents, duplicate],
      )[0].documentId,
    ).toBe("other");

    const sameDate = {
      ...questions[0],
      dates: questions[0].dates.map((date) => ({
        ...date,
        date: "2026-10-15",
      })),
    };

    expect(() =>
      parseOrganizationReply("2026-10-15로", [sameDate], documents),
    ).toThrow();
  });
});

async function prepared() {
  const snapshot: SourceSnapshot = {
    documents: documents.map((document) => ({
      ...document,
      path: [...document.sourcePath, document.name],
      size: 100,
      lastModified: 42,
      sha256: "a".repeat(64),
      excerptHash: "b".repeat(64),
    })),
    excluded: [],
    complete: true,
    limits: [],
    discoveredFiles: 2,
    directories: 2,
    bytes: 200,
  };
  const action = vi.fn(async () => ({
    ok: true as const,
    organization,
    questions,
    model: "fixture",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  }));
  const read = vi.fn(async () => snapshot);
  const controller = new OrganizationPreparationController(
    read,
    vi.fn(),
    vi.fn(),
    vi.fn(async () => ({ userId: "A", workspaceId: "A" })),
  );

  controller.update({ request: "성능 결과 정리", scope: { kind: "all" } });
  await controller.prepare();
  controller.consent(true);
  await controller.send(action);

  return { controller, action, read };
}

describe("CF-003: reply state and existing consent boundary", () => {
  it("rejects oversized replies without truncating away a later negation", async () => {
    const { controller } = await prepared();
    const reply = "검토 기준일로".padEnd(801, " ") + "하지 마";

    controller.updateReply(reply);
    controller.submitReply();
    expect(controller.getSnapshot()).toMatchObject({
      replyDraft: reply,
      answers: [],
      result: { organization },
    });
    expect(controller.getSnapshot().issue).toBeTruthy();
  });
  it("keeps typing separate and commits all answers without rereading or transmitting", async () => {
    const { controller, action, read } = await prepared();
    const before = controller.getSnapshot();
    const draft = "검토 기준일로 하고, 혼합자료는 학습 폴더로";

    controller.updateReply(draft);
    expect(controller.getSnapshot()).toMatchObject({
      request: before.request,
      snapshot: before.snapshot,
      result: before.result,
      answers: [],
      replyDraft: draft,
    });
    controller.submitReply();
    expect(controller.getSnapshot()).toMatchObject({
      phase: "ready",
      request: before.request,
      snapshot: before.snapshot,
      result: null,
      consentKey: null,
      replyDraft: "",
      submittedReply: draft,
    });
    expect(controller.getSnapshot().answers).toHaveLength(2);
    await controller.send(action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    controller.consent(true);
    expect(controller.getSnapshot().consentKey).toBeTruthy();
    controller.updateReply("날짜보고는 작성일로");
    expect(controller.getSnapshot().consentKey).toBeTruthy();
    controller.submitReply();
    expect(controller.getSnapshot()).toMatchObject({
      consentKey: null,
      result: null,
    });
    expect(
      controller
        .getSnapshot()
        .answers.find((answer) => answer.documentId === "date")?.date,
    ).toBe("2026-10-01");
    expect(
      controller
        .getSnapshot()
        .answers.find((answer) => answer.documentId === "mixed")?.destination,
    ).toEqual(["학습"]);
  });

  it("keeps all previous answers, proposal and consent if any clause is unsupported", async () => {
    const { controller } = await prepared();

    controller.answer({ documentId: "mixed", destination: ["기존"] });

    const before = controller.getSnapshot();

    controller.updateReply("검토 기준일로, 혼합자료는 알아서");
    controller.submitReply();
    expect(controller.getSnapshot()).toMatchObject({
      answers: before.answers,
      snapshot: before.snapshot,
      result: before.result,
      consentKey: before.consentKey,
      replyDraft: "검토 기준일로, 혼합자료는 알아서",
    });
    expect(controller.getSnapshot().issue).toBeTruthy();
  });

  it("clears reply drafts on scope/selection changes, cancel and owner reset", async () => {
    for (const change of [
      (c: OrganizationPreparationController) => c.update({ basis: "변경" }),
      (c: OrganizationPreparationController) => c.toggleDocument("date"),
      (c: OrganizationPreparationController) => c.cancel(),
      (c: OrganizationPreparationController) => c.reset(),
    ]) {
      const { controller } = await prepared();

      controller.updateReply("검토 기준일로");
      change(controller);
      expect(controller.getSnapshot()).toMatchObject({
        replyDraft: "",
        submittedReply: "",
      });
    }
  });

  it("replaces a dated answer with no date and clears old evidence labels", async () => {
    const { controller } = await prepared();

    controller.answer({
      documentId: "date",
      date: "2026-10-15",
      dateLabel: "검토 기준일",
    });
    controller.updateReply("날짜보고는 날짜로 나누지 않기");
    controller.submitReply();
    expect(controller.getSnapshot().answers).toEqual([
      { documentId: "date", date: null, dateLabel: undefined },
    ]);
    expect(controller.getSnapshot().issue).toBeNull();
  });

  it("blocks replies while sending and discards a late result after cancellation", async () => {
    const { controller, action } = await prepared();
    const response = await action.mock.results[0].value;

    controller.updateReply("검토 기준일로, 혼합자료는 학습 폴더로");
    controller.submitReply();

    let finish!: (value: typeof response) => void;

    action.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    controller.consent(true);

    const sending = controller.send(action);

    await Promise.resolve();
    expect(controller.getSnapshot().phase).toBe("sending");

    const answers = controller.getSnapshot().answers;

    controller.updateReply("날짜보고는 작성일로");
    controller.submitReply();
    expect(controller.getSnapshot()).toMatchObject({
      answers,
      replyDraft: "",
      phase: "sending",
    });
    controller.cancel();
    finish(response);
    await sending;
    expect(controller.getSnapshot()).toMatchObject({
      answers: [],
      questions: [],
      submittedReply: "",
      replyDraft: "",
      result: null,
    });
    expect(action).toHaveBeenCalledTimes(2);
  });
});

import type {
  LiveOrganizationAction,
  LiveOrganizationInput,
  LiveOrganizationResult
} from "../../src/shared/live-organization";
import { parseLiveOrganizationResponse } from "../../src/shared/live-organization-review";

// Only the provider/Action transport is synthetic; the actual controller, disk reader and Worker run.

declare global {
  interface Window {
    liveTransferProbe: {
      calls: LiveOrganizationInput[];
      mode: "success" | "hold" | "failure" | "review";
      finish: (() => void) | null;
      total: number;
    };
  }
}

export function liveOrganizationFixtureAction(): LiveOrganizationAction {
  const probe = (window.liveTransferProbe = {
    calls: [] as LiveOrganizationInput[],
    mode: "success" as "success" | "hold" | "failure" | "review",
    finish: null as (() => void) | null,
    total: Number(sessionStorage.getItem("fixture-live-calls") ?? 0)
  });

  return async input => {
    probe.calls.push(structuredClone(input));
    sessionStorage.setItem("fixture-live-calls", String(++probe.total));

    if (probe.mode === "review") {
      const documents = input.documents.filter(document =>
        ["날짜보고.md", "혼합.txt"].includes(document.name)
      );
      const request = {
        instruction: input.request,
        documents: documents.map(document => ({
          ...document,
          sourcePath: document.path.slice(0, -1)
        }))
      };
      const answers = input.answers ?? [];
      const held = documents.filter(
        document => !answers.some(answer => answer.documentId === document.id)
      );
      const reviewed = parseLiveOrganizationResponse(
        {
          summary: held.length
            ? "날짜와 혼합 자료를 함께 확인해 주세요."
            : "답변을 반영한 합성 제안입니다.",
          matches: documents
            .filter(document =>
              answers.some(answer => answer.documentId === document.id && !answer.exclude)
            )
            .map(document => {
              const answer = answers.find(answer => answer.documentId === document.id)!;

              return {
                documentId: document.id,
                destination: answer.destination ?? [
                  "날짜자료",
                  ...(answer.date ? [answer.date] : [])
                ],
                evidence: document.excerpt.slice(-60),
                date: answer.date ?? null
              };
            }),
          held: held.map(document => ({
            documentId: document.id,
            reason:
              document.name === "날짜보고.md"
                ? "작성일과 검토 기준일 중 무엇을 사용할까요?"
                : "회사와 개인 주제가 섞여 있습니다. 어느 폴더로 정리할까요?"
          })),
          questions: held.map(document => ({
            documentId: document.id,
            kind: document.name === "날짜보고.md" ? "date" : "destination"
          }))
        },
        request,
        answers
      );

      return {
        ok: true,
        ...reviewed,
        model: "fixture-provider",
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 }
      };
    }

    const response: LiveOrganizationResult = {
      ok: true,
      model: "fixture-provider",
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      organization: {
        summary: "합성 공급자의 검토 제안입니다.",
        matches: [
          {
            documentId: input.documents[0].id,
            destination: ["성능 자료"],
            evidence: input.documents[0].excerpt.slice(0, 80),
            date: null
          }
        ],
        held: input.documents.slice(1, 2).map(document => ({
          documentId: document.id,
          reason: "합성 자료의 날짜 기준을 확인해 주세요."
        }))
      }
    };

    if (probe.mode === "failure") return { ok: false, code: "limit", retryAfter: 60 };

    if (probe.mode === "hold")
      await new Promise<void>(resolve => {
        probe.finish = resolve;
      });

    return response;
  };
}

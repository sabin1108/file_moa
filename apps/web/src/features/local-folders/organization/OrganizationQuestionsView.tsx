"use client";

import type {
  OrganizationPreparationController,
  OrganizationPreparationState,
} from "./organization-preparation-controller";
import { actionClasses } from "../../../components/ui/action-classes";
import styles from "./organization-preparation.module.css";

export function OrganizationQuestionsView({
  controller,
  state,
  assignment,
  onAssignment,
}: {
  controller: OrganizationPreparationController;
  state: OrganizationPreparationState;
  assignment: string;
  onAssignment: (value: string) => void;
}) {
  if (!state.questions.length || !state.snapshot) return null;

  const pending = state.phase === "checking" || state.phase === "sending";
  const documentIds = [
    ...new Set(state.questions.map((question) => question.documentId)),
  ];
  const destinationIds = [...new Set(state.questions.filter(question => question.kind === "destination").map(question => question.documentId))]
    .filter(id => !state.answers.some(answer => answer.documentId === id && answer.exclude));
  const reasons = [...new Set(state.questions.map(question => question.reason))];
  const commonReason = reasons.length === 1 ? reasons[0] : null;

  return (
    <section
      className={styles.snapshot}
      aria-label="애매한 자료 묶음 확인"
      data-review-questions
    >
      <h3>확인이 필요한 자료 {documentIds.length}개</h3>
      <p className={styles.note}>파일 내용을 살펴보고 목적지나 날짜 기준을 정해 주세요. 아직 파일은 바뀌지 않습니다.</p>
      {commonReason && <p className={styles.note}>{commonReason}</p>}
      {destinationIds.length > 0 && <fieldset disabled={pending} className={styles.assignment}>
        <legend>목적지를 어떻게 정할까요?</legend>
        <div className={styles.actions}>
          <label><input type="radio" name="organization-assignment" checked={assignment === "same"} onChange={() => onAssignment("same")} /> 같은 폴더로 한 번에</label>
          <label><input type="radio" name="organization-assignment" checked={assignment === "each"} onChange={() => onAssignment("each")} /> 파일별로 지정</label>
        </div>
        {assignment === "same" && <button type="button" className={actionClasses("secondary")} onClick={() => void controller.browseAnswers(destinationIds)}>
          {destinationIds.length}개 자료의 목적지 폴더 선택
        </button>}
      </fieldset>}
      {documentIds.map((documentId) => {
        const document = state.snapshot!.documents.find(
          (document) => document.id === documentId,
        )!;
        const questions = state.questions.filter(
          (question) => question.documentId === documentId,
        );
        const answer = state.answers.find(
          (answer) => answer.documentId === documentId,
        );
        const base = answer?.exclude
          ? { documentId }
          : (answer ?? { documentId });
        let status = "기준 확인 필요";
        if (answer?.exclude) status = "이번 정리에서 제외";
        else if (answer?.destination) status = `목적지: ${answer.destination.join(" / ")}`;
        else if (answer?.date !== undefined) status = answer.date === null ? "날짜로 나누지 않음" : `날짜: ${answer.date}`;

        return (
          <details
            key={documentId}
            className={styles.questionRow}
          >
            <summary>
              <strong>{document.name}</strong>
              <span>{status}</span>
            </summary>
            <fieldset disabled={pending}>
            <legend className="sr-only">{document.name}</legend>
            <p className={styles.note}>{document.path.slice(0, -1).join(" / ") || "연결 폴더"}</p>
            <details>
              <summary>파일 내용 확인</summary>
              <pre className={styles.questionExcerpt}>{document.excerpt || "(빈 문서)"}</pre>
            </details>
            {questions.map((question) => (
              <div key={question.id}>
                {!commonReason && <p className={styles.note}>
                  {question.reason}
                </p>}
                {question.kind === "date"
                  ? (
                    <label className={styles.basis}>
                      어떤 날짜 의미로 정리할까요?
                      <select
                        aria-label={`${document.name} 날짜 기준`}
                        value={
                          answer?.date === null
                            ? "none"
                            : (question.dates.find(
                              (date) =>
                                date.date === answer?.date
                                &&
                                (!answer.dateLabel ||
                                  date.label === answer.dateLabel),
                            )?.id ?? "")
                        }
                        onChange={(event) => {
                          if (!event.target.value) {
                            controller.clearAnswer(documentId);

                            return;
                          }

                          const date = question.dates.find(
                            (date) => date.id === event.target.value,
                          );

                          controller.answer({
                            ...base,
                            date: date?.date ?? null,
                            ...(date
                              ? { dateLabel: date.label }
                              : { dateLabel: undefined }),
                          });
                        }}
                      >
                        <option value="">근거를 확인하고 선택</option>
                        {question.dates.map((date) => (
                          <option key={date.id} value={date.id}>
                            {date.label} · {date.date}
                          </option>
                        ))}
                        <option value="none">이 자료는 날짜로 나누지 않기</option>
                      </select>
                      {question.dates.map((date) => (
                        <blockquote key={date.id}>
                          {date.evidence}
                        </blockquote>
                      ))}
                      {!question.dates.length
                        && (
                          <p>
                            발췌에 확인 가능한 날짜가 없습니다. 생성일이나 수정일을
                            대신 만들지 않습니다.
                          </p>
                        )}
                    </label>
                  )
                  : (
                    <div className={styles.folderChoice}>
                      <p>{answer?.exclude ? "이번 정리에서 제외" : answer?.destination ? `목적지: ${answer.destination.join(" / ")}` : "목적지를 선택해 주세요"}</p>
                      {assignment === "each" && !answer?.exclude && <button type="button" className={actionClasses("secondary")} aria-label={`${document.name} 목적지 폴더 선택`} onClick={() => void controller.browseAnswers([documentId])}>폴더 선택</button>}
                    </div>
                  )}
              </div>
            ))}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={!!answer?.exclude}
                onChange={(event) =>
                  event.target.checked
                    ? controller.answer({ documentId, exclude: true })
                    : controller.clearAnswer(documentId)
                }
              />
              이번 정리에서 제외
            </label>
            </fieldset>
          </details>
        );
      })}
    </section>
  );
}

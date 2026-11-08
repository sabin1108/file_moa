"use client";
import type {
  OrganizationPreparationController,
  OrganizationPreparationState,
} from "../../store/organization-preparation-controller";
import { actionClasses } from "../../../../components/ui/action-classes";
import styles from "./organization-preparation.module.css";

export function OrganizationQuestionsView({
  controller,
  state,
}: {
  controller: OrganizationPreparationController;
  state: OrganizationPreparationState;
}) {
  if (!state.questions.length || !state.snapshot) return null;
  const pending = state.phase === "checking" || state.phase === "sending";
  const documentIds = [
    ...new Set(state.questions.map((question) => question.documentId)),
  ];
  return (
    <section
      className={styles.snapshot}
      aria-label="애매한 자료 묶음 확인"
      data-review-questions
    >
      <h3>
        {state.result && !state.result.organization.held.length
          ? "확인한 기준·답변 수정"
          : "확인이 필요한 자료를 모았어요"}
      </h3>
      <p>
        실제 날짜 근거와 목적지를 함께 확인해 주세요. 답변을 바꾸면 이전 제안은
        폐기하며, 다시 확인하고 전송해야 반영됩니다.
      </p>
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
        return (
          <fieldset
            key={documentId}
            disabled={pending}
            className={styles.conditions}
          >
            <legend>{document.path.join(" / ")}</legend>
            {questions.map((question) => (
              <div key={question.id}>
                <p>{question.reason}</p>
                {question.kind === "date" ? (
                  <label className={styles.basis}>
                    어떤 날짜 의미로 정리할까요?
                    <select
                      aria-label={`${document.name} 날짜 기준`}
                      value={
                        answer?.date === null
                          ? "none"
                          : (question.dates.find(
                              (date) =>
                                date.date === answer?.date &&
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
                      <blockquote key={date.id}>{date.evidence}</blockquote>
                    ))}
                    {!question.dates.length && (
                      <p>
                        발췌에 확인 가능한 날짜가 없습니다. 생성일이나 수정일을
                        대신 만들지 않습니다.
                      </p>
                    )}
                  </label>
                ) : (
                  <form
                    className={styles.basis}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = String(
                        new FormData(event.currentTarget).get("destination") ??
                          "",
                      ).trim();
                      controller.answer({
                        ...base,
                        destination: value.split("/"),
                      });
                    }}
                  >
                    <label>
                      이 자료의 정리 하위 경로
                      <input
                        key={answer?.destination?.join("/") ?? ""}
                        name="destination"
                        aria-label={`${document.name} 정리 하위 경로`}
                        maxLength={120}
                        defaultValue={answer?.destination?.join("/") ?? ""}
                        placeholder="주제 폴더/하위 폴더"
                      />
                    </label>
                    <button
                      type="submit"
                      className={actionClasses("secondary")}
                    >
                      이 목적지로 답변
                    </button>
                  </form>
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
            {answer && (
              <p className={styles.note}>
                답변을 보관했습니다. 전송 자료 확인에서 새로 확인하고 답변을
                반영해 주세요.
              </p>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}

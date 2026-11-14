"use client";

import { actionClasses } from "../../../components/ui/action-classes";
import type {
  OrganizationPreparationController,
  OrganizationPreparationState,
} from "./organization-preparation-controller";
import type { SourceListingState } from "../browsing/file-list/source-listing-controller";
import styles from "./organization-preparation.module.css";

/** 자료 범위·참고·목적지 조건 입력만 담당한다. 파일 읽기/전송 상태는 기존 controller가 소유한다. */

export function OrganizationConditionsView({
  controller,
  state,
  files,
  folderName,
}: {
  controller: OrganizationPreparationController;
  state: OrganizationPreparationState;
  files: SourceListingState;
  folderName: string;
}) {
  const pathLabel = (path: readonly string[] | null) =>
    path === null ? "미지정" : [folderName, ...path].join(" / ");
  const scopeLabel =
    state.scope?.kind === "all"
      ? `${folderName} 전체`
      : state.scope?.kind === "folder"
        ? pathLabel(state.scope.path)
        : state.scope?.kind === "selected"
          ? `선택한 항목 ${state.scope.entries.length}개`
          : "어디에서 찾을까요?";
  const reading = ["reading", "checking", "sending"].includes(state.phase);
  const availableSelection =
    files.phase === "ready" && !files.stale && !!files.result;
  const selected = availableSelection
    ? files.result!.entries.filter((entry) =>
      files.selectedNames.includes(entry.name),
    )
    : [];

  return (
    <details
      data-organization-conditions
      className={styles.conditions}
      open={
        state.phase === "draft" ||
        state.phase === "scope" ||
        state.phase === "error"
      }
    >
      <summary>찾을 범위·정리 조건 · {scopeLabel}</summary>
      <fieldset disabled={reading}>
        <legend>어디에서 찾을까요?</legend>
        {state.questions.length > 0
          && (
            <div>
              <button
                type="button"
                className={actionClasses("secondary")}
                onClick={() => controller.update({ request: state.request })}
              >
                최초 정리 요청 수정
              </button>
              <p className={styles.note}>
                수정하면 자료와 답변을 다시 준비합니다.
              </p>
            </div>
          )}
        <p aria-label="현재 탐색 범위">
          {scopeLabel}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={actionClasses("secondary")}
            aria-pressed={state.scope?.kind === "all"}
            onClick={() => controller.update({ scope: { kind: "all" } })}
          >
            연결한 폴더 전체
          </button>
          <button
            type="button"
            className={actionClasses("secondary")}
            onClick={() => void controller.browse("scope")}
          >
            하위 폴더 선택
          </button>
          <button
            type="button"
            className={actionClasses("ghost")}
            disabled={!selected.length}
            onClick={() =>
              controller.update({
                scope: {
                  kind: "selected",
                  entries: selected.map((entry) => ({
                    path: [...files.result!.path, entry.name],
                    kind: entry.kind,
                  })),
                },
              })
            }
          >
            내 파일에서 선택한 {selected.length}개
          </button>
        </div>
        <label className={styles.basis}>
          정리 기준·확인할 내용
          <textarea
            rows={2}
            maxLength={800}
            value={state.basis}
            placeholder="원하는 기준이 있으면 적어 주세요. 요청에 적은 내용도 함께 보관합니다."
            onChange={(event) =>
              controller.update({ basis: event.target.value })
            }
          />
        </label>
        {(["reference", "destination"] as const).map((kind) => (
          <div className={styles.folderChoice} key={kind}>
            <div>
              <h3>
                {kind === "reference" ? "참고할 폴더 구조" : "최종 목적지"}
              </h3>
              <p>
                {pathLabel(state[kind])}
              </p>
            </div>
            <button
              type="button"
              className={actionClasses("secondary")}
              aria-label={`${kind === "reference" ? "참고" : "목적지"} 폴더 선택`}
              onClick={() => void controller.browse(kind)}
            >
              폴더 선택
            </button>
            {state[kind] !== null
              && (
                <button
                  type="button"
                  className={actionClasses("ghost")}
                  onClick={() => controller.update({ [kind]: null })}
                >
                  지우기
                </button>
              )}
          </div>
        ))}
        <p className={styles.note}>
          참고 폴더와 목적지는 찾을 범위를 바꾸지 않습니다. 날짜의 의미나 여러
          주제가 섞인 자료는 AI 분석 뒤 함께 확인합니다.
        </p>
      </fieldset>
      {!reading
        && (
          <button
            type="button"
            data-local-prepare
            className={actionClasses("secondary")}
            disabled={!state.request.trim() || !state.scope}
            onClick={() => void controller.prepare()}
          >
            {state.phase === "ready"
              ? "자료 다시 읽기"
              : "설정한 범위의 TXT/MD 읽기"}
          </button>
        )}
    </details>
  );
}

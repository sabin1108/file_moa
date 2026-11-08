import { useEffect, useRef } from "react";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { actionClasses } from "../../../../components/ui/action-classes";
import type {
  ManagedFilesController,
  ManagedFilesState,
} from "../../store/managed-files-controller";
import styles from "./managed-files.module.css";
import historyStyles from "../history/folder-history.module.css";
import { DestinationPlanStep } from "../plan/DestinationPlanStep";
import { FileChangeComparison } from "../plan/FileChangeComparison";

const actions = {
  copy: "복사 실행",
  move: "보존 후 이동 실행",
  trash: "보존 후 휴지통으로 보내기",
  edit: "보존 후 저장",
  recover: "새 항목으로 복구",
};
const phases = {
  preserving: "원래 내용 보존·검증 중",
  writing: "목적지 쓰기·검증 중",
  removing: "보존된 원본 처리 중",
  completed: "완료",
  cancelled: "중단됨",
  error: "완료하지 못함",
};
export function ManagedOperationView({
  controller,
  state,
  folderName,
}: {
  controller: ManagedFilesController;
  state: ManagedFilesState;
  folderName: string;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state.phase === "ready") cancel.current?.focus({ preventScroll: true });
  }, [state.phase]);
  const kind = state.request!.kind;
  const running = state.phase === "running";
  const finished = state.result && !running;
  const planning = kind === "copy" || kind === "move";
  return (
    <section aria-label="파일 작업 검토" data-managed-phase={state.phase}>
      {planning && state.phase === "ready" && state.preview && (
        <FileChangeComparison
          rootName={folderName}
          operation={kind}
          changes={state.preview.roots.map((from) => ({
            from,
            to: [...state.preview!.destination, from.at(-1)!],
          }))}
        />
      )}
      {kind === "edit" && state.editor && (
        <label className={styles.editor}>
          문서 편집 내용
          <textarea
            value={state.text}
            maxLength={2 * 1024 * 1024}
            readOnly={state.phase !== "draft"}
            spellCheck={false}
            onChange={(event) => controller.setText(event.target.value)}
          />
        </label>
      )}
      {planning && !running && !state.result && (
        <DestinationPlanStep
          operation={kind}
          onOperationChange={controller.setOperation}
          folderName={folderName}
          destination={state.request!.destination}
          confirmed={state.destinationConfirmed}
          onBrowse={() => {
            void controller.browse();
          }}
          pending={state.phase === "preparing"}
          hasPlan={!!state.preview}
          onPlan={() => {
            if (state.phase === "ready") controller.backToDraft();
            void controller.review();
          }}
          onCancel={controller.cancel}
        />
      )}
      {state.phase === "draft" && !planning && (
        <>
          <p className={historyStyles.note}>
            {kind === "trash"
              ? "보관함에 사본을 검증한 뒤 선택한 원본을 제거합니다. 앱 휴지통에서 새 항목으로 복구할 수 있습니다."
              : kind === "edit"
                ? "저장 전 파일 변경 여부와 이전 내용 보존을 검사합니다."
                : "목적지와 선택 자료를 먼저 확인합니다."}
          </p>
          <button
            type="button"
            className={actionClasses("primary")}
            disabled={kind === "edit" && !state.editor}
            onClick={() => {
              void controller.review();
            }}
          >
            변경 전 검사
          </button>
        </>
      )}
      {state.preview && (
        <>
          <div className={historyStyles.list}>
            <dl>
              <dt>선택한 위치</dt>
              <dd>
                {state.preview.roots
                  .map((path) => [folderName, ...path].join(" / "))
                  .join(", ")}
              </dd>
              <dt>규모</dt>
              <dd>
                {"파일 "}
                {state.preview.files}
                {"개 · 폴더 "}
                {state.preview.folders}
                {"개 · "}
                {state.preview.bytes.toLocaleString("ko-KR")}
                {" bytes"}
              </dd>
              {["copy", "move", "recover"].includes(kind) && (
                <>
                  <dt>목적지</dt>
                  <dd>
                    {[folderName, ...state.preview.destination].join(" / ")}
                  </dd>
                </>
              )}
            </dl>
          </div>
          {state.preview.skipped && (
            <StatusNotice
              state="attention"
              title="관리 폴더는 복사에서 제외합니다."
            />
          )}
          <details>
            <summary>
              {"항목별 위치 "}
              {state.preview.paths.length}개
            </summary>
            <ol className={styles.paths}>
              {state.preview.paths.map((path) => (
                <li key={JSON.stringify(path)}>
                  {[folderName, ...path].join(" / ")}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {state.phase === "ready" && (
        <>
          <StatusNotice
            state="attention"
            title={
              kind === "move" || kind === "trash"
                ? "보존본을 검증한 뒤 원본을 처리합니다."
                : kind === "edit"
                  ? "기존 내용을 보존한 뒤 이 파일을 저장합니다."
                  : "새 항목으로 만들고 내용을 검증합니다."
            }
            detail="실행 직전에 변경과 충돌을 다시 확인합니다. 실패·중단 시 일부 항목이 남을 수 있습니다."
          />
          <div className={styles.actions}>
            <button
              ref={cancel}
              type="button"
              className={actionClasses("secondary")}
              onClick={controller.backToDraft}
            >
              검토 취소
            </button>
            <button
              type="button"
              className={actionClasses("primary")}
              onClick={() => {
                void controller.start();
              }}
            >
              {actions[kind]}
            </button>
          </div>
        </>
      )}
      {running && (
        <p role="status">
          {state.cancelling
            ? "중단 결과를 정리하고 있습니다."
            : state.result
              ? phases[state.result.phase]
              : "권한과 보존 위치를 확인하고 있습니다."}
        </p>
      )}
      {state.result && (
        <div className={historyStyles.list}>
          <dl>
            <dt>현재 결과</dt>
            <dd>
              {state.result.status === "verified" && finished
                ? "작업 검증 완료"
                : state.result.status === "not-run"
                  ? "원본 변경 미실행"
                  : "결과 확인 필요"}
            </dd>
            <dt>목적지 검증</dt>
            <dd>{state.result.copied}개</dd>
            <dt>원본 제거 확인</dt>
            <dd>{state.result.removed}개</dd>
            <dt>보존 검증</dt>
            <dd>
              {state.result.preserved
                ? "보존본 검증 기록 있음"
                : "아직 확인하지 못함"}
            </dd>
          </dl>
        </div>
      )}
      {finished && (
        <StatusNotice
          state={state.phase === "completed" ? "success" : "attention"}
          title={
            state.phase === "completed"
              ? "작업을 마치고 검증했습니다."
              : "작업을 중단했습니다. 남은 항목을 확인해 주세요."
          }
          detail={
            state.phase === "completed"
              ? "보존본은 휴지통·보존 기록에서 다시 확인할 수 있습니다."
              : "부분 파일과 기록은 자동으로 삭제하거나 다시 실행하지 않습니다."
          }
        />
      )}
      <div className={styles.actions}>
        {(state.phase === "preparing" || running) && (
          <button
            type="button"
            className={actionClasses("secondary")}
            disabled={state.cancelling}
            onClick={controller.cancel}
          >
            작업 중단
          </button>
        )}
        {!running &&
          state.phase !== "preparing" &&
          (kind === "recover" || (planning && !!state.result)) && (
            <button
              type="button"
              className={actionClasses("secondary")}
              onClick={() => {
                void controller.browse();
              }}
            >
              목적지 다시 선택
            </button>
          )}
        {!running && finished && (
          <button
            type="button"
            className={actionClasses("secondary")}
            onClick={() => {
              void controller.showArchives();
            }}
          >
            휴지통·보존 기록 보기
          </button>
        )}
        {["error", "cancelled"].includes(state.phase) &&
          !state.result &&
          kind === "trash" && (
            <button
              type="button"
              className={actionClasses("secondary")}
              onClick={() => {
                void controller.review();
              }}
            >
              다시 검사
            </button>
          )}
        {["error", "cancelled"].includes(state.phase) && kind === "edit" && (
          <button
            type="button"
            className={actionClasses("secondary")}
            onClick={() => {
              void controller.open(state.request!);
            }}
          >
            편집 내용 버리고 다시 읽기
          </button>
        )}
      </div>
    </section>
  );
}

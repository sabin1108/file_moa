import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { Icon } from "../../../../components/ui/Icon";
import type { RecoveryBackupController, RecoveryBackupState } from "./recovery-backup-controller";
import styles from "../../operations/planning/file-change-plan.module.css";
import { RecoveryOverwriteView } from "./RecoveryOverwriteView";

const issues = {
  connection: "계획을 닫고 폴더 연결 관리에서 복구 보관함을 먼저 연결해 주세요.",
  permission: "자료 폴더 또는 복구 보관함에 접근할 수 없습니다. 연결과 권한을 확인해 주세요.",
  changed: "파일이나 위치가 바뀌었거나 파일 이외의 충돌이 있습니다. 목록과 계획을 다시 확인해 주세요.",
  limit: "파일당16MiB, 새 파일과 기존 파일 합계64MiB까지 검사할 수 있습니다. 선택 수를 줄여 주세요.",
  read: "검사나 백업을 마치지 못했습니다. 파일별 결과를 확인하고 계획부터 다시 검토해 주세요.",
};
const statuses = { "not-run": "미실행", uncertain: "확인 필요", verified: "복구 사본 검증됨" };

/** 파일 비교/결과 표시만 담당한다. 검사와 쓰기는 계획 controller의 명시적 행동으로 시작한다. */

export function RecoveryBackupView({ controller, state, inspect, folderName, vaultName, disabled = false }: {
  controller: RecoveryBackupController;
  state: RecoveryBackupState;
  inspect: () => Promise<void>;
  folderName: string;
  vaultName: string;
  disabled?: boolean;
}) {
  if (state.mode === "overwrite") return <RecoveryOverwriteView
    controller={controller}
    state={state}
    folderName={folderName}
    vaultName={vaultName}
  />;

  const running = state.phase === "running";
  const finished = state.result !== null && !running;

  return (
    <section
      className={styles.inspection}
      aria-label="충돌 파일 복구 사본"
      data-backup-phase={state.phase}
    >
      <h3>기존 파일의 복구 사본</h3>
      <p>
        같은 이름의 기존 목적지 파일을 별도 복구 보관함에 보관합니다. 새 파일과 기존 목적지 파일은
        그대로 유지됩니다.
      </p>
      {!controller.available() && <p className={styles.note}>
        {issues.connection}
      </p>}
      {state.phase === "inspecting" && (
        <p role="status">새 파일과 기존 파일의 내용·변경 여부를 확인하고 있습니다…</p>
      )}
      {state.issue && <StatusNotice state="attention" title={issues[state.issue]} />}
      {state.report
        && (
          <ol className={styles.rows} aria-label="백업할 기존 파일 비교">
            {state.report.files.map((file, index) => {
              const outcome = state.result?.items[index];

              return (
                <li key={JSON.stringify(file.to)}>
                  <strong>
                    {file.to.at(-1)}
                  </strong>
                  <dl className={styles.backupComparison}>
                    <div>
                      <dt>새 파일 · 유지</dt>
                      <dd>
                        {[folderName, ...file.from].join(" / ")}
                      </dd>
                      <dd>{file.source.size.toLocaleString("ko-KR")} bytes</dd>
                    </div>
                    <div>
                      <dt>기존 목적지 파일 · 백업 대상</dt>
                      <dd>
                        {[folderName, ...file.to].join(" / ")}
                      </dd>
                      <dd>{file.target.size.toLocaleString("ko-KR")} bytes</dd>
                    </div>
                  </dl>
                  <p>
                    {file.source.sha256 === file.target.sha256
                      ? "두 파일의 내용이 같습니다."
                      : "두 파일의 내용이 다릅니다."}
                  </p>
                  {outcome
                    && (
                      <p>
                        {outcome.status === "verified" && <Icon name="check" size={16} />}
                        {statuses[outcome.status]}
                      </p>
                    )}
                </li>
              );
            })}
          </ol>
        )}
      {state.phase === "ready"
        && (
          <p>
            검사한 기존 파일 {state.report?.files.length}개의 복구 사본을 만듭니다. 보관 기간은 아직
            정하지 않았으며 자동 삭제하지 않습니다.
          </p>
        )}
      {running
        && (
          <p role="status">
            {state.cancelling
              ? "중단 요청을 처리하고 있습니다. 파일별 결과를 확인할 때까지 기다려 주세요."
              : "복구 사본을 저장하고 다시 읽어 검증하고 있습니다…"}
          </p>
        )}
      {finished
        && (
          <StatusNotice
            state={state.phase === "completed" ? "success" : "attention"}
            title={
              state.phase === "completed"
                ? "복구 사본을 만들고 검증했습니다. 기존 파일은 그대로입니다."
                : state.phase === "cancelled"
                  ? "백업을 중단했습니다. 파일별 결과를 확인해 주세요."
                  : "백업을 완료하지 못했습니다. 파일별 결과를 확인해 주세요."
            }
            detail={
              !state.result?.journalComplete
                ? "작업 기록도 완전히 확인하지 못했습니다. 보관함에 일부 폴더나 파일이 남아 있을 수 있습니다."
                : undefined
            }
          />
        )}
      <div className={styles.actions}>
        {state.phase === "completed" && state.result?.journalComplete
          && (
            <button
              type="button"
              className={actionClasses("primary")}
              onClick={controller.confirmOverwrite}
            >
              덮어쓰기 검토
            </button>
          )}
        {state.phase === "idle"
          && (
            <button
              type="button"
              className={actionClasses("secondary")}
              disabled={disabled || !controller.available()}
              onClick={() => {
                void inspect();
              }}
            >
              충돌 파일 검사
            </button>
          )}
        {state.phase === "ready"
          && (
            <button
              type="button"
              className={actionClasses("primary")}
              onClick={() => {
                void controller.start();
              }}
            >
              기존 파일의 복구 사본 만들기
            </button>
          )}
        {(state.phase === "inspecting" || running)
          && (
            <button
              type="button"
              className={actionClasses("secondary")}
              disabled={state.cancelling}
              onClick={controller.cancel}
            >
              {running ? "백업 중단" : "충돌 검사 취소"}
            </button>
          )}
        {state.phase !== "idle" && !running && state.phase !== "inspecting"
          && (
            <button type="button" className={actionClasses("secondary")} onClick={controller.reset}>
              계획으로 돌아가기
            </button>
          )}
      </div>
    </section>
  );
}

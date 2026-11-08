/** 검토 결과만 표시한다. 계획 생성·파일 접근은 호출자가 담당한다. */
import type { FileChangePlan, PlanIssue } from "../../lib/file-change-plan";
import styles from "./file-change-plan.module.css";
import { Icon } from "../../../../components/ui/Icon";
import { FolderPathTree } from "./FolderPathTree";
import { FileChangeComparison } from "./FileChangeComparison";

const issueLabels: Record<PlanIssue, string> = {
  "same-path": "출발·도착 위치가 같음",
  "name-conflict": "같은 이름이 이미 있음",
  "ambiguous-name": "대소문자·유니코드 이름 충돌 가능",
  "duplicate-target": "다른 선택 파일과 도착 위치 중복",
  "incomplete-destination": "목적지 전체 확인 필요",
  "blocked-directory": "분류 폴더 이름 충돌",
};

export function FileChangePlanView({
  plan,
  folderName,
  executionStarted = false,
}: {
  plan: FileChangePlan;
  folderName: string;
  executionStarted?: boolean;
}) {
  const pathLabel = (path: readonly string[]) =>
    [folderName, ...path].join(" / ");

  return (
    <section className={styles.result} aria-label="변경 계획 결과">
      <h3>{executionStarted ? "검토한 계획" : "예상 결과"}</h3>
      <p role="status">
        {"대상 "}
        {plan.rows.length.toLocaleString("ko-KR")}
        {"개 · 확인 필요 "}
        {plan.conflictCount.toLocaleString("ko-KR")}개
      </p>
      <p>
        {executionStarted
          ? "실행 전 검토한 계획입니다. 파일별 처리 결과는 복사 결과를 확인하세요."
          : `${plan.operation === "copy" ? "원본을 유지하고 목적지에 복사하는 계획입니다." : "파일을 도착 위치로 옮기는 계획입니다."} 아직 적용하지 않았습니다.`}
      </p>
      {plan.directoriesToCreate.length > 0 && (
        <div className={styles.folders}>
          <h4>생성 예정 폴더</h4>
          <ul>
            {plan.directoriesToCreate.map((path) => (
              <li key={JSON.stringify(path)}>{pathLabel(path)}</li>
            ))}
          </ul>
        </div>
      )}
      <FileChangeComparison
        rootName={folderName}
        operation={plan.operation === "classify" ? null : plan.operation}
        changes={plan.rows.map((row) => ({
          from: row.from,
          to: row.to,
          kind: "file",
        }))}
      />
      <details open={plan.conflictCount > 0}>
        <summary>파일별 경로·충돌 상세 {plan.rows.length}개</summary>
        <ol className={styles.planFiles}>
          {plan.rows.map((row) => (
            <li key={JSON.stringify(row.from)}>
              <div className={styles.planFileHeading}>
                <Icon name="file" size={22} />
                <strong>{row.from.at(-1)}</strong>
                <span>
                  {plan.operation === "copy" ? "원본 유지" : "이동 예정"}
                </span>
              </div>
              <dl
                key={JSON.stringify([row.from, row.to])}
                className={`${styles.fileRoute} ${executionStarted ? "" : styles.previewSequence}`}
              >
                <div>
                  <dt>변경 전 · 출발 폴더</dt>
                  <dd>
                    <FolderPathTree
                      folders={[folderName, ...row.from.slice(0, -1)]}
                      fileName={row.from.at(-1)!}
                      stateLabel={
                        plan.operation === "copy" ? "유지" : "현재 위치"
                      }
                    />
                  </dd>
                </div>
                <div>
                  <dt>
                    <Icon
                      name={plan.operation === "copy" ? "copy" : "arrow"}
                      size={15}
                    />
                    변경 후 · 도착 폴더
                  </dt>
                  <dd>
                    <FolderPathTree
                      folders={[folderName, ...row.to.slice(0, -1)]}
                      fileName={row.to.at(-1)!}
                      proposed={!executionStarted}
                      stateLabel={
                        executionStarted
                          ? "계획 위치"
                          : plan.operation === "copy"
                            ? "복사본"
                            : "이동 후"
                      }
                    />
                  </dd>
                </div>
              </dl>
              <p className={row.issues.length ? styles.issue : styles.note}>
                {row.issues.length ? (
                  <>
                    <Icon name="warning" size={18} />
                    <span>
                      {row.issues
                        .map((issue) => issueLabels[issue])
                        .join(" · ")}
                    </span>
                  </>
                ) : (
                  <span className={styles.clearName}>
                    <Icon name="check" size={16} />
                    이름 충돌 없음
                  </span>
                )}
              </p>
            </li>
          ))}
        </ol>
      </details>
      <p className={styles.note}>
        {plan.operation === "copy"
          ? "이 계획은 이름 목록을 기준으로 합니다. 계획 생성 후 파일 변경은 자동 감지하지 않습니다."
          : "이름 목록을 확인한 시점의 계획입니다. 파일 내용과 이후 외부 변경은 확인하지 않았습니다."}
      </p>
    </section>
  );
}

"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { Icon, type IconName } from "../../../../components/ui/Icon";
import { COPY_INSPECTION_LIMITS } from "./copy-inspection-rules";
import type { CopyInspectionController, CopyInspectionIssue } from "./copy-inspection-controller";
import styles from "../planning/file-change-plan.module.css";

const errors: Record<CopyInspectionIssue, string> = {
  "copy-limit": "검사 한도를 넘었어요. 파일 수나 용량을 줄여 다시 선택해 주세요.",
  "copy-conflict": "목적지에 충돌이 생겼거나 전체 목록을 확인하지 못했어요. 계획을 다시 확인해 주세요.",
  "source-changed": "검사 중 선택 파일이 바뀌었어요. 계획을 다시 확인해 주세요.",
  "unsupported-hash": "이 환경에서 내용 검사를 시작하지 못했어요. 지원 브라우저에서 다시 시도해 주세요.",
  permission: "파일 읽기 권한을 확인해 주세요.",
  read: "파일 검사를 마치지 못했어요. 파일 상태를 확인하고 다시 시도해 주세요.",
};

const bytes = (size: number) => `${size.toLocaleString("ko-KR")}바이트`;

const readableBytes = (size: number) =>
  size < 1024
    ? bytes(size)
    : `${(size / (size < 1024 * 1024 ? 1024 : 1024 * 1024)).toLocaleString(
      "ko-KR",
      { maximumFractionDigits: 1 }
    )} ${size < 1024 * 1024 ? "KB" : "MB"}`;

const checks: readonly {
  icon: IconName;
  title: string;
  detail: string;
  complete: string;
}[] = [
    {
      icon: "file",
      title: "파일 내용",
      detail: "읽을 수 있는 파일인지 · 용량 확인",
      complete: "파일 읽기·용량 확인"
    },
    {
      icon: "retry",
      title: "변경 여부",
      detail: "검사 중 원본 내용이 바뀌지 않았는지",
      complete: "검사 중 원본 변경 없음"
    },
    {
      icon: "folder",
      title: "이름 충돌",
      detail: "목적지에 같은 이름이 있는지",
      complete: "목적지 이름 충돌 없음"
    },
  ];
/** 검사 서비스의 전체 결과만 시각화한다. 실제 단계별 진행률을 추정해 표시하지 않는다. */

export function CopyInspectionView({ controller, inspect, disabled = false }: {
  controller: CopyInspectionController;
  inspect: () => Promise<void>;
  disabled?: boolean;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const loading = state.phase === "loading";

  return (
    <section
      className={styles.inspection}
      aria-label="복사 전 검사"
      data-copy-inspection={state.phase}
    >
      <h3>복사 전에 확인할 내용</h3>
      <ol className={styles.inspectionChecks} aria-label="검사 항목">
        {checks.map((check, index) => (
          <li
            key={check.title}
            data-checked={!!state.result}
            style={{ "--check-delay": `${index * 160}ms` } as CSSProperties}
          >
            {loading || state.result
              ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  className={styles.inspectionMark}
                  data-complete={!!state.result}
                >
                  <circle
                    className={styles.checkRing}
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeDasharray="42 15"
                  />
                  <path
                    className={styles.checkTick}
                    d="m6 12 4 4 8-8"
                    pathLength="1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )
              : (
                <Icon name={check.icon} size={22} />
              )}
            <div>
              <strong>
                {check.title}
              </strong>
              <p>
                {state.result ? check.complete : check.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className={styles.actions}>
        <button
          type="button"
          className={actionClasses("primary")}
          disabled={disabled}
          onClick={() => {
            if (loading) {
              controller.reset();
            } else {
              void inspect();
            }
          }}
        >
          {loading ? "검사 취소" : state.result ? "파일 다시 검사" : "복사 전 검사"}
        </button>
        <p className={styles.note}>
          {"최대 "}
          {COPY_INSPECTION_LIMITS.files}개 · 파일당 16MiB · 합계 64MiB
        </p>
      </div>
      {loading && (
        <StatusNotice state="pending" title="선택 파일의 내용과 목적지 충돌을 확인하고 있어요." />
      )}
      {state.issue && <StatusNotice state="error" title={errors[state.issue]} />}
      {state.result
        && (
          <>
            <p role="status" className={styles.inspectionSummary}>
              <Icon name="check" />
              {"검사 완료 · "}
              {state.result.files.length.toLocaleString("ko-KR")}
              {"개 · "}
              {readableBytes(state.result.totalBytes)}
            </p>
            <p className={styles.note}>
              검사 시점의 결과입니다. 복사를 실행할 때 원본과 목적지를 다시 확인합니다.
            </p>
            <ul className={styles.inspectedFiles} aria-label="검사한 파일">
              {state.result.files.map(file => (
                <li key={JSON.stringify(file.from)}>
                  <Icon name="file" />
                  <strong>
                    {file.from.at(-1)}
                  </strong>
                  <span>
                    {readableBytes(file.size)}
                  </span>
                  <span className={styles.checkedFile}>
                    <Icon name="check" size={16} />
                    확인
                  </span>
                </li>
              ))}
            </ul>
            <details className={styles.inspectionDetails}>
              <summary>기술 정보</summary>
              <p className={styles.note}>
                SHA-256은 파일 내용에서 계산한 비교값입니다. 내용이 바뀌었는지 확인할 때 사용하며,
                직접 읽거나 입력할 필요는 없습니다. 악성 코드나 문서의 의미를 검사하는 기능은
                아닙니다.
              </p>
              <ul className={styles.rows}>
                {state.result.files.map(file => (
                  <li key={JSON.stringify(file.from)}>
                    <strong>
                      {file.from.at(-1)}
                    </strong>
                    <p>
                      {bytes(file.size)}
                      {" · 수정 "}
                      {new Date(file.lastModified).toLocaleString("ko-KR")}
                    </p>
                    <p className={styles.note}>
                      {"SHA-256 "}
                      <code>
                        {file.sha256}
                      </code>
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      {!state.result
        && (
          <p className={styles.note}>
            선택 파일을 읽어 크기와 내용을 검사합니다. 파일을 복사하거나 변경하지 않습니다.
          </p>
        )}
    </section>
  );
}

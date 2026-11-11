"use client";

import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { DocumentFindResults } from "./DocumentFindResults";
import type {
  DocumentFindController,
  DocumentFindState,
} from "../../store/document-find-controller";
import { confirmFindQuery } from "../../lib/document-find";
import styles from "./organization-preparation.module.css";

export function DocumentFindPanel({
  controller,
  state,
  folderName,
  currentPath,
  onOpenFile,
  onPrepare,
  canPrepare,
}: {
  controller: DocumentFindController;
  state: DocumentFindState;
  folderName: string;
  currentPath: readonly string[];
  onOpenFile: (path: readonly string[]) => void;
  onPrepare: () => void;
  canPrepare: boolean;
}) {
  const busy = state.phase === "searching";
  const period = state.filters.month !== "all";
  let range = "기간 제한 없음";

  try {
    const q = confirmFindQuery(state.filters);

    if (q.from) range = `${q.from} ~ ${q.to}`;
  } catch {
    range = "연도·날짜 기준·기간을 선택해 주세요.";
  }

  return (
    <div data-document-find className={styles.preparation}>
      <details open={state.phase !== "ready"}>
        <summary>검색 조건 · {range}</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void controller.search();
          }}
        >
          <fieldset disabled={busy} className={styles.conditions}>
            <legend>어떤 자료를 찾을까요?</legend>
            <div className={styles.actions}>
              <button
                type="submit"
                data-find-search
                className={actionClasses("primary")}
              >
                검색 시작
              </button>
            </div>
            <label className={styles.basis}>
              본문에서 찾을 단어 · 모두 포함
              <input
                aria-label="본문 검색어"
                required
                maxLength={200}
                value={state.filters.terms}
                onChange={(event) =>
                  controller.configure({ terms: event.target.value })
                }
              />
            </label>
            <div className={styles.findFields}>
              <label className={styles.basis}>
                찾을 달
                <select
                  aria-label="찾을 달"
                  required
                  value={state.filters.month}
                  onChange={(event) =>
                    controller.configure({ month: event.target.value })
                  }
                >
                  <option value="">달 선택</option>
                  <option value="all">전체 기간</option>
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}월
                    </option>
                  ))}
                </select>
              </label>
              {period
                && (
                  <>
                    <label className={styles.basis}>
                      어느 해인가요?
                      <input
                        aria-label="찾을 연도"
                        type="number"
                        required
                        min={2000}
                        max={2099}
                        value={state.filters.year}
                        onChange={(event) =>
                          controller.configure({ year: event.target.value })
                        }
                      />
                    </label>
                    <label className={styles.basis}>
                      어떤 날짜를 기준으로 찾을까요?
                      <select
                        aria-label="검색 날짜 기준"
                        required
                        value={state.filters.basis}
                        onChange={(event) =>
                          controller.configure({ basis: event.target.value })
                        }
                      >
                        <option value="">기준 선택</option>
                        <option value="meeting">본문의 회의일</option>
                        <option value="written">본문의 작성일</option>
                        <option value="body">본문에 적힌 날짜 전체</option>
                      </select>
                    </label>
                    <label className={styles.basis}>
                      얼마나 넓게 찾을까요?
                      <select
                        aria-label="검색 기간 범위"
                        required
                        value={state.filters.window}
                        onChange={(event) =>
                          controller.configure({ window: event.target.value })
                        }
                      >
                        <option value="">기간 확인</option>
                        <option value="month">해당 월만</option>
                        <option value="around">해당 월의 앞뒤 7일도 포함</option>
                        <option value="late">월말 · 21일부터 마지막 날</option>
                        <option value="months">여러 달 · 같은 해</option>
                      </select>
                    </label>
                    {state.filters.window === "months" && <label className={styles.basis}>
                      마지막 달
                      <select
                        aria-label="검색 마지막 달"
                        required
                        value={state.filters.endMonth ?? ""}
                        onChange={event => controller.configure({ endMonth: event.target.value })}
                      >
                        <option value="">마지막 달 선택</option>
                        {Array.from(
                          { length: 12 },
                          (_, index) => <option key={index + 1} value={index + 1}>{index + 1}월</option>
                        )}
                      </select>
                    </label>}
                  </>
                )}
            </div>
            <p data-find-range>
              {range}
            </p>
            <p>
              검색 범위:{" "}
              {state.scope.kind === "folder"
                ? [folderName, ...state.scope.path].join(" / ")
                : `${folderName} 전체`}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={actionClasses("ghost")}
                aria-pressed={state.scope.kind === "all"}
                onClick={() => controller.setScope(null)}
              >
                연결한 폴더 전체
              </button>
              <button
                type="button"
                className={actionClasses("ghost")}
                onClick={() => controller.setScope(currentPath)}
              >
                현재 폴더와 하위 폴더
              </button>
            </div>
            <p className={styles.note}>
              문서 본문과 사용을 켠 OCR 인식 글에서 단어·날짜 근거를 확인합니다. 이 기기에서만
              읽으며 파일을 옮기거나 외부 AI로 보내지 않습니다.
            </p>
          </fieldset>
        </form>
      </details>
      {state.issue && <StatusNotice state="attention" title={state.issue} />}
      {busy && <p role="status">본문을 읽고 근거를 확인하고 있어요…</p>}
      {state.result
        && (
          <>
            <DocumentFindResults
              result={state.result}
              folderName={folderName}
              onOpenFile={onOpenFile}
              selectedPaths={state.selectedPaths}
              onToggle={controller.toggle}
            />
            {!state.result.documents.length
              ? <div className={styles.actions}>
                {period && <button
                  type="button"
                  className={actionClasses("secondary")}
                  onClick={() => controller.configure({ month: "all", endMonth: "" })}
                >기간 제한 없이 다시 확인</button>}
                <button
                  type="button"
                  className={actionClasses("ghost")}
                  onClick={() => {
                    document.querySelector<HTMLDetailsElement>("[data-document-find] details")!.open = true;
                    document.querySelector<HTMLInputElement>('[aria-label="본문 검색어"]')?.focus();
                  }}
                >검색어 바꾸기</button>
                <p className={styles.note}>조건을 바꾼 뒤 검색 시작을 눌러 주세요. 검색 범위와 읽기 문제도 확인할 수 있어요.</p>
              </div>
              : <div className={styles.actions}>
                <button
                  type="button"
                  data-find-prepare
                  className={actionClasses("primary")}
                  disabled={!canPrepare || !state.selectedPaths.length}
                  onClick={onPrepare}
                >선택한 {state.selectedPaths.length}개 정리 준비</button>
                <p className={styles.note}>선택한 원본을 다시 읽습니다. 발췌 확인과 전송 동의 후 AI 제안을 받을 수 있어요.</p>
              </div>}
          </>
        )}
    </div>
  );
}

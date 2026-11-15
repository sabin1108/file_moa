"use client";

import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { DocumentFindResults } from "./DocumentFindResults";
import type {
  DocumentFindController,
  DocumentFindState,
} from "./document-find-controller";
import { confirmFindQuery } from "./document-find";
import styles from "../../organization/organization-preparation.module.css";
import findStyles from "./document-find.module.css";
import { Icon } from "../../../../components/ui/Icon";
import { RemoteQueryControl } from "./RemoteQueryControl";
import type { SearchQueryAction } from "../../../../shared/search-query";
import type { ConnectionOwner } from "../../types";
import { SemanticModelPanel, type SemanticTools } from "../semantic/SemanticModelPanel";

export function DocumentFindPanel({
  controller,
  state,
  folderName,
  currentPath,
  onOpenFile,
  onPrepare,
  onQuestion,
  canPrepare,
  queryAction,
  owner,
  semanticTools,
}: {
  controller: DocumentFindController;
  state: DocumentFindState;
  folderName: string;
  currentPath: readonly string[];
  onOpenFile: (path: readonly string[]) => void;
  onPrepare: () => void;
  onQuestion?: () => void;
  canPrepare: boolean;
  queryAction?: SearchQueryAction;
  owner?: ConnectionOwner;
  semanticTools?: SemanticTools;
}) {
  const busy = state.phase === "searching";
  const period = state.filters.month !== "all";
  let range = "기간 제한 없음";

  try {
    const q = confirmFindQuery(state.filters, state.semantic.enabled);

    if (q.from) range = `${q.from} ~ ${q.to}`;
  } catch {
    range = "연도·날짜 기준·기간을 선택해 주세요.";
  }

  return (
    <div data-document-find className={`${styles.preparation} ${findStyles.panel}`}>
      <details className={findStyles.settings} open={state.phase !== "ready"}>
        <summary><Icon name="search" /><strong>검색 조건</strong>{state.phase === "ready" && <span>{state.filters.terms}</span>}<Icon name="chevron" size={16} /></summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void controller.search();
          }}
        >
          <fieldset disabled={busy} className={styles.conditions}>
            <legend className="sr-only">검색 조건 입력</legend>
            <label className={styles.basis}>
              <span className={findStyles.label}>필수 검색어 <small>이름·경로·본문에서 확인 · 정확한 문구는 따옴표</small></span>
              <input
                aria-label="본문 검색어"
                required={!state.semantic.enabled}
                maxLength={200}
                value={state.filters.terms}
                onChange={(event) =>
                  controller.configure({ terms: event.target.value })
                }
              />
            </label>
            {semanticTools && <div>
              <label><input type="checkbox" aria-label="의미 검색 함께 사용" checked={state.semantic.enabled} onChange={event => controller.configureSemantic({ enabled: event.target.checked })} />의미 검색 함께 사용</label>
              {state.semantic.enabled && <>
                <label className={styles.basis}>찾고 싶은 내용의 설명
                  <textarea aria-label="의미 검색 설명" maxLength={300} rows={3} value={state.semantic.meaning} onChange={event => controller.configureSemantic({ meaning: event.target.value })} />
                </label>
                <p className={styles.note}>설명에 해당하는 단어는 위 필수 검색어에서 직접 빼 주세요. 회사명·사람 이름·기술명처럼 반드시 일치해야 하는 조건은 필수 검색어에 남겨 주세요. +검색어·따옴표 문구·제외·형식·경로·명시한 기간은 유지합니다.</p>
                <label><input type="checkbox" aria-label="의미 검색 조건 확인" checked={state.semantic.confirmed} onChange={event => controller.configureSemantic({ confirmed: event.target.checked })} />설명과 반드시 지킬 조건을 직접 구분했어요.</label>
              </>}
            </div>}
            <details className={findStyles.period} open={!!(state.filters.preferred || state.filters.excluded || state.filters.formats || state.filters.folder)}>
              <summary>검색 조건 더 보기 <span>선호 문서·제외·형식·경로</span></summary>
              <div className={styles.findFields}>
                <label className={styles.basis}>선호하는 문서·단어
                  <input aria-label="선호 검색어" maxLength={200} value={state.filters.preferred ?? ""} onChange={event => controller.configure({ preferred: event.target.value })} />
                </label>
                <label className={styles.basis}>제외할 단어
                  <input aria-label="제외 검색어" maxLength={200} value={state.filters.excluded ?? ""} onChange={event => controller.configure({ excluded: event.target.value })} />
                </label>
                <label className={styles.basis}>파일 형식
                  <input aria-label="검색 파일 형식" placeholder="pdf, md" maxLength={64} value={state.filters.formats ?? ""} onChange={event => controller.configure({ formats: event.target.value })} />
                </label>
                <label className={styles.basis}>포함할 폴더 경로
                  <input aria-label="검색 폴더 경로 조건" maxLength={64} value={state.filters.folder ?? ""} onChange={event => controller.configure({ folder: event.target.value })} />
                </label>
              </div>
              <p className={styles.note}>필수 검색어와 제외·형식·경로는 유지합니다. 선호 조건이 맞지 않는 결과는 관련 자료로 구분합니다.</p>
            </details>
            <details className={findStyles.period} open={period}>
              <summary>기간 <span data-find-range>{range}</span></summary>
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
                        <option value="modified">파일을 마지막으로 수정한 날짜</option>
                        <option value="body">본문에 기록된 날짜</option>
                        <option value="created" disabled>파일 생성 날짜 · 브라우저에서 제공하지 않음</option>
                        {state.filters.basis === "meeting" && <option value="meeting">본문의 회의일 · 요청에서 선택됨</option>}
                        {state.filters.basis === "written" && <option value="written">본문의 작성일 · 요청에서 선택됨</option>}
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
            </details>
            <fieldset className={styles.scopeChoices}>
              <legend>검색 범위 <small className={findStyles.scopeName}>{state.scope.kind === "folder" ? [folderName, ...state.scope.path].join(" / ") : folderName}</small></legend>
              <label><input type="radio" name="find-scope" checked={state.scope.kind === "all"} onChange={() => controller.setScope(null)} />연결한 폴더 전체</label>
              <label><input type="radio" name="find-scope" checked={state.scope.kind === "folder"} onChange={() => controller.setScope(currentPath)} />현재 폴더와 하위 폴더</label>
            </fieldset>
            <p className={styles.note}>
              이 기기에서만 검색합니다.
            </p>
            {queryAction && owner && <RemoteQueryControl key={`${owner.userId}:${owner.workspaceId}:${state.request}`} action={queryAction} owner={owner} question={state.request} filters={state.filters} onApply={controller.configure} />}
            <div className={styles.actions}>
              <button type="submit" data-find-search className={actionClasses("primary")}><Icon name="search" size={18} />검색 시작</button>
            </div>
          </fieldset>
        </form>
      </details>
      {semanticTools && <SemanticModelPanel tools={semanticTools} scope={state.scope} connected={true} scopeName={state.scope.kind === "folder" ? [folderName, ...state.scope.path].join(" / ") : folderName} />}
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
              </div>
              : <div className={styles.actions}>
                {onQuestion && <button type="button" data-find-question className={actionClasses("primary")} disabled={!canPrepare || !state.selectedPaths.length} onClick={onQuestion}>선택한 자료로 질문</button>}
                <button
                  type="button"
                  data-find-prepare
                  className={actionClasses("secondary")}
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

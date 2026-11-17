"use client";

import { useState } from "react";
import { PathTree } from "../operations/FileChangeComparison";
import { buildComparisonTrees } from "../operations/file-change-comparison";
import { actionClasses } from "../../../components/ui/action-classes";
import type { OrganizationPreparationState } from "./organization-preparation-controller";
import type { SourceListingState } from "../browsing/file-list/source-listing-controller";
import styles from "./organization-preparation.module.css";

/** 현재 결정과 실제 선택 구조만 보여 준다. 답변은 동일 채팅 입력 경로로 보낸다. */
export function OrganizationConversationView({ state, files, folderName, onReply, onChooseFolder }: {
  state: OrganizationPreparationState;
  files: SourceListingState;
  folderName: string;
  onReply?: (text: string) => void;
  onChooseFolder?: () => void;
}) {
  const [all, setAll] = useState(false);
  const scope = state.scope;
  const scopeLabel = !scope ? null : scope.kind === "all" ? `${folderName} 전체` : scope.kind === "folder" ? [folderName, ...scope.path].join(" / ") : `선택한 항목 ${scope.entries.length}개`;
  const documents = state.snapshot?.documents.filter(document => state.selectedIds.includes(document.id)) ?? [];
  let paths: { path: readonly string[]; kind: "file" | "directory" }[] = documents.map(document => ({ path: document.path, kind: "file" }));
  if (!state.snapshot && scope?.kind === "selected") paths = scope.entries.map(entry => ({ path: entry.path, kind: entry.kind }));
  else if (!state.snapshot && scope?.kind === "folder") {
    const current = files.phase === "ready" && !files.stale && JSON.stringify(files.result?.path) === JSON.stringify(scope.path);
    paths = current ? files.result!.entries.map(entry => ({ path: [...scope.path, entry.name], kind: entry.kind })) : [{ path: scope.path, kind: "directory" }];
  }
  else if (!state.snapshot && scope?.kind === "all" && files.phase === "ready" && !files.stale && files.result?.path.length === 0) {
    paths = files.result.entries.map(entry => ({ path: [entry.name], kind: entry.kind }));
  }
  const visible = all ? paths : paths.slice(0, 8);
  const tree = buildComparisonTrees(visible.map(entry => ({ from: entry.path, to: entry.path, kind: entry.kind })), null).before;
  const questioning = state.questions.length > 0 && !state.reviewConfirmed;
  const questions = [...new Set(state.questions.map(question => question.documentId))];
  const suggestions = state.conversationStep === "scope" ? ["전체", "현재 폴더만"]
    : state.conversationStep === "coverage" ? ["하위 폴더까지 포함해줘", "이 폴더 파일만"]
    : state.conversationStep === "basis" ? ["주제별로", "본문 언어별로"]
      : state.conversationStep === "destination" ? ["나중에 정할게"]
        : state.conversationStep === "confirm" ? ["자료 확인 실행"] : [];

  const pending = ["reading", "checking", "sending"].includes(state.phase);
  return <section data-organization-conversation aria-label="현재 정리 조건" className={styles.conversationReview}>
    <dl className={styles.conditionSummary} tabIndex={0} aria-label="정한 정리 조건">
      {scopeLabel && <div><dt>범위</dt><dd>{scopeLabel}</dd></div>}
      {state.basis && <div><dt>기준</dt><dd>{state.basis}</dd></div>}
      {scope && <div><dt>목적지</dt><dd>{state.destination ? [folderName, ...state.destination].join(" / ") : state.conversationStep === "destination" ? "아직 정하지 않음" : "변경 계획에서 선택"}</dd></div>}
    </dl>
    {questioning ? <div className={styles.miniStructure} tabIndex={0} aria-label="답변할 자료와 근거">
      <ul className={styles.reviewSubjects}>
        {questions.map(id => {
          const document = state.snapshot?.documents.find(document => document.id === id);
          const prompts = state.questions.filter(question => question.documentId === id);
          const answer = state.answers.find(answer => answer.documentId === id);
          return <li key={id}><strong>{document?.name ?? id}</strong>
            <p>{answer?.exclude ? "이번 정리에서 제외" : answer?.destination ? `목적지: ${answer.destination.join(" / ")}` : prompts[0]?.reason}</p>
            {prompts.flatMap(question => question.dates).map(date => <small key={date.id}>{date.label} · {date.date} </small>)}
          </li>;
        })}
      </ul>
    </div> : paths.length > 0 && <>
      <p className={styles.note}>{state.snapshot ? `정리 후보 ${documents.length}개` : "현재 확인 가능한 구조"}{paths.length > visible.length && ` · ${visible.length}개 미리보기`}</p>
      <div className={styles.miniStructure} tabIndex={0}><PathTree rootName={folderName} nodes={tree} label="정리할 자료 구조" /></div>
      {paths.length > 8 && <button type="button" className={actionClasses("ghost")} onClick={() => setAll(!all)}>{all ? "작게 보기" : `전체 ${paths.length}개 보기`}</button>}
    </>}
    {onReply && suggestions.length > 0 && <div className={styles.actions} aria-label="채팅으로 답하기">
      {(state.conversationStep === "scope" || state.conversationStep === "destination") && <button type="button" disabled={pending} className={actionClasses("primary")} onClick={onChooseFolder}>폴더 선택</button>}
      {suggestions.map(text => <button key={text} type="button" disabled={pending} className={actionClasses(state.conversationStep === "confirm" ? "primary" : "secondary")} onClick={() => onReply(text)}>{text}</button>)}
    </div>}
  </section>;
}

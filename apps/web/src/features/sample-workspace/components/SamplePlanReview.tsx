"use client";

import { useState } from "react";
import type { SampleCatalog } from "../../../shared/sample-contract";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { FileChangePlanView } from "../../local-folders/components/plan/FileChangePlanView";
import { sampleChangePlan, type SampleAction, type SampleState } from "../lib/sample-state";
import styles from "./sample-workspace.module.css";
import { SampleDestinationPicker } from "./SampleDestinationPicker";

export function SamplePlanReview({ catalog, state, disabled, dispatch }: {
  catalog: SampleCatalog;
  state: SampleState;
  disabled: boolean;
  dispatch: (action: SampleAction) => void;
}) {
  const [browsingId, setBrowsingId] = useState<string | null>(null);
  const documents = catalog.documents.filter(document => state.selected.includes(document.id));
  const unresolved = documents.filter(document => !state.targets[document.id]).length;
  const plan = unresolved ? null : sampleChangePlan(catalog, state);
  const closeBrowse = () => {
    const id = browsingId;

    setBrowsingId(null);
    requestAnimationFrame(() => document.getElementById(`browse-${id}`)?.focus());
  };

  return (
    <section className={styles.preview} aria-labelledby="sample-review-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="sample-review-title">분류 계획 검토</h2>
          <p>
            {state.organization
              ? `AI 내용 분석 · ${state.organization.model} · 사용 토큰 ${state.organization.usage.totalTokens}개`
              : state.ai
                ? `AI 제안 · ${state.ai.model} · 사용 토큰 ${state.ai.usage.totalTokens}개`
                : "준비된 제안 · AI 호출 없음"}
            . 목적지를 확인한 뒤 샘플에 적용해 주세요.
          </p>
        </div>
      </div>
      <div className={styles.destinations}>
        {documents.map(document => (
          <div className={styles.destinationRow} key={document.id}>
            <label htmlFor={`destination-${document.id}`}>
              <strong>
                {document.name}
              </strong>
              <span>
                {state.organization
                  ? state.organization.response.matches.find(
                    match => match.documentId === document.id,
                  )?.evidence
                  : state.ai
                    ? state.ai.proposals.find(proposal => proposal.documentId === document.id)
                      ?.reason
                    : document.proposal.reason}
              </span>
              {(state.ai
                ? state.ai.proposals.find(proposal => proposal.documentId === document.id)
                  ?.reviewRequired
                : document.proposal.reviewRequired) && <span>검토가 필요한 제안이에요.</span>}
            </label>
            <select
              id={`destination-${document.id}`}
              aria-label={`${document.name} 목적지`}
              disabled={disabled}
              value={state.targets[document.id] ?? ""}
              onChange={event =>
                dispatch({
                  type: "destination",
                  id: document.id,
                  folderId: event.target.value || null,
                })
              }
            >
              <option value="">직접 선택해 주세요</option>
              {catalog.folders.map(folder => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              id={`browse-${document.id}`}
              data-browse-for={document.id}
              className={actionClasses("ghost")}
              disabled={disabled}
              aria-expanded={browsingId === document.id}
              onClick={() => setBrowsingId(document.id)}
            >
              폴더 탐색으로 선택
            </button>
            {browsingId === document.id
              && (
                <SampleDestinationPicker
                  catalog={catalog}
                  initialFolderId={state.targets[document.id] ?? null}
                  disabled={disabled}
                  onChoose={folderId => {
                    dispatch({ type: "destination", id: document.id, folderId });
                    closeBrowse();
                  }}
                  onClose={closeBrowse}
                />
              )}
          </div>
        ))}
      </div>
      {unresolved > 0
        && (
          <StatusNotice
            state="attention"
            title={`목적지 확인이 필요한 자료 ${unresolved}개`}
            detail="내용이 섞인 자료의 목적지를 직접 선택해 주세요. 선택 전에는 적용되지 않아요."
          />
        )}
      {plan && <FileChangePlanView plan={plan} folderName="샘플 자료" />}
      <div className={styles.actions}>
        <button
          type="button"
          className={actionClasses("secondary")}
          disabled={disabled}
          onClick={() => dispatch({ type: "back" })}
        >
          선택으로 돌아가기
        </button>
        <button
          type="button"
          data-action="sample-apply"
          className={actionClasses("primary")}
          disabled={disabled || browsingId !== null || !plan || plan.conflictCount > 0}
          onClick={() => dispatch({ type: "apply" })}
        >
          이 계획으로 샘플 정리
        </button>
      </div>
    </section>
  );
}

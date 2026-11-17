"use client";

import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { useState } from "react";
import { AI_PROVIDER_LABELS, type AiProvider } from "../../../shared/ai-provider";
import { OrganizationDocumentsView } from "./OrganizationDocumentsView";
import type {
  OrganizationPreparationController,
  OrganizationPreparationState,
} from "./organization-preparation-controller";
import styles from "./organization-preparation.module.css";
import type { LiveOrganizationAction } from "../../../shared/live-organization";
import { actionClasses } from "../../../components/ui/action-classes";
import { hasUnansweredReview } from "../../../shared/live-organization-review";
import { LIVE_ORGANIZATION_LIMITS, organizationBatches, organizationSelectionIssue } from "../../../shared/live-organization-limits";
import { AI_DAILY_LIMITS } from "../../../shared/ai-daily-limits";
import { SelectionWorkspaceDialog } from "../destination-picker/SelectionWorkspaceDialog";

const reasons: Record<string, string> = {
  "unsupported-extension": "TXT·MD·PDF·PNG·JPEG가 아닌 형식",
  "ocr-disabled": "이미지 글자 읽기 설정이 꺼져 있음",
  "ocr-no-text": "OCR에서 읽을 글자를 찾지 못함",
  "ocr-unavailable": "OCR 엔진·인식 파일 확인 필요",
  "ocr-image-too-large": "이미지600만 픽셀 상한 초과",
  "ocr-image-invalid": "PNG·JPEG 이미지 손상",
  "ocr-timeout": "OCR 처리 시간 상한",
  "ocr-limit": "OCR 쪽수·문자 상한으로 일부만 읽음",
  "pdf-no-text": "이미지 PDF · OCR이 필요함",
  "pdf-encrypted": "암호가 설정된 PDF",
  "pdf-invalid": "PDF를 읽을 수 없음",
  "pdf-text-limit": "PDF 50쪽·200,000자 추출 상한",
  "too-large": "파일당 2MiB 초과",
  "invalid-utf8": "UTF-8로 읽을 수 없음",
  "unreadable-file": "파일 읽기 실패",
  "unreadable-folder": "폴더 읽기 실패",
  "source-changed": "읽는 중 원본 변경",
  "listing-limit": "폴더당 목록 상한",
  "scan-limit": "탐색 개수/시간 상한",
  "depth-limit": "폴더 깊이 상한",
  "document-limit": "500문서 상한",
  "bytes-limit": "50MiB 상한",
  "reference-limit": "참고 폴더 구조 탐색 상한",
};

export function OrganizationSnapshotView({
  controller,
  state,
  organizeAction,
  aiProvider = "gemini",
}: {
  controller: OrganizationPreparationController;
  state: OrganizationPreparationState;
  organizeAction?: LiveOrganizationAction;
  folderName: string;
  aiProvider?: AiProvider | null;
}) {
  const [confirmation, setConfirmation] = useState({ provider: aiProvider, accepted: false });
  const [selecting, setSelecting] = useState(false);

  if (confirmation.provider !== aiProvider) {
    setConfirmation({ provider: aiProvider, accepted: false });
  }

  const snapshot = state.snapshot;

  if (!snapshot) return null;

  const pending = state.phase === "checking" || state.phase === "sending";
  const unanswered = hasUnansweredReview(state.questions, state.answers);
  const consented = !!state.consentKey && !!aiProvider && confirmation.provider === aiProvider && confirmation.accepted;
  const providerLabel = aiProvider ? AI_PROVIDER_LABELS[aiProvider] : "설정되지 않은 외부 AI";
  const documents = snapshot.documents.filter(document => state.selectedIds.includes(document.id));
  const selectionIssue = organizationSelectionIssue(documents);

  return (
    <section
      className={styles.snapshot}
      aria-label="전송 전 자료 확인"
      data-local-snapshot
    >
      <div>
        <button type="button" data-organization-select-documents className={actionClasses("secondary")} disabled={pending} onClick={() => setSelecting(true)}>자료 선택 · {state.selectedIds.length} / {snapshot.documents.length}개 · 발췌 확인</button>
        <p>
          {providerLabel}에 선택한 파일의 이름·상대 경로·발췌와 정리 조건을
          보냅니다. 선택한 발췌 {documents.reduce((sum, document) => sum + document.excerpt.length, 0).toLocaleString()}자 · 최대 {organizationBatches(documents).length}개 묶음으로 나눠 분석합니다. 짧은 문서는 전체 내용이 포함될 수 있습니다.
        </p>
        {!snapshot.complete
          && (
            <>
              <StatusNotice
                state="attention"
                title="범위 일부만 준비됐어요"
                detail={
                  snapshot.limits
                    .map((limit) => reasons[limit] ?? limit)
                    .join(" · ")
                  ||
                  "읽지 못한 자료가 있습니다. 제외 내역을 확인하세요."
                }
              />
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={state.partialAccepted}
                  disabled={pending || state.phase === "review"}
                  onChange={(event) =>
                    controller.acceptPartial(event.target.checked)
                  }
                />
                전체가 아닌, 확인한 일부 자료만 대상으로 준비합니다.
              </label>
            </>
          )}
        {snapshot.documents.length === 0
          && (
            <p>
              읽을 수 있는 TXT/MD/PDF가 없습니다. 제외 내역을 확인하거나 범위를 바꿔
              주세요.
            </p>
          )}
        {state.answers.length > 0 && (
          <p>함께 반영할 답변 {state.answers.length}개</p>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            data-local-consent
            checked={consented}
            disabled={
              state.phase !== "ready" ||
              !state.selectedIds.length
              ||
              (!snapshot.complete && !state.partialAccepted)
              ||
              unanswered
              || !!selectionIssue
              || !aiProvider
            }
            onChange={(event) => {
              setConfirmation({ provider: aiProvider, accepted: event.target.checked });
              controller.consent(event.target.checked);
            }}
          />
          선택 자료의 발췌와 정리 조건을 외부 AI 전송 대상으로 확인했습니다.
        </label>
        {organizeAction
          && (
            <button
              type="button"
              data-live-send
              className={actionClasses("primary")}
              disabled={state.phase !== "ready" || !consented}
              onClick={() => void controller.send(organizeAction)}
            >
              {state.phase === "checking"
                ? "원본 재검사 중…"
                : state.phase === "sending"
                  ? "AI 응답 대기 중…"
                  : state.issue ? "다시 분석 실행" : "AI 분석 실행"}
            </button>
          )}
        {consented
          && (
            <p role="status">
              전송 대상 확인을 마쳤어요. 전송 직전에 원본과 발췌를 다시
              검사합니다.
            </p>
          )}
        {selecting && <SelectionWorkspaceDialog title="정리할 자료 선택 · 발췌 확인" onClose={() => setSelecting(false)}><section data-source-excerpts aria-label="전송할 파일 선택">
          <h4>자료 선택 · {state.selectedIds.length} / {snapshot.documents.length}개</h4>
          <OrganizationDocumentsView
            documents={snapshot.documents}
            selectedIds={state.selectedIds}
            candidateIds={state.candidateIds}
            pending={pending}
            onToggle={controller.toggleDocument}
          />
          {selectionIssue && <StatusNotice state="attention" title={selectionIssue} />}
          <button type="button" className={actionClasses("primary")} onClick={() => setSelecting(false)}>선택 완료 · 채팅으로 돌아가기</button>
        </section></SelectionWorkspaceDialog>}
        {snapshot.reference
          && (
            <details data-reference-structure>
              <summary>
                함께 보낼 참고 폴더 구조 {snapshot.reference.directories.length}개
              </summary>
              <p>
                폴더 이름과 상대 경로만 읽었습니다. 파일 본문은 포함하지 않습니다.
                {!snapshot.reference.complete && " 구조 일부만 확인했습니다."}
              </p>
              <ul>
                {snapshot.reference.directories.map((path) => (
                  <li key={JSON.stringify(path)}>
                    {path.join(" / ") || "연결 폴더"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        {snapshot.excluded.length > 0
          && (
            <details>
              <summary>제외·실패 내역 {snapshot.excluded.length}개</summary>
              <ul className={styles.exclusions}>
                {snapshot.excluded.map((entry, index) => (
                  <li key={index}>
                    {entry.path.join(" / ")} —{" "}
                    {reasons[entry.reason] ?? "읽기 제외"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        <details>
          <summary>전송 범위·모델 한도 상세</summary>
          <p className={styles.note}>
            확인한 파일 {snapshot.discoveredFiles}개 · 읽은 TXT/MD{" "}
            {snapshot.documents.length}개 · 선택 {state.selectedIds.length}개
          </p>
          <p className={styles.note}>
            발췌는 요청 단어 주변 최대 1,200자입니다. 의미 일치 판정은 아직 하지
            않았습니다. 한 번에 최대 {LIVE_ORGANIZATION_LIMITS.documents}개·발췌 합계 {LIVE_ORGANIZATION_LIMITS.excerptCharacters.toLocaleString()}자입니다. 자동 추천에 없는 자료도 직접 선택할 수 있습니다. 요청·정리 기준·참고
            및 목적지 경로도 보냅니다. 파일 바이너리와 폴더 핸들은 보내지
            않습니다.
          </p>
          <p className={styles.note}>
            계정당 하루 {AI_DAILY_LIMITS.live}작업, 정식 사용 전체에서 하루 {AI_DAILY_LIMITS.global}작업까지입니다. 큰 작업은 여러 묶음으로 분석합니다. 묶음별 입력은 최대 {LIVE_ORGANIZATION_LIMITS.inputTokens.toLocaleString()}토큰, 출력은 최대 {LIVE_ORGANIZATION_LIMITS.outputTokens.toLocaleString()}토큰입니다.
            선택한 공급자에서 입력 토큰을 계산한 뒤 한도를 넘으면 생성을 중단하며 자동
            재시도하지 않습니다. 전송한 분석 작업은 답변 기다리기를 중지해도 계속되어 사용량이 발생할 수 있습니다.
          </p>
        </details>
      </div>
    </section>
  );
}

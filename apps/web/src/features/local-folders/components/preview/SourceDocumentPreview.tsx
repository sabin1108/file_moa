"use client";

/**
 * SourceFolderBrowser가 전달한 본문 상태를 읽기 화면으로 구성한다.
 * 원문을 React 텍스트로 표시하고 정보 접힘/읽기 실패/닫기 조작을 제공한다. 파일 읽기와 요청 취소 규칙은 store/services를 따른다.
 */


import type { Ref } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { PreviewIssue, SourcePreviewState } from "../../store/source-preview-controller";
import styles from "./source-document-preview.module.css";
import { DocumentWorkspace } from "./DocumentWorkspace";

const messages: Record<PreviewIssue, string> = {
  permission: "파일을 읽을 권한이 필요해요. 연결 관리에서 다시 연결해 주세요.",
  missing: "파일을 찾지 못했어요. 위치가 바뀌었거나 삭제되었을 수 있습니다.",
  read: "파일을 읽지 못했어요. 파일이 변경되었거나 사용할 수 없는 상태일 수 있습니다.",
  encoding: "UTF-8로 읽을 수 없는 파일이에요. 원본의 문자 인코딩을 확인해 주세요.",
  "too-large": "2MiB를 넘는 파일은 미리 볼 수 없어요.",
  unsupported: "MD와 TXT 파일만 미리 볼 수 있어요.",
  cancelled: "본문 읽기를 취소했어요.",
};
type Props = {
  state: SourcePreviewState;
  folderName: string | null;
  headingRef: Ref<HTMLHeadingElement>;
  onClose: () => void;
  onRefresh: () => void;
  onCancel: () => void;
  onEdit?: () => void;
};

/** 표시와 정보 접힘만 소유한다. 읽기·취소는 콜백으로 위임하고 파일 API에 접근하지 않는다. */
export function SourceDocumentPreview({ state, folderName, headingRef, onClose, onRefresh, onCancel, onEdit }: Props) {
  const pending = state.phase === "loading";
  const { result, issue } = state;
  return (
    <DocumentWorkspace
      mode="preview"
      phase={state.phase}
      title={state.path?.at(-1) ?? "문서"}
      headingRef={headingRef}
      back={
        <button type="button" className={actionClasses("secondary")} onClick={onClose}>
          목록으로 돌아가기
        </button>
      }
      actions={
        <>
          {onEdit && (
            <button
              type="button"
              className={actionClasses("secondary")}
              disabled={state.phase !== "ready" || state.stale || !state.available}
              onClick={onEdit}
            >
              문서 편집
            </button>
          )}
          <button
            type="button"
            className={actionClasses("secondary")}
            disabled={!state.available || pending}
            onClick={onRefresh}
          >
            본문 새로고침
          </button>
          {pending && (
            <button type="button" className={actionClasses("secondary")} onClick={onCancel}>
              본문 읽기 취소
            </button>
          )}
        </>
      }
      status={state.stale ? "이전에 읽은 본문" : "MD/TXT 원문"}
      info={
        <>
          <dl>
            <div>
              <dt>보관 위치</dt>
              <dd>
                {[folderName, ...(state.path?.slice(0, -1) ?? [])].filter(Boolean).join(" / ")}
              </dd>
            </div>
            <div>
              <dt>파일 크기</dt>
              <dd>{result ? `${result.size.toLocaleString("ko-KR")} bytes` : "아직 읽지 못함"}</dd>
            </div>
            <div>
              <dt>수정 시각</dt>
              <dd>
                {result ? new Date(result.lastModified).toLocaleString("ko-KR") : "아직 읽지 못함"}
              </dd>
            </div>
            <div>
              <dt>자료 사용</dt>
              <dd>이 기기에서만 읽기 · 서버 전송 없음</dd>
            </div>
          </dl>
          {state.stale && <p>이전에 읽은 파일의 정보입니다.</p>}
        </>
      }
      feedback={
        <>
          {pending && <StatusNotice state="pending" title="파일 본문을 읽고 있어요." />}
          {issue && (
            <StatusNotice
              state={issue === "permission" || issue === "cancelled" ? "attention" : "error"}
              title={messages[issue]}
              action={
                state.available && (
                  <button type="button" className={actionClasses("secondary")} onClick={onRefresh}>
                    본문 다시 시도
                  </button>
                )
              }
            />
          )}
          {state.stale && result && (
            <p>아래는 이전에 읽은 본문입니다. 현재 파일 내용과 다를 수 있어요.</p>
          )}
        </>
      }
      footer="MD/TXT 원문 보기 · Markdown 서식과 링크는 텍스트로 표시합니다."
    >
      <div aria-busy={pending}>
        {/* 원문을 React 텍스트로 렌더링한다. HTML/Markdown 해석과 원격 리소스 요청을 만들지 않는다. */}
        {result && (
          <article className={styles.body} aria-label="문서 본문" tabIndex={0}>
            {result.text === "" ? (
              <p className={styles.empty}>내용이 없는 빈 파일이에요.</p>
            ) : (
              result.text
            )}
          </article>
        )}
      </div>
    </DocumentWorkspace>
  );
}

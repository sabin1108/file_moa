"use client";

import { useCallback, useEffect, useState } from "react";
import { useNavigationBlocker } from "../../../components/navigation/NavigationGuard";
import { actionClasses } from "../../../components/ui/action-classes";
import { Icon } from "../../../components/ui/Icon";
import { aiRecordPayloadSchema, type AiRecordPayload } from "../../../shared/ai-records";
import type { AiRecordsController } from "../ai-records-controller";
import styles from "../library/ai-library.module.css";
import controls from "../../../styles/controls.module.css";
import { acceptWikiUpdate, isWiki, wikiMarkdown } from "../wiki/wiki";
import { WikiSources } from "../wiki/WikiSources";
import { RecordTitleField, RecordBodyField } from "./RecordFields";

export function RecordEditor({ initial, controller, onClose, onReveal }: {
  initial: Exclude<AiRecordPayload, { type: "conversation" }>;
  controller: AiRecordsController;
  onClose: () => void;
  onReveal?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [savedContent, setSavedContent] = useState(JSON.stringify(initial));
  const [closing, setClosing] = useState(false);
  const [format, setFormat] = useState<"md" | "txt">("md");
  const dirty = JSON.stringify(value) !== savedContent
    || !controller.getSnapshot().records.some(record => record.payload.id === value.id);
  const requestLeave = useCallback(() => { setClosing(true); onReveal?.(); }, [onReveal]);
  const { cancelNavigation, confirmNavigation } = useNavigationBlocker(dirty || pending, requestLeave);
  const [versions, setVersions] = useState<Awaited<ReturnType<AiRecordsController["repository"]["revisions"]>>>([]);

  useEffect(() => {
    let current = true;

    if (controller.getSnapshot().records.some(record => record.payload.id === initial.id)) {
      void controller.repository.revisions(initial.type, initial.id).then(items => {
        if (current) setVersions(items);
      }, () => {
        if (current) setNotice("이전 버전을 읽지 못했어요.");
      });
    }

    return () => {
      current = false;
    };
  }, [controller, initial]);

  const save = async () => {
    const parsed = aiRecordPayloadSchema.safeParse({ ...value, updatedAt: new Date().toISOString() });

    if (!parsed.success) {
      setNotice("제목·내용·적용 범위를 확인해 주세요. 프로젝트 ID는 영문 소문자·숫자·하이픈으로 입력해 주세요.");

      return;
    }

    setPending(true);

    try {
      const saved = await controller.save(parsed.data);

      setValue(current => JSON.stringify(current) === JSON.stringify(value) ? saved.payload as typeof value : current);
      setSavedContent(JSON.stringify(saved.payload));
      setVersions(await controller.repository.revisions(value.type, value.id));
      setNotice("로컬 폴더에 저장했습니다.");
    } catch {
      setNotice("저장하지 못했어요. 편집 내용은 유지합니다.");
    }
    finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (value.type !== "artifact" || value.wiki || value.status !== "draft" || !dirty || pending || closing
      || controller.getSnapshot().phase !== "ready") return;

    const timer = window.setTimeout(() => {
      const input = { ...value, updatedAt: new Date().toISOString() };

      setPending(true);
      void controller.save(input).then(async () => {
        setSavedContent(JSON.stringify(value));
        setVersions(await controller.repository.revisions(value.type, value.id));
        setNotice("초안을 자동 저장했습니다.");
      }, () => setNotice("초안을 저장하지 못했어요. 편집 내용을 내보내 보관해 주세요."))
        .catch(() => setNotice("이전 버전을 읽지 못했어요. 현재 편집 내용은 유지합니다."))
        .finally(() => setPending(false));
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [controller, value, dirty, pending, closing]);

  const exportText = (format: "md" | "txt") => {
    const text = isWiki(value)
      ? wikiMarkdown(value)
      : value.type === "artifact"
        ? value.markdown
        : value.type === "memory" ? value.content : `${value.displayName}\n\n${value.description}\n\n${value.preferences}`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");

    link.href = url;
    link.download = `${value.title.replace(/[\\/:*?"<>|]/gu, "-") || "document"}.${format}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section
    className={styles.editor}
    aria-label="기록 편집"
    data-quick-switch-block={dirty || pending || undefined}
  >
    <div className={styles.editorHeading}>
      <div>
        <h3>
          {isWiki(value) ? "위키 편집" : value.type === "artifact" ? "결과물 편집" : value.type === "memory" ? "기억 검토" : "내 프로필"}
        </h3>
        <small>
          {pending ? "저장 중…" : dirty ? "저장하지 않은 변경" : "저장됨"}
        </small>
      </div>
      <button
        type="button"
        className={actionClasses("secondary")}
        onClick={() => dirty ? setClosing(true) : onClose()}
        disabled={pending}
      ><Icon name="chevron" />기록 목록으로 돌아가기</button>
    </div>
    {closing && <div role="alert" className={styles.deletion}>
      <p>저장하지 않은 내용이 있어요.</p>
      <div className={styles.actions}>
        <button type="button" className={actionClasses("secondary")} onClick={() => {
          cancelNavigation();
          setClosing(false);
        }}>계속 편집</button>
        <button type="button" className={actionClasses("secondary", styles.danger)} disabled={pending} onClick={() => {
          if (!confirmNavigation()) onClose();
        }}>변경 버리고 나가기</button>
      </div>
    </div>}
    <form
      className={styles.fields}
      onSubmit={event => {
        event.preventDefault();
        void save();
      }}
    >
      <RecordTitleField value={value.title} onChange={title => setValue({ ...value, title })} />
      {value.type === "artifact" && <>
        <RecordBodyField label="본문" document value={value.markdown} maxLength={500000} onChange={markdown => setValue({ ...value, markdown })} />
        {value.wiki && <p>
          {value.markdown === value.wiki.generatedMarkdown ? "AI가 만든 초안입니다. 본문과 출처를 확인해 주세요." : "사용자가 편집한 본문입니다. AI 초안과 구분해 보존합니다."}
        </p>}
        <details className={controls.disclosure}>
          <summary>문서 상태 · {value.status === "draft" ? "초안" : "확정본"}</summary>
          <label>
            상태
            <select
              value={value.status}
              onChange={event => setValue({ ...value, status: event.target.value as "draft" | "final" })}
            >
              <option value="draft">초안</option>
              <option value="final">확정본</option>
            </select>
          </label>
          <p>
            {value.wiki ? "위키는 본문과 출처를 검토한 뒤 저장합니다." : "초안은 연결한 폴더에 자동 저장됩니다."}
          </p>
        </details>
      </>}
      {value.type === "memory" && <>
        <RecordBodyField value={value.content} maxLength={4000} required onChange={content => setValue({ ...value, content })} />
        <label>
          AI가 이 기억을 사용해도 될까요?
          <select
            value={value.status}
            onChange={event => setValue({ ...value, status: event.target.value as "proposed" | "approved" | "inactive" })}
          >
            <option value="proposed">검토 중 · 사용하지 않음</option>
            <option value="approved">내 정보임을 확인 · 사용 허용</option>
            <option value="inactive">사용 중지</option>
          </select>
        </label>
        <p>허용한 기억만 전송 설정을 켠 대화에 사용합니다.</p>
        <details className={controls.disclosure}>
          <summary>적용 범위 · {value.scope.type === "global" ? "모든 대화" : "지정 프로젝트"}</summary>
          <label>
            적용 범위
            <select
              value={value.scope.type}
              onChange={event => setValue({
                ...value,
                scope: event.target.value === "global" ? { type: "global" } : { type: "project", id: "project" }
              })}
            >
              <option value="global">모든 대화</option>
              <option value="project">지정 프로젝트</option>
            </select>
          </label>
          {value.scope.type === "project" && <label>
            프로젝트 식별자
            <input
              value={value.scope.id}
              maxLength={64}
              required
              onChange={event => setValue({ ...value, scope: { type: "project", id: event.target.value } })}
            />
            <small>대화의 고급 설정과 같은 식별자를 입력하세요.</small>
          </label>}
        </details>
      </>}
      {value.type === "profile" && <>
        <label>
          부를 이름 · 선택
          <input
            value={value.displayName}
            maxLength={100}
            placeholder="어떻게 불러드릴까요?"
            onChange={event => setValue({ ...value, displayName: event.target.value })}
          />
        </label>
        <label>
          AI가 알아둘 내용
          <textarea
            value={value.description}
            maxLength={4000}
            placeholder="자주 하는 작업이나 관심사를 짧게 적어도 좋아요."
            onChange={event => setValue({ ...value, description: event.target.value })}
          />
        </label>
        <details className={controls.disclosure}>
          <summary>답변 방식 · 선택</summary>
          <label>
            답변 선호
            <textarea
              value={value.preferences}
              maxLength={4000}
              placeholder="예: 핵심부터 짧게, 예시를 함께"
              onChange={event => setValue({ ...value, preferences: event.target.value })}
            />
          </label>
        </details>
      </>}
      <div className={styles.editorActions}>
        <button
          type="submit"
          className={actionClasses("primary")}
          disabled={pending || controller.getSnapshot().phase !== "ready"}
        >
          <Icon name="check" />
          {pending ? "저장 중" : "저장"}
        </button>
      </div>
    </form>
    {isWiki(value) && <>
      {value.wiki.proposal && <section className={styles.wikiSources} aria-label="위키 새 초안 검토">
        <h4>새 자료 답변으로 만든 초안</h4>
        <p>현재 편집 본문은 바꾸지 않았습니다. 반영하면 새 생성 버전이 되며 저장 후 이전 버전에서 기존 내용을 확인할 수 있어요.</p>
        <pre>
          {value.wiki.proposal.markdown}
        </pre>
      </section>}
      <WikiSources wiki={value.wiki} onAccept={() => setValue(acceptWikiUpdate(value))} />
    </>}
    <details className={controls.disclosure}>
      <summary>파일로 내보내기</summary>
      <div className={styles.fields}>
        <label>
          파일 형식
          <select value={format} onChange={event => setFormat(event.target.value as "md" | "txt")}>
            <option value="md">Markdown (.md)</option>
            <option value="txt">텍스트 (.txt)</option>
          </select>
        </label>
        <button type="button" className={actionClasses("secondary")} onClick={() => exportText(format)}>
          <Icon name="external" />
          내보내기
        </button>
      </div>
    </details>
    {versions.length > 0 && <details className={controls.disclosure}>
      <summary>이전 버전 · {versions.length}개</summary>
      <label className={styles.fields}>
        저장 버전 불러오기
        <select
          defaultValue=""
          onChange={event => {
            const version = versions.find(item => item.metadata.revisionId === event.target.value);

            if (version && version.payload.type !== "conversation") {
              setValue(version.payload);
              setNotice("이전 내용을 편집기에 불러왔습니다. 저장하면 새 버전이 됩니다.");
            }
          }}
        >
          <option value="" disabled>버전 선택</option>
          {versions.map(item => <option key={item.metadata.revisionId} value={item.metadata.revisionId}>{new Date(item.metadata.createdAt).toLocaleString("ko-KR")} · {item.metadata.state}</option>)}
        </select>
      </label>
    </details>}
    {notice && <p role="status">
      {notice}
    </p>}
  </section>;
}

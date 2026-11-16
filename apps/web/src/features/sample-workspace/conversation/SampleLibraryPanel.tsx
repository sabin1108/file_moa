"use client";

import { useCallback, useRef, useState } from "react";
import { useNavigationBlocker } from "../../../components/navigation/NavigationGuard";
import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SampleAction, SampleRecord, SampleState } from "../sample-state";
import { sampleRecordSchema } from "../sample-state";
import { actionClasses } from "../../../components/ui/action-classes";
import styles from "../sample-workspace.module.css";
import { recordKinds as kinds } from "../../../shared/record-kinds";
import { RecordKindTabs, type RecordKind } from "../../ai-records/library/RecordKindTabs";
import { RecordTitleField, RecordBodyField } from "../../ai-records/editing/RecordFields";
import library from "../../ai-records/library/ai-library.module.css";

export function SampleLibraryPanel({ state, catalog, disabled, dispatch, onPreview, onReveal, previewKind }: {
  state: SampleState; catalog: SampleCatalog; disabled: boolean;
  dispatch: (action: SampleAction) => boolean; onPreview: (id: string) => void;
  onReveal: () => void;
  previewKind?: RecordKind;
}) {
  const [selectedKind, setKind] = useState<SampleRecord["kind"]>("conversation");
  const kind = previewKind ?? selectedKind;
  const [editing, setEditing] = useState<SampleRecord | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [leaving, setLeaving] = useState(false);
  const requestLeave = useCallback(() => { setLeaving(true); onReveal(); }, [onReveal]);
  const { cancelNavigation, confirmNavigation } = useNavigationBlocker(editing !== null, requestLeave);
  const title = useRef<HTMLInputElement>(null);
  const create = () => {
    const label = kinds.find(([value]) => value === kind)![1];
    const content = kind === "conversation" ? state.messages.map(message => `${message.author === "user" ? "나" : "모아"}: ${message.text}`).join("\n\n")
      : kind === "wiki" ? state.sourceReply
      : kind === "profile" ? "핵심부터 짧게 설명하고 예시를 함께 보여 주세요."
      : kind === "memory" ? "자료를 정리하기 전에 변경 계획을 확인합니다."
      : state.messages.filter(message => message.author === "assistant").at(-1)?.text ?? "샘플에서 직접 작성한 초안입니다.";
    setNotice(content.length > 8000 ? "샘플 기록은 8,000자까지 보관해요. 앞부분을 편집 화면에 담았습니다. 원래 대화는 유지됩니다." : "");
    setEditing({ id: crypto.randomUUID(), kind, title: `샘플 ${label}`, content: content.slice(0, 8000), approved: false, sources: kind === "wiki" ? state.citations : [] });
    requestAnimationFrame(() => title.current?.focus());
  };
  return <section aria-label="샘플 기록함" className={library.library}>
    <h2>기록함</h2>
    <p>이 샘플 세션의 탭에만 임시 보관합니다. 실제 저장 폴더·AI 기억과 연결하지 않아요.</p>
    {leaving && <div role="alert"><p>아직 저장하지 않은 편집 내용이 있어요.</p>
      <button type="button" className={actionClasses("secondary")} onClick={() => { setLeaving(false); cancelNavigation(); }}>계속 편집</button>
      <button type="button" className={actionClasses("ghost")} onClick={() => { setEditing(null); setLeaving(false); confirmNavigation(); }}>저장하지 않고 이동</button></div>}
    {editing && !previewKind ? <form className={library.fields} onSubmit={event => {
      event.preventDefault();
      const parsed = sampleRecordSchema.safeParse(editing);
      if (!parsed.success) { setNotice("제목과 내용의 길이를 확인해 주세요. 편집 내용은 유지합니다."); return; }
      if (JSON.stringify([editing, ...state.records.filter(record => record.id !== editing.id)]).length > 60_000) {
        setNotice("임시 기록 용량 한도입니다. 내용을 줄이거나 기존 기록을 정리하세요."); return;
      }
      if (dispatch({ type: "save-record", record: parsed.data })) { setEditing(null); setNotice(""); }
      else setNotice("저장하지 못했어요. 편집 내용은 유지합니다. 세션과 보관 한도를 확인하세요.");
    }}>
      {notice && <p role="status">{notice}</p>}
      <RecordTitleField inputRef={title} value={editing.title} disabled={disabled} onChange={value => setEditing({ ...editing, title: value })} />
      <RecordBodyField value={editing.content} maxLength={8000} disabled={disabled} onChange={content => setEditing({ ...editing, content })} />
      {editing.kind === "memory" && <label className={library.checkRow}><input type="checkbox" checked={editing.approved} disabled={disabled}
        onChange={event => setEditing({ ...editing, approved: event.target.checked })} /><span>내용을 검토하고 승인했어요</span></label>}
      <div className={library.editorActions}><button type="submit" disabled={disabled} className={actionClasses("primary")}>임시 기록 저장</button>
        <button type="button" className={actionClasses("secondary")} onClick={() => setEditing(null)}>편집 취소</button></div>
      <p>저장 전 편집 내용은 이 패널을 닫으면 사라질 수 있어요. 저장한 기록은 같은 세션에서 다시 열 수 있습니다.</p>
    </form> : <>
      <RecordKindTabs selected={kind} onChange={value => { setKind(value); setRemoveId(null); }} counts={Object.fromEntries(kinds.map(([value]) => [value, state.records.filter(record => record.kind === value).length]))} />
      <button type="button" disabled={disabled || state.records.length >= 20 || kind === "conversation" && !state.messages.length || kind === "wiki" && !state.citations.length}
        className={actionClasses("secondary")} onClick={create}>{kind === "conversation" ? "현재 대화 임시 보관" : `새 ${kinds.find(([value]) => value === kind)![1]}`}</button>
      {kind === "wiki" && !state.citations.length && <p>먼저 ‘자료로 질문’을 실행하면 확인한 출처를 위키에 함께 남길 수 있어요.</p>}
      {state.records.length >= 20 && <p role="status">샘플 기록 20개 한도입니다. 기존 기록을 정리한 뒤 다시 저장하세요.</p>}
      {!state.records.some(record => record.kind === kind) && <p>아직 보관한 기록이 없어요.</p>}
      {state.records.filter(record => record.kind === kind).map(record => <article key={record.id} className={styles.sampleRecord}>
        <h3>{record.title}</h3>{record.kind === "memory" && <p>{record.approved ? "승인함" : "검토 전"}</p>}
        <pre>{record.content}</pre>
        {record.sources.map(id => <button type="button" className={actionClasses("secondary")} key={id} onClick={() => onPreview(id)}>출처: {catalog.documents.find(document => document.id === id)?.name}</button>)}
        <div className={styles.actions}><button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={() => setEditing(record)}>열어 편집</button>
          <button type="button" className={actionClasses("ghost")} disabled={disabled} onClick={() => setRemoveId(record.id)}>기록 삭제</button></div>
        {removeId === record.id && <div role="group" aria-label="샘플 기록 삭제 확인"><p>이 임시 기록만 삭제할까요? 원본 샘플 자료는 유지됩니다.</p>
          <button type="button" className={actionClasses("primary")} disabled={disabled} onClick={() => { dispatch({ type: "remove-record", id: record.id }); setRemoveId(null); }}>삭제 확인</button>
          <button type="button" className={actionClasses("ghost")} onClick={() => setRemoveId(null)}>취소</button></div>}
      </article>)}
    </>}
  </section>;
}

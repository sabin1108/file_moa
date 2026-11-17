"use client";

import { useState, useSyncExternalStore } from "react";
import { SelectionWorkspaceDialog } from "../../local-folders/destination-picker/SelectionWorkspaceDialog";
import { SourceFileRow } from "../../local-folders/browsing/file-list/SourceFileRow";
import { actionClasses } from "../../../components/ui/action-classes";
import { SAMPLE_ANSWER_LIMITS } from "../../../shared/sample-answer";
import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SampleWorkspaceStore } from "../sample-workspace-store";
import { sampleActiveCatalog, sampleFolderPath, sampleQuestionSelection } from "../sample-state";
import styles from "../../local-folders/organization/organization-preparation.module.css";

export function SampleMaterialPicker({ catalog, store, onClose }: {
  catalog: SampleCatalog; store: SampleWorkspaceStore; onClose: () => void;
}) {
  const { state, aiPending, expired } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const selected = sampleQuestionSelection(catalog, state);
  const active = sampleActiveCatalog(catalog, state);
  const disabled = aiPending || expired;
  const characters = catalog.documents.filter(document => selected.includes(document.id)).reduce((sum, document) => sum + document.excerpt.length, 0);
  const visible = catalog.documents.filter(document => `${document.name} ${sampleFolderPath(active, state.locations[document.id]).join("/")} ${document.excerpt}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const toggle = (id: string) => store.dispatch({ type: "select-question", ids: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] });
  return <SelectionWorkspaceDialog title="질문할 예시 자료 선택" onClose={onClose}>
    <p>선택 {selected.length} / {catalog.documents.length}개 · 발췌 {characters.toLocaleString()}자 · 최대 {SAMPLE_ANSWER_LIMITS.documents}개·{SAMPLE_ANSWER_LIMITS.excerptCharacters.toLocaleString()}자</p>
    <label>이름·폴더·내용으로 찾기<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className={styles.actions}>
      <button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={() => store.dispatch({ type: "select-question", ids: visible.map(document => document.id) })}>보이는 자료 전체 선택</button>
      <button type="button" className={actionClasses("ghost")} disabled={disabled} onClick={() => store.dispatch({ type: "select-question", ids: [] })}>전체 선택 해제</button>
      <button type="button" className={actionClasses("primary")} disabled={disabled || !selected.length} onClick={onClose}>선택한 {selected.length}개로 질문하기</button>
    </div>
    <ul className={styles.documents} aria-label="자료별 발췌와 선택">{visible.map(document => <li key={document.id}>
      <SourceFileRow name={document.name} selecting selected={selected.includes(document.id)} previewing={preview === document.id} selectionDisabled={disabled} previewDisabled={false}
        onToggle={() => toggle(document.id)} onLongSelect={() => toggle(document.id)} onPreview={() => setPreview(preview === document.id ? null : document.id)} />
      <p className={styles.note}>{sampleFolderPath(active, state.locations[document.id]).join(" / ")}</p>
      {preview === document.id && <pre className={styles.questionExcerpt}>{document.excerpt}</pre>}
    </li>)}</ul>
  </SelectionWorkspaceDialog>;
}

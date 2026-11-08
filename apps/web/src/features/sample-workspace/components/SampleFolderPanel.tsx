"use client";
import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SampleState } from "../lib/sample-state";
import { sampleFolderPath } from "../lib/sample-state";
import { SourceFileRow } from "../../local-folders/components/listing/SourceFileRow";
import { SourceFolderRow } from "../../local-folders/components/listing/SourceFolderRow";
import { actionClasses } from "../../../components/ui/action-classes";
import styles from "./sample-workspace.module.css";

export function SampleFolderPanel({ catalog, state, path, onOpen, onPreview, onToggle, disabled }: {
  catalog: SampleCatalog; state: SampleState; path: readonly string[]; onOpen: (path: string[]) => void;
  onPreview: (id: string) => void; onToggle: (id: string) => void; disabled: boolean;
}) {
  const paths = catalog.documents.map(document => ({ document, path: sampleFolderPath(catalog, state.locations[document.id]) }));
  const descendant = paths.filter(item => path.every((part, index) => item.path[index] === part));
  const folders = [...new Set(descendant.filter(item => item.path.length > path.length).map(item => item.path[path.length]))].sort();
  const documents = descendant.filter(item => item.path.length === path.length).map(item => item.document);
  return (
    <section aria-label="샘플 폴더 탐색" data-sample-folder={JSON.stringify(path)}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>{path.at(-1) ?? "샘플 자료"}</h2>
          <p>
            {catalog.documents.length}개 파일 · {catalog.folders.length}개 분류 폴더
          </p>
        </div>
        {path.length > 0 && (
          <button
            type="button"
            className={actionClasses("ghost")}
            onClick={() => onOpen(path.slice(0, -1))}
          >
            상위 폴더
          </button>
        )}
      </div>
      <ul className={styles.folderList}>
        {folders.map(name => (
          <li key={name}>
            <SourceFolderRow
              name={name}
              selected={false}
              selecting={false}
              disabled={false}
              selectionDisabled
              onOpen={() => onOpen([...path, name])}
              onToggle={() => {}}
              onLongSelect={() => {}}
            />
          </li>
        ))}
        {documents.map(document => (
          <li key={document.id} data-sample-id={document.id}>
            <SourceFileRow
              name={document.name}
              selected={state.selected.includes(document.id)}
              selecting
              previewing={false}
              selectionDisabled={disabled || state.phase !== "select"}
              previewDisabled={false}
              previewSupported
              onToggle={() => onToggle(document.id)}
              onLongSelect={() => {
                if (!state.selected.includes(document.id)) onToggle(document.id);
              }}
              onPreview={() => onPreview(document.id)}
            />
            <p className={styles.location} data-location-for={document.id}>
              {sampleFolderPath(catalog, state.locations[document.id]).join(" / ")}
            </p>
          </li>
        ))}
      </ul>
      {!documents.length && !folders.length && (
        <p className={styles.muted}>이 폴더에는 자료가 없어요.</p>
      )}
    </section>
  );
}

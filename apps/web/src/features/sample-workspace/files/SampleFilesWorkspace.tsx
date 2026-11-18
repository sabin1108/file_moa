"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SampleWorkspaceStore } from "../sample-workspace-store";
import { FolderWorkspaceFrame } from "../../local-folders/browsing/FolderWorkspaceFrame";
import { FilePreviewPane } from "../../local-folders/documents/preview/FilePreviewPane";
import { ManagedFilesDialog } from "../../local-folders/operations/managed/ManagedFilesDialog";
import { EntryCreationForm } from "../../local-folders/creation/EntryCreationForm";
import { EntryCreationController } from "../../local-folders/creation/entry-creation-controller";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { actionClasses } from "../../../components/ui/action-classes";
import { SampleDocumentPreview } from "./SampleDocumentPreview";
import { SampleFolderPanel, sampleFolderListing } from "./SampleFolderPanel";
import { SampleFolderTree } from "./SampleFolderTree";
import { SampleFileController } from "./sample-file-controller";
import ui from "../../../styles/workspace-ui.module.css";
import folderStyles from "../../local-folders/browsing/folder-workspace.module.css";

function SampleEntryCreation({ files, path, disabled, onCreated }: {
  files: SampleFileController; path: readonly string[]; disabled: boolean; onCreated: () => void;
}) {
  const [controller] = useState(() => new EntryCreationController(files.create));
  return <EntryCreationForm controller={controller} path={path} folderName="예시 자료" disabled={disabled || !path.length}
    onCreated={onCreated} storageNote="이 탭의 예시 자료에만 만듭니다. 탭을 닫으면 임시 보관이 끝납니다." />;
}

export function SampleFilesWorkspace({ sourceCatalog, store }: { sourceCatalog: SampleCatalog; store: SampleWorkspaceStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [files] = useState(() => new SampleFileController(sourceCatalog, store));
  const picker = useSyncExternalStore(files.managed.picker.subscribe, files.managed.picker.getSnapshot, files.managed.picker.getServerSnapshot);
  const [path, setPath] = useState<string[]>(["받은 자료"]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const state = files.files();
  const { catalog, locations } = files.view();
  const preview = catalog.documents.find(document => document.id === previewId);
  const previewNode = state.nodes.find(node => node.id === previewId);
  const disabled = !snapshot.ready || snapshot.expired || snapshot.aiPending || snapshot.state.phase === "review";
  const selected = state.nodes.filter(node => state.selected.includes(node.id));
  const selectedHere = selected.filter(node => JSON.stringify(node.path.slice(0, -1)) === JSON.stringify(path));
  const selectionOutside = selectedHere.length !== selected.length;
  const listing = sampleFolderListing(catalog, { locations }, path);
  const changed = () => { setPreviewId(null); };
  const openOperation = (kind: "copy" | "move" | "trash") => {
    if (selectionOutside) return;
    const names = selectedHere.map(node => node.path.at(-1)!);
    void files.managed.open({ kind, source: path, names, destination: [] });
  };

  return <div className={`${ui.system} ${folderStyles.theme}`} data-sample-ready={snapshot.ready}>
    <FolderWorkspaceFrame rootName="예시 자료" path={path} ancestors={[]} disabled={disabled} mode="sample"
      onOpen={value => setPath([...value])}
      folderTree={<SampleFolderTree catalog={catalog} path={path} onOpen={value => setPath([...value])} />}
      onOpenFile={value => setPreviewId(state.nodes.find(node => node.kind === "file" && JSON.stringify(node.path) === JSON.stringify(value))?.id ?? null)}
      onSelectPrevious={() => {}}
      footer={<span>{path.at(-1) ?? "예시 자료"} · {listing.entries.length}개 항목 · {state.selected.length}개 선택</span>}
      preview={<FilePreviewPane open={!!preview} onClose={() => setPreviewId(null)}>
        {preview && <SampleDocumentPreview document={preview} headingRef={heading} assetId={previewNode?.assetId} onClose={() => setPreviewId(null)}
          onEdit={!disabled && /\.(md|txt)$/i.test(preview.name) ? () => { void files.managed.open({ kind: "edit", source: previewNode!.path.slice(0, -1), names: [preview.name], destination: [] }); } : undefined} />}
      </FilePreviewPane>}>
      <p>파일 작업은 이 탭의 예시 사본에 적용됩니다. AI 질문·정리는 서버가 제공한 원문을 사용합니다.</p>
      {snapshot.expired && <StatusNotice state="attention" title="샘플 세션이 만료됐어요" action={<a href="/demo/start">새 세션 시작</a>} />}
      {snapshot.notice && <StatusNotice state="attention" title="샘플 안내" detail={snapshot.notice} compact={snapshot.notice.startsWith("이 탭에서 보관한")} />}
      {snapshot.state.phase === "review" && <StatusNotice state="attention" title="채팅의 정리 계획 검토를 먼저 마치거나 취소해 주세요." />}
      {selectionOutside && <StatusNotice state="attention" title="다른 폴더의 선택이 남아 있어요. 현재 폴더의 항목만 선택한 뒤 작업해 주세요."
        action={<button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={() => files.select(selectedHere.map(node => node.id))}>다른 폴더 선택 해제</button>} />}
      <SampleFolderPanel catalog={catalog} state={{ locations, selected: selected.filter(node => node.kind === "file").map(node => node.id), phase: "select" }} path={path}
        onOpen={setPath} onPreview={setPreviewId} disabled={disabled} onToggle={files.toggle}
        selectedFolders={selected.filter(node => node.kind === "directory").map(node => node.path)}
        onToggleFolder={path.length ? path => { const node = state.nodes.find(node => JSON.stringify(node.path) === JSON.stringify(path)); if (node) files.toggle(node.id); } : undefined}
        creation={<SampleEntryCreation files={files} path={path} disabled={disabled} onCreated={() => {}} />}
        historyControls={<button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={() => { void files.managed.showArchives(); }}>휴지통·보존본</button>}
        onReviewPlan={disabled || selectionOutside ? undefined : openOperation} onTrash={disabled || selectionOutside ? undefined : () => openOperation("trash")} />
    </FolderWorkspaceFrame>
    <ManagedFilesDialog controller={files.managed} folderName="예시 자료" disabled={disabled} onChanged={changed} editCharacterLimit={64_000} allowRootSelection={false}
      creation={<SampleEntryCreation files={files} path={picker.requestedPath} disabled={disabled} onCreated={() => { void files.managed.picker.retry(); }} />} />
  </div>;
}

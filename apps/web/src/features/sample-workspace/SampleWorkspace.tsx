"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { SampleCatalog, SampleSession } from "../../shared/sample-contract";
import type { SampleOrganizationAction } from "../../shared/sample-organization";
import type { SampleAnswerAction } from "../../shared/sample-answer";
import type { AiProvider } from "../../shared/ai-provider";
import { StatusNotice } from "../../components/ui/feedback/StatusNotice";
import { FolderWorkspaceFrame } from "../local-folders/browsing/FolderWorkspaceFrame";
import { FilePreviewPane } from "../local-folders/documents/preview/FilePreviewPane";
import { SampleWorkspaceStore } from "./sample-workspace-store";
import { sampleActiveCatalog, sampleFolderPath } from "./sample-state";
import { SampleConversation } from "./conversation/SampleConversation";
import { SampleDocumentPreview } from "./files/SampleDocumentPreview";
import { SampleFolderPanel, sampleFolderListing } from "./files/SampleFolderPanel";
import { SampleFolderTree } from "./files/SampleFolderTree";
import ui from "../../styles/workspace-ui.module.css";
import folderStyles from "../local-folders/browsing/folder-workspace.module.css";

export function SampleWorkspace({ catalog: sourceCatalog, session, remainingMs, organizeAction, answerAction, view = "chat", aiProvider = "gemini" }: {
  catalog: SampleCatalog;
  session: SampleSession;
  remainingMs: number;
  organizeAction: SampleOrganizationAction;
  answerAction: SampleAnswerAction;
  view?: "chat" | "files";
  aiProvider?: AiProvider | null;
}) {
  const [store] = useState(() => new SampleWorkspaceStore(sourceCatalog, session, undefined, remainingMs));
  const { state, ready, expired, notice, aiPending } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const catalog = sampleActiveCatalog(sourceCatalog, state);
  const [path, setPath] = useState<string[]>(["받은 자료"]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const preview = catalog.documents.find(document => document.id === previewId);
  const disabled = !ready || expired || aiPending;

  if (view === "chat") return <SampleConversation catalog={sourceCatalog} store={store}
    organizeAction={organizeAction} answerAction={answerAction} aiProvider={aiProvider} />;

  return <div className={`${ui.system} ${folderStyles.theme}`} data-sample-ready={ready}>
    <FolderWorkspaceFrame rootName="예시 자료" path={path} ancestors={[]} disabled={disabled} mode="sample"
      onOpen={value => setPath([...value])}
      folderTree={<SampleFolderTree catalog={catalog} path={path} onOpen={value => setPath([...value])} />}
      onOpenFile={value => setPreviewId(catalog.documents.find(document => document.name === value.at(-1)
        && JSON.stringify(sampleFolderPath(catalog, state.locations[document.id])) === JSON.stringify(value.slice(0, -1)))?.id ?? null)}
      onSelectPrevious={() => {}}
      footer={<span>{path.at(-1) ?? "예시 자료"} · {sampleFolderListing(catalog, state, path).entries.length}개 항목 · {state.fileSelected.length + state.fileSelectedFolders.length}개 선택</span>}
      preview={<FilePreviewPane open={!!preview} onClose={() => setPreviewId(null)}>
        {preview && <SampleDocumentPreview document={preview} headingRef={heading} />}
      </FilePreviewPane>}>
      {expired && <StatusNotice state="attention" title="샘플 세션이 만료됐어요" action={<a href="/demo/start">새 세션 시작</a>} />}
      {notice && <StatusNotice state="attention" title="샘플 안내" detail={notice} compact={notice.startsWith("이 탭에서 보관한")} />}
      <SampleFolderPanel catalog={catalog} state={{ locations: state.locations, selected: state.fileSelected, phase: "select" }} path={path} onOpen={setPath} onPreview={setPreviewId} disabled={disabled}
        selectedFolders={state.fileSelectedFolders}
        onToggleFolder={path => {
          const folders = store.getSnapshot().state.fileSelectedFolders;
          const key = JSON.stringify(path);
          store.dispatch({ type: "select-file-folders", paths: folders.some(folder => JSON.stringify(folder) === key)
            ? folders.filter(folder => JSON.stringify(folder) !== key) : [...folders, path] });
        }}
        onToggle={id => {
          const selected = store.getSnapshot().state.fileSelected;
          store.dispatch({ type: "select-files", ids: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] });
        }} />
    </FolderWorkspaceFrame>
  </div>;
}

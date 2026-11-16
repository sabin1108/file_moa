"use client";

import { useEffect, useRef, useState } from "react";
import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SampleState } from "../sample-state";
import { sampleFolderPath } from "../sample-state";
import { FolderListingView } from "../../local-folders/browsing/file-list/FolderListingView";
import type { SourceListingState } from "../../local-folders/browsing/file-list/source-listing-controller";
import type { FolderListing } from "../../local-folders/browsing/source-folder-listing";
import type { FolderSearchState } from "../../local-folders/browsing/search/folder-search-controller";
import { searchFolderTree } from "../../local-folders/browsing/search/folder-tree-search";

type ListingState = Pick<SampleState, "locations" | "selected" | "phase">;

export function sampleFolderListing(catalog: SampleCatalog, state: Pick<SampleState, "locations">, path: readonly string[]): FolderListing {
  const items = catalog.documents.map(document => ({ document, path: sampleFolderPath(catalog, state.locations[document.id]) }));
  const descendants = items.filter(item => path.every((part, index) => item.path[index] === part));
  const folders = [...new Set(descendants.filter(item => item.path.length > path.length).map(item => item.path[path.length]))].sort();
  return { path, truncated: false, entries: [
    ...folders.map(name => ({ name, kind: "directory" as const })),
    ...descendants.filter(item => item.path.length === path.length).map(({ document }) => ({ name: document.name, kind: "file" as const })),
  ] };
}

export function SampleFolderPanel({ catalog, state, path, onOpen, onPreview, onToggle, disabled, selecting = false }: {
  catalog: SampleCatalog; state: ListingState; path: readonly string[];
  onOpen: (path: string[]) => void; onPreview: (id: string) => void; onToggle: (id: string) => void; disabled: boolean; selecting?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [search, setSearch] = useState<FolderSearchState>({ phase: "idle", result: null });
  const [searchRevision, setSearchRevision] = useState(0);
  const searchAbort = useRef<AbortController | null>(null);
  const result = sampleFolderListing(catalog, state, path);
  const documents = catalog.documents.filter(document => JSON.stringify(sampleFolderPath(catalog, state.locations[document.id])) === JSON.stringify(path));
  const selectedNames = documents.filter(document => state.selected.includes(document.id)).map(document => document.name);
  const toggle = (name: string) => {
    const document = documents.find(document => document.name === name);
    if (document) { setSelectionOpen(true); onToggle(document.id); }
  };
  const listing: SourceListingState = {
    available: !disabled, phase: "ready", result, requestedPath: path, stale: false, issue: null,
    selectedNames, query, searchOpen, selectionOpen: selecting || selectionOpen || selectedNames.length > 0,
  };
  useEffect(() => {
    if (!query.trim()) return;
    const abort = new AbortController();
    searchAbort.current = abort;
    void searchFolderTree(path, query, async path => sampleFolderListing(catalog, state, path), () => abort.signal.throwIfAborted()).then(
      result => { if (!abort.signal.aborted) setSearch({ phase: "ready", result }); },
      () => { if (!abort.signal.aborted) setSearch({ phase: "error", result: null }); },
    );
    return () => abort.abort();
  }, [catalog, state, path, query, searchRevision]);
  return <>
    {notice && <p role="status">{notice}</p>}
    <FolderListingView state={listing} folderName="예시 자료" headingRef={heading}
      allowFolderSelection={false}
      selectionLocked={state.phase === "review" || (!selecting && state.phase !== "select")} previewSupported={() => true}
      connectionControls={<span data-tour="folder-connection">예시 자료 · 연결됨</span>}
      historyControls={null} creation={null} previewName={null} searchState={search}
      onOpen={path => { setQuery(""); onOpen([...path]); }}
      onOpenFile={path => {
        const document = catalog.documents.find(document => document.name === path.at(-1) && JSON.stringify(sampleFolderPath(catalog, state.locations[document.id])) === JSON.stringify(path.slice(0, -1)));
        if (document) onPreview(document.id);
      }}
      onSearchOpen={setSearchOpen}
      onSearchCancel={() => { searchAbort.current?.abort(); setSearch(current => ({ phase: "cancelled", result: current.result })); }}
      onSearchRetry={() => { setSearch({ phase: "loading", result: null }); setSearchRevision(value => value + 1); }}
      onSelectSearch={(parentPath, name, kind) => {
        const document = catalog.documents.find(document => document.name === name && JSON.stringify(sampleFolderPath(catalog, state.locations[document.id])) === JSON.stringify(parentPath));
        if (kind === "file" && document) {
          setQuery("");
          onOpen([...parentPath]);
          if (!state.selected.includes(document.id)) onToggle(document.id);
        }
      }}
      onRefresh={() => setNotice("준비된 예시 자료의 현재 상태입니다.")} onRetry={() => setNotice("")} onCancel={() => {}}
      onToggleSelection={toggle}
      onSelectAll={() => documents.filter(document => !state.selected.includes(document.id)).forEach(document => onToggle(document.id))}
      onClearVisibleSelection={() => documents.filter(document => state.selected.includes(document.id)).forEach(document => onToggle(document.id))}
      onQueryChange={value => { setSearch({ phase: "loading", result: null }); setQuery(value); }} onClearSelection={() => state.selected.forEach(onToggle)}
      onExitSelection={selecting ? undefined : () => { state.selected.forEach(onToggle); setSelectionOpen(false); }}
    />
  </>;
}

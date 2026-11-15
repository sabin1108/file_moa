"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { SourceConnectionControl } from "../../local-folders/connection/SourceConnectionControl";
import { DocumentFindPanel } from "../../local-folders/search/documents/DocumentFindPanel";
import { OrganizationPreparationPanel } from "../../local-folders/organization/OrganizationPreparationPanel";
import { SourceDocumentPreview } from "../../local-folders/documents/preview/SourceDocumentPreview";
import { useSharedSourceFolderConnection } from "../../local-folders/SourceFolderProvider";
import type { LiveOrganizationAction } from "../../../shared/live-organization";
import type { AiProvider } from "../../../shared/ai-provider";
import { actionClasses } from "../../../components/ui/action-classes";
import type { SearchQueryAction } from "../../../shared/search-query";

function FindWorkPanel({ onPrepare, onQuestion, canStart, queryAction }: {
  onPrepare: () => void;
  onQuestion?: () => void;
  canStart: boolean
  queryAction?: SearchQueryAction;
}) {
  const local = useSharedSourceFolderConnection();
  const state = useSyncExternalStore(
    local.finding.subscribe,
    local.finding.getSnapshot,
    local.finding.getServerSnapshot
  );
  const preview = useSyncExternalStore(
    local.preview.subscribe,
    local.preview.getSnapshot,
    local.preview.getServerSnapshot
  );
  const listing = useSyncExternalStore(
    local.listing.subscribe,
    local.listing.getSnapshot,
    local.listing.getServerSnapshot
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const showing = !!preview.path
    && !!state.result?.documents.some(document => JSON.stringify(document.path) === JSON.stringify(preview.path));

  useEffect(() => {
    if (showing) heading.current?.focus();
  }, [showing, preview.phase]);

  const folderName = local.state.view?.folderName ?? "내 폴더";

  return <>
    <div hidden={showing}>
      <DocumentFindPanel
        controller={local.finding}
        state={state}
        folderName={folderName}
        currentPath={listing.result?.path ?? []}
        onPrepare={onPrepare}
        onQuestion={onQuestion}
        canPrepare={canStart}
        queryAction={queryAction}
        owner={local.owner}
        semanticTools={{ model: local.semanticModel, prepare: local.prepareSourceSemantic, readStatus: local.readSourceSemanticStatus }}
        onOpenFile={path => {
          trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          void local.preview.open(path);
        }}
      />
    </div>
    {showing && <div data-find-preview>
      <SourceDocumentPreview
        state={preview}
        folderName={folderName}
        headingRef={heading}
        onClose={() => {
          local.preview.close();
          requestAnimationFrame(() => {
            if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
          });
        }}
        onRefresh={local.preview.refresh}
        onCancel={local.preview.cancel}
      />
    </div>}
  </>;
}

export function MaterialWorkPanel({ kind, onPrepare, onQuestion, canStart, organizeAction, aiProvider, waitingForSource, onContinue, queryAction }: {
  kind: "find" | "organize";
  onPrepare: () => void;
  onQuestion?: () => void;
  canStart: boolean;
  organizeAction?: LiveOrganizationAction;
  aiProvider: AiProvider | null;
  waitingForSource: boolean;
  onContinue: () => void;
  queryAction?: SearchQueryAction;
}) {
  const local = useSharedSourceFolderConnection();

  if (local.state.view?.status !== "connected") return <SourceConnectionControl />;

  if (waitingForSource) return <button
    type="button"
    className={actionClasses("secondary")}
    onClick={onContinue}
    disabled={!canStart}
  >연결한 폴더로 요청 계속</button>;

  return kind === "find"
    ? <FindWorkPanel onPrepare={onPrepare} onQuestion={onQuestion} canStart={canStart} queryAction={queryAction} />
    : <OrganizationPreparationPanel organizeAction={organizeAction} aiProvider={aiProvider} />;
}

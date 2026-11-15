import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { NavigationGuardProvider } from "../../src/components/navigation/NavigationGuard";
import { ConversationStateProvider } from "../../src/features/conversation-workspace/ConversationStateProvider";
import { LiveConversation } from "../../src/features/conversation-workspace/LiveConversation";
import { SourceFolderProvider, useSharedSourceFolderConnection } from "../../src/features/local-folders/SourceFolderProvider";
import { SourceFolderSettings } from "../../src/features/local-folders/connection/SourceFolderSettings";
import { WorkspaceShell } from "../../src/components/layout/WorkspaceShell";
import ui from "../../src/styles/workspace-ui.module.css";
import layout from "../../src/styles/workspace-layout.module.css";
import { compileSearchQuerySuggestion, searchQueryRequestSchema, type SearchQueryAction, type SearchQueryResult } from "../../src/shared/search-query";
import { groundedRequestSchema, type GroundedAction, type GroundedRequest } from "../../src/shared/grounded-chat";
import "../../src/styles/globals.css";

type Probe = {
  local?: ReturnType<typeof useSharedSourceFolderConnection>;
  requests: unknown[];
  groundedRequests: GroundedRequest[];
  mode: "ok" | "hold" | "invalid";
  release: (() => void) | null;
};
const browser = window as unknown as Window & { ragProbe: Probe };
browser.ragProbe = { requests: [], groundedRequests: [], mode: "ok", release: null };
const groundedAction: GroundedAction = async value => {
  const input = groundedRequestSchema.parse(value);
  browser.ragProbe.groundedRequests.push(input);
  return { ok: true, model: "synthetic-only", answer: { answer: "합성 자료에서 확인한 답변입니다.", citations: [{ documentId: input.documents[0].id, quote: input.documents[0].excerpt.slice(0, 20) }] } };
};

// Only the paid model response is replaced; product UI, controllers, permissions, Worker and IDB run.
const queryAction: SearchQueryAction = async value => {
  const input = searchQueryRequestSchema.parse(value);
  browser.ragProbe.requests.push(input);
  const response = (): SearchQueryResult => browser.ragProbe.mode === "invalid"
    ? { ok: true, question: input.question, model: "synthetic-invalid", suggestion: { required: [{ text: "invented", start: 0, end: 8 }], preferred: [], phrases: [], excluded: [] } }
    : { ok: true, question: input.question, model: "synthetic", suggestion: compileSearchQuerySuggestion({ required: ["가온센터"], preferred: ["이력서"], phrases: [], excluded: [] }, input.question) };

  if (browser.ragProbe.mode === "hold") return new Promise(resolve => { browser.ragProbe.release = () => resolve(response()); });

  return response();
};

function Workspace() {
  const local = useSharedSourceFolderConnection();
  const [settings, setSettings] = useState(false);

  useEffect(() => { browser.ragProbe.local = local; }, [local]);

  return <>
    <nav aria-label="합성 검증 조작" style={{ position: "fixed", right: 0, top: 0, zIndex: 100 }}>
      <button data-rag-connect disabled={local.state.phase !== "ready" || !!local.state.pending} onClick={() => { void local.connect(); }}>합성 폴더 연결</button>
      <button data-rag-settings onClick={() => setSettings(value => !value)}>{settings ? "대화로 돌아가기" : "폴더 설정"}</button>
    </nav>
    {settings ? <WorkspaceShell title="설정" active="settings"><div className={`${ui.canvas} ${layout.settingsCanvas}`}><section className={layout.settingsSection}><header className={layout.settingsHeader}><h2>자료 폴더와 복구 보관함</h2></header><div className={layout.settingsPanel}><SourceFolderSettings /></div></section></div></WorkspaceShell> : <LiveConversation aiProvider="openai" queryAction={queryAction} groundedAction={groundedAction} />}
  </>;
}

const owner = { userId: "rag-search", workspaceId: "synthetic" };
createRoot(document.getElementById("fixture")!).render(
  <NavigationGuardProvider><SourceFolderProvider owner={owner}><ConversationStateProvider><Workspace /></ConversationStateProvider></SourceFolderProvider></NavigationGuardProvider>,
);

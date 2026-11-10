import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { SourceFolderProvider, useSharedSourceFolderConnection } from "../../src/features/local-folders/providers/SourceFolderProvider";
import { LiveConversation } from "../../src/features/conversation-workspace/components/LiveConversation";
import { ConversationStateProvider } from "../../src/features/conversation-workspace/providers/ConversationStateProvider";
import { SourceFolderBrowser } from "../../src/features/local-folders/components/listing/SourceFolderBrowser";
import { groundedRequestSchema, type GroundedRequest, type GroundedAction } from "../../src/shared/grounded-chat";
import "../../src/styles/globals.css";
import ui from "../../src/styles/workspace-ui.module.css";
import files from "../../src/features/local-folders/components/listing/folder-workspace.module.css";

declare global {
  interface Window { groundedProbe: { calls: GroundedRequest[]; mode: "success" | "hold" | "forged"; finish: (() => void) | null; navigations: string[]; answer?: string }; }
}
const probe = window.groundedProbe = { calls: [] as GroundedRequest[], mode: "success" as "success" | "hold" | "forged", finish: null as (() => void) | null, navigations: [] as string[] };
const action: GroundedAction = async input => {
  const parsed = groundedRequestSchema.parse(input);
  probe.calls.push(parsed);
  if (probe.mode === "hold") await new Promise<void>(resolve => { probe.finish = resolve; });
  return { ok: true, model: "fixture-only", answer: { answer: window.groundedProbe.answer ?? "합성 근거에서 확인한 답변입니다.", citations: [{ documentId: probe.mode === "forged" ? "document-999" : parsed.documents[0].id, quote: parsed.documents[0].excerpt.slice(0, 20) }] } };
};
function Workbench() {
  const local = useSharedSourceFolderConnection();
  const preparation = useSyncExternalStore(local.organization.subscribe, local.organization.getSnapshot, local.organization.getServerSnapshot);
  const [view, setView] = useState("chat");
  useEffect(() => {
    const navigate = (event: Event) => { const path = (event as CustomEvent<string>).detail; probe.navigations.push(path); if (path === "/files") setView("files"); };
    window.addEventListener("fixture-grounded-navigation", navigate);
    return () => window.removeEventListener("fixture-grounded-navigation", navigate);
  }, []);
  return <>
    <nav aria-label="검증 조작">
      <button data-grounded-prepare data-ready={preparation.phase} onClick={() => { setView("chat"); local.organization.update({ request: "합성 자료 확인", scope: { kind: "selected", entries: [{ path: ["evidence.md"], kind: "file" }] }, reference: null, destination: null }); void local.organization.prepare(); }}>검증 자료 준비</button>
      <button data-grounded-connect disabled={!!local.state.pending || local.state.phase !== "ready"} onClick={() => void local.connect()}>검증 폴더 연결</button>
      <button data-grounded-return onClick={() => setView("chat")}>대화로 복귀</button>
      <button data-grounded-files onClick={() => setView("files")}>파일 화면 검증</button>
    </nav>
    {view === "files" ? <div className={`${ui.system} ${files.theme}`}><SourceFolderBrowser /></div> : <LiveConversation aiProvider="openai" groundedAction={action} />}
  </>;
}
function Fixture() {
  const [owner, setOwner] = useState("A");
  return <><button data-grounded-owner onClick={() => setOwner(owner === "A" ? "B" : "A")}>계정 전환 검증</button><SourceFolderProvider key={owner} owner={{ userId: `grounded-${owner}`, workspaceId: `workspace-${owner}` }}><ConversationStateProvider><Workbench /></ConversationStateProvider></SourceFolderProvider></>;
}
createRoot(document.getElementById("fixture")!).render(<Fixture />);

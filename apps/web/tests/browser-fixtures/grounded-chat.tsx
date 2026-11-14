import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { SourceFolderProvider, useSharedSourceFolderConnection } from "../../src/features/local-folders/SourceFolderProvider";
import { LiveConversation } from "../../src/features/conversation-workspace/LiveConversation";
import { ConversationStateProvider } from "../../src/features/conversation-workspace/ConversationStateProvider";
import { SourceFolderBrowser } from "../../src/features/local-folders/SourceFolderBrowser";
import { groundedRequestSchema, type GroundedRequest, type GroundedAction } from "../../src/shared/grounded-chat";
import "../../src/styles/globals.css";
import ui from "../../src/styles/workspace-ui.module.css";
import files from "../../src/features/local-folders/browsing/folder-workspace.module.css";

declare global {
  interface Window {
    groundedProbe: {
      calls: GroundedRequest[];
      mode: "success" | "hold" | "forged";
      finish: (() => void) | null;
      navigations: string[];
      answer?: string
    };
  }
}

const probe = window.groundedProbe = {
  calls: [] as GroundedRequest[],
  mode: "success" as "success" | "hold" | "forged",
  finish: null as (() => void) | null,
  navigations: [] as string[]
};
const action: GroundedAction = async input => {
  const parsed = groundedRequestSchema.parse(input);

  probe.calls.push(parsed);

  if (probe.mode === "hold") await new Promise<void>(resolve => {
    probe.finish = resolve;
  });

  return {
    ok: true,
    model: "fixture-only",
    answer: {
      answer: window.groundedProbe.answer ?? "합성 근거에서 확인한 답변입니다.",
      citations: [{
        documentId: probe.mode === "forged" ? "document-999" : parsed.documents[0].id,
        quote: parsed.documents[0].excerpt.slice(0, 20)
      }]
    }
  };
};

function Workbench() {
  const local = useSharedSourceFolderConnection();
  const preparation = useSyncExternalStore(
    local.organization.subscribe,
    local.organization.getSnapshot,
    local.organization.getServerSnapshot
  );
  const [view, setView] = useState("chat");

  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<string | { href: string }>).detail;
      const path = typeof detail === "string" ? detail : detail.href;

      probe.navigations.push(path);

      if (path === "/files") setView("files");
      if (path === "/") setView("chat");
    };

    window.addEventListener("fixture-grounded-navigation", navigate);
    window.addEventListener("fixture-navigation", navigate);

    return () => {
      window.removeEventListener("fixture-grounded-navigation", navigate);
      window.removeEventListener("fixture-navigation", navigate);
    };
  }, []);

  return <>
    <nav aria-label="검증 조작" style={{ position: "fixed", top: 0, left: 100, zIndex: 100, opacity: 0.15 }}>
      <button
        data-grounded-prepare
        data-ready={preparation.phase}
        onClick={() => {
          setView("chat");
          local.organization.update({
            purpose: "grounded",
            request: document.querySelector<HTMLTextAreaElement>("#message-draft")?.value.trim() || "합성 자료 확인",
            scope: { kind: "selected", entries: [{ path: ["evidence.md"], kind: "file" }] },
            reference: null,
            destination: null
          });
          void local.organization.prepare();
        }}
      >검증 자료 준비</button>
      <button data-grounded-prepare-partial onClick={() => {
        local.organization.update({ purpose: "grounded", request: document.querySelector<HTMLTextAreaElement>("#message-draft")?.value.trim() || "일부 자료 확인", scope: { kind: "selected", entries: [{ path: ["evidence.md"], kind: "file" }, { path: ["missing.md"], kind: "file" }] }, basis: "", reference: null, destination: null });
        void local.organization.prepare();
      }}>일부 자료 검증</button>
      <button
        data-grounded-connect
        disabled={!!local.state.pending || local.state.phase !== "ready"}
        onClick={() => void local.connect()}
      >검증 폴더 연결</button>
      <button data-grounded-return onClick={() => setView("chat")}>대화로 복귀</button>
      <button data-grounded-files onClick={() => setView("files")}>파일 화면 검증</button>
    </nav>
    {view === "files"
      ? <div className={`${ui.system} ${files.theme}`}>
        <SourceFolderBrowser />
      </div>
      : <LiveConversation aiProvider="openai" groundedAction={action} />}
  </>;
}

function Fixture() {
  const [owner, setOwner] = useState("A");

  return <>
    <button data-grounded-owner style={{ position: "fixed", top: 0, left: 0, zIndex: 100, opacity: 0.15 }} onClick={() => setOwner(owner === "A" ? "B" : "A")}>계정 전환 검증</button>
    <SourceFolderProvider
      key={owner}
      owner={{ userId: `grounded-${owner}`, workspaceId: `workspace-${owner}` }}
    >
      <ConversationStateProvider>
        <Workbench />
      </ConversationStateProvider>
    </SourceFolderProvider>
  </>;
}

createRoot(document.getElementById("fixture")!).render(<Fixture />);

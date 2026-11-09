import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SourceFolderProvider } from "../../src/features/local-folders/providers/SourceFolderProvider";
import { LiveConversation } from "../../src/features/conversation-workspace/components/LiveConversation";
import { ConversationStateProvider } from "../../src/features/conversation-workspace/providers/ConversationStateProvider";
import { SourceFolderSettings } from "../../src/features/local-folders/components/connection/SourceFolderSettings";
import { SourceFolderBrowser } from "../../src/features/local-folders/components/listing/SourceFolderBrowser";
import "../../src/styles/globals.css";
import ui from "../../src/styles/workspace-ui.module.css";
import files from "../../src/features/local-folders/components/listing/folder-workspace.module.css";
import { liveOrganizationFixtureAction } from "./live-organization-action";
import { WorkspaceQuickSwitch } from "../../src/features/quick-switch/components/WorkspaceQuickSwitch";

const organizeAction = new URLSearchParams(location.search).has("transfer") ? liveOrganizationFixtureAction() : undefined;

const owners = [
  { userId: "organization-A", workspaceId: "fixture" },
  { userId: "organization-B", workspaceId: "fixture" }
];
function Fixture() {
  const [view, setView] = useState(location.pathname === "/files" ? "files" : "chat");
  const [owner, setOwner] = useState(0);
  return (
    <>
      <div>
        {["chat", "files", "settings"].map(view => (
          <button key={view} data-fixture-view={view} onClick={() => setView(view)}>
            {view}
          </button>
        ))}
        <button data-fixture-owner onClick={() => setOwner(value => 1 - value)}>
          소유자 전환
        </button>
      </div>
      <SourceFolderProvider key={owner} owner={owners[owner]}>
        <ConversationStateProvider>
        {view === "chat" ? (
          <LiveConversation aiProvider="openai" organizeAction={organizeAction} />
        ) : view === "files" ? (
          <div data-workspace-quick-menu className={`${ui.system} ${files.theme}`}><SourceFolderBrowser /></div>
        ) : (
          <SourceFolderSettings />
        )}
        </ConversationStateProvider>
      </SourceFolderProvider>
      <WorkspaceQuickSwitch />
    </>
  );
}
createRoot(document.getElementById("fixture")!).render(<Fixture />);

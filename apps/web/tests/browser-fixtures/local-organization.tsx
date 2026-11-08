import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SourceFolderProvider } from "../../src/features/local-folders/providers/SourceFolderProvider";
import { LiveConversation } from "../../src/features/conversation-workspace/components/LiveConversation";
import { SourceFolderSettings } from "../../src/features/local-folders/components/connection/SourceFolderSettings";
import { SourceFolderBrowser } from "../../src/features/local-folders/components/listing/SourceFolderBrowser";
import "../../src/styles/globals.css";
import ui from "../../src/styles/workspace-ui.module.css";
import files from "../../src/features/local-folders/components/listing/folder-workspace.module.css";
import { liveOrganizationFixtureAction } from "./live-organization-action";

const organizeAction = new URLSearchParams(location.search).has("transfer") ? liveOrganizationFixtureAction() : undefined;

const owners = [
  { userId: "organization-A", workspaceId: "fixture" },
  { userId: "organization-B", workspaceId: "fixture" }
];
function Fixture() {
  const [view, setView] = useState("chat");
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
        {view === "chat" ? (
          <LiveConversation organizeAction={organizeAction} />
        ) : view === "files" ? (
          <div className={`${ui.system} ${files.theme}`}><SourceFolderBrowser /></div>
        ) : (
          <SourceFolderSettings />
        )}
      </SourceFolderProvider>
    </>
  );
}
createRoot(document.getElementById("fixture")!).render(<Fixture />);

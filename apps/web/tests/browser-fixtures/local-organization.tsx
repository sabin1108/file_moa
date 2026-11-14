import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SourceFolderProvider } from "../../src/features/local-folders/SourceFolderProvider";
import { LiveConversation } from "../../src/features/conversation-workspace/LiveConversation";
import { ConversationStateProvider, useConversationStore } from "../../src/features/conversation-workspace/ConversationStateProvider";
import type { ConversationStore } from "../../src/features/conversation-workspace/conversation-store";
import { SourceFolderSettings } from "../../src/features/local-folders/connection/SourceFolderSettings";
import { SourceFolderBrowser } from "../../src/features/local-folders/SourceFolderBrowser";
import "../../src/styles/globals.css";
import ui from "../../src/styles/workspace-ui.module.css";
import files from "../../src/features/local-folders/browsing/folder-workspace.module.css";
import { liveOrganizationFixtureAction } from "./live-organization-action";
import { WorkspaceQuickSwitch } from "../../src/features/quick-switch/WorkspaceQuickSwitch";
import { NavigationGuardProvider } from "../../src/components/navigation/NavigationGuard";

const organizeAction = new URLSearchParams(location.search).has("transfer") ? liveOrganizationFixtureAction() : undefined;

const owners = [
  { userId: "organization-A", workspaceId: "fixture" },
  { userId: "organization-B", workspaceId: "fixture" }
];

function ConversationFixtureProbe() {
  const store = useConversationStore();

  useEffect(() => {
    const fixture = window as Window & { conversationFixtureStore?: ConversationStore };

    fixture.conversationFixtureStore = store;

    return () => {
      if (fixture.conversationFixtureStore === store) delete fixture.conversationFixtureStore;
    };
  }, [store]);

  return null;
}

function Fixture() {
  const [view, setView] = useState(location.pathname === "/files" ? "files" : "chat");
  const [owner, setOwner] = useState(0);

  useEffect(() => {
    const changeView = () => setView(location.pathname === "/files" ? "files" : location.pathname === "/settings" ? "settings" : "chat");
    const navigate = (event: Event) => {
      const { href, replace } = (event as CustomEvent<{ href: string; replace: boolean }>).detail;

      if (replace) history.replaceState(null, "", href);
      else history.pushState(null, "", href);
      changeView();
    };

    window.addEventListener("fixture-navigation", navigate);
    window.addEventListener("popstate", changeView);

    return () => {
      window.removeEventListener("fixture-navigation", navigate);
      window.removeEventListener("popstate", changeView);
    };
  }, []);

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
          <ConversationFixtureProbe />
          {view === "chat"
            ? (
              <LiveConversation aiProvider="openai" organizeAction={organizeAction} />
            )
            : view === "files"
              ? (
                <div data-workspace-quick-menu className={`${ui.system} ${files.theme}`}>
                  <SourceFolderBrowser />
                </div>
              )
              : (
                <SourceFolderSettings />
              )}
        </ConversationStateProvider>
      </SourceFolderProvider>
      <WorkspaceQuickSwitch />
    </>
  );
}

createRoot(document.getElementById("fixture")!).render(<NavigationGuardProvider><Fixture /></NavigationGuardProvider>);

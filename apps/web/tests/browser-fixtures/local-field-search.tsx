import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { NavigationGuardProvider } from "../../src/components/navigation/NavigationGuard";
import { ConversationStateProvider } from "../../src/features/conversation-workspace/ConversationStateProvider";
import { LiveConversation } from "../../src/features/conversation-workspace/LiveConversation";
import { SourceFolderProvider, useSharedSourceFolderConnection } from "../../src/features/local-folders/SourceFolderProvider";
import "../../src/styles/globals.css";

function SearchProbe() {
  const local = useSharedSourceFolderConnection();

  useEffect(() => {
    const probe = window as Window & { fieldSearch?: typeof local };

    probe.fieldSearch = local;
  }, [local]);

  return <button data-search-connect disabled={local.state.phase !== "ready" || !!local.state.pending} onClick={() => void local.connect()} style={{ position: "fixed", right: 0, top: 0, zIndex: 100 }}>합성 폴더 연결</button>;
}

createRoot(document.getElementById("fixture")!).render(
  <NavigationGuardProvider>
    <SourceFolderProvider owner={{ userId: "field-search", workspaceId: "synthetic" }}>
      <ConversationStateProvider>
        <SearchProbe />
        <LiveConversation aiProvider="openai" />
      </ConversationStateProvider>
    </SourceFolderProvider>
  </NavigationGuardProvider>,
);

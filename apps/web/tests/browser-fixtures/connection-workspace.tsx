import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SourceFolderProvider } from "../../src/features/local-folders/SourceFolderProvider";
import { SourceFolderSettings } from "../../src/features/local-folders/connection/SourceFolderSettings";
import { LiveConversation } from "../../src/features/conversation-workspace/LiveConversation";
import { ConversationStateProvider } from "../../src/features/conversation-workspace/ConversationStateProvider";
import "../../src/styles/globals.css";

function Fixture() {
  const [settings, setSettings] = useState(false);

  return <SourceFolderProvider
    owner={{ userId: "navigation-fixture-user", workspaceId: "navigation-fixture-workspace" }}
  >
    <ConversationStateProvider>
      <button type="button" data-fixture-toggle onClick={() => setSettings(value => !value)}>연결 설정 검증</button>
      {settings ? <SourceFolderSettings /> : <LiveConversation />}
    </ConversationStateProvider>
  </SourceFolderProvider>;
}

createRoot(document.getElementById("fixture")!).render(<Fixture />);

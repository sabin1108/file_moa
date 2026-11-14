import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { GuardedLink, NavigationGuardProvider, useNavigationBlocker } from "../../src/components/navigation/NavigationGuard";
import { createBrowserStringStore } from "../../src/shared/browser-string-store";
import { WorkspaceTour } from "../../src/features/onboarding/WorkspaceTour";
import { SettingsTabs } from "../../src/components/layout/SettingsTabs";
import { QuickSwitchSettings } from "../../src/features/quick-switch/QuickSwitchSettings";
import { replayWorkspaceTour } from "../../src/features/onboarding/workspace-tour";
import { WorkspaceTourRecordView, useWorkspaceTourRecordView, type TourRecordKind } from "../../src/features/onboarding/workspace-tour-view";

const organizeAction = new URLSearchParams(location.search).has("transfer") ? liveOrganizationFixtureAction() : undefined;

const owners = [
  { userId: "organization-A", workspaceId: "fixture" },
  { userId: "organization-B", workspaceId: "fixture" }
];

function workspaceTourStore(owner: typeof owners[number]) {
  return createBrowserStringStore(`fixture:guide:${owner.userId}`, () => localStorage);
}

if (!new URLSearchParams(location.search).has("tour")) {
  for (const owner of owners) workspaceTourStore(owner).write("done");
}

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

function GuideGuardProbe() {
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const request = useCallback(() => setConfirming(true), []);
  const guard = useNavigationBlocker(dirty, request);

  return <>
    <button data-fixture-guide-dirty onClick={() => setDirty(true)}>검증용 미저장 상태</button>
    <button data-fixture-guide-replay onClick={replayWorkspaceTour}>검증용 안내 다시 보기</button>
    {confirming && <section role="alertdialog" aria-label="검증용 이탈 확인">
      <button onClick={() => { setConfirming(false); guard.cancelNavigation(); }}>검증용 계속 편집</button>
      <button onClick={() => { setConfirming(false); setDirty(false); guard.confirmNavigation(); }}>검증용 이동</button>
    </section>}
  </>;
}

function RecordPreviewProbe({ children }: { children: ReactNode }) {
  const automatic = useWorkspaceTourRecordView();
  const [preview, setPreview] = useState<TourRecordKind | null>(null);

  return <WorkspaceTourRecordView.Provider value={preview ?? automatic}>
    <button data-fixture-record-preview onClick={() => setPreview("wiki")}>검증용 위키 임시 보기</button>
    <button data-fixture-record-preview-close onClick={() => setPreview(null)}>검증용 임시 보기 종료</button>
    {children}
  </WorkspaceTourRecordView.Provider>;
}

function Fixture() {
  const [view, setView] = useState(location.pathname === "/files" ? "files" : "chat");
  const [owner, setOwner] = useState(0);
  const claim = useCallback(async () => {
    const store = workspaceTourStore(owners[owner]);
    if (store.read() === "done") return false;
    if (new URLSearchParams(location.search).has("guideDelay")) {
      await new Promise<void>(resolve => {
        (window as Window & { resolveFixtureGuide?: () => void }).resolveFixtureGuide = resolve;
      });
    }
    store.write("done");
    return true;
  }, [owner]);

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
        <GuideGuardProbe />
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
          <WorkspaceTour key={owner} claim={claim}>
          <RecordPreviewProbe>
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
                <div data-workspace-quick-menu className={ui.system}>
                  <SettingsTabs panels={{ account: <p>테스트 계정</p>, folders: <SourceFolderSettings />, editor: <p>문서 편집</p>, controls: <><GuardedLink href="/?guide=1">사용 방법 다시 보기</GuardedLink><QuickSwitchSettings /></> }} />
                </div>
              )}
          </RecordPreviewProbe>
          </WorkspaceTour>
        </ConversationStateProvider>
      </SourceFolderProvider>
      <WorkspaceQuickSwitch />
    </>
  );
}

createRoot(document.getElementById("fixture")!).render(<NavigationGuardProvider><Fixture /></NavigationGuardProvider>);

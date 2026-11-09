/**
 * URL에 드러나지 않는 route group의 공통 layout이다. 대화·파일·설정 경로를 Provider로 감싼다.
 * 같은 그룹 안에서 이동해도 폴더 연결/목록/선택 상태가 유지되며, 그룹을 떠나면 기능 수명이 정리된다.
 */
import { Suspense, type ReactNode } from "react";
import { SourceFolderProvider } from "../../features/local-folders/providers/SourceFolderProvider";
import { SessionBoundary } from "../../features/auth/components/SessionBoundary";
import { requireWorkspace } from "../../server/session-guards";
import { checkAuthSessionAction } from "../actions/auth";
import { headers } from "next/headers";
import { after } from "next/server";
import { prepareSettingsDisplay } from "../../server/settings-display";
import { WorkspaceShell } from "../../components/layout/WorkspaceShell";
import ui from "../../styles/workspace-ui.module.css";
import { ConversationStateProvider } from "../../features/conversation-workspace/providers/ConversationStateProvider";

// 시안·로그인·가입은 이 layout 밖에 둔다. URL에는 (workspace)가 포함되지 않는다.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={
    <WorkspaceShell title="작업 공간" quickMenu={false}>
      <div className={ui.canvas}><p role="status">로그인과 작업 공간을 확인하고 있어요.</p></div>
    </WorkspaceShell>
  }><AuthenticatedWorkspace>{children}</AuthenticatedWorkspace></Suspense>;
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const { sessionExpiresAt, sessionUserId, ...owner } = await requireWorkspace();
  const requestHeaders = await headers();
  after(() => prepareSettingsDisplay(requestHeaders));
  return (
    <SessionBoundary
      key={sessionUserId}
      userId={sessionUserId}
      initialExpiresAt={sessionExpiresAt}
      checkSessionAction={checkAuthSessionAction}
    >
      <SourceFolderProvider key={`${owner.userId}:${owner.workspaceId}`} owner={owner}>
        <ConversationStateProvider>{children}</ConversationStateProvider>
      </SourceFolderProvider>
    </SessionBoundary>
  );
}

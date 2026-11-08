/**
 * URL에 드러나지 않는 route group의 공통 layout이다. 대화·파일·설정 경로를 Provider로 감싼다.
 * 같은 그룹 안에서 이동해도 폴더 연결/목록/선택 상태가 유지되며, 그룹을 떠나면 기능 수명이 정리된다.
 */
import type { ReactNode } from "react";
import { SourceFolderProvider } from "../../features/local-folders/providers/SourceFolderProvider";
import { SessionBoundary } from "../../features/auth/components/SessionBoundary";
import { requireWorkspace } from "../../server/session-guards";
import { checkAuthSessionAction } from "../actions/auth";
import { headers } from "next/headers";
import { after } from "next/server";
import { prepareSettingsDisplay } from "../../server/settings-display";

// 시안·로그인·가입은 이 layout 밖에 둔다. URL에는 (workspace)가 포함되지 않는다.
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
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
        {children}
      </SourceFolderProvider>
    </SessionBoundary>
  );
}

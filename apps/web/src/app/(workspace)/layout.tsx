/**
 * URL에 드러나지 않는 route group의 공통 layout이다. 대화·파일·설정 경로를 Provider로 감싼다.
 * 같은 그룹 안에서 이동해도 폴더 연결/목록/선택 상태가 유지되며, 그룹을 떠나면 기능 수명이 정리된다.
 */
import type { ReactNode } from "react";
import { SourceFolderProvider } from "../../features/local-folders/providers/SourceFolderProvider";

// 시안·로그인·가입은 이 layout 밖에 둔다. URL에는 (workspace)가 포함되지 않는다.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <SourceFolderProvider>{children}</SourceFolderProvider>;
}

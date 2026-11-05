"use client";

/**
 * 설정과 파일 화면이 하나의 폴더 연결을 공유하도록 하는 진입점이다.
 * app/(workspace)/layout.tsx에서 한 번 감싸며, hooks/use-source-folder-connection이 실제 상태와 정리를 만든다.
 */


import { createContext, useContext, type ReactNode } from "react";
import { useSourceFolderConnection } from "../hooks/use-source-folder-connection";

// TEMPORARY(local-folder-dev): 로그인 전 localhost 검증용 소유자다.
// 실제 인증 세션의 사용자/workspace로 교체하고 계정 전환·늦은 응답 격리를 검증한다.
// 개발 핸들은 제품 저장소로 자동 이관하지 않는다. 명세 §6/7 참고.
const developmentOwner = { userId: "development-local", workspaceId: "folder-connection-review" };

const SourceFolderContext = createContext<ReturnType<typeof useSourceFolderConnection> | null>(null);

/** 작업 영역의 공통 layout만 소유한다. 페이지 이동으로 연결 수명이 끝나지 않는다. */
export function SourceFolderProvider({ children }: { children: ReactNode }) {
  const connection = useSourceFolderConnection(developmentOwner);
  return <SourceFolderContext.Provider value={connection}>{children}</SourceFolderContext.Provider>;
}

export function useSharedSourceFolderConnection() {
  const connection = useContext(SourceFolderContext);
  if (!connection) {
    throw new Error("SourceFolderProvider is required for the actual folder connection.");
  }
  return connection;
}

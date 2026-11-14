"use client";

/**
 * 설정과 파일 화면이 하나의 폴더 연결을 공유하도록 하는 진입점이다.
 * app/(workspace)/layout.tsx에서 한 번 감싸며, hooks/use-source-folder-connection이 실제 상태와 정리를 만든다.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useSourceFolderConnection } from "./use-source-folder-connection";
import type { ConnectionOwner } from "./types";

const SourceFolderContext = createContext<ReturnType<typeof useSourceFolderConnection> | null>(null);

/** 작업 영역의 공통 layout만 소유한다. 페이지 이동으로 연결 수명이 끝나지 않는다. */

export function SourceFolderProvider({ children, owner }: {
  children: ReactNode;
  owner: ConnectionOwner
}) {
  const connection = useSourceFolderConnection(owner);

  return <SourceFolderContext.Provider value={connection}>
    {children}
  </SourceFolderContext.Provider>;
}

export function useSharedSourceFolderConnection() {
  const connection = useContext(SourceFolderContext);

  if (!connection) {
    throw new Error("SourceFolderProvider is required for the actual folder connection.");
  }

  return connection;
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceFolderTree } from "../../../../components/layout/WorkspaceFolderTree";
import { workspaceFolderNodes } from "../../../../components/layout/workspace-folder-nodes";
import { useSharedSourceFolderConnection } from "../../SourceFolderProvider";
import { SourceConnectionControl } from "../../connection/SourceConnectionControl";

export function SourceFolderTree() {
  const pathname = usePathname();
  const { state: connection, listing, navigation, trail } = useSharedSourceFolderConnection();
  const current = useSyncExternalStore(listing.subscribe, listing.getSnapshot, listing.getServerSnapshot);
  const visited = useSyncExternalStore(trail.subscribe, trail.getSnapshot, trail.getServerSnapshot);

  useEffect(() => listing.activate(), [listing]);

  if (connection.view?.status !== "connected") return <SourceConnectionControl />;

  const snapshots = [...visited, ...(current.result ? [current.result] : [])];
  const paths = snapshots.flatMap(snapshot => [snapshot.path, ...snapshot.entries.filter(entry => entry.kind === "directory").map(entry => [...snapshot.path, entry.name])]);
  const path = current.result?.path ?? [];

  return <>
    <WorkspaceFolderTree
      title="연결 폴더"
      nodes={workspaceFolderNodes(connection.view.folderName ?? "내 폴더", paths)}
      currentPath={path}
      onOpen={path => pathname === "/files" ? navigation.openFolder(path) : listing.open(path)}
      disabled={!current.available || current.phase === "loading"}
    />
  </>;
}

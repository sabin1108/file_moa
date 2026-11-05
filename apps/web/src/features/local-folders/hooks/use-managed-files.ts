"use client";
import { useEffect, useState } from "react";
import { useSharedSourceFolderConnection } from "../providers/SourceFolderProvider";
import { ManagedFilesController } from "../store/managed-files-controller";

export function useManagedFiles() {
  const connection = useSharedSourceFolderConnection();
  const [controller] = useState(() => new ManagedFilesController(connection.readManagedDestination,
    connection.openManagedEditor, connection.prepareManaged, connection.executeManaged,
    connection.readManagedArchives, connection.discardManaged));
  useEffect(() => () => controller.dispose(), [controller, connection.recoveryKey]);
  return controller;
}

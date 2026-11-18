"use client";

import { useState, type ComponentProps } from "react";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import { EntryCreationController } from "./entry-creation-controller";
import { EntryCreationForm } from "./EntryCreationForm";

export function NewEntryForm(props: Omit<ComponentProps<typeof EntryCreationForm>, "controller" | "storageNote">) {
  const connection = useSharedSourceFolderConnection();
  const [controller] = useState(() => new EntryCreationController(connection.createEntry));
  return <EntryCreationForm {...props} controller={controller} />;
}

"use client";

import { useState } from "react";
import type { SampleCatalog, SampleSession } from "../../shared/sample-contract";
import type { SampleOrganizationAction } from "../../shared/sample-organization";
import type { SampleAnswerAction } from "../../shared/sample-answer";
import type { AiProvider } from "../../shared/ai-provider";
import { SampleWorkspaceStore } from "./sample-workspace-store";
import { SampleConversation } from "./conversation/SampleConversation";
import { SampleFilesWorkspace } from "./files/SampleFilesWorkspace";

export function SampleWorkspace({ catalog, session, remainingMs, organizeAction, answerAction, view = "chat", aiProvider = "gemini" }: {
  catalog: SampleCatalog;
  session: SampleSession;
  remainingMs: number;
  organizeAction: SampleOrganizationAction;
  answerAction: SampleAnswerAction;
  view?: "chat" | "files";
  aiProvider?: AiProvider | null;
}) {
  const [store] = useState(() => new SampleWorkspaceStore(catalog, session, undefined, remainingMs));
  return view === "files" ? <SampleFilesWorkspace sourceCatalog={catalog} store={store} />
    : <SampleConversation catalog={catalog} store={store} organizeAction={organizeAction} answerAction={answerAction} aiProvider={aiProvider} />;
}

"use client";

import { useState } from "react";
import type { SampleAnswerAction } from "../../shared/sample-answer";
import type { SampleOrganizationAction } from "../../shared/sample-organization";
import type { SampleCatalog, SampleSession } from "../../shared/sample-contract";
import type { AiProvider } from "../../shared/ai-provider";
import { SampleWorkspaceStore } from "./sample-workspace-store";
import { SampleConversation } from "./conversation/SampleConversation";
import { SampleFilesWorkspace } from "./files/SampleFilesWorkspace";
import { streamingSampleAnswer, streamingSampleOrganization } from "./sample-stream";

export function SampleWorkspace({ catalog, session, remainingMs, answerAction, organizeAction, view = "chat", aiProvider = "gemini" }: {
  catalog: SampleCatalog;
  session: SampleSession;
  remainingMs: number;
  answerAction?: SampleAnswerAction;
  organizeAction?: SampleOrganizationAction;
  view?: "chat" | "files";
  aiProvider?: AiProvider | null;
}) {
  const [store] = useState(() => new SampleWorkspaceStore(catalog, session, undefined, remainingMs));
  return view === "files" ? <SampleFilesWorkspace sourceCatalog={catalog} store={store} />
    : <SampleConversation catalog={catalog} store={store} organizeAction={organizeAction ?? streamingSampleOrganization(aiProvider)} answerAction={answerAction ?? streamingSampleAnswer(aiProvider)} aiProvider={aiProvider} />;
}

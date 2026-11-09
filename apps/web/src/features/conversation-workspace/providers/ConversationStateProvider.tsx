"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ConversationStore } from "../store/conversation-store";

const ConversationContext = createContext<ConversationStore | null>(null);

export function ConversationStateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new ConversationStore());
  return <ConversationContext.Provider value={store}>{children}</ConversationContext.Provider>;
}

export function useConversationStore() {
  const store = useContext(ConversationContext);
  if (!store) throw new Error("ConversationStateProvider is required for the workspace conversation.");
  return store;
}

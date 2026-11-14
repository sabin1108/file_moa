"use client";

import { useSyncExternalStore } from "react";
import { parseAuthDraft, serializeAuthDraft, type AuthDraft } from "./draft";
import { authDraftStore } from "./auth-draft";

export function useAuthDraft() {
  const draft = parseAuthDraft(useSyncExternalStore(authDraftStore.subscribe, authDraftStore.read, () => ""));

  function update(field: keyof AuthDraft, value: string) {
    const next = { ...parseAuthDraft(authDraftStore.read()), [field]: value };

    authDraftStore.write(serializeAuthDraft(next));
  }

  function clear() {
    authDraftStore.write(null);
  }

  return { draft, update, clear };
}

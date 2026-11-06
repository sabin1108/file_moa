"use client";

import { useState, useSyncExternalStore } from "react";
import { parseAuthDraft, serializeAuthDraft, type AuthDraft } from "../lib/draft";

const key = "moa-auth-input";
const event = "moa-auth-input-change";
function read() { try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; } }
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener("storage", listener);

  return () => { window.removeEventListener(event, listener); window.removeEventListener("storage", listener); };
}

export function useAuthDraft() {
  const persisted = parseAuthDraft(useSyncExternalStore(subscribe, read, () => ""));
  const [edited, setEdited] = useState<AuthDraft>();
  const draft = edited ?? persisted;

  function update(field: keyof AuthDraft, value: string) {
    const next = { ...draft, [field]: value };
    setEdited(next);

    try {
      sessionStorage.setItem(key, serializeAuthDraft(next));
      window.dispatchEvent(new Event(event));
    } catch { /* A blocked browser store must not prevent form input. */ }
  }

  function clear() {
    setEdited({ name: "", email: "" });
    try { sessionStorage.removeItem(key); window.dispatchEvent(new Event(event)); } catch {}
  }

  return { draft, update, clear };
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { clearSignupDraft, normalizeSignupStage, parseSignupDraft, serializeSignupDraft, signupFieldError, signupInputStages, signupNextStage, SIGNUP_DRAFT_EVENT, SIGNUP_DRAFT_KEY, type SignupDraft, type SignupStage } from "../lib/signup-flow";

const empty: SignupDraft = { name: "", email: "", stage: "name" };
function read() { try { return localStorage.getItem(SIGNUP_DRAFT_KEY) ?? ""; } catch { return ""; } }
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(SIGNUP_DRAFT_EVENT, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(SIGNUP_DRAFT_EVENT, listener); };
}
const noSubscription = () => () => {};

export function useSavedSignupDraft() {
  return parseSignupDraft(useSyncExternalStore(subscribe, read, () => ""));
}

export function useSignupFlow() {
  const search = useSearchParams();
  const restored = useSyncExternalStore(noSubscription, () => true, () => false);
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const [edited, setEdited] = useState<SignupDraft>();
  const [errors, setErrors] = useState<Partial<Record<"name" | "email", string>>>({});
  const draft = edited ?? parseSignupDraft(raw) ?? empty;
  const stage = normalizeSignupStage(search.get("step") ?? draft.stage, draft);
  const current = useRef(stage);
  const focusNext = useRef(false);

  useEffect(() => {
    const reset = () => setEdited(undefined);
    window.addEventListener("storage", reset);
    window.addEventListener(SIGNUP_DRAFT_EVENT, reset);
    return () => { window.removeEventListener("storage", reset); window.removeEventListener(SIGNUP_DRAFT_EVENT, reset); };
  }, []);

  useEffect(() => {
    if (!raw) return;
    const saved = parseSignupDraft(raw);
    const timer = window.setTimeout(clearSignupDraft, saved ? Math.max(0, saved.expiresAt - Date.now()) : 0);
    return () => window.clearTimeout(timer);
  }, [raw]);

  function persist(next: SignupDraft) {
    setEdited(next);
    try { localStorage.setItem(SIGNUP_DRAFT_KEY, serializeSignupDraft(next)); window.dispatchEvent(new Event(SIGNUP_DRAFT_EVENT)); } catch {}
  }

  function goTo(next: SignupStage, focus = true) {
    const valid = normalizeSignupStage(next, draft);
    current.current = valid;
    focusNext.current = focus;
    persist({ ...draft, stage: valid });
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ step: valid }).toString();
    url.hash = "";
    if (url.href !== window.location.href) window.history.pushState(null, "", url.pathname + url.search);
  }

  function advance(expected = stage, focus = true) {
    if (expected !== current.current || expected === "password") return false;
    const message = signupFieldError(expected, draft[expected]);
    setErrors(previous => ({ ...previous, [expected]: message }));
    if (message) return false;
    goTo(signupNextStage(expected, draft), focus);
    return true;
  }

  useEffect(() => {
    current.current = stage;
    if (!restored) return;
    const url = new URL(window.location.href);
    const next = new URLSearchParams({ step: stage }).toString();
    if (url.search !== `?${next}` || url.hash) window.history.replaceState(null, "", url.pathname + `?${next}`);
    if (focusNext.current) {
      focusNext.current = false;
      document.getElementById(`auth-${stage}`)?.focus();
    }
  }, [stage, restored]);

  return {
    draft, stage, errors,
    index: signupInputStages.indexOf(stage),
    update: (field: "name" | "email", value: string) => { persist({ ...draft, stage, [field]: value }); setErrors(previous => ({ ...previous, [field]: undefined })); },
    advance, goTo,
    back: () => goTo(stage === "password" ? "email" : "name"),
    clear: clearSignupDraft,
  };
}

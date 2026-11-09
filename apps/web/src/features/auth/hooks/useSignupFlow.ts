"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeSignupStage, parseSignupDraft, signupFieldError, signupInputStages, signupNextStage, type SignupDraft, type SignupStage } from "../lib/signup-flow";
import { clearSignupDraft, persistSignupDraft, signupDraftStore } from "../store/signup-draft";

const empty: SignupDraft = { name: "", email: "", stage: "email" };
const noSubscription = () => () => {};

export function useSavedSignupDraft() {
  return parseSignupDraft(useSyncExternalStore(signupDraftStore.subscribe, signupDraftStore.read, () => ""));
}

export function useSignupFlow() {
  const search = useSearchParams();
  const restored = useSyncExternalStore(noSubscription, () => true, () => false);
  const raw = useSyncExternalStore(signupDraftStore.subscribe, signupDraftStore.read, () => "");
  const [errors, setErrors] = useState<Partial<Record<"email", string>>>({});
  const draft = parseSignupDraft(raw) ?? empty;
  const stage = normalizeSignupStage(search.get("step") ?? draft.stage, draft);
  const current = useRef(stage);
  const focusNext = useRef(false);

  useEffect(() => {
    if (!raw) return;
    const saved = parseSignupDraft(raw);
    const timer = setTimeout(clearSignupDraft, saved ? Math.max(0, saved.expiresAt - Date.now()) : 0);
    return () => clearTimeout(timer);
  }, [raw]);

  function goTo(next: SignupStage, focus = true) {
    const valid = normalizeSignupStage(next, draft);
    current.current = valid;
    focusNext.current = focus;
    persistSignupDraft({ ...draft, stage: valid });
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
    update: (field: "email", value: string) => { persistSignupDraft({ ...draft, stage, [field]: value }); setErrors(previous => ({ ...previous, [field]: undefined })); },
    advance, goTo,
    back: () => goTo("email"),
    clear: clearSignupDraft,
  };
}

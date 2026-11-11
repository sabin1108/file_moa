import { createSignal } from "./signal";

export const AUTH_SESSION_CHANGED = "moa-auth-session-changed";
export const AUTH_SESSION_STORAGE_KEY = "moa-auth-session-event";
const changed = createSignal<void>();
const revoked = createSignal<void>();
export const subscribeAuthSessionChange = changed.subscribe;
export const subscribeAuthScopeRevoked = revoked.subscribe;
export const revokeAuthScope = revoked.emit;
let source: string | undefined;

export function authSessionSource() {
  source ??= crypto.randomUUID();

  return source;
}

export function announceAuthSessionChange(includeCurrent = true, userId?: string) {
  if (includeCurrent) changed.emit();

  const signal = { type: "changed", source: authSessionSource(), id: crypto.randomUUID(), userId };

  try {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(signal));
  } catch { }

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(AUTH_SESSION_CHANGED);

      try {
        channel.postMessage(signal);
      }
      finally {
        channel.close();
      }
    } catch { /* Same-tab invalidation and storage notification remain available. */ }
  }
}

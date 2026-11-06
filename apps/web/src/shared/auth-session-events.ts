export const AUTH_SESSION_CHANGED = "moa-auth-session-changed";
export const AUTH_SCOPE_REVOKED = "moa-auth-scope-revoked";
export const AUTH_SESSION_STORAGE_KEY = "moa-auth-session-event";
let source: string | undefined;
export function authSessionSource() { source ??= crypto.randomUUID(); return source; }

export function announceAuthSessionChange(includeCurrent = true) {
  if (includeCurrent) window.dispatchEvent(new Event(AUTH_SESSION_CHANGED));
  try { localStorage.setItem(AUTH_SESSION_STORAGE_KEY, crypto.randomUUID()); } catch {}

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(AUTH_SESSION_CHANGED);
    channel.postMessage({ type: "changed", source: authSessionSource() });
    channel.close();
  }
}

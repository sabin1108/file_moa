export type AuthDraft = { name: string; email: string };

export function parseAuthDraft(raw: string): AuthDraft {
  try {
    if (raw.length > 2048) return { name: "", email: "" };
    const value: unknown = JSON.parse(raw);

    if (typeof value === "object" && value !== null && "name" in value && "email" in value
      && typeof value.name === "string" && value.name.length <= 40 && typeof value.email === "string" && value.email.length <= 254) {
      return { name: value.name, email: value.email };
    }
  } catch {}

  return { name: "", email: "" };
}

export function serializeAuthDraft(value: AuthDraft) { return JSON.stringify({ name: value.name.slice(0, 40), email: value.email.slice(0, 254) }); }

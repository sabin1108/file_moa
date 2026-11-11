import { z } from "zod";
import type { AuthDraft } from "./draft";

export const signupInputStages = ["email", "password"] as const;

export type SignupStage = typeof signupInputStages[number];

export type SignupDraft = AuthDraft & { stage: SignupStage };

const lifetime = 86_400_000;
const email = z.string().trim().max(254).pipe(z.email("올바른 이메일 주소를 입력해 주세요."));
const draftSchema = z.object({
  email: z.string().max(254),
  stage: z.enum(["name", ...signupInputStages]),
  expiresAt: z.number().finite()
});

export function signupFieldError(_field: "email", value: string): string | undefined {
  const result = email.safeParse(value);

  return result.success ? undefined : result.error.issues[0]?.message;
}

export function normalizeSignupStage(value: unknown, draft: AuthDraft): SignupStage {
  const candidate = signupInputStages.find(stage => stage === value) ?? "email";

  if (candidate === "password" && signupFieldError("email", draft.email)) return "email";

  return candidate;
}

export function signupNextStage(stage: SignupStage, draft: AuthDraft): SignupStage {
  if (stage === "password") return stage;

  if (signupFieldError(stage, draft[stage])) return stage;

  return normalizeSignupStage("password", draft);
}

export function parseSignupDraft(raw: string, now = Date.now()): (SignupDraft & { expiresAt: number }) | undefined {
  if (raw.length > 2048) return;

  try {
    const value = draftSchema.safeParse(JSON.parse(raw));

    if (!value.success || value.data.expiresAt <= now || value.data.expiresAt > now + lifetime + 60_000) return;

    const draft = { name: "", email: value.data.email };

    return { ...draft, stage: normalizeSignupStage(value.data.stage, draft), expiresAt: value.data.expiresAt };
  } catch {
    return;
  }
}

export function serializeSignupDraft(value: SignupDraft, now = Date.now()) {
  return JSON.stringify({ email: value.email.slice(0, 254), stage: value.stage, expiresAt: now + lifetime });
}

export type AuthOperation = "login" | "signup" | "resend" | "request-reset" | "verify" | "reset" | "signout";
export type AuthFieldName = "name" | "email" | "password" | "passwordConfirm" | "token";
export type AuthFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<AuthFieldName, string>>;
};
export type AuthFormAction = (previous: AuthFormState, data: FormData) => Promise<AuthFormState>;
export type AuthSessionSnapshot = { user: { id: string; emailVerified: boolean }; session: { userId: string; expiresAt: string } } | null;
export type CheckAuthSessionAction = () => Promise<{ available: boolean; session: AuthSessionSnapshot }>;

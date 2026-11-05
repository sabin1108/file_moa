export type RecoveryStage = "select-location" | "check-location" | "request-write" | "create-directory" | "write-identity" | "verify-identity" | "save-connection";
type RecoveryCode = "permission" | "cancelled" | "location" | "changed" | "invalid" | "foreign-owner" | "storage" | "failed";

/** 화면에는 단계와 제한된 코드만 공개한다. 원본 예외의 경로/본문/메시지는 출력하지 않는다. */
export class RecoveryConnectionError extends Error {
  readonly code: RecoveryCode;
  readonly exceptionName: string;
  constructor(readonly stage: RecoveryStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : "recovery-connection-failed", { cause });
    this.name = "RecoveryConnectionError";
    const name = cause instanceof Error ? cause.name : "Error";
    const reason = cause instanceof Error ? cause.message : "";
    this.exceptionName = /^[A-Za-z]{1,48}$/u.test(name) ? name : "Error";
    this.name = this.exceptionName;
    this.code = name === "AbortError" ? "cancelled"
      : name === "NotAllowedError" || name === "SecurityError" ? "permission"
      : reason === "recovery-vault-location" ? "location"
      : reason === "recovery-vault-changed" || reason === "stale-connection-operation" ? "changed"
      : reason === "recovery-vault-foreign-owner" ? "foreign-owner"
      : reason === "recovery-vault-missing" || reason === "recovery-vault-invalid" ? "invalid"
      : stage === "save-connection" ? "storage" : "failed";
  }
}

export async function recoveryStage<T>(stage: RecoveryStage, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof RecoveryConnectionError) throw cause;
    throw new RecoveryConnectionError(stage, cause);
  }
}

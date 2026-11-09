"use client";

import { useActionState } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import type { AuthFormAction, AuthFormState } from "../../../shared/auth-contract";
import styles from "../../../components/layout/auth-shell.module.css";

export function AccountDeletionConfirmation({ token, action }: { token: string; action: AuthFormAction }) {
  const [state, formAction, pending] = useActionState(
    (previous: AuthFormState, data: FormData) => action(previous, data),
    { status: "idle" },
  );
  return <section className={styles.form} aria-labelledby="delete-account-title">
    <h1 id="delete-account-title">계정을 삭제할까요?</h1>
    <p>이 브라우저에서 같은 계정으로 로그인한 상태인지 확인한 뒤 삭제를 진행해 주세요.</p>
    <form action={formAction} aria-busy={pending}>
      <input type="hidden" name="token" value={token} />
      <fieldset disabled={pending} className={styles.fields}>
        <label className={styles.checkbox}><input type="checkbox" name="confirm" required /><span>서버의 계정 정보와 작업 공간이 삭제된다는 점을 확인했습니다.</span></label>
        <button type="submit" className={actionClasses("primary")}>계정 삭제</button>
      </fieldset>
    </form>
    {state.message && <StatusNotice state="error" title={state.message} role="alert" />}
  </section>;
}

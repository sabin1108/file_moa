"use client";

import { useActionState } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import type { AuthFormAction, AuthFormState, WorkspaceConnection } from "../../../shared/auth-contract";
import styles from "./account-login-settings.module.css";

export function AccountDeletionSettings({ connection, action }: {
  connection: WorkspaceConnection | null;
  action: AuthFormAction
}) {
  const [state, formAction, pending] = useActionState(
    (previous: AuthFormState, data: FormData) => action(previous, data),
    { status: "idle" },
  );
  const blocked = connection !== null;

  return <section className={styles.connection} aria-labelledby="account-deletion-title">
    <h3 id="account-deletion-title">계정 삭제</h3>
    <p>계정을 삭제하면 서버의 계정 정보와 작업 공간이 삭제됩니다. 이 브라우저에만 저장한 원본 폴더 연결과 원본 파일은 삭제되지 않습니다.</p>
    {blocked
      ? <StatusNotice
        state="attention"
        title="연결된 계정은 먼저 연결을 해제해야 삭제할 수 있습니다."
        detail="연결 해제는 두 계정에서 작업 공간 접근을 분리하고 모든 기기에서 로그아웃합니다."
      />
      : <form action={formAction} aria-busy={pending}>
        <fieldset disabled={pending} className={styles.connectionFields}>
          <label className={styles.confirm}>
            <input type="checkbox" name="confirm" required />
            <span>서버의 계정 정보와 작업 공간이 삭제되며, 원본 폴더와 원본 파일은 이 브라우저에 남는다는 점을 확인했습니다.</span>
          </label>
          <button type="submit" className={actionClasses("secondary")}>계정 삭제 확인 메일 보내기</button>
        </fieldset>
      </form>}
    {state.message && <StatusNotice
      state={state.status === "error" ? "error" : "success"}
      title={state.message}
      role={state.status === "error" ? "alert" : "status"}
    />}
  </section>;
}

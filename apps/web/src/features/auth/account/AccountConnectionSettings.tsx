"use client";

import { useActionState, useState } from "react";
import { AuthInput } from "../form/AuthInput";
import { authForms } from "../form/form-config";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { PageLoading } from "../../../components/ui/feedback/PageLoading";
import { announceAuthSessionChange } from "../../../shared/auth-session-events";
import type { AuthFormAction, AuthFormState, WorkspaceConnection } from "../../../shared/auth-contract";
import styles from "./account-login-settings.module.css";

export function AccountConnectionSettings({ connection, canConnect, connectAction, selectAction, disconnectAction }: {
  connection: WorkspaceConnection | null;
  canConnect: boolean;
  connectAction: AuthFormAction;
  selectAction: AuthFormAction;
  disconnectAction: AuthFormAction;
}) {
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState(async (previous: AuthFormState, data: FormData) => {
    try {
      const operation = data.get("operation") === "disconnect" ? disconnectAction : connection ? selectAction : connectAction;
      const result = await operation(previous, data);

      if (result.status === "success") announceAuthSessionChange(false);

      return result;
    } catch (error) {
      announceAuthSessionChange(false);

      throw error;
    }
  }, { status: "idle" });

  if (!connection && !canConnect) return null;

  return <section className={styles.connection} aria-labelledby="connection-title">
    <h3 id="connection-title">
      {connection ? "연결된 계정과 작업 공간" : "기존 이메일 계정 연결"}
    </h3>
    <p>
      {connection
        ? "두 계정의 작업 공간을 모두 유지합니다. 기본으로 열 작업 공간을 선택하세요."
        : "이미 이메일로 가입했다면 두 계정을 연결할 수 있습니다. 양쪽의 원본 폴더와 작업 기록은 그대로 유지됩니다."}
    </p>
    <form action={action} aria-label="기존 계정과 작업 공간 연결" aria-busy={pending}>
      <fieldset disabled={pending} className={styles.connectionFields}>
        {!connection
          && authForms.login.fields.map(field => <AuthInput
            key={field.name}
            field={field}
            value={field.name === "email" ? email : undefined}
            onChange={field.name === "email" ? event => setEmail(event.target.value) : undefined}
          />)}
        <fieldset className={styles.workspaceChoices}>
          <legend>기본으로 열 작업 공간</legend>
          {connection
            ? connection.members.map(member => <label key={member.ownerUserId}>
              <input
                type="radio"
                name="ownerUserId"
                value={member.ownerUserId}
                defaultChecked={member.ownerUserId === connection.primaryOwnerUserId}
                required
              />
              <span>
                <strong>
                  {member.name}
                </strong>
                <span>
                  {member.email}
                </span>
              </span>
            </label>)
            : <>
              <label>
                <input type="radio" name="primary" value="current" defaultChecked />
                <span>지금 소셜 계정의 작업 공간</span>
              </label>
              <label>
                <input type="radio" name="primary" value="existing" />
                <span>기존 이메일 계정의 작업 공간</span>
              </label>
            </>}
        </fieldset>
        <p className={styles.help}>폴더와 기록은 합치거나 옮기지 않습니다. 같은 브라우저에서는 각 작업 공간의 연결 정보를 다시 사용하며, 다른 기기에서는 폴더를 다시 연결해야 합니다.</p>
        <p className={styles.help}>보안을 위해 저장하면 두 계정의 모든 기기에서 로그아웃됩니다. 이후 어느 계정으로 로그인해도 선택한 작업 공간을 엽니다.</p>
        {!connection && <label className={styles.confirm}>
          <input type="checkbox" name="confirm" required />
          <span>두 계정에서 양쪽 작업 공간에 접근할 수 있음을 확인했습니다.</span>
        </label>}
        <button type="submit" className={actionClasses("primary")} disabled={pending}>
          {connection ? "작업 공간 선택 저장" : "계정 연결하고 다시 로그인"}
        </button>
      </fieldset>
      {pending && <PageLoading compact message="계정과 작업 공간을 확인하고 있어요." />}
      {state.message && <StatusNotice state="error" title={state.message} role="alert" />}
    </form>
    {connection && <form action={action} className={styles.disconnect} aria-label="기존 계정 연결 해제">
      <input type="hidden" name="operation" value="disconnect" />
      <fieldset disabled={pending} className={styles.connectionFields}>
        <label className={styles.confirm}>
          <input type="checkbox" name="confirm" required />
          <span>각 계정이 자기 작업 공간만 열도록 연결을 해제합니다. 두 계정의 폴더와 기록은 유지되고 모든 기기에서 로그아웃됩니다.</span>
        </label>
        <button type="submit" className={actionClasses("secondary")} disabled={pending}>두 계정 연결 해제</button>
      </fieldset>
    </form>}
  </section>;
}

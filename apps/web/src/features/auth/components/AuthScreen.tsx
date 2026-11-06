"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionLink } from "../../../components/ui/ActionLink";
import { actionClasses } from "../../../components/ui/action-classes";
import { WorkflowStepper } from "../../../components/ui/WorkflowStepper";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { useAuthDraft } from "../hooks/useAuthDraft";
import { authForms, authProgress } from "../lib/form-config";
import type { AuthFormAction, AuthFormState, AuthOperation } from "../../../shared/auth-contract";
import styles from "../../../components/layout/auth-shell.module.css";

const initialState: AuthFormState = { status: "idle" };

export function AuthScreen({ operation, action: submitAction, initialToken = "", account }: {
  operation: AuthOperation; action: AuthFormAction; initialToken?: string; account?: { name: string; email: string };
}) {
  const router = useRouter();
  const { draft, update, clear } = useAuthDraft();
  const [secretToken, setSecretToken] = useState(initialToken);
  const [state, formAction, pending] = useActionState(async (previous: AuthFormState, data: FormData) => {
    const result = await submitAction(previous, data);
    if (result.status === "success") setSecretToken("");

    return result;
  }, initialState);
  const config = authForms[operation];
  const success = state.status === "success";
  const progress = authProgress(operation, success);
  const privateLink = operation === "verify" || operation === "reset";
  const missingLink = privateLink && !secretToken && !success;

  useEffect(() => {
    if (!privateLink) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [privateLink]);

  useEffect(() => {
    if (operation === "signup" && success) router.push("/welcome?step=verification", { scroll: false });
  }, [operation, success, router]);

  return <section className={styles.form} aria-labelledby="auth-title">
    <h1 id="auth-title">{config.title}</h1>
    <p>{config.description}</p>
    {progress && <WorkflowStepper {...progress} />}
    {account && <>
      <dl className={styles.account}><dt>표시 이름</dt><dd>{account.name}</dd><dt>이메일</dt><dd>{account.email}</dd></dl>
      <p className={styles.help}>계정별 폴더 연결은 준비 중입니다.</p>
    </>}
    {state.message && <StatusNotice state={state.status === "error" ? "error" : "success"} title={state.message} role={state.status === "error" ? "alert" : "status"} />}
    {missingLink ? <>
      <StatusNotice state="attention" title="메일의 링크를 다시 열어 주세요." detail="링크를 연 뒤 새로고침하면 확인 정보가 지워집니다. 새 메일을 요청할 수도 있어요." />
      <ActionLink href={operation === "reset" ? "/forgot-password" : "/welcome?step=verification"} variant="primary">새 메일 요청하기</ActionLink>
    </> : privateLink && success ? <ActionLink href="/login" variant="primary">로그인하기</ActionLink> : <form action={formAction} className={styles.fields} aria-busy={pending} onSubmit={() => { if (operation === "signout") clear(); }}
      onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}>
      {privateLink && <input type="hidden" name="token" value={secretToken} />}
      <fieldset disabled={pending} className={styles.fields}>
        {config.fields.map(field => {
          const error = state.fieldErrors?.[field.name];
          const draftField = field.name === "email" || field.name === "name" ? field.name : undefined;

          return <label key={field.name} className={styles.field} htmlFor={`auth-${field.name}`}>
            {field.label}
            <input id={`auth-${field.name}`} name={field.name} type={field.type} required autoComplete={field.autoComplete}
              minLength={field.minLength} maxLength={field.maxLength} aria-invalid={error ? true : undefined} aria-describedby={error ? `error-${field.name}` : undefined}
              {...draftField ? { value: draft[draftField], onChange: (event: React.ChangeEvent<HTMLInputElement>) => update(draftField, event.target.value) } : {}} />
            {error && <span id={`error-${field.name}`} className={styles.fieldError}>{error}</span>}
          </label>;
        })}
        <button type="submit" className={actionClasses("primary", styles.submit)} disabled={pending}>{pending ? "처리 중…" : config.submit}</button>
      </fieldset>
    </form>}
    {operation === "signup" && <p className={styles.help}>이메일 확인 후 로그인합니다. 폴더 연결만으로 자료가 전송되지 않아요.</p>}
    {operation !== "signout" && <nav className={styles.links} aria-label="계정 메뉴">
      {operation === "login" ? <><ActionLink href="/welcome">계정 만들기</ActionLink><ActionLink href="/forgot-password">비밀번호 찾기</ActionLink></> : <ActionLink href="/login">로그인으로</ActionLink>}
      {operation === "resend" && <ActionLink href="/welcome">가입 정보 입력으로</ActionLink>}
    </nav>}
  </section>;
}

"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ActionLink } from "../../../components/ui/ActionLink";
import { actionClasses } from "../../../components/ui/action-classes";
import { WorkflowStepper } from "../../../components/ui/WorkflowStepper";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import type { AuthFormAction, AuthFormState } from "../../../shared/auth-contract";
import { useSignupFlow } from "../hooks/useSignupFlow";
import { useAuthDraft } from "../hooks/useAuthDraft";
import { authForms, authProgress } from "../lib/form-config";
import { AuthInput } from "./AuthInput";
import styles from "../../../components/layout/auth-shell.module.css";

export function SignupScreen({ action }: { action: AuthFormAction }) {
  const flow = useSignupFlow();
  const router = useRouter();
  const { update } = useAuthDraft();
  const composing = useRef(false);
  const pointerStage = useRef(flow.stage);
  const [state, formAction, pending] = useActionState(async (previous: AuthFormState, data: FormData) => {
    const result = await action(previous, data);
    if (result.status === "success") {
      update("email", flow.draft.email);
      router.push("/welcome?step=verification", { scroll: false });
    } else if (result.fieldErrors?.name) flow.goTo("name");
    else if (result.fieldErrors?.email) flow.goTo("email");
    return result;
  }, { status: "idle" });
  const success = state.status === "success";
  const progress = authProgress(success ? "resend" : "signup", false, flow.stage)!;
  const fields = authForms.signup.fields.filter(field => field.name === "name" || flow.index >= (field.name === "email" ? 1 : 2));

  return <section className={`${styles.form} ${styles.signupForm}`} aria-labelledby="auth-title">
    <h1 id="auth-title">모아 계정 만들기</h1>
    <p>이름부터 차례로 작성하세요. 입력한 내용은 한 장에 이어집니다.</p>
    <WorkflowStepper {...progress} />
    {state.message && <StatusNotice state={success ? "success" : "error"} title={state.message} role={success ? "status" : "alert"} />}
    {success ? <ActionLink href="/welcome?step=verification" variant="primary">이메일 확인 안내로</ActionLink> : <form data-auth-form action={formAction} className={styles.fields} aria-busy={pending}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onSubmit={event => { if (flow.stage !== "password" || composing.current) { event.preventDefault(); if (!composing.current) flow.advance(); } }}>
      <fieldset className={styles.fields} disabled={pending}>
        {fields.map(field => {
          const identity = field.name === "name" || field.name === "email" ? field.name : undefined;
          return <div key={field.name} className={field.name === "name" ? undefined : styles.revealedField}><div><AuthInput field={field} error={identity ? flow.errors[identity] ?? state.fieldErrors?.[identity] : state.fieldErrors?.[field.name]}
            value={identity ? flow.draft[identity] : undefined} onChange={identity ? event => flow.update(identity, event.target.value) : undefined}
            onBlur={identity ? event => {
              if (composing.current || event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-signup-control], [data-signup-back]")) return;
              if (flow.stage === identity) flow.advance(identity, false);
            } : undefined}
            onKeyDown={event => {
              if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === "Enter") event.preventDefault(); return; }
              if (event.key === "Tab" && !event.shiftKey && identity && flow.stage === identity) {
                if (flow.advance(identity)) event.preventDefault();
                return;
              }
              if (event.key !== "Enter") return;
              if (identity) { event.preventDefault(); flow.advance(identity); }
            }} /></div></div>;
        })}
        {flow.stage === "password" ? <button type="submit" className={actionClasses("primary", styles.submit)}>{pending ? "처리 중…" : "가입하고 인증 메일 받기"}</button>
          : <button type="button" data-signup-control className={actionClasses("primary", styles.submit)} onPointerDown={() => { pointerStage.current = flow.stage; }} onClick={event => flow.advance(event.detail ? pointerStage.current : flow.stage)}>다음</button>}
        {flow.index > 0 && <button type="button" data-signup-back className={actionClasses("secondary")} onClick={flow.back}>이전 단계</button>}
      </fieldset>
    </form>}
    <p className={styles.help}>이름·이메일·단계는 이 브라우저에 하루 동안 보관합니다. 비밀번호는 저장하지 않아요.</p>
    <nav className={styles.links} aria-label="계정 메뉴"><ActionLink href="/login">로그인으로</ActionLink></nav>
  </section>;
}

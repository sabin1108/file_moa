"use client";

import { useActionState, useEffect, useState } from "react";
import { ActionLink } from "../../../components/ui/ActionLink";
import { actionClasses } from "../../../components/ui/action-classes";
import { PaperStepper } from "../../../components/ui/PaperStepper";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { useAuthDraft } from "./useAuthDraft";
import { authForms, authProgress } from "./form-config";
import type { AuthFormAction, AuthFormState, AuthOperation } from "../../../shared/auth-contract";
import styles from "../../../components/layout/auth-shell.module.css";
import { announceAuthSessionChange } from "../../../shared/auth-session-events";
import { SignupScreen } from "../signup/SignupScreen";
import { AuthInput } from "./AuthInput";
import { clearSignupDraft } from "../signup/signup-draft";
import { SocialProviders } from "../social/SocialProviders";
import type { SocialProvider } from "../../../shared/social-auth";
import { PageLoading } from "../../../components/ui/feedback/PageLoading";

const initialState: AuthFormState = { status: "idle" };

type AuthScreenProps = {
  operation: AuthOperation;
  action: AuthFormAction;
  initialToken?: string;
  account?: {
    name: string;
    email: string
  };
  providers?: readonly SocialProvider[];
  socialAction?: AuthFormAction;
  notice?: string;
};

export function AuthScreen(props: AuthScreenProps) {
  return props.operation === "signup"
    ? <SignupScreen action={props.action} providers={props.providers} socialAction={props.socialAction} />
    : <AuthFormScreen {...props} />;
}

function AuthFormScreen({ operation, action: submitAction, initialToken = "", account, providers, socialAction, notice }: AuthScreenProps) {
  const { draft, update, clear } = useAuthDraft();
  const [secretToken, setSecretToken] = useState(initialToken);
  const [profileName, setProfileName] = useState("");
  const [state, formAction, pending] = useActionState(async (previous: AuthFormState, data: FormData) => {
    const changesSession = operation === "login" || operation === "signout";

    if (changesSession) {
      if (operation === "signout") clearSignupDraft();

      announceAuthSessionChange();
    }

    try {
      const result = await submitAction(previous, data);

      if (result.status === "success") setSecretToken("");

      return result;
    } finally {
      if (changesSession) announceAuthSessionChange();
    }
  }, initialState);
  const config = authForms[operation];
  const success = state.status === "success";
  const progress = authProgress(operation, success);
  const privateLink = operation === "verify" || operation === "reset";
  const missingLink = privateLink && !secretToken && !success;

  useEffect(() => {
    if (operation === "resend") clearSignupDraft();
  }, [operation]);

  useEffect(() => {
    if (!privateLink) return;

    const url = new URL(window.location.href);

    if (!url.searchParams.has("token")) return;

    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [privateLink]);

  return (
    <section className={styles.form} aria-labelledby="auth-title">
      <h1 id="auth-title">
        {config.title}
      </h1>
      <p>
        {config.description}
      </p>
      {notice && <StatusNotice state="attention" title={notice} role="status" />}
      {operation === "login" && socialAction && !!providers?.length
        && (
          <>
            <SocialProviders providers={providers} action={socialAction} />
            <div className={styles.divider}>
              <span>또는 이메일로 로그인</span>
            </div>
          </>
        )}
      {progress && <PaperStepper {...progress} />}
      {account
        && (
          <>
            <dl className={styles.account}>
              <dt>표시 이름</dt>
              <dd>
                {account.name}
              </dd>
              <dt>이메일</dt>
              <dd>
                {account.email}
              </dd>
            </dl>
            <ActionLink href="/">작업 공간으로</ActionLink>
          </>
        )}
      {state.message
        && (
          <StatusNotice
            state={state.status === "error" ? "error" : "success"}
            title={state.message}
            role={state.status === "error" ? "alert" : "status"}
          />
        )}
      {missingLink
        ? (
          <>
            <StatusNotice
              state="attention"
              title="메일의 링크를 다시 열어 주세요."
              detail="링크를 연 뒤 새로고침하면 확인 정보가 지워집니다. 새 메일을 요청할 수도 있어요."
            />
            <ActionLink
              href={operation === "reset" ? "/forgot-password" : "/welcome?step=verification"}
              variant="primary"
            >
              새 메일 요청하기
            </ActionLink>
          </>
        )
        : privateLink && success
          ? (
            <ActionLink href="/login" variant="primary">
              로그인하기
            </ActionLink>
          )
          : (
            <form
              data-auth-form
              action={formAction}
              className={styles.fields}
              aria-busy={pending}
              onSubmit={() => {
                if (operation === "signout") clear();
              }}
              onKeyDown={event => {
                if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
              }}
            >
              {privateLink && <input type="hidden" name="token" value={secretToken} />}
              <fieldset disabled={pending} className={styles.fields}>
                {config.fields.map(field => {
                  const error = state.fieldErrors?.[field.name];
                  const draftField =
                    operation !== "profile" && (field.name === "email" || field.name === "name")
                      ? field.name
                      : undefined;

                  return (
                    <AuthInput
                      key={field.name}
                      field={field}
                      error={error}
                      value={
                        operation === "profile"
                          ? profileName
                          : draftField
                            ? draft[draftField]
                            : undefined
                      }
                      onChange={
                        operation === "profile"
                          ? event => setProfileName(event.target.value)
                          : draftField
                            ? event => update(draftField, event.target.value)
                            : undefined
                      }
                    />
                  );
                })}
                <button
                  type="submit"
                  className={actionClasses("primary", styles.submit)}
                  disabled={pending}
                >
                  {pending ? "처리 중…" : config.submit}
                </button>
              </fieldset>
            </form>
          )}
      {pending
        && (
          <PageLoading
            compact
            message={
              operation === "login"
                ? "로그인하고 작업 공간으로 이동하고 있어요."
                : "요청을 처리하고 있어요."
            }
          />
        )}
      {operation === "resend" && socialAction && !!providers?.length
        && (
          <section className={styles.socialSection} aria-label="소셜 계정으로 계속하기">
            <p>소셜 계정으로 계속하기</p>
            <SocialProviders providers={providers} action={socialAction} />
          </section>
        )}
      {operation === "profile" && <p className={styles.help}>실명 대신 별명을 사용해도 됩니다.</p>}
      {operation !== "signout" && operation !== "profile"
        && (
          <nav className={styles.links} aria-label="계정 메뉴">
            {operation === "login"
              ? (
                <>
                  <ActionLink href="/welcome">계정 만들기</ActionLink>
                  <ActionLink href="/forgot-password">비밀번호 찾기</ActionLink>
                </>
              )
              : (
                <ActionLink href="/login">로그인으로</ActionLink>
              )}
          </nav>
        )}
      {operation === "resend"
        && (
          <p className={styles.help}>
            재발송 버튼은 메일을 다시 요청합니다. 받은 메일의 인증 링크를 눌러야 다음 단계로
            넘어갑니다. 처음 가입하지 않았거나 주소가 다르면 메일이 오지 않으니 가입 정보를 확인해
            주세요.
          </p>
        )}
    </section>
  );
}

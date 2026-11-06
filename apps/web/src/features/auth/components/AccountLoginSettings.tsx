"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { SettingRow } from "../../../components/ui/SettingRow";
import { ActionLink } from "../../../components/ui/ActionLink";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import type { AccountLoginSettings as AccountSettings, AuthFormAction, AuthFormState } from "../../../shared/auth-contract";
import { socialLabels, type SocialProvider } from "../../../shared/social-auth";
import styles from "./account-login-settings.module.css";

export function AccountLoginSettings({ account, action, notice }: { account: AccountSettings; action: AuthFormAction; notice?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async (previous: AuthFormState, data: FormData) => {
    const result = await action(previous, data);
    if (result.status === "success") router.refresh();
    return result;
  }, { status: "idle" });
  const connected = account.providers.filter(provider => provider.connected).length;
  const usableConnected = account.providers.filter(provider => provider.connected && provider.available).length;
  const canUnlink = (id: SocialProvider) => account.hasPassword || account.providers.some(provider => provider.id !== id && provider.connected && provider.available);

  return <section aria-label="계정과 로그인 수단" className={styles.account}>
    <header className={styles.identity}><div><strong>{account.name}</strong><p>{account.email}</p></div><ActionLink href="/account">계정 및 로그아웃</ActionLink></header>
    <SettingRow title="이메일·비밀번호" description={account.hasPassword ? "가입한 이메일과 비밀번호로 로그인할 수 있습니다." : "소셜 계정으로 가입했습니다. 별도 비밀번호는 필요하지 않습니다."}><span>{account.hasPassword ? "사용 중" : "사용하지 않음"}</span></SettingRow>
    {notice && <StatusNotice state="attention" title={notice} />}
    {state.message && <StatusNotice state={state.status === "error" ? "error" : "success"} title={state.message} role={state.status === "error" ? "alert" : "status"} />}
    <div role="group" aria-label="소셜 로그인 연결 관리" aria-busy={pending}>
      {account.providers.map(provider => <form key={provider.id} action={formAction}>
        <input type="hidden" name="provider" value={provider.id} /><input type="hidden" name="operation" value={provider.connected ? "unlink" : "link"} />
        <SettingRow title={socialLabels[provider.id]} description={provider.connected ? "이 소셜 계정으로 로그인할 수 있습니다." : "연결하면 이 소셜 계정으로도 로그인할 수 있습니다."}>
        <div className={styles.method}><span>{provider.connected ? "연결됨" : provider.available ? "미연결" : "연결 준비 중"}</span>
          <button type="submit" className={actionClasses("secondary")} disabled={pending || !provider.available && !provider.connected || provider.connected && !canUnlink(provider.id)}
            aria-label={`${socialLabels[provider.id]} ${provider.connected ? "연결 해제" : "연결"}`}>{provider.connected ? "연결 해제" : "연결"}</button>
        </div>
      </SettingRow></form>)}
    </div>
    {!account.hasPassword && usableConnected < 2 && connected > 0 && <p className={styles.help}>마지막으로 사용할 수 있는 로그인 수단은 해제할 수 없습니다. 다른 소셜 계정을 먼저 연결해 주세요.</p>}
    <p className={styles.help}>로그인 수단은 현재 로그인한 계정에서 관리합니다. 다른 모아 계정과 자동으로 연결되지 않습니다.</p>
  </section>;
}

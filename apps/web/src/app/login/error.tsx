"use client";

import { AuthShell } from "../../components/layout/AuthShell";
import { ActionLink } from "../../components/ui/ActionLink";
import { actionClasses } from "../../components/ui/action-classes";
import { StatusNotice } from "../../components/ui/feedback/StatusNotice";

export default function LoginError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AuthShell guest>
    <section data-login-unavailable>
      <h1>로그인 연결을 확인해 주세요</h1>
      <StatusNotice state="error" role="alert" title="로그인 상태를 확인하지 못했어요."
        detail="인증 확인을 완료하지 못해 로그인을 진행할 수 없습니다. 잠시 후 다시 시도하거나 데모로 돌아가세요."
        action={<button type="button" className={actionClasses("secondary")} onClick={reset}>다시 시도</button>} />
      <ActionLink href="/demo" variant="secondary">데모로 돌아가기</ActionLink>
    </section>
  </AuthShell>;
}

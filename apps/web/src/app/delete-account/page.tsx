import { AuthShell } from "../../components/layout/AuthShell";
import { AccountDeletionConfirmation } from "../../features/auth/account/AccountDeletionConfirmation";
import { finishAccountDeletionAction } from "../actions/auth";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const token = (await searchParams).token;
  const validToken = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

  return <AuthShell>
    {validToken
      ? <AccountDeletionConfirmation token={token} action={finishAccountDeletionAction} />
      : <section>
        <h1>삭제 확인 링크가 올바르지 않습니다.</h1>
        <p>계정 설정에서 삭제 확인 메일을 다시 요청해 주세요.</p>
      </section>}
  </AuthShell>;
}

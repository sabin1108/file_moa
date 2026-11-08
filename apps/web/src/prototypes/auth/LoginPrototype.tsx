import { ActionLink } from "../../components/ui/ActionLink";
import { AuthShell } from "../../components/layout/AuthShell";
import styles from "../../components/layout/auth-shell.module.css";

export function LoginPrototype() {
  return (
    <AuthShell preview>
      <div className={styles.form}>
        <h1>모아 시작하기</h1>
        <p>
          사용하던 계정으로 로그인하세요.
          <br />
          처음이라면 가입 안내로 이어집니다.
        </p>
        <div className={styles.providers}>
          {["Google", "Kakao", "Naver"].map(provider => (
            <ActionLink key={provider} href="/preview/screens/welcome" variant="secondary">
              {provider}로 계속하기
            </ActionLink>
          ))}
        </div>
        <div className={styles.footnote}>
          <p>폴더 연결은 로그인 후 선택할 수 있어요.</p>
          <ActionLink href="/preview/login-error">로그인 오류 화면 보기</ActionLink>
        </div>
      </div>
    </AuthShell>
  );
}

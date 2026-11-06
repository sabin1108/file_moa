/**
 * 설정 분류와 서버에서 조회한 계정 정보를 조합한다. 폴더/편집 설정은 기존 기능 컴포넌트를 공유한다.
 */
import { SourceFolderSettings } from "../../../features/local-folders/components/connection/SourceFolderSettings";
import { EditorSettings } from "../../../features/local-folders/components/connection/EditorSettings";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import ui from "../../../styles/workspace-ui.module.css";
import styles from "../../../styles/workspace-layout.module.css";
import Link from "next/link";
import { headers } from "next/headers";
import { readAccountLoginSettings } from "../../../server/auth-account";
import { socialErrorMessage } from "../../../server/auth-social";
import { socialAccountAction } from "../../actions/auth";
import { AccountLoginSettings } from "../../../features/auth/components/AccountLoginSettings";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = params.tab === "folders" || params.tab === "editor" ? params.tab : "account";
  const account = tab === "account" ? await readAccountLoginSettings(await headers()) : null;
  return (
    <WorkspaceShell title="설정" active="settings">
      <div className={`${ui.canvas} ${styles.settingsCanvas}`}>
        <nav className={styles.settingsTabs} aria-label="설정 분류">
          <Link href="/settings?tab=account" aria-current={tab === "account" ? "page" : undefined}>계정과 로그인</Link>
          <Link href="/settings?tab=folders" aria-current={tab === "folders" ? "page" : undefined}>폴더 연결</Link>
          <Link href="/settings?tab=editor" aria-current={tab === "editor" ? "page" : undefined}>문서 편집</Link>
        </nav>
        <div className={styles.settingsSection}>
          <header className={styles.settingsHeader}>
            <h2>{tab === "account" ? "계정과 로그인" : tab === "folders" ? "자료 폴더와 복구 보관함" : "문서 편집"}</h2>
            <p>{tab === "account" ? "내 계정과 연결된 로그인 수단을 관리합니다." : tab === "folders" ? "이 기기에 저장된 폴더 연결입니다. 연결을 해제해도 원본 파일은 유지됩니다." : "이 브라우저에서 문서를 편집하고 저장하는 방식을 정합니다."}</p>
          </header>
          <div className={styles.settingsPanel}>
            {account && <AccountLoginSettings account={account} action={socialAccountAction} notice={socialErrorMessage(params.error)} />}
            {tab === "folders" && <SourceFolderSettings />}
            {tab === "editor" && <EditorSettings />}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

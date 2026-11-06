/**
 * 설정 분류와 서버에서 조회한 계정 정보를 조합한다. 폴더/편집 설정은 기존 기능 컴포넌트를 공유한다.
 */
import { SourceFolderSettings } from "../../../features/local-folders/components/connection/SourceFolderSettings";
import { EditorSettings } from "../../../features/local-folders/components/connection/EditorSettings";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import ui from "../../../styles/workspace-ui.module.css";
import styles from "../../../styles/workspace-layout.module.css";
import { SettingsTabs } from "../../../components/layout/SettingsTabs";
import { headers } from "next/headers";
import { readAccountLoginSettings } from "../../../server/auth-account";
import { socialErrorMessage } from "../../../server/auth-social";
import { socialAccountAction, connectExistingAccountAction, selectConnectedWorkspaceAction, disconnectAccountConnectionAction } from "../../actions/auth";
import { AccountLoginSettings } from "../../../features/auth/components/AccountLoginSettings";
import { AccountConnectionSettings } from "../../../features/auth/components/AccountConnectionSettings";
import { readWorkspaceConnection } from "../../../server/auth-account-connection";
import { requireAccountSession } from "../../../server/session-guards";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccountSession();
  const params = await searchParams;
  const tab = params.tab === "folders" || params.tab === "editor" ? params.tab : "account";
  const account = tab === "account" ? await readAccountLoginSettings(await headers()) : null;
  const connection = tab === "account" ? await readWorkspaceConnection(await headers()) : null;
  return (
    <WorkspaceShell title="설정" active="settings">
      <div className={`${ui.canvas} ${styles.settingsCanvas}`}>
        <SettingsTabs current={tab} />
        <div key={tab} className={styles.settingsSection}>
          <header className={styles.settingsHeader}>
            <h2>{tab === "account" ? "계정과 로그인" : tab === "folders" ? "자료 폴더와 복구 보관함" : "문서 편집"}</h2>
            <p>{tab === "account" ? "내 계정과 연결된 로그인 수단을 관리합니다." : tab === "folders" ? "이 기기에 저장된 폴더 연결입니다. 연결을 해제해도 원본 파일은 유지됩니다." : "이 브라우저에서 문서를 편집하고 저장하는 방식을 정합니다."}</p>
          </header>
          <div className={styles.settingsPanel}>
            {account && <AccountLoginSettings account={account} action={socialAccountAction} notice={socialErrorMessage(params.error)} />}
            {account && <AccountConnectionSettings connection={connection} canConnect={!account.hasPassword && account.providers.some(provider => provider.connected)} connectAction={connectExistingAccountAction} selectAction={selectConnectedWorkspaceAction} disconnectAction={disconnectAccountConnectionAction} />}
            {tab === "folders" && <SourceFolderSettings />}
            {tab === "editor" && <EditorSettings />}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

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
import { readSettingsDisplay } from "../../../server/settings-display";
import { socialErrorMessage } from "../../../server/auth-social";
import { accountDeletionAction, socialAccountAction, connectExistingAccountAction, selectConnectedWorkspaceAction, disconnectAccountConnectionAction } from "../../actions/auth";
import { AccountLoginSettings } from "../../../features/auth/components/AccountLoginSettings";
import { AccountConnectionSettings } from "../../../features/auth/components/AccountConnectionSettings";
import { AccountDeletionSettings } from "../../../features/auth/components/AccountDeletionSettings";
import { requireAccountSession } from "../../../server/session-guards";
import { QuickSwitchSettings } from "../../../features/quick-switch/components/QuickSwitchSettings";
import { SourceFolderTree } from "../../../features/local-folders/components/listing/SourceFolderTree";
import { Suspense } from "react";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function Page({ searchParams }: Props) {
  return (
    <WorkspaceShell title="설정" active="settings" folderTree={<SourceFolderTree />}>
      <div className={`${ui.canvas} ${styles.settingsCanvas}`}>
        <SettingsTabs
          panels={{
            account: (
              <Suspense fallback={<p role="status">계정 정보를 불러오고 있어요.</p>}>
                <AccountSettings searchParams={searchParams} />
              </Suspense>
            ),
            folders: <SourceFolderSettings />,
            editor: <EditorSettings />,
            controls: <QuickSwitchSettings />,
          }}
        />
      </div>
    </WorkspaceShell>
  );
}

async function AccountSettings({ searchParams }: Props) {
  await requireAccountSession();
  const params = await searchParams;
  const { account, connection } = await readSettingsDisplay(await headers());
  return <>
    <AccountLoginSettings account={account} action={socialAccountAction} notice={socialErrorMessage(params.error)} />
    <AccountConnectionSettings
      connection={connection}
      canConnect={!account.hasPassword && account.providers.some(provider => provider.connected)}
      connectAction={connectExistingAccountAction}
      selectAction={selectConnectedWorkspaceAction}
      disconnectAction={disconnectAccountConnectionAction}
    />
    <AccountDeletionSettings connection={connection} action={accountDeletionAction} />
  </>;
}

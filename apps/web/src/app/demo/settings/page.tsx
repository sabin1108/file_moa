import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSampleAccess, SAMPLE_COOKIE } from "../../../server/sample-session";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import styles from "../../../styles/workspace-layout.module.css";
import { QuickSwitchSettings } from "../../../features/quick-switch/components/QuickSwitchSettings";
import { SettingsTabs } from "../../../components/layout/SettingsTabs";

export default async function SampleSettingsPage() {
  if (!readSampleAccess((await cookies()).get(SAMPLE_COOKIE)?.value)) redirect("/demo/start");
  return <WorkspaceShell title="설정" active="settings" mode="sample"><div className={styles.settingsBody}><div className={styles.settingsCanvas}>
    <SettingsTabs panels={{
      account: <p>샘플 체험 중입니다. 개인 계정 설정은 정식 사용에서 관리할 수 있어요.</p>,
      folders: <><p>샘플 자료가 연결되어 있어요. 대화와 파일 작업은 이 세션의 가상 자료에만 적용됩니다.</p><a href="/demo">대화로 돌아가기</a></>,
      editor: <p>샘플 문서는 미리보기로 확인할 수 있어요. 실제 문서 편집 설정은 정식 사용에서 관리합니다.</p>,
      controls: <QuickSwitchSettings />,
    }} />
  </div></div></WorkspaceShell>;
}

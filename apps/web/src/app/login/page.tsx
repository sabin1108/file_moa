import { WorkspaceShell } from "../../components/layout/WorkspaceShell";
import { UnavailableFeature } from "../../components/ui/feedback/UnavailableFeature";

export default function Page() {
  return (
    <WorkspaceShell title="로그인">
      <UnavailableFeature title="로그인은 아직 구현되지 않았습니다.">
        소셜 인증이 연결되지 않았습니다. 현재 실제 로그인 계정이나 인증된 세션은 없습니다.
      </UnavailableFeature>
    </WorkspaceShell>
  );
}

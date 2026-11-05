import { WorkspaceShell } from "../../components/layout/WorkspaceShell";
import { UnavailableFeature } from "../../components/ui/feedback/UnavailableFeature";

export default function Page() {
  return (
    <WorkspaceShell title="가입 안내">
      <UnavailableFeature title="계정 생성은 아직 구현되지 않았습니다.">
        로그인과 가입 정보 저장이 연결되지 않았습니다. 이름을 입력하거나 가입 완료를 진행할 수 없습니다.
      </UnavailableFeature>
    </WorkspaceShell>
  );
}

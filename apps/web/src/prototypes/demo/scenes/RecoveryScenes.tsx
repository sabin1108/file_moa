import { ActionLink } from "../../../components/ui/ActionLink";
import { DemoButton } from "../DemoButton";
import type { SceneProps } from "../scene-data";
import styles from "../demo.module.css";
import layout from "../scene-layout.module.css";
import { ImpactComparison, RiskNotice } from "../RiskSummary";

export function RecoveryScenes({ scene, navigate }: SceneProps) {
  if (scene === "empty") return (
    <div className={layout.recovery}>
      <div>
        <h3>내 자료를 연결할 자리</h3>
        <p>
          공부 노트나 작업 자료가 있는 폴더를 연결하면, 폴더 안의 MD·TXT 문서를 여기서 살펴볼 수
          있어요.
        </p>
        <div className={styles.actions}>
          <DemoButton variant="primary" onClick={() => navigate("connect")}>
            폴더 연결
          </DemoButton>
        </div>
      </div>
      <div>
        <h3>대화부터 시작해도 좋아요</h3>
        <p>파일을 연결하지 않아도 생각을 정리하거나 궁금한 것을 물어볼 수 있어요.</p>
        <div className={styles.actions}>
          <ActionLink href="/">자료 없이 대화하기 →</ActionLink>
        </div>
      </div>
    </div>
  );

  const login = scene === "login-error";

  return (
    <div className={styles.stack}>
      <RiskNotice
        label={login ? "로그인 미완료" : "전송 중단"}
        title={login ? "계정 연결을 마치지 못했어요" : "메시지 전송을 마치지 못했어요"}
      >
        {login
          ? "로그인이 취소되었거나 연결이 끊겼을 수 있어요. 로그인 화면에서 사용할 계정을 다시 확인해 주세요."
          : "연결 상태를 확인해 주세요. 입력 중인 내용은 남아 있으니 대화로 돌아가 다시 시도할 수 있어요."}
      </RiskNotice>
      <ImpactComparison
        affected={{
          title: "지금 멈춘 작업",
          items: login
            ? ["선택한 계정으로 로그인 완료", "그 계정의 작업 공간 불러오기"]
            : ["새 메시지 전송", "해당 메시지에 대한 답변 받기"],
        }}
        preserved={{
          title: "그대로 유지되는 내용",
          items: login
            ? ["이미 저장된 계정 자료", "기기의 원본 폴더와 파일"]
            : ["입력창에 작성한 내용", "화면에 열려 있는 대화"],
        }}
      />
      <div className={styles.actions}>
        <ActionLink href="/files">폴더로 돌아가기</ActionLink>
        <ActionLink href={login ? "/login" : "/"} variant="primary">
          다시 시도
        </ActionLink>
      </div>
    </div>
  );
}

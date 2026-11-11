"use client";

import { ActionLink } from "../../../components/ui/ActionLink";
import { Icon } from "../../../components/ui/Icon";
import { DemoButton } from "../DemoButton";
import type { SceneProps } from "../scene-data";
import styles from "../demo.module.css";
import layout from "../scene-layout.module.css";
import { studyGroups, studyFolder } from "../../files/folder-groups";
import { ImpactComparison, RiskNotice } from "../RiskSummary";

function ConnectionFolder() {
  return (
    <section className={layout.tree}>
      <h3>
        <Icon name="folder" size={24} />
        {studyFolder}
      </h3>
      <ul>
        {studyGroups.map(group => (
          <li key={group.name}>
            <span>
              <Icon name="folder" size={16} />
              {group.name}
            </span>
            <small>문서 {group.files.length}개</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ConnectScenes({ scene, navigate, dismiss }: SceneProps) {
  if (scene === "connected") return (
    <div className={layout.decision}>
      <ConnectionFolder />
      <div className={layout.decisionSide}>
        <h3>내 폴더에서 이어서 보기</h3>
        <p>파일을 읽고 정리할 준비가 되었어요. 대화에 사용할 자료는 별도로 선택할 수 있어요.</p>
        <p className={styles.note}>
          지금은 연결 완료 모습만 보여줍니다. 기기 폴더에는 접근하지 않았습니다.
        </p>
        <div className={styles.actions}>
          {dismiss
            ? (
              <DemoButton variant="primary" onClick={dismiss}>
                폴더 화면으로
              </DemoButton>
            )
            : (
              <ActionLink href="/files" variant="primary">
                폴더 화면으로
              </ActionLink>
            )}
        </div>
      </div>
    </div>
  );

  if (scene === "permission") return (
    <div className={styles.stack}>
      <RiskNotice label="읽기 권한 필요" title={`${studyFolder} 폴더를 읽을 수 없어요`}>
        브라우저의 접근 권한이 해제된 상태예요. 같은 폴더를 다시 선택해야 문서를 확인할 수 있어요.
      </RiskNotice>
      <ImpactComparison
        affected={{
          title: "지금 사용할 수 없는 기능",
          items: ["폴더 안의 문서 열기", "파일 목록과 변경 내용 새로 확인"],
        }}
        preserved={{
          title: "영향받지 않는 자료",
          items: ["기기에 있는 원본 폴더와 파일", "기존 대화 기록과 자료 없는 대화"],
        }}
      />
      <div className={layout.ledgerFooter}>
        <p>접근 권한 해제는 원본 파일 삭제를 뜻하지 않아요.</p>
        <div className={styles.actions}>
          <ActionLink href="/">대화로</ActionLink>
          <DemoButton variant="primary" onClick={() => navigate("connect")}>
            폴더 다시 선택
          </DemoButton>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.stack}>
      <RiskNotice label="권한 요청 전 확인" title="선택한 폴더의 읽기 권한을 사용해요">
        하위 폴더의 MD·TXT 문서를 표시합니다. 읽기 허용과 서버 전송 동의는 별개예요.
      </RiskNotice>
      <div className={layout.decision}>
        <ConnectionFolder />
        <div className={layout.decisionSide}>
          <h3>허용되는 범위</h3>
          <p className={styles.note}>하위 폴더 포함 · MD/TXT 문서만 표시</p>
          <p>폴더와 문서 목록을 읽어요. 파일 이동·수정·삭제 권한을 함께 요청하지 않아요.</p>
          <p className={styles.note}>
            실제 제품에서는 기기의 폴더 선택 창이 열립니다. 여기서는 예시 폴더로 다음 화면을
            보여줍니다.
          </p>
          <div className={styles.actions}>
            <DemoButton variant="ghost" onClick={() => navigate("permission")}>
              권한 거부 상황 보기
            </DemoButton>
            <DemoButton variant="primary" onClick={() => navigate("connected")}>
              이 폴더 연결
            </DemoButton>
          </div>
        </div>
      </div>
    </div>
  );
}

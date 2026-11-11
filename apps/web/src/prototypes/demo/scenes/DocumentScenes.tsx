"use client";

import { useId, useState } from "react";
import { ActionLink } from "../../../components/ui/ActionLink";
import { selectedFiles } from "../../files/library-data";
import { DemoButton } from "../DemoButton";
import type { SceneProps } from "../scene-data";
import styles from "../demo.module.css";
import layout from "../scene-layout.module.css";
import { FileSelection } from "./FileSelection";
import { ImpactComparison, RiskNotice } from "../RiskSummary";
import { TaskProgress } from "../../feedback/TaskProgress";

export function DocumentScenes({ scene, navigate, documentName = "리액트 성능 향상.md" }: SceneProps) {
  const [consent, setConsent] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();

  if (scene === "document") return (
    <div className={layout.reading}>
      <div className={layout.documentToolbar}>
        <DemoButton
          variant="ghost"
          aria-expanded={infoOpen}
          aria-controls={infoId}
          onClick={() => setInfoOpen(open => !open)}
        >
          파일 정보 {infoOpen ? "접기" : "보기"}
        </DemoButton>
      </div>
      <aside id={infoId} className={layout.documentInfo} hidden={!infoOpen} aria-label="파일 정보">
        <dl className={layout.facts}>
          <div>
            <dt>보관 위치</dt>
            <dd>프론트엔드 공부 / React</dd>
          </div>
          <div>
            <dt>파일</dt>
            <dd>
              {"Markdown · "}
              {selectedFiles.find(file => file.name === documentName)?.size ?? 2.4}
              {" KB"}
            </dd>
          </div>
          <div>
            <dt>자료 사용</dt>
            <dd>전송 전 범위 확인</dd>
          </div>
        </dl>
      </aside>
      <article className={styles.article}>
        <h3>
          {documentName.replace(/\.md$/i, "")}
        </h3>
        <p>느리게 느껴지는 화면이 있다면, 먼저 어떤 작업에서 시간이 걸리는지 확인한다.</p>
        <h4>입력창과 목록 나누기</h4>
        <p>검색창의 입력 상태를 가까이 두면 관련 없는 화면까지 다시 그리는 일을 줄일 수 있다. 큰 목록은 Profiler에서 실제 비용을 확인한 뒤 개선한다.</p>
        <h4>측정 기록 남기기</h4>
        <p>같은 데이터와 기기에서 변경 전후를 비교한다. 파일 수와 대화 길이도 함께 기록한다.</p>
      </article>
      <div className={styles.actions}>
        <DemoButton variant="primary" onClick={() => navigate("transfer")}>대화에 보낼 자료 확인</DemoButton>
      </div>
    </div>
  );

  if (scene === "indexing") return (
    <div className={layout.ledger}>
      <TaskProgress
        label={`문서 ${selectedFiles.length}개 중 2개 준비`}
        detail="프론트엔드 공부 / React"
        progress={{ completed: 2, total: selectedFiles.length }}
      />
      <FileSelection files={selectedFiles} status={index => index < 2 ? "준비됨" : "대기"} />
      <div className={layout.ledgerFooter}>
        <p>준비된 자료부터 대화에 사용할 수 있어요. 지금은 준비 상태의 예시입니다.</p>
        <div className={styles.actions}>
          <DemoButton onClick={() => navigate("transfer")}>자료 범위 확인</DemoButton>
          <ActionLink href="/" variant="primary">대화로 돌아가기</ActionLink>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.stack}>
      <RiskNotice label="서버 전송 전 확인" title="선택한 문서의 내용이 기기 밖으로 전송돼요">
        문서에 개인정보나 비공개 내용이 있다면 함께 전송될 수 있어요. 목록과 원문을 확인한 뒤 동의해
        주세요.
      </RiskNotice>
      <ImpactComparison
        affected={{
          title: "전송하는 내용",
          items: [
            `선택한 문서 ${selectedFiles.length}개의 텍스트`,
            "검색과 답변에 사용할 서버 복사본",
          ],
        }}
        preserved={{
          title: "전송·변경하지 않는 것",
          items: ["선택하지 않은 문서와 다른 폴더", "기기에 보관한 원본 파일"],
        }}
      />
      <div className={layout.decision}>
        <section>
          <div className={layout.sectionTitle}>
            <h3>선택한 자료</h3>
            <span>
              {selectedFiles.length}
              {"개 · "}
              {selectedFiles.reduce((sum, file) => sum + file.size, 0).toFixed(1)}
              {" KB"}
            </span>
          </div>
          <FileSelection files={selectedFiles} />
          <p className={styles.note}>프론트엔드 공부 / React</p>
        </section>
        <div className={layout.decisionSide}>
          <h3>전송 범위에 동의</h3>
          <p>확인 전에는 자료 준비를 시작하지 않아요.</p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={consent}
              onChange={event => setConsent(event.target.checked)}
            />
            위 자료의 전송 범위를 확인했어요.
          </label>
          <div className={styles.actions}>
            <DemoButton variant="primary" disabled={!consent} onClick={() => navigate("indexing")}>
              자료 준비 화면 보기
            </DemoButton>
          </div>
        </div>
      </div>
    </div>
  );
}

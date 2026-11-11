"use client";

import { useId, useState } from "react";
import { ActionLink } from "../../../components/ui/ActionLink";
import { selectedFiles } from "../../files/library-data";
import { DemoButton } from "../DemoButton";
import type { SceneProps } from "../scene-data";
import styles from "../demo.module.css";
import layout from "../scene-layout.module.css";
import { FileSelection } from "./FileSelection";
import { FolderRoute } from "./FolderRoute";
import { studyFolder, sourceFolder, portfolioFolder, targetFolder } from "../../files/folder-groups";
import { RiskNotice } from "../RiskSummary";
import { TaskProgress } from "../../feedback/TaskProgress";

const route = {
  from: { root: studyFolder, name: sourceFolder },
  to: { root: portfolioFolder, name: targetFolder }
};

export function MoveScenes({ scene, navigate, dismiss }: SceneProps) {
  const radioGroup = useId();
  const [resolution, setResolution] = useState("rename");

  if (scene === "destination") return (
    <div>
      <FolderRoute {...route} />
      <div className={layout.sectionTitle}>
        <h3>옮길 문서</h3>
        <span>{selectedFiles.length}개 선택</span>
      </div>
      <FileSelection files={selectedFiles} />
      <div className={layout.ledgerFooter}>
        <p>
          프로젝트 기록 · 기존 3개 → 이동 후 {3 + selectedFiles.length}개<br />
          목적지가 고정된 예시입니다.
        </p>
        <div className={styles.actions}>
          <DemoButton onClick={() => navigate("conflict")}>동일 이름 충돌 예시</DemoButton>
          <DemoButton variant="primary" onClick={() => navigate("move-progress")}>
            이 위치로 이동
          </DemoButton>
        </div>
      </div>
    </div>
  );

  if (scene === "conflict") return (
    <div className={styles.stack}>
      <RiskNotice label="이름 충돌 · 선택 필요" title="이름은 같지만 내용이 다른 파일일 수 있어요">
        도착 폴더에 이미 같은 이름의 파일이 있어요. 기존 파일을 덮어쓰지 않도록 보관 방법을 선택해
        주세요.
      </RiskNotice>
      <div className={layout.comparison}>
        <div className={layout.paper}>
          <h3>옮길 파일</h3>
          <strong>리액트 성능 향상.md</strong>
          <p>2.4 KB</p>
          <p className={styles.note}>프론트엔드 공부 / React</p>
        </div>
        <div className={layout.paper}>
          <h3>도착 폴더에 있는 파일</h3>
          <strong>리액트 성능 향상.md</strong>
          <p>1.9 KB</p>
          <p className={styles.note}>포트폴리오 / 프로젝트 기록</p>
        </div>
      </div>
      <div className={layout.resolve}>
        <fieldset className={styles.choices}>
          <legend>이 파일은 어떻게 할까요?</legend>
          <label className={styles.choice}>
            <input
              type="radio"
              name={radioGroup}
              value="rename"
              checked={resolution === "rename"}
              onChange={() => setResolution("rename")}
            />
            <span>다른 이름으로 두 파일 모두 보관</span>
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name={radioGroup}
              value="skip"
              checked={resolution === "skip"}
              onChange={() => setResolution("skip")}
            />
            <span>이 파일은 건너뛰기</span>
          </label>
        </fieldset>
        <div>
          <p>
            {resolution === "rename"
              ? "새 이름 예시: 리액트 성능 향상 (2).md"
              : "원래 폴더에 이 파일을 남겨 둡니다."}
          </p>
          <p className={styles.note}>기존 파일을 덮어쓰지 않습니다.</p>
          <div className={styles.actions}>
            <DemoButton onClick={() => navigate("destination")}>돌아가기</DemoButton>
            <DemoButton
              variant="primary"
              onClick={() => navigate(resolution === "skip" ? "move-skipped" : "move-progress")}
            >
              선택한 방식으로 계속
            </DemoButton>
          </div>
        </div>
      </div>
    </div>
  );

  if (scene === "move-progress") return (
    <div>
      <FolderRoute {...route} />
      <div className={layout.ledger}>
        <TaskProgress
          label={`${selectedFiles.length}개 중 2개 이동`}
          detail="진행 화면 예시"
          progress={{ completed: 2, total: selectedFiles.length }}
        />
        <FileSelection files={selectedFiles} status={index => (index < 2 ? "완료" : "대기")} />
        <div className={layout.ledgerFooter}>
          <p>시안은 자동으로 파일을 처리하지 않습니다. 결과 상태를 선택해 보세요.</p>
          <div className={styles.actions}>
            <DemoButton onClick={() => navigate("move-partial")}>중단·일부 완료 보기</DemoButton>
            <DemoButton variant="primary" onClick={() => navigate("move-result")}>
              완료 화면 보기
            </DemoButton>
          </div>
        </div>
      </div>
    </div>
  );

  const partial = scene === "move-partial";
  const copy = scene === "copy-result";
  const skipped = scene === "move-skipped";

  return (
    <div className={styles.stack}>
      {partial
        && (
          <RiskNotice
            label="일부 미처리 · 확인 필요"
            title={`${selectedFiles[2].name} 파일이 아직 원래 위치에 있어요`}
          >
            다른 두 파일은 이동 완료 상태입니다. 중단 원인과 접근 권한을 확인한 뒤 미처리 파일의
            이동을 다시 계획해 주세요.
          </RiskNotice>
        )}
      <div>
        <FolderRoute {...route} copy={copy} />
        <div className={layout.ledger}>
          <div className={layout.ledgerHeader}>
            <h3>
              {skipped
                ? "2개 완료 · 1개 건너뜀"
                : partial
                  ? "2개 완료 · 1개 확인 필요"
                  : copy
                    ? "문서 3개의 복사본을 만들었어요."
                    : "문서 3개를 옮겼어요."}
            </h3>
            <span>처리 결과 예시</span>
          </div>
          <FileSelection
            files={selectedFiles}
            status={index =>
              (partial && index === 2) || (skipped && index === 0)
                ? skipped
                  ? "건너뜀"
                  : "미처리"
                : "완료"
            }
          />
          <div className={layout.ledgerFooter}>
            <p>
              {skipped
                ? "리액트 성능 향상.md는 원래 폴더에 남겨 두었습니다. 다른 두 파일만 옮긴 상태의 예시입니다."
                : partial
                  ? "미처리 파일은 원래 위치에 남습니다. 중단 또는 권한 문제를 확인하고 다시 시도하세요."
                  : copy
                    ? "원본은 React 폴더에 그대로 두고, 프로젝트 기록 폴더에 복사본을 보관합니다."
                    : "도착 위치는 포트폴리오 / 프로젝트 기록입니다."}
            </p>
            <div className={styles.actions}>
              {partial && (
                <DemoButton onClick={() => navigate("permission")}>권한 문제 확인</DemoButton>
              )}
              {partial
                ? (
                  <DemoButton variant="primary" onClick={() => navigate("destination")}>
                    다시 계획하기
                  </DemoButton>
                )
                : dismiss
                  ? (
                    <DemoButton variant="primary" onClick={dismiss}>
                      확인
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
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { LoadingRegion, ContentSkeleton, type RegionState } from "../../../feedback/LoadingRegion";
import { DemoButton } from "../../DemoButton";
import { FileSelection } from "../FileSelection";
import { selectedFiles } from "../../../files/library-data";
import { ScenarioControls } from "./ScenarioControls";
import styles from "./feedback-scenes.module.css";
import feedback from "../../../feedback/prototype-feedback.module.css";

const labels = {
  loading: "자료를 불러오고 있어요",
  refreshing: "새 내용을 확인하고 있어요",
  ready: "자료를 불러왔어요",
  error: "자료를 새로 불러오지 못했어요"
};
const options = [{ value: "loading", label: "처음 불러오기" }, { value: "refreshing", label: "갱신 중" }, { value: "error", label: "갱신 실패" }, { value: "ready", label: "완료" }] as const;

export function ContentLoadingDemo() {
  const [state, setState] = useState<RegionState>("loading");
  const [view, setView] = useState<"list" | "document">("list");
  const [note, setNote] = useState("");

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <div>
          <h3>프론트엔드 공부</h3>
          <p>React · 선택 자료</p>
        </div>
        <div className={styles.viewButtons}>
          <DemoButton aria-pressed={view === "list"} onClick={() => setView("list")}>
            목록
          </DemoButton>
          <DemoButton aria-pressed={view === "document"} onClick={() => setView("document")}>
            문서
          </DemoButton>
        </div>
      </div>
      <LoadingRegion
        state={state}
        label={labels[state]}
        detail={
          state === "refreshing" || state === "error"
            ? "마지막으로 불러온 내용은 아래에 유지됩니다."
            : undefined
        }
        placeholder={<ContentSkeleton shape={view} />}
        action={
          state === "error"
            ? (
              <DemoButton onClick={() => setState("refreshing")}>다시 시도</DemoButton>
            )
            : undefined
        }
      >
        <div key={view} className={feedback.contentChange}>
          {view === "list"
            ? (
              <FileSelection files={selectedFiles} />
            )
            : (
              <article className={styles.document}>
                <h3>리액트 성능 향상</h3>
                <p>느리게 느껴지는 화면이 있다면, 먼저 어떤 작업에서 시간이 걸리는지 확인한다.</p>
                <p>검색창의 입력 상태를 가까이 두고, 큰 목록은 실제 비용을 측정한 뒤 개선한다.</p>
              </article>
            )}
        </div>
      </LoadingRegion>
      <label className={styles.field}>
        자료 메모
        <input
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="화면을 전환해도 메모를 유지해요"
        />
      </label>
      <ScenarioControls value={state} options={options} onChange={setState} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { actionClasses } from "../../../components/ui/action-classes";
import {
  buildComparisonTrees,
  type ComparisonNode,
  type PathChange,
} from "./file-change-comparison";
import styles from "./file-change-comparison.module.css";

/** 일반 계획·AI 제안·시안이 공유하는 읽기 전용 비교. 실행 상태나 파일 핸들을 소유하지 않는다. */

export function FileChangeComparison({
  changes,
  rootName,
  operation,
}: {
  changes: readonly PathChange[];
  rootName: string;
  operation: "copy" | "move" | null;
}) {
  const [view, setView] = useState<"before" | "after">("after");
  const [all, setAll] = useState(false);
  const visible = all ? changes : changes.slice(0, 8);
  const trees = buildComparisonTrees(visible, operation);

  return (
    <section
      className={styles.preview}
      aria-label="현재와 정리 후 폴더 비교"
      data-file-change-comparison
    >
      <p className={styles.caption}>
        선택 항목 {changes.length}개 · 제안·검토 시점의 구조
        {visible.length < changes.length && ` · ${visible.length}개 미리보기`}
      </p>
      <div className={styles.tabs} role="group" aria-label="비교할 폴더 모습">
        <button
          className={actionClasses("ghost")}
          aria-pressed={view === "before"}
          onClick={() => setView("before")}
        >
          현재
        </button>
        <button
          className={actionClasses("ghost")}
          aria-pressed={view === "after"}
          onClick={() => setView("after")}
        >
          도착 구조
        </button>
      </div>
      <div className={styles.comparison} data-view={view}>
        <section tabIndex={0} aria-label="현재 구조 미리보기">
          <h3>현재</h3>
          <PathTree
            rootName={rootName}
            nodes={trees.before}
            label="현재 폴더 구조"
          />
        </section>
        <section tabIndex={0} aria-label="도착 구조 미리보기">
          <h3>
            {operation
              ? `${operation === "copy" ? "복사" : "이동"} 후 예상 구조`
              : "제안된 도착 구조"}
          </h3>
          <PathTree
            rootName={rootName}
            nodes={trees.after}
            label="예상 도착 폴더 구조"
          />
        </section>
      </div>
      {changes.length > 8
        && (
          <button className={actionClasses("ghost")} onClick={() => setAll(!all)}>
            {all ? "미리보기로 접기" : `전체 ${changes.length}개 구조 보기`}
          </button>
        )}
      {changes.length === 0 && <p>비교할 항목이 없습니다.</p>}
    </section>
  );
}

export function PathTree({
  rootName,
  nodes,
  label,
}: {
  rootName: string;
  nodes: readonly ComparisonNode[];
  label: string;
}) {
  const rows = (entries: readonly ComparisonNode[]) =>
    entries.map((node) => (
      <li key={node.name}>
        <span>
          <Icon
            name={
              node.kind === "directory"
                ? "folder"
                : node.kind === "file"
                  ? "file"
                  : "copy"
            }
            size={16}
          />
          {node.name}
          {node.count > 1 && <small>대상 {node.count}개</small>}
        </span>
        {node.children.length > 0 && <ul>
          {rows(node.children)}
        </ul>}
      </li>
    ));

  return (
    <ul className={styles.tree} aria-label={label}>
      <li>
        <span>
          <Icon name="folder" size={17} />
          {rootName}
        </span>
        <ul>
          {rows(nodes)}
        </ul>
      </li>
    </ul>
  );
}

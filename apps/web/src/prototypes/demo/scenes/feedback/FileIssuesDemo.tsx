"use client";
import { useEffect, useRef, useState } from "react";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { FileIssueList, type FileIssue } from "../../../feedback/FileIssueList";
import { DemoButton } from "../../DemoButton";
import { FileSelection } from "../FileSelection";
import { selectedFiles } from "../../../files/library-data";
import styles from "./feedback-scenes.module.css";

const candidates: FileIssue[] = [
  { id: "format", name: "스터디 발표.pdf", reason: "지원하지 않는 형식 · PDF", resolution: "현재는 MD·TXT 문서를 사용할 수 있어요." },
  { id: "size", name: "전체 강의 기록.txt", reason: "크기 초과 · 3.1 MiB", resolution: "파일당 2 MiB 이하의 자료를 선택해 주세요. 원본을 자동으로 나누지는 않아요." },
  { id: "read", name: "다음 주 계획.md", reason: "읽기 실패", resolution: "파일과 폴더 접근 권한을 확인한 뒤 다시 선택해 주세요." },
];
const usable = selectedFiles.slice(0, 2);

export function FileIssuesDemo() {
  const [excluded, setExcluded] = useState<string[]>([]);
  const issueArea = useRef<HTMLDivElement>(null);
  const usableArea = useRef<HTMLElement>(null);
  const issues = candidates.filter(item => !excluded.includes(item.id));
  useEffect(() => {
    if (!excluded.length) return;
    const next = issueArea.current?.querySelector<HTMLButtonElement>("button");
    (next ?? usableArea.current)?.focus();
  }, [excluded]);
  return (
    <div className={styles.stack}>
      <StatusNotice
        state={issues.length ? "attention" : "success"}
        title={
          issues.length
            ? `${issues.length}개 자료를 확인해 주세요`
            : "확인이 필요한 자료를 목록에서 제외했어요"
        }
        detail={`선택 ${usable.length + issues.length}개 · 사용 가능 ${usable.length}개 · 제외 ${excluded.length}개. 기기의 원본은 변경하지 않아요.`}
      />
      {!!issues.length && (
        <div ref={issueArea}>
          <FileIssueList
            issues={issues.map(issue => ({
              ...issue,
              action: (
                <DemoButton
                  aria-label={`${issue.name} 목록에서 제외`}
                  onClick={() => setExcluded([...excluded, issue.id])}
                >
                  목록에서 제외
                </DemoButton>
              ),
            }))}
          />
        </div>
      )}
      <section ref={usableArea} tabIndex={-1} aria-label="사용할 수 있는 자료">
        <h3>사용할 수 있는 자료</h3>
        <FileSelection files={usable} />
      </section>
      <div className={styles.right}>
        <DemoButton disabled={!excluded.length} onClick={() => setExcluded([])}>
          제외 항목 다시 보기
        </DemoButton>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, MoaMark } from "../../components/ui/Icon";
import { actionClasses } from "../../components/ui/action-classes";
import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { dateChoices, exampleDocuments } from "./chat-first-data";
import ui from "../../styles/workspace-ui.module.css";
import styles from "./chat-first.module.css";
import { FileChangeComparison } from "../../features/local-folders/components/plan/FileChangeComparison";
import type { PathChange } from "../../features/local-folders/lib/file-change-comparison";

type Stage = "materials" | "questions" | "plan" | "review";

type Operation = "copy" | "move";

/** 실제 상태/전송/파일 접근과 분리해 대화 안의 질문과 변경 구조를 검토하는 시안이다. */

export function ChatFirstPrototype() {
  const [stage, setStage] = useState<Stage>("plan");
  const [date, setDate] = useState<string>("2026-10-15");
  const [separate, setSeparate] = useState<boolean | null>(true);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [draft, setDraft] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(stage);
  const dateLabel = dateChoices.find((choice) => choice.value === date)?.label;
  const [report, mixed] = exampleDocuments;
  const mixedFolder = separate ? "혼합자료" : "성능자료";
  const operationLabel = operation === "move" ? "이동" : "복사";
  const changes: PathChange[] = [
    {
      from: [report.name],
      to: ["정리", "성능자료", date, report.name],
      kind: "file",
    },
    { from: [mixed.name], to: ["정리", mixedFolder, mixed.name], kind: "file" },
  ];
  const destinations = changes.map((change) => ({
    name: change.from.at(-1)!,
    path: ["source", ...change.to].join("/"),
  }));

  useEffect(() => {
    if (previousStage.current !== stage)
      heading.current?.focus({ preventScroll: true });

    previousStage.current = stage;
  }, [stage]);

  return (
    <div
      className={`${ui.system} ${styles.workspace}`}
      data-chat-first-prototype
    >
      <WorkspaceSidebar showHistory={false} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <MoaMark size={24} />
            <h1>성능 자료 정리</h1>
          </div>
          <button
            className={actionClasses("ghost")}
            onClick={() => {
              setStage("materials");
              setDate("");
              setSeparate(null);
              setOperation(null);
            }}
          >
            처음부터 보기
          </button>
        </header>
        <div className={styles.context}>
          <Icon name="folder" size={16} />
          source
          {" "}
          <span>· 연결한 폴더 전체 · 자료 {exampleDocuments.length}개</span>
        </div>
        <div className={styles.thread}>
          <div className={styles.user}>
            <p>성능 실측 자료를 모아서 날짜별로 정리해 줘.</p>
          </div>
          <article className={styles.reply} aria-label="모아의 정리 안내">
            <div className={styles.identity}>
              <MoaMark size={22} />
              <span>모아</span>
            </div>
            <h2 ref={heading} tabIndex={-1}>
              {stage === "materials"
                ? `자료 ${exampleDocuments.length}개를 찾았어요.`
                : stage === "questions"
                  ? "두 가지만 정하면 정리 모습을 보여드릴게요."
                  : stage === "plan"
                    ? "이렇게 모으면 어떨까요?"
                    : `${operationLabel}할 내용을 확인해 주세요.`}
            </h2>
            {stage === "materials"
              ? (
                <>
                  <p>이 자료를 바탕으로 정리안을 만들어 볼까요?</p>
                  <ul className={styles.changes}>
                    {exampleDocuments.map((document) => (
                      <li key={document.name}>
                        <strong>
                          <Icon name="file" size={17} />
                          {document.name}
                        </strong>
                      </li>
                    ))}
                  </ul>
                  <p>
                    Google Gemini에 파일 이름·상대 경로·내용의 필요한 부분을
                    보냅니다.
                  </p>
                  <div className={styles.actionRow}>
                    <button
                      className={actionClasses("primary")}
                      onClick={() => setStage("questions")}
                    >
                      이 자료로 제안 보기
                      <Icon name="chevron" size={16} />
                    </button>
                    <span>
                      시안의 다음 화면으로 이동합니다. 실제 전송은 하지 않습니다.
                    </span>
                  </div>
                </>
              )
              : stage === "questions"
                ? (
                  <>
                    <p>
                      보고서에는 날짜가 두 개 있고, 다른 자료에는 회사와 개인 학습
                      내용이 함께 있어요.
                    </p>
                    <fieldset className={styles.question}>
                      <legend>날짜보고.md는 어떤 날짜로 나눌까요?</legend>
                      <div className={styles.choices}>
                        {dateChoices.map((choice) => (
                          <button
                            key={choice.value}
                            aria-pressed={date === choice.value}
                            className={actionClasses("secondary")}
                            onClick={() => setDate(choice.value)}
                          >
                            {choice.label}
                            <span>
                              {choice.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className={styles.question}>
                      <legend>혼합자료.txt는 어디에 둘까요?</legend>
                      <div className={styles.choices}>
                        {[
                          {
                            value: true,
                            label: "혼합자료로 따로",
                            text: "두 주제를 그대로 보관",
                          },
                          {
                            value: false,
                            label: "성능자료와 함께",
                            text: "회사 성능 자료로 분류",
                          },
                        ].map((choice) => (
                          <button
                            key={choice.label}
                            aria-pressed={separate === choice.value}
                            className={actionClasses("secondary")}
                            onClick={() => setSeparate(choice.value)}
                          >
                            {choice.label}
                            <span>
                              {choice.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className={styles.actionRow}>
                      <button
                        className={actionClasses("primary")}
                        disabled={!date || separate === null}
                        onClick={() => setStage("plan")}
                      >
                        정리 모습 보기
                        <Icon name="chevron" size={16} />
                      </button>
                      {(!date || separate === null) && (
                        <span>두 기준을 선택해 주세요.</span>
                      )}
                    </div>
                  </>
                )
                : (
                  <>
                    <div className={styles.summary}>
                      <p>
                        보고서는 {dateLabel}로 나누고, 혼합 자료는{" "}
                        {separate ? "따로 모아둘게요." : "성능 자료와 함께 둘게요."}
                      </p>
                      <button
                        className={actionClasses("ghost")}
                        onClick={() => setStage("questions")}
                      >
                        기준 바꾸기
                      </button>
                    </div>
                    {stage === "plan"
                      ? (
                        <>
                          <fieldset className={styles.operation}>
                            <legend>어떤 방식으로 정리할까요?</legend>
                            {(["copy", "move"] as const).map((kind) => (
                              <label key={kind}>
                                <input
                                  type="radio"
                                  name="operation"
                                  checked={operation === kind}
                                  onChange={() => setOperation(kind)}
                                />
                                {kind === "copy"
                                  ? "복사 · 원본 유지"
                                  : "이동 · 보존 후 옮기기"}
                              </label>
                            ))}
                          </fieldset>
                          <div className={styles.actionRow}>
                            <button
                              className={actionClasses("primary")}
                              disabled={!operation}
                              onClick={() => setStage("review")}
                            >
                              {operation
                                ? `${operationLabel} 내용 검토`
                                : "방식을 선택해 주세요"}
                              <Icon name="chevron" size={16} />
                            </button>
                            <span>이 단계에서는 파일을 바꾸지 않아요.</span>
                          </div>
                          <FileChangeComparison
                            changes={changes}
                            rootName="source"
                            operation={operation}
                          />
                        </>
                      )
                      : (
                        <>
                          <ul className={styles.changes}>
                            {destinations.map((document) => (
                              <li key={document.name}>
                                <strong>
                                  <Icon name="file" size={17} />
                                  {document.name}
                                </strong>
                                <span>현재 · source/{document.name}</span>
                                <span>도착 · {document.path}</span>
                              </li>
                            ))}
                          </ul>
                          <p>
                            {operation === "copy"
                              ? "원본 두 파일을 그대로 두고 사본을 만듭니다."
                              : "복구 사본을 보존한 뒤 두 파일을 새 위치로 옮깁니다."}
                          </p>
                          <div className={styles.actionRow}>
                            <button
                              className={actionClasses("secondary")}
                              onClick={() => setStage("plan")}
                            >
                              정리 모습으로 돌아가기
                            </button>
                            <button className={actionClasses("primary")} disabled>
                              이대로 {operationLabel}
                            </button>
                          </div>
                          <p className={styles.note}>
                            실제 실행은 연결 전입니다. 이 시안에서는 파일을 변경하지
                            않습니다.
                          </p>
                        </>
                      )}
                  </>
                )}
            <details className={styles.details}>
              <summary>자료 {exampleDocuments.length}개 · 발췌 확인</summary>
              {exampleDocuments.map((document) => (
                <section key={document.name}>
                  <h3>
                    {document.name}
                  </h3>
                  <p>
                    {document.excerpt}
                  </p>
                </section>
              ))}
              <p className={styles.note}>
                합성 자료와 예시 경로입니다. 실제 AI 응답이나 계정 상태를
                가져오지 않습니다.
              </p>
            </details>
          </article>
        </div>
        <footer className={styles.composer}>
          <label htmlFor="prototype-chat-draft">이어서 대화하기</label>
          <div>
            <textarea
              id="prototype-chat-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="검토 기준일로 정리하고, 혼합 자료는 따로 모아 줘"
              rows={2}
            />
            <button
              className={actionClasses("primary")}
              disabled
              aria-label="시안에서는 AI 전송하지 않음"
            >
              <Icon name="arrow" size={18} />
            </button>
          </div>
          <p>화면 시안 · 입력은 이 화면에만 보관하며 AI에 전송하지 않습니다.</p>
        </footer>
      </main>
    </div>
  );
}

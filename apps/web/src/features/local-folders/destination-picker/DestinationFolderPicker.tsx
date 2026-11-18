"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import { Icon } from "../../../components/ui/Icon";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import type { DestinationPickerController, DestinationPickerState } from "./destination-picker-controller";
import styles from "./destination-folder-picker.module.css";
import { NewEntryForm } from "../creation/NewEntryForm";
import { DestinationPathForm } from "./DestinationPathForm";
import { FolderUpButton } from "../browsing/navigation/FolderUpButton";
/** 같은 계획 dialog 안의 탐색 면. 표시/키보드 초점만 관리하고 읽기·취소는 controller에 맡긴다. */

export function DestinationFolderPicker({ controller, state, folderName, onChoose, allowCreation = true, onCancel, purpose = "목적지", showFiles = false, hideHeader = false, creation, allowRootSelection = true }: {
  controller: DestinationPickerController;
  state: DestinationPickerState;
  folderName: string;
  onChoose: () => void;
  allowCreation?: boolean;
  onCancel?: () => void;
  purpose?: string;
  showFiles?: boolean;
  hideHeader?: boolean;
  creation?: ReactNode;
  allowRootSelection?: boolean;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef(state.phase);
  const [slowRead, setSlowRead] = useState(false);

  useEffect(() => {
    if (state.phase !== "loading") {
      return;
    }

    const timer = setTimeout(() => setSlowRead(true), 180);

    return () => {
      clearTimeout(timer);
      setSlowRead(false);
    };
  }, [state.phase]);

  useEffect(() => {
    title.current?.focus();
  }, []);

  useEffect(() => {
    if (previousPhase.current === "loading" && state.phase !== "loading"
      && (document.activeElement === document.body || document.activeElement?.tagName === "DIALOG")) {
      title.current?.focus({ preventScroll: true });
    }

    previousPhase.current = state.phase;
  }, [state.phase]);

  const pending = state.phase === "loading";
  const folders = state.result?.entries.filter(entry => entry.kind === "directory") ?? [];
  const files = showFiles ? state.result?.entries.filter(entry => entry.kind === "file") ?? [] : [];
  const path = state.requestedPath;
  const currentName = path.at(-1) ?? folderName;

  return (
    <section
      className={styles.picker}
      aria-label={`${purpose} 폴더 선택`}
      data-destination-phase={state.phase}
    >
      {!hideHeader && <div className={styles.header}>
        <h3 ref={title} tabIndex={-1}>
          {purpose} 폴더 선택
        </h3>
        <button
          type="button"
          className={actionClasses("secondary")}
          onClick={onCancel ?? controller.close}
        >
          {purpose} 탐색 취소
        </button>
      </div>}
      <DestinationPathForm
        path={state.requestedPath}
        rootName={folderName}
        purpose={purpose}
        disabled={pending}
        onOpen={controller.show}
      />
      <div className={styles.navigation}>
        <p aria-label={`${purpose} 탐색 위치`}>
          {path.length > 0
            ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void controller.root()}
                aria-label={`${folderName} 최상위로 이동`}
              >
                {folderName}
              </button>
            )
            : (
              <span aria-current="location">
                {folderName}
              </span>
            )}
          {path.map((part, index) => (
            <span key={index}>
              {" / "}
              {index === path.length - 1
                ? (
                  <span aria-current="location">
                    {part}
                  </span>
                )
                : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void controller.show(path.slice(0, index + 1))}
                    aria-label={`${part} 상위 경로로 이동`}
                  >
                    {part}
                  </button>
                )}
            </span>
          ))}
        </p>
      </div>
      {path.length > 0
        && (
          <FolderUpButton
            parentName={path.at(-2) ?? folderName}
            disabled={pending}
            onClick={() => void controller.parent()}
          />
        )}
      {state.phase === "ready" && <div className={styles.chooseRow}>
        <p>
          <Icon name="folder" size={22} />
          <span>
            <small>선택할 폴더</small>
            <strong>
              {currentName}
            </strong>
          </span>
        </p>
        <button
          type="button"
          className={actionClasses("primary", styles.choose)}
          disabled={state.phase !== "ready" || (!allowRootSelection && !path.length)}
          onClick={onChoose}
          aria-label={`${currentName} 폴더를 ${purpose}로 선택`}
        >
          이 폴더 선택
          <Icon name="chevron" />
        </button>
      </div>}
      {allowCreation && state.phase === "ready"
        && (
          <section className={styles.creationSection} aria-label="현재 위치에 새 항목 만들기">
            {creation ?? <NewEntryForm
              key={`creation:${JSON.stringify(path)}`}
              path={path}
              folderName={folderName}
              disabled={state.phase !== "ready"}
              onCreated={() => void controller.retry()}
            />}
          </section>
        )}
      <div className={styles.feedback}>
        {state.issue
          && (
            <StatusNotice
              state="error"
              title={
                state.issue === "missing"
                  ? `${purpose} 폴더를 찾지 못했어요.`
                  : `${purpose} 폴더를 읽지 못했어요.`
              }
              detail={`요청 위치: ${[folderName, ...state.requestedPath].join(" / ")}. ${state.issue === "missing" ? `상위 폴더로 돌아가 다른 폴더를 선택하세요.${allowCreation ? " 새 폴더가 필요하면 상위 폴더에서 ‘새로 만들기’를 누르세요." : ""}` : "접근 권한과 연결 상태를 확인하고 다시 시도해 주세요."}`}
              action={
                <div className={styles.recoveryActions}>
                {path.length > 0 && <button type="button" className={actionClasses("secondary")} onClick={() => void controller.parent()}>상위 폴더에서 선택</button>}
                <button type="button" className={actionClasses("secondary")} onClick={() => void controller.root()}>연결 폴더로 이동</button>
                <button
                  type="button"
                  className={actionClasses("secondary")}
                  onClick={() => void controller.retry()}
                >
                  {purpose} 다시 시도
                </button>
                </div>
              }
            />
          )}
        {state.result?.truncated
          && (
            <StatusNotice
              state="attention"
              title="전체 항목 중 1,000개까지만 확인했어요."
              detail="아래 하위 폴더가 전부는 아닐 수 있습니다. 현재 폴더는 선택할 수 있으며 계획을 만들 때 다시 확인합니다."
            />
          )}
      </div>
      <p className={styles.readStatus} role="status">
        {pending && slowRead
          ? "폴더를 확인하고 있어요. 이전 목록은 잠시 선택할 수 없습니다."
          : state.phase === "error" && state.result
            ? "이전에 확인한 목록입니다. 다시 시도해 주세요."
            : ""}
      </p>
      <div aria-busy={pending} className={styles.contents}>
        <section>
        <h4 className={styles.folderListTitle}>하위 폴더</h4>
        {state.phase === "ready" && folders.length === 0
          && (
            <p className={styles.note}>
              {state.result?.truncated
                ? "확인한 항목 안에는 하위 폴더가 없습니다."
                : "이 폴더에는 하위 폴더가 없습니다."}
            </p>
          )}
        {folders.length > 0
          && (
            <ul aria-label={`${purpose} 하위 폴더`} className={styles.folders}>
              {folders.map(folder => (
                <li key={folder.name}>
                  <button
                    type="button"
                    disabled={state.phase !== "ready"}
                    onClick={() => void controller.enter(folder.name)}
                    aria-label={`${folder.name} ${purpose} 폴더 열기`}
                  >
                    <Icon name="folder" />
                    <span>
                      {folder.name}
                    </span>
                    <Icon name="chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {showFiles && <section>
          <h4 className={styles.folderListTitle}>이 폴더의 파일 · {files.length}개</h4>
          {state.phase === "ready" && !files.length && <p className={styles.note}>이 위치에 파일이 없습니다.</p>}
          <ul className={styles.files} aria-label={`${purpose} 폴더의 파일`}>
            {files.map(file => <li key={file.name}><Icon name="file" size={18} /><span>{file.name}</span></li>)}
          </ul>
        </section>}
      </div>
    </section>
  );
}

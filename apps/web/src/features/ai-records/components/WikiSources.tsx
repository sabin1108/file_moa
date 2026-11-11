"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { WikiArtifact } from "../../../shared/ai-records";
import { actionClasses } from "../../../components/ui/action-classes";
import { useSharedSourceFolderConnection } from "../../local-folders/providers/SourceFolderProvider";
import { SourceDocumentPreview } from "../../local-folders/components/preview/SourceDocumentPreview";
import { checkWikiSources, type WikiSourceStatus } from "../services/wiki-sources";
import styles from "./ai-library.module.css";

const labels: Record<WikiSourceStatus, string> = {
  current: "확인한 시점의 원본과 근거가 일치합니다.",
  "needs-update": "갱신 필요 · 원본이 바뀌었거나 없어졌어요. 편집한 본문은 유지합니다.",
  unavailable: "출처 확인 불가 · 읽기 권한과 연결 상태를 확인해 주세요.",
  "wrong-connection": "이 위키를 만들 때 사용한 자료 폴더를 연결·선택해 주세요.",
};

export function WikiSources({ wiki, onAccept }: {
  wiki: WikiArtifact["wiki"];
  onAccept?: () => void
}) {
  const local = useSharedSourceFolderConnection();
  const [selection, setSelection] = useState<"current" | "proposal">("proposal");
  const proposal = selection === "proposal" ? wiki.proposal : undefined;
  const generation = proposal ?? wiki;
  const evidence = generation.evidence;
  const connectionId = local.sources.find(source => source.active)?.connectionId;
  const [revision, setRevision] = useState(0);
  const [checked, setChecked] = useState<{
    key: string;
    status: WikiSourceStatus
  } | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const check = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const preview = useSyncExternalStore(
    local.preview.subscribe,
    local.preview.getSnapshot,
    local.preview.getServerSnapshot
  );
  const { userId, workspaceId } = local.owner;
  const readSourceFile = local.readSourceFile;
  const key = JSON.stringify([evidence, userId, workspaceId, connectionId, revision]);
  const status = checked?.key === key ? checked.status : "checking";
  const previewOpen = previewKey === key;

  useEffect(() => {
    const operation = new AbortController();

    check.current = operation;
    void checkWikiSources(
      evidence,
      { owner: { userId, workspaceId }, connectionId },
      (source, signal) => readSourceFile(source.path, signal, source),
      operation.signal,
    ).then(value => {
      if (!operation.signal.aborted) setChecked({ key, status: value });
    }, () => { });

    return () => {
      operation.abort();

      if (check.current === operation) check.current = null;
    };
  }, [evidence, userId, workspaceId, connectionId, readSourceFile, key]);

  useEffect(() => () => {
    if (previewOpen) local.preview.close();
  }, [previewOpen, local.preview]);

  const open = (index: number) => {
    const source = evidence.citations[index];

    if (!source || status === "wrong-connection" || status === "checking") return;

    check.current?.abort();
    setPreviewKey(key);
    void local.preview.open(
      source.path,
      { ...source, owner: evidence.owner, connectionId: evidence.connectionId }
    );
  };

  return <section className={styles.wikiSources} aria-label="위키 출처">
    {wiki.proposal && <label>
      확인할 출처
      <select
        value={selection}
        onChange={event => setSelection(event.target.value as "current" | "proposal")}
      >
        <option value="proposal">새 초안 출처</option>
        <option value="current">현재 본문 출처</option>
      </select>
    </label>}
    <div>
      <h4>
        {proposal ? "새 초안 출처와 생성 기록" : "출처와 생성 기록"}
      </h4>
      <p>생성 버전 {wiki.generationVersion + (proposal ? 1 : 0)} · {new Date(generation.generatedAt).toLocaleString("ko-KR")} · {generation.model ?? "모델 미확인"}</p>
    </div>
    <p role="status">
      {status === "checking" ? "현재 원본과 근거를 확인하고 있어요…" : labels[status]}
    </p>
    <ul>
      {evidence.citations.map((source, index) => <li key={index}>
        <button
          type="button"
          className={actionClasses("ghost")}
          disabled={status === "wrong-connection" || status === "checking"}
          onClick={() => open(index)}
        >{source.path.join(" / ")} 원문 열기</button>
        <blockquote>
          {source.quote}
        </blockquote>
      </li>)}
    </ul>
    <button
      type="button"
      className={actionClasses("secondary")}
      onClick={() => setRevision(value => value + 1)}
    >출처 다시 확인</button>
    {wiki.proposal && onAccept && <>
      <p>새 초안의 출처가 현재 원본과 일치하면 반영할 수 있습니다.</p>
      <button
        type="button"
        className={actionClasses("secondary")}
        disabled={!proposal || status !== "current"}
        onClick={onAccept}
      >새 초안 반영</button>
    </>}
    {previewOpen && <SourceDocumentPreview
      state={preview}
      folderName={local.state.view?.folderName ?? null}
      headingRef={heading}
      onClose={() => {
        local.preview.close();
        setPreviewKey(null);
      }}
      onRefresh={() => open(evidence.citations.findIndex(source => JSON.stringify(source.path) === JSON.stringify(preview.path)))}
      onCancel={local.preview.cancel}
    />}
  </section>;
}

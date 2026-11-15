"use client";

import { useEffect, useRef, useState } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import type { LocalIndexStatus } from "./local-text-index";

export function SearchIndexSettings({ readStatus, refresh, clear }: {
  readStatus: () => Promise<LocalIndexStatus>;
  refresh: (signal: AbortSignal) => Promise<LocalIndexStatus & { complete: boolean }>;
  clear: () => Promise<void>;
}) {
  const [status, setStatus] = useState<LocalIndexStatus | null>(null);
  const [pending, setPending] = useState<"status" | "refresh" | "clear" | null>(null);
  const [notice, setNotice] = useState("");
  const operation = useRef<AbortController | null>(null);

  useEffect(() => () => operation.current?.abort(), []);

  const run = async (action: "status" | "refresh" | "clear") => {
    if (pending) return;

    const abort = new AbortController();

    operation.current = abort;
    setPending(action);
    setNotice("");

    try {
      if (action === "clear") await clear();

      const result = action === "refresh" ? await refresh(abort.signal) : await readStatus();

      if (abort.signal.aborted) return;

      setStatus(result);
      setNotice(action === "clear" ? "이 폴더의 기기 색인을 지웠어요." : action === "refresh" ? "complete" in result && !result.complete ? "일부 목록만 확인했어요. 이전 목록은 보존했습니다." : "현재 파일 목록을 확인했어요. 본문은 검색할 때 검사합니다." : "현재 기기 저장 상태입니다.");
    } catch {
      if (!abort.signal.aborted) setNotice("기기 저장소나 폴더 권한을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      if (operation.current === abort) {
        operation.current = null;
        setPending(null);
      }
    }
  };

  return <details data-search-index-settings>
    <summary>이 폴더의 로컬 검색 저장소</summary>
    <p>파일 목록과 읽은 본문을 이 기기에 보관합니다. 원본과 저장한 AI 기록은 유지됩니다.</p>
    {status && <p>목록 {status.catalogCount}개 · 본문 {status.textCount}개 · {(status.textBytes / 1024 / 1024).toFixed(1)}MiB</p>}
    <div>
      <button type="button" className={actionClasses("secondary")} disabled={!!pending} onClick={() => { void run("status"); }}>저장 상태 확인</button>{" "}
      <button type="button" className={actionClasses("secondary")} disabled={!!pending} onClick={() => { void run("refresh"); }}>파일 목록 갱신</button>{" "}
      <button type="button" className={actionClasses("secondary")} disabled={!!pending} onClick={() => { void run("clear"); }}>기기 색인 지우기</button>
      {pending === "refresh" && <button type="button" onClick={() => { operation.current?.abort(); setNotice("목록 확인을 중지했어요. 확인한 항목은 보관하며 다음 갱신은 처음부터 다시 확인합니다."); }}>중지</button>}
    </div>
    <p role="status">{notice}</p>
  </details>;
}

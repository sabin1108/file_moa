"use client";

import { useEffect, useRef, useState } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import type { LocalIndexStatus } from "./local-text-index";

export function SearchIndexSettings({ readStatus, refresh, clear, watch }: {
  readStatus: () => Promise<LocalIndexStatus>;
  refresh: (signal: AbortSignal) => Promise<LocalIndexStatus & { complete: boolean }>;
  clear: () => Promise<void>;
  watch?: { enabled: boolean; notice: string; setEnabled: (enabled: boolean) => void };
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
      setNotice(action === "clear" ? "이 폴더의 기기 색인을 지웠어요. 자동 확인도 껐습니다." : action === "refresh" ? result.resumable ? "확인 지점을 저장했어요. 이어서 확인할 수 있습니다." : "complete" in result && !result.complete ? "일부 목록만 확인했어요. 이전 목록은 보존했습니다." : "현재 파일 목록을 확인했어요. 본문은 검색할 때 검사합니다." : "현재 기기 저장 상태입니다.");
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
    {watch && <div>
      <label><input type="checkbox" aria-label="파일 목록 자동 확인" checked={watch.enabled} disabled={!!pending} onChange={event => watch.setEnabled(event.target.checked)} />화면이 보이는 동안 파일 목록 자동 확인</label>
      <p>30초마다 목록을 조금씩 확인합니다. 본문 읽기·AI 전송은 하지 않습니다.</p>
      <p role="status">{watch.notice}</p>
    </div>}
    {status && <p>목록 {status.catalogCount}개 · 본문 {status.textCount}개 · {(status.textBytes / 1024 / 1024).toFixed(1)}MiB</p>}
    <div>
      <button type="button" className={actionClasses("secondary")} disabled={!!pending} onClick={() => { void run("status"); }}>저장 상태 확인</button>{" "}
      <button type="button" className={actionClasses("secondary")} disabled={!!pending} onClick={() => { void run("refresh"); }}>{status?.resumable ? "파일 목록 이어서 확인" : "파일 목록 갱신"}</button>{" "}
      <button type="button" className={actionClasses("secondary")} disabled={!!pending} onClick={() => { void run("clear"); }}>기기 색인 지우기</button>
      {pending === "refresh" && <button type="button" onClick={() => { operation.current?.abort(); setNotice("목록 확인을 중지했어요. 다음 갱신 때 마지막 저장 지점부터 확인합니다."); }}>중지</button>}
    </div>
    <p role="status">{notice}</p>
  </details>;
}

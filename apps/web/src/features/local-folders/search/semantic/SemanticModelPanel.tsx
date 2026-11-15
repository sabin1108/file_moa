"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import type { OrganizationScope } from "../../../../shared/source-snapshot";
import type { SemanticModelController } from "./semantic-model-controller";
import { MODEL_DOWNLOAD_BYTES } from "./model-assets";
import styles from "./semantic.module.css";

export type SemanticTools = {
  model: SemanticModelController;
  prepare: (scope: OrganizationScope, signal: AbortSignal, progress: (count: number) => void) => Promise<{ prepared: number; partial: boolean; scanned: number }>;
  readStatus: () => Promise<{ documents: number; chunks: number; partial: number; bytes: number }>;
};

export function SemanticModelPanel({ tools, scope, connected, scopeName }: { tools: SemanticTools; scope: OrganizationScope; connected: boolean; scopeName: string }) {
  const model = useSyncExternalStore(tools.model.subscribe, tools.model.getSnapshot, tools.model.getServerSnapshot);
  const [notice, setNotice] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [remove, setRemove] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const busy = ["downloading", "verifying", "deleting"].includes(model.phase);
  useEffect(() => () => abort.current?.abort(), []);
  const prepare = async () => {
    if (preparing) return;
    const operation = new AbortController();
    abort.current = operation;
    setPreparing(true);
    setNotice("선택 범위의 현재 파일을 확인하고 있어요.");
    try {
      const result = await tools.prepare(scope, operation.signal, count => { if (!operation.signal.aborted) setNotice(`${count}개 자료를 준비했어요.`); });
      if (!operation.signal.aborted) setNotice(`${result.prepared}개 자료 준비 완료.${result.partial ? " 읽기 문제나 한도로 일부 자료·본문은 준비하지 못했어요." : ""} 원본이 바뀌면 다시 준비해 주세요.`);
    } catch { if (!operation.signal.aborted) setNotice("준비를 마치지 못했어요. 모델 설치·폴더 권한·저장 공간을 확인해 주세요. 기본 검색은 계속 사용할 수 있어요."); }
    finally { if (abort.current === operation) { abort.current = null; setPreparing(false); } }
  };
  return <details data-semantic-model className={styles.panel}>
    <summary>선택 기능 · 이 기기에서 의미 검색 {model.phase === "ready" ? "· 설치됨" : ""}</summary>
    <p>표현이 달라도 비슷한 뜻의 자료를 후보로 찾습니다. 기본 검색은 설치 없이 사용할 수 있어요.</p>
    <p>최초 약 {Math.ceil(MODEL_DOWNLOAD_BYTES / 1024 / 1024)}MiB를 다운로드하며, 실행 중에는 수백MiB의 추가 메모리를 사용할 수 있습니다. 공개 모델 파일을 Hugging Face에서 받으며, 의미 검색은 이 브라우저에서 처리합니다. 모바일이나 메모리가 적은 기기에서는 느리거나 실행되지 않을 수 있어요.</p>
    <p>설치는 이 브라우저에서 공유합니다. 폴더 준비는 계정·작업 공간·연결별로 구분하며, 설치만으로 폴더를 읽지 않습니다.</p>
    <div className={styles.actions}>
      {model.phase !== "ready" && <button type="button" data-semantic-install className={actionClasses("secondary")} disabled={busy || preparing} onClick={() => { setRemove(false); void tools.model.install(); }}>모델 다운로드 및 설치</button>}
      {(model.phase === "downloading" || model.phase === "verifying") && <button type="button" onClick={tools.model.stop}>다운로드 중지</button>}
      <button type="button" className={actionClasses("ghost")} disabled={busy || preparing} onClick={() => { void tools.model.refresh(); setNotice(""); }}>설치 상태 확인</button>
      <button type="button" className={actionClasses("ghost")} disabled={busy || preparing} onClick={() => setRemove(true)}>모델 삭제</button>
    </div>
    {busy && <p role="status">{model.phase === "verifying" ? "파일 무결성과 실행을 확인하고 있어요." : model.phase === "deleting" ? "모델과 의미 검색 저장소를 지우고 있어요." : `다운로드 중 · 현재 파일 ${(model.loaded / 1024 / 1024).toFixed(1)}MiB 수신`}</p>}
    {model.issue && <p role="status">{model.issue}</p>}
    {remove && <div role="group" aria-label="모델 삭제 확인"><p>이 브라우저의 모델과 모든 연결의 의미 검색 저장소를 지웁니다. 원본·기본 검색 저장소·AI 기록은 유지됩니다.</p><button type="button" onClick={() => { setRemove(false); void tools.model.remove(); }}>모델과 의미 검색 저장소 삭제</button>{" "}<button type="button" onClick={() => setRemove(false)}>취소</button></div>}
    <p>준비 대상: {scopeName}. 읽을 수 있는 최대 500개 자료·50MiB, 자료당 최대 64개 구간·연결당 총 4,096개 구간을 준비합니다. 긴 자료는 일부만 포함될 수 있어요. 첫 준비는 문서 길이와 기기에 따라 수십 초 이상 걸릴 수 있으며 중지할 수 있습니다.</p>
    <div className={styles.actions}>
      <button type="button" data-semantic-prepare className={actionClasses("secondary")} disabled={!connected || model.phase !== "ready" || preparing || busy} onClick={() => { void prepare(); }}>선택 범위 준비</button>
      <button type="button" className={actionClasses("ghost")} disabled={!connected || preparing || busy} onClick={() => { void tools.readStatus().then(status => setNotice(`연결 전체: ${status.documents}개 자료 · ${status.chunks}개 구간 · 일부 본문 ${status.partial}개 · 벡터 ${(status.bytes / 1024 / 1024).toFixed(1)}MiB. 현재 원본과의 일치는 검색할 때 확인합니다.`)).catch(() => setNotice("폴더 연결과 저장소를 확인해 주세요.")); }}>폴더 준비 상태 확인</button>
      {preparing && <button type="button" onClick={() => { abort.current?.abort(); setNotice("준비를 중지했어요. 완료된 자료는 다음 준비 때 재사용해요."); }}>준비 중지</button>}
    </div>
    <p role="status">{notice}</p>
  </details>;
}

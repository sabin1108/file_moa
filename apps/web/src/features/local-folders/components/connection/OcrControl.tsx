"use client";

import { useState, useSyncExternalStore } from "react";
import { readOcrEnabled, saveOcrEnabled, serverOcrEnabled, subscribeOcr } from "../../store/ocr-preferences";

export function OcrControl({ disabled = false }: { disabled?: boolean }) {
  const enabled = useSyncExternalStore(subscribeOcr, readOcrEnabled, serverOcrEnabled);
  const [unsaved, setUnsaved] = useState(false);
  return <section aria-label="이미지 글자 읽기 설정">
    <label><input type="checkbox" checked={enabled} disabled={disabled} onChange={event => setUnsaved(!saveOcrEnabled(event.target.checked))} /> 스캔 PDF·PNG·JPEG의 글자 읽기(OCR)</label>
    <p>이 브라우저에서 한국어·영어를 읽습니다. 원본은 전송하지 않으며 첫 실행에 엔진 파일을 읽습니다. 파일당 최대3쪽·쪽당600만 픽셀·90초 범위로, 인식한 글은 원본과 대조해 주세요.</p>
    {unsaved && <p role="status">현재 탭에 적용했지만 설정을 저장하지 못했어요.</p>}
  </section>;
}

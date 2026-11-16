"use client";

import type { Ref } from "react";

export function RecordTitleField({ value, onChange, disabled, inputRef }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; inputRef?: Ref<HTMLInputElement>;
}) {
  return <label>제목<input ref={inputRef} value={value} maxLength={120} required disabled={disabled}
    onChange={event => onChange(event.target.value)} /></label>;
}

export function RecordBodyField({ value, onChange, label = "내용", maxLength, required, disabled, document }: {
  value: string; onChange: (value: string) => void; label?: string; maxLength: number;
  required?: boolean; disabled?: boolean; document?: boolean;
}) {
  return <label>{label}<textarea value={value} maxLength={maxLength} required={required} disabled={disabled}
    data-document={document || undefined} onChange={event => onChange(event.target.value)} /></label>;
}

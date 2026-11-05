"use client";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { validWorkflowSteps } from "../lib/workflow-steps";

/** 표시 단계는 URL이 소유한다. 실행 권한/읽기·쓰기 결과는 controller/session이 별도로 검증한다. */
export function useWorkflowUrl(flow: "copy" | "managed" | "edit" | "restore") {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  const active = query.get("flow") === flow;
  const raw = query.get("step");
  const step = active && raw && validWorkflowSteps.has(raw) ? raw : "destination";
  const update = useCallback((next: string, id?: string, clear = false) => {
    if (!validWorkflowSteps.has(next) && !clear) return;
    // 같은 프레임의 단계 업데이트도 최신 URL을 기준으로 합성한다.
    const params = new URLSearchParams(window.location.search);
    if (clear) {
      if (params.get("flow") !== flow) return;
      params.delete("flow"); params.delete("step"); params.delete("draft");
    } else {
      params.set("flow", flow); params.set("step", next);
      if (id) params.set("draft", id);
    }
    const url = `${pathname}${params.size ? `?${params}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) router.replace(url, { scroll: false });
  }, [flow, pathname, router]);
  return { active, step, draftId: active ? query.get("draft") : null, update };
}

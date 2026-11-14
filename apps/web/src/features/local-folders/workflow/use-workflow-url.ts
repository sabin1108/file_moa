"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { validWorkflowSteps } from "../operations/planning/workflow-steps";

/** 표시 단계는 URL이 소유한다. 실행 권한/읽기·쓰기 결과는 controller/session이 별도로 검증한다. */

export function useWorkflowUrl(flow: "copy" | "managed" | "edit" | "restore") {
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

      params.delete("flow");
      params.delete("step");
      params.delete("draft");
    } else {
      params.set("flow", flow);
      params.set("step", next);

      if (id) params.set("draft", id);
    }

    const url = `${pathname}${params.size ? `?${params}` : ""}`;

    if (url !== `${window.location.pathname}${window.location.search}`) {
      // Next의 내부 상태는 native History 통합이 보존한다. 앱의 방문 복원 값만 전달한다.
      const visit: unknown = window.history.state?.moaFileVisit;

      window.history.replaceState(typeof visit === "string" ? { moaFileVisit: visit } : null, "", url);
    }
  }, [flow, pathname]);

  return { active, step, draftId: active ? query.get("draft") : null, update };
}

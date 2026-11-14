"use client";

import { useEffect, useRef, useState } from "react";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import type { RecoveryArchiveController } from "./archive/recovery-archive-controller";
import type { RecoveryRestoreController } from "./restore/recovery-restore-controller";
import { useWorkflowUrl } from "../workflow/use-workflow-url";
import { WorkflowStepper } from "../../../components/ui/WorkflowStepper";
import { managedSteps } from "../operations/planning/workflow-steps";
import { DismissibleNotice } from "../../../components/ui/feedback/DismissibleNotice";

export function RecoveryWorkflowBridge({ controller, restore }: {
  controller: RecoveryArchiveController;
  restore: RecoveryRestoreController;
}) {
  const { state: source, recoveryView, persistWorkflow, readWorkflow, removeWorkflow } = useSharedSourceFolderConnection();
  const { active, step, draftId, update } = useWorkflowUrl("restore");
  const initialized = useRef(false);
  const restoring = useRef(false);
  const id = useRef<string | null>(null);
  const signature = useRef("");
  const synchronize = useRef<() => void>(() => { });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialized.current || source.view?.status !== "connected" || recoveryView.status !== "connected") return;

    initialized.current = true;

    if (!active || !draftId) return;

    restoring.current = true;

    let disposed = false;

    void readWorkflow(draftId).then(async draft => {
      if (disposed || draft?.flow !== "restore" || !draft.archiveId) return;

      id.current = draft.id;
      await controller.open();
      await controller.inspect(draft.archiveId);

      if (disposed) return;

      await restore.resume(draft.archiveId, draft.destination, step, draft.interrupted, draft.restoreOutcome);
    }).catch(() => {
      if (!disposed) setNotice("복원 초안을 열지 못했습니다. 연결과 보관함을 확인한 뒤 다시 검사해 주세요.");
    })
      .finally(() => {
        restoring.current = false;

        if (!disposed) synchronize.current();
      });

    return () => {
      disposed = true;
    };
  }, [controller, readWorkflow, recoveryView.status, restore, source.view?.status, active, draftId, step]);

  useEffect(() => {
    const sync = () => {
      if (!initialized.current || restoring.current || window.location.pathname !== "/files"
        || source.view?.status !== "connected") return;

      const value = restore.getSnapshot();

      if (value.phase === "idle" || !value.id) {
        if (id.current) {
          void removeWorkflow(id.current).catch(() => { });
          id.current = null;
          update("destination", undefined, true);
        }

        return;
      }

      id.current ??= crypto.randomUUID();

      const picker = restore.picker.getSnapshot();
      const step = value.phase === "running" ? "execute" : value.result ? "result" : value.phase === "ready" ? "review" : "destination";

      update(step, id.current);

      const draft = {
        id: id.current,
        flow: "restore" as const,
        source: [],
        names: [],
        destination: [...(picker.open ? picker.requestedPath : value.preview?.destination ?? [])],
        archiveId: value.id,
        interrupted: value.phase === "running",
        restoreOutcome: value.result
          && (value.result.phase === "completed" || value.result.phase === "cancelled" || value.result.phase === "error")
          ? { ...value.result, phase: value.result.phase, path: [...value.result.path] }
          : undefined
      };
      const next = JSON.stringify(draft);

      if (next !== signature.current) {
        signature.current = next;
        void persistWorkflow(draft).catch(() => {
          signature.current = "";
          setNotice("복원 초안을 기기에 보관하지 못했습니다. 새로고침 전에 저장소를 확인해 주세요.");
        });
      }
    };
    const subscriptions = [restore.subscribe(sync), restore.picker.subscribe(sync)];

    synchronize.current = sync;

    return () => {
      synchronize.current = () => { };
      subscriptions.forEach(stop => stop());
    };
  }, [persistWorkflow, removeWorkflow, restore, source.view?.status, update]);

  return notice ? <DismissibleNotice state="attention" title={notice} autoDismissMs={0} /> : null;
}

export function RecoveryWorkflowSteps() {
  const url = useWorkflowUrl("restore");

  return <WorkflowStepper steps={managedSteps} current={url.step} label="복원 진행 단계" />;
}

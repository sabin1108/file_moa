"use client";

import { useEffect, useRef, useState } from "react";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import type { ManagedFilesController } from "../operations/managed/managed-files-controller";
import type { InlineEditorController } from "../documents/editing/inline-editor-controller";
import type { WorkflowDraft } from "./workflow-drafts";
import { useWorkflowUrl } from "./use-workflow-url";
import { recoveryIdSchema } from "../recovery/recovery-vault-rules";
import { managedWorkflowStep } from "../operations/managed/managed-workflow-step";

/** URL 단계와 로컬 초안을 연결한다. 복원한 단계는 실행 승인으로 사용하지 않는다. */

export function useWorkspaceWorkflow(managed: ManagedFilesController, editor: InlineEditorController) {
  const { state: connection, listing, preview, navigation, plan, persistWorkflow, readWorkflow, removeWorkflow } = useSharedSourceFolderConnection();
  const { update: updateCopy } = useWorkflowUrl("copy");
  const { update: updateManaged } = useWorkflowUrl("managed");
  const { update: updateEdit } = useWorkflowUrl("edit");
  const initial = useRef(typeof window === "undefined"
    ? null
    : {
      params: new URLSearchParams(window.location.search),
      visit: window.history.state?.moaFileVisit as unknown,
    });
  const initialized = useRef(false);
  const restoring = useRef(false);
  const ids = useRef<{
    copy?: string;
    managed?: string;
    edit?: string
  }>({});
  const previous = useRef(new Map<string, string>());
  const synchronize = useRef<() => void>(() => { });
  const [notice, setNotice] = useState<{
    text: string;
    blocking: boolean
  } | null>(null);

  useEffect(() => {
    if (initialized.current || connection.phase !== "ready" || connection.view?.status !== "connected") return;

    initialized.current = true;
    restoring.current = true;

    const saved = initial.current;
    const flow = saved?.params.get("flow");
    const id = saved?.params.get("draft") ?? (typeof saved?.visit === "string" ? saved.visit : null);
    let disposed = false;
    const resume = async () => {
      if (!id || !recoveryIdSchema.safeParse(id).success) return;

      const draft = await readWorkflow(id);

      if (disposed) return;

      if (!draft) {
        if (flow) setNotice({ text: "이 기기에는 해당 작업 초안이 없습니다. 공유한 링크의 단계만 표시할 수 있으며 자료 폴더는 이 기기에서 연결해야 합니다.", blocking: false });

        return;
      }

      const step = saved?.params.get("step") ?? "destination";

      if (draft.flow === "edit" && flow === "edit") {
        ids.current.edit = id;
        await navigation.openFolder(draft.source);
        await preview.open([...draft.source, ...draft.names]);
        await editor.open([...draft.source, ...draft.names], id);
      } else if (draft.flow === "managed" && flow === "managed" && draft.kind) {
        ids.current.managed = id;
        await managed.resume({
          kind: draft.kind,
          source: draft.source,
          names: draft.names,
          destination: draft.destination,
          archiveId: draft.archiveId
        }, step, draft.interrupted, draft.outcome, draft.destinationConfirmed, draft.choosing, draft.pickerPath);
        setNotice({
          text: draft.interrupted ? "새로고침 전 실행은 중단 상태로 복원했습니다. 자동 재실행하지 않습니다." : "작업 위치와 단계를 복원하고 현재 자료를 다시 확인했습니다.",
          blocking: false
        });
      } else if (draft.flow === "copy" && flow === "copy") {
        ids.current.copy = id;
        await navigation.openFolder(draft.source);
        // 루트 연결 직후에는 최초 목록 읽기가 아직 진행 중일 수 있다.
        // 항목 종류까지 확인한 뒤 선택을 복원해야 plan.open의 검사도 통과한다.

        const current = listing.getSnapshot();

        if (current.phase !== "ready" || JSON.stringify(current.result?.path) !== JSON.stringify(draft.source)) {
          await listing.open(draft.source);
        }

        if (disposed) return;

        const entries = listing.getSnapshot().result?.entries ?? [];

        listing.restoreView({
          query: "",
          searchOpen: false,
          selectionOpen: true,
          selectedNames: draft.names,
          selectedKinds: Object.fromEntries(entries.filter(entry => draft.names.includes(entry.name)).map(entry => [entry.name, entry.kind]))
        });
        plan.open("copy");
        plan.setDestination(
          draft.destination.join("/"),
          draft.destinationConfirmed ?? step !== "destination"
        );

        if (draft.outcome && !draft.interrupted && step === "result") plan.restoreOutcome(draft.outcome);
        else if (step !== "destination") {
          await plan.generate();

          if (plan.getSnapshot().result?.conflictCount) await plan.inspectBackup();
          else await plan.inspectCopy();
        } else if (draft.choosing) await plan.browseDestination(draft.pickerPath);

        setNotice({
          text: draft.interrupted
            ? "중단된 복사는 자동으로 반복하지 않습니다. 남은 파일과 작업 기록을 확인한 뒤 다시 검사해 주세요."
            : "복사 위치와 선택을 복원했습니다. 현재 자료를 다시 검사했으며 보존·쓰기 승인은 새로 확인합니다.",
          blocking: false
        });
      } else if (draft.flow === "browse" && !flow) {
        await navigation.openFolder(draft.source);

        if (draft.destination.length) await preview.open(draft.destination);
      }
    };

    void resume().catch(() => {
      if (!disposed) setNotice({ text: "작업 초안은 보관되어 있지만 현재 연결이나 파일이 달라 복원하지 못했습니다. 연결을 확인해 주세요.", blocking: true });
    })
      .finally(() => {
        restoring.current = false;

        if (!disposed) synchronize.current();
      });

    return () => {
      disposed = true;
    };
  }, [connection.phase, connection.view?.status, editor, listing, managed, navigation, plan, preview, readWorkflow]);

  useEffect(() => {
    const persist = (value: WorkflowDraft) => {
      const signature = JSON.stringify(value);

      if (previous.current.get(value.id) === signature) return;

      previous.current.set(value.id, signature);
      void persistWorkflow(value).catch(() => {
        previous.current.delete(value.id);
        setNotice({ text: "작업 초안을 기기에 보관하지 못했습니다. 새로고침 전에 저장소 상태를 확인해 주세요.", blocking: true });
      });
    };
    const sync = () => {
      if (!initialized.current || restoring.current || listing.getSnapshot().available === false
        || window.location.pathname !== "/files") return;

      const copied = plan.getSnapshot();
      const moved = managed.getSnapshot();
      const edited = editor.getSnapshot();

      if (edited.open && edited.id) {
        ids.current.edit = edited.id;
        updateEdit(edited.phase === "saving" ? "execute" : "review", edited.id);
      } else if (ids.current.edit) {
        updateEdit("destination", undefined, true);
        ids.current.edit = undefined;
      }

      if (moved.open && moved.request && moved.request.kind !== "edit") {
        const id = ids.current.managed ??= crypto.randomUUID();
        const picker = managed.picker.getSnapshot();
        const step = managedWorkflowStep(moved);

        updateManaged(step, id);
        persist({
          id,
          flow: "managed",
          source: [...moved.request.source],
          names: [...moved.request.names],
          destination: [...moved.request.destination],
          kind: moved.request.kind,
          archiveId: moved.request.archiveId,
          interrupted: moved.phase === "running",
          destinationConfirmed: moved.destinationConfirmed,
          choosing: picker.open,
          pickerPath: picker.open ? [...picker.requestedPath] : undefined,
          outcome: moved.result
            && (moved.result.phase === "completed" || moved.result.phase === "cancelled" || moved.result.phase === "error")
            ? { ...moved.result, phase: moved.result.phase }
            : undefined
        });
      } else if ((!moved.open || !moved.request) && ids.current.managed) {
        void removeWorkflow(ids.current.managed).catch(() => { });
        ids.current.managed = undefined;
        updateManaged("destination", undefined, true);
      }

      if (copied.open) {
        const id = ids.current.copy ??= crypto.randomUUID();
        const backup = plan.backup.getSnapshot();
        const execution = plan.execution.getSnapshot();
        const inspection = plan.inspection.getSnapshot();
        const step = backup.phase === "running"
          ? backup.mode === "overwrite" ? "execute" : "preserve"
          : backup.mode === "overwrite"
            ? backup.phase === "confirming" ? "overwrite" : "result"
            : backup.phase === "completed"
              ? "overwrite"
              : backup.phase !== "idle"
                ? "inspect"
                : execution.running
                  ? "execute"
                  : execution.result || copied.resumedOutcome ? "result" : inspection.phase !== "idle" ? "inspect" : "destination";

        updateCopy(step, id);

        const finalCopy = backup.mode === "overwrite" ? backup.overwrite : execution.result;
        const outcome = finalCopy && (finalCopy.phase === "completed" || finalCopy.phase === "cancelled" || finalCopy.phase === "error")
          ? {
            id: finalCopy.id,
            phase: finalCopy.phase,
            status: finalCopy.phase === "completed" && finalCopy.journalComplete ? "verified" as const : "uncertain" as const,
            copied: finalCopy.items.filter(item => item.status === "verified").length,
            removed: 0,
            preserved: backup.mode === "overwrite",
            issue: finalCopy.issue
          }
          : copied.resumedOutcome ?? undefined;

        persist({
          id,
          flow: "copy",
          source: [...copied.sourcePath],
          names: [...copied.selectedNames],
          destination: copied.destination.split("/").filter(Boolean),
          interrupted: execution.running || backup.phase === "running",
          destinationConfirmed: copied.destinationConfirmed,
          choosing: plan.destinationPicker.getSnapshot().open,
          pickerPath: plan.destinationPicker.getSnapshot().open ? [...plan.destinationPicker.getSnapshot().requestedPath] : undefined,
          outcome: outcome && (outcome.phase === "completed" || outcome.phase === "cancelled" || outcome.phase === "error")
            ? { ...outcome, phase: outcome.phase }
            : undefined
        });
      } else if (ids.current.copy) {
        void removeWorkflow(ids.current.copy).catch(() => { });
        ids.current.copy = undefined;
        updateCopy("destination", undefined, true);
      }

      if (!copied.open && !moved.open && !edited.open) {
        const id: unknown = window.history.state?.moaFileVisit;
        const listingState = listing.getSnapshot();

        if (typeof id === "string" && recoveryIdSchema.safeParse(id).success && listingState.phase === "ready"
          && listingState.result) {
          persist({
            id,
            flow: "browse",
            source: [...listingState.result.path],
            names: [],
            destination: [...(preview.getSnapshot().path ?? [])],
            interrupted: false
          });
        }
      }
    };
    const stores = [plan, plan.backup, plan.execution, plan.inspection, plan.destinationPicker, managed, managed.picker, editor, listing, preview];

    synchronize.current = sync;

    const subscriptions = stores.map(store => store.subscribe(sync));

    sync();

    return () => {
      synchronize.current = () => { };
      subscriptions.forEach(unsubscribe => unsubscribe());
    };
  }, [updateCopy, updateEdit, editor, listing, managed, updateManaged, persistWorkflow, plan, preview, removeWorkflow]);

  return notice;
}

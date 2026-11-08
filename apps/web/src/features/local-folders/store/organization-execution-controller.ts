import type { FolderConnectionSession } from "../services/connection-session";
import type { ManagedResult } from "../lib/managed-files";
import { buildOrganizationBatches, type OrganizationBatch } from "../lib/organization-operation";
import { copyFolderPath } from "../lib/folder-path";
import { hasUnansweredReview } from "../../../shared/live-organization-review";
import type { OrganizationPreparationController } from "./organization-preparation-controller";
import { ManagedFilesController } from "./managed-files-controller";
import { DestinationPickerController } from "./destination-picker-controller";

type Outcome = Readonly<{
  key: string;
  destination: readonly string[];
  kind: "copy" | "move";
  result: ManagedResult;
}>;
const initial = {
  operation: null as "copy" | "move" | null,
  base: null as readonly string[] | null,
  batches: [] as readonly OrganizationBatch[],
  outcomes: [] as readonly Outcome[],
  issue: null as string | null,
  stale: false
};

/** Projects reviewed local capabilities into the existing managed engine; never runs on model completion. */
export class OrganizationExecutionController {
  readonly managed: ManagedFilesController;
  readonly picker: DestinationPickerController;
  private state = initial;
  private listeners = new Set<() => void>();
  private result: ReturnType<OrganizationPreparationController["getSnapshot"]>["result"] = null;
  private active: OrganizationBatch | null = null;
  constructor(
    private readonly preparation: OrganizationPreparationController,
    session: FolderConnectionSession,
    permissionLost: () => void = () => {}
  ) {
    this.result = preparation.getSnapshot().result;
    this.picker = new DestinationPickerController(session.readManagedDestination, () => {});
    const current = () => {
      if (
        !this.result ||
        this.state.stale ||
        this.preparation.getSnapshot().result !== this.result ||
        !this.active
      )
        throw Error("managed-changed");
      return this.active;
    };
    this.managed = new ManagedFilesController(
      session.readManagedDestination,
      session.openManagedEditor,
      (request, signal) => {
        if (request.kind === "recover") return session.prepareManaged(request, signal);
        const batch = current();
        if (
          !["copy", "move"].includes(request.kind) ||
          JSON.stringify(request.source) !== JSON.stringify(batch.request.source) ||
          JSON.stringify(request.names) !== JSON.stringify(batch.request.names)
        )
          throw Error("managed-changed");
        const source = this.preparation.getSnapshot();
        const result = this.result;
        return session
          .prepareOrganizationManaged(
            request,
            batch.documents,
            `${source.request}\n${source.basis}`,
            signal
          )
          .catch(error => {
            if (result === this.preparation.getSnapshot().result && !signal.aborted) {
              if (
                error instanceof DOMException &&
                ["NotAllowedError", "SecurityError"].includes(error.name)
              )
                permissionLost();
              else if (
                error instanceof Error &&
                ["managed-changed", "source-changed"].includes(error.message)
              )
                this.publish({
                  ...this.state,
                  stale: true,
                  issue:
                    "원본이 제안 당시와 달라졌어요. 기존 계획은 실행할 수 없습니다. 자료를 다시 읽고 제안을 준비해 주세요."
                });
            }
            throw error;
          });
      },
      (view, signal, progress) => {
        if (view.kind !== "recover") current();
        // No await: keep the existing engine's permission requests inside the user's gesture.
        return session.executeManaged(view, signal, progress);
      },
      session.readManagedArchives,
      session.discardManaged
    );
    preparation.subscribe(() => {
      const result = preparation.getSnapshot().result;
      if (result === this.result) return;
      this.result = result;
      this.active = null;
      if (this.managed.getSnapshot().phase === "running") this.managed.cancel();
      else this.managed.dispose();
      this.picker.close();
      this.publish({ ...initial, base: preparation.getSnapshot().destination });
    });
    this.managed.subscribe(() => {
      const { result, request, phase } = this.managed.getSnapshot();
      if (
        !this.active ||
        !result ||
        !request ||
        phase === "running" ||
        !["copy", "move"].includes(request.kind)
      )
        return;
      const outcome: Outcome = {
        key: this.active.key,
        destination: request.destination,
        kind: request.kind as "copy" | "move",
        result
      };
      const changed = result.issue === "managed-changed" || result.issue === "source-changed";
      this.publish({
        ...this.state,
        stale: this.state.stale || changed,
        issue: changed
          ? "원본이 바뀌어 계획을 중단했어요. 결과와 보존 기록을 확인하고 자료를 다시 준비해 주세요."
          : this.state.issue,
        outcomes: [...this.state.outcomes.filter(item => item.key !== outcome.key), outcome]
      });
    });
  }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: typeof initial) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  setOperation = (operation: "copy" | "move") => {
    if (this.managed.getSnapshot().phase === "running" || this.state.stale) return;
    this.managed.dispose();
    this.active = null;
    this.publish({ ...initial, operation, base: this.state.base, stale: this.state.stale });
  };
  setBase = (base: readonly string[]) => {
    if (this.managed.getSnapshot().phase === "running" || this.state.stale) return;
    this.managed.dispose();
    this.active = null;
    this.publish({
      ...initial,
      operation: this.state.operation,
      base: copyFolderPath(base),
      stale: this.state.stale
    });
    this.picker.close();
  };
  browse = () =>
    this.picker.show(this.state.base ?? this.preparation.getSnapshot().destination ?? []);
  choose = () => {
    const path = this.picker.selectedPath();
    if (path) this.setBase(path);
  };
  review = () => {
    if (this.managed.getSnapshot().phase === "running" || this.state.stale) return;
    const source = this.preparation.getSnapshot();
    if (
      !source.result ||
      !source.snapshot ||
      hasUnansweredReview(source.questions, source.answers) ||
      !this.state.operation ||
      this.state.base === null
    ) {
      this.publish({
        ...this.state,
        issue: "확인 질문에 답하고 복사/이동과 실제 목적지를 선택해 주세요."
      });
      return;
    }
    try {
      const batches = buildOrganizationBatches(
        source.result.organization,
        source.snapshot.documents,
        this.state.base,
        this.state.operation
      );
      this.managed.dispose();
      this.active = null;
      this.publish({ ...this.state, batches, outcomes: [], issue: null });
    } catch {
      this.publish({
        ...this.state,
        batches: [],
        issue: "미해결 자료나 같은 목적지 이름이 있어요. 제안과 목적지를 다시 확인해 주세요."
      });
    }
  };
  openBatch = async (key: string) => {
    if (
      this.state.stale ||
      this.managed.getSnapshot().phase === "running" ||
      this.state.outcomes.some(item => item.key === key && item.result.phase === "completed")
    )
      return;
    const batch = this.state.batches.find(batch => batch.key === key);
    if (!batch || this.preparation.getSnapshot().result !== this.result) return;
    this.active = batch;
    await this.managed.open(batch.request, true);
  };
  showArchives = () => {
    this.active = null;
    return this.managed.showArchives();
  };
}

import type { BackupInspection } from "../lib/recovery-backup";
import type { FileChangePlan } from "../lib/file-change-plan";
import type { BackupExecution } from "../services/recovery-backup";
import { waitForPendingFeedback } from "../lib/pending-feedback";
import type { OverwriteExecution } from "../lib/recovery-overwrite";

type Inspector = (plan: FileChangePlan, signal: AbortSignal) => Promise<BackupInspection>;
type Runner = (plan: FileChangePlan, report: BackupInspection, signal: AbortSignal, progress: (value: BackupExecution) => void) => Promise<BackupExecution>;
type OverwriteRunner = (plan: FileChangePlan, report: BackupInspection, backup: BackupExecution, signal: AbortSignal,
  progress: (value: OverwriteExecution) => void) => Promise<OverwriteExecution>;
export type RecoveryBackupState = Readonly<{
  phase: "idle" | "inspecting" | "ready" | "confirming" | "running" | "completed" | "cancelled" | "error";
  mode: "backup" | "overwrite"; overwrite: OverwriteExecution | null;
  report: BackupInspection | null; result: BackupExecution | null; cancelling: boolean;
  issue: "connection" | "permission" | "changed" | "limit" | "read" | null;
}>;
const initial: RecoveryBackupState = { phase: "idle", mode: "backup", overwrite: null, report: null, result: null, cancelling: false, issue: null };

/** 백업 화면의 검사/실행/중단 수명. 파일 접근과 승인 보관은 session에 맡긴다. */
export class RecoveryBackupController {
  private state = initial;
  private generation = 0;
  private abort: AbortController | null = null;
  private plan: FileChangePlan | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly inspectFiles: Inspector, private readonly run: Runner, readonly available: () => boolean,
    private readonly overwriteFiles?: OverwriteRunner, private readonly discardOverwrite: () => void = () => {}) {}

  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: RecoveryBackupState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  reset = () => {
    this.discardOverwrite();
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.plan = null;
    this.publish(initial);
  };

  confirmOverwrite = () => {
    if (this.state.phase !== "completed" || this.state.mode !== "backup" || !this.overwriteFiles || !this.available()
      || !this.state.result?.journalComplete || this.state.result.phase !== "completed"
      || this.state.result.items.some(item => item.status !== "verified")) return;
    this.publish({ ...this.state, phase: "confirming", mode: "overwrite", overwrite: null });
  };

  dismissOverwrite = () => {
    if (this.state.phase === "confirming") this.publish({ ...this.state, phase: "completed", mode: "backup" });
  };

  startOverwrite = async () => {
    if (this.state.phase !== "confirming" || !this.plan || !this.state.report || !this.state.result || !this.overwriteFiles || !this.available()) return;
    const generation = ++this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const { report, result } = this.state;
    this.publish({ ...this.state, phase: "running", overwrite: null, issue: null });
    try {
      const overwrite = await this.overwriteFiles(this.plan, report, result, abort.signal, value => {
        if (generation === this.generation) this.publish({ ...this.state, overwrite: value });
      });
      if (generation !== this.generation) return;
      this.abort = null;
      const phase = overwrite.phase === "completed" && overwrite.journalComplete ? "completed" : overwrite.phase === "cancelled" ? "cancelled" : "error";
      this.publish({ ...this.state, phase, overwrite, cancelling: false });
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof Error && error.message === "stale-connection-operation") {
        this.reset();
        return;
      }
      this.abort = null;
      this.publish({ ...this.state, phase: "error", issue: "read", cancelling: false });
    }
  };
  cancel = () => {
    this.abort?.abort();
    if (this.state.phase === "running") {
      this.publish({ ...this.state, cancelling: true });
    } else {
      this.reset();
    }
  };
  inspect = async (plan: FileChangePlan) => {
    if (this.state.phase === "running") return;
    this.reset();
    if (!this.available()) {
      this.publish({ ...initial, phase: "error", issue: "connection" });
      return;
    }
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.plan = structuredClone(plan);
    this.publish({ ...initial, phase: "inspecting" });
    const started = Date.now();
    try {
      const report = await this.inspectFiles(this.plan, abort.signal);
      await waitForPendingFeedback(started, abort.signal);
      if (generation !== this.generation || abort.signal.aborted) return;
      this.abort = null;
      this.publish({ ...initial, phase: "ready", report });
    } catch (error) {
      if (generation !== this.generation) return;
      this.abort = null;
      const message = error instanceof Error ? error.message : "";
      const issue = error instanceof Error && error.name === "NotAllowedError" ? "permission"
        : message.includes("changed") || message.includes("conflict") ? "changed"
        : message.includes("limit") ? "limit" : message.includes("connections") ? "connection" : "read";
      this.publish({ ...initial, phase: "error", issue });
    }
  };
  start = async () => {
    if (this.state.phase !== "ready" || !this.state.report || !this.plan || !this.available()) return;
    const generation = ++this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const report = this.state.report;
    this.publish({ ...this.state, phase: "running", result: null, issue: null });
    try {
      const result = await this.run(this.plan, report, abort.signal, value => {
        if (generation === this.generation) this.publish({ ...this.state, result: value });
      });
      if (generation !== this.generation) return;
      this.abort = null;
      const phase = result.phase === "completed" && result.journalComplete ? "completed"
        : result.phase === "cancelled" ? "cancelled" : "error";
      this.publish({ ...this.state, phase, result, cancelling: false });
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof Error && error.message === "stale-connection-operation") {
        this.reset();
        return;
      }
      this.abort = null;
      this.publish({ ...this.state, phase: "error", issue: "read", cancelling: false });
    }
  };
}

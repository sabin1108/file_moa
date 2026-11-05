import type { RecoveryArchiveDetail, RecoveryArchiveList } from "../lib/recovery-archive";
import type { RecoveryRestoreController } from "./recovery-restore-controller";

type Phase = "idle" | "loading" | "ready" | "cancelled" | "error";
export type RecoveryArchiveState = Readonly<{
  open: boolean; phase: Phase; list: RecoveryArchiveList | null; issue: "permission" | "read" | null;
  detail: Readonly<{ id: string; phase: Phase; result: RecoveryArchiveDetail | null }> | null;
}>;
const initial: RecoveryArchiveState = { open: false, phase: "idle", list: null, issue: null, detail: null };

/** 목록/상세 요청 수명만 소유한다. 권한/핸들/읽기 검사는 session이 맡는다. */
export class RecoveryArchiveController {
  private state = initial;
  private generation = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly read: (signal: AbortSignal) => Promise<RecoveryArchiveList>,
    private readonly inspectItem: (id: string, signal: AbortSignal) => Promise<RecoveryArchiveDetail>, readonly restore?: RecoveryRestoreController) {}

  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: RecoveryArchiveState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private invalidate() { this.generation++; this.abort?.abort(); this.abort = null; }
  close = () => {
    if (this.restore?.getSnapshot().phase === "running") { this.restore.cancel(); return false; }
    this.restore?.reset();
    this.invalidate();
    this.publish(initial);
    return true;
  };
  dispose = () => { this.restore?.dispose(); this.invalidate(); this.publish(initial); };
  cancel = () => {
    this.invalidate();
    if (this.state.detail?.phase === "loading") this.publish({ ...this.state, detail: { ...this.state.detail, phase: "cancelled", result: null } });
    else if (this.state.phase === "loading") this.publish({ ...this.state, phase: "cancelled", list: null });
  };
  open = async () => {
    if (this.restore?.getSnapshot().phase === "running") return;
    this.restore?.reset();
    this.invalidate();
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.publish({ ...initial, open: true, phase: "loading" });
    try {
      const list = await this.read(abort.signal);
      if (generation !== this.generation) return;
      this.abort = null;
      this.publish({ ...this.state, phase: "ready", list });
    } catch (error) {
      if (generation !== this.generation) return;
      this.abort = null;
      if (error instanceof Error && error.message === "stale-connection-operation") { this.close(); return; }
      this.publish({ ...this.state, phase: error instanceof Error && error.name === "AbortError" ? "cancelled" : "error",
        issue: error instanceof Error && (error.name === "NotAllowedError" || error.name === "SecurityError") ? "permission" : "read" });
    }
  };
  refresh = () => this.state.open ? this.open() : Promise.resolve();
  inspect = async (id: string) => {
    if (this.restore?.getSnapshot().phase === "running") return;
    this.restore?.reset();
    if (!this.state.open || this.state.phase !== "ready" || !this.state.list?.items.some(item => item.id === id && item.canInspect)) return;
    this.invalidate();
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.publish({ ...this.state, detail: { id, phase: "loading", result: null } });
    try {
      const result = await this.inspectItem(id, abort.signal);
      if (generation !== this.generation) return;
      this.abort = null;
      this.publish({ ...this.state, detail: { id, phase: "ready", result } });
    } catch (error) {
      if (generation !== this.generation) return;
      this.abort = null;
      if (error instanceof Error && error.message === "stale-connection-operation") { this.close(); return; }
      this.publish({ ...this.state, detail: { id, phase: error instanceof Error && error.name === "AbortError" ? "cancelled" : "error", result: null } });
    }
  };
}

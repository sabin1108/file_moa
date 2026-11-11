/** 복사 버튼·취소·진행 결과의 수명. 취소 정산이 끝날 때까지 결과를 유지한다. */
import type { CopyInspection } from "../lib/copy-inspection";
import type { FileChangePlan } from "../lib/file-change-plan";
import type { CopyExecution } from "../services/copy-execution";

export type CopyRunner = (plan: FileChangePlan, inspected: CopyInspection, signal: AbortSignal, progress: (value: CopyExecution) => void) => Promise<CopyExecution>;

type State = Readonly<{
  running: boolean;
  cancelling: boolean;
  result: CopyExecution | null;
  issue: boolean
}>;

const initial: State = { running: false, cancelling: false, result: null, issue: false };

export class CopyExecutionController {
  private state = initial;
  private generation = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly run: CopyRunner) { }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(value: State) {
    this.state = value;
    this.listeners.forEach(listener => listener());
  }
  reset = () => {
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
    this.publish(initial);
  };
  cancel = () => {
    if (!this.state.running) return;

    this.abort?.abort();
    this.publish({ ...this.state, cancelling: true });
  };
  start = async (plan: FileChangePlan, inspected: CopyInspection) => {
    if (this.state.running || this.state.result) return;

    const generation = ++this.generation, abort = new AbortController();

    this.abort = abort;
    this.publish({ ...initial, running: true });

    try {
      const result = await this.run(plan, inspected, abort.signal, result => {
        if (generation === this.generation) this.publish({ ...this.state, result });
      });

      if (generation === this.generation) {
        this.abort = null;
        this.publish({ running: false, cancelling: false, result, issue: false });
      }
    } catch {
      if (generation === this.generation) {
        this.abort = null;
        this.publish({ ...this.state, running: false, cancelling: false, issue: true });
      }
    }
  };
}

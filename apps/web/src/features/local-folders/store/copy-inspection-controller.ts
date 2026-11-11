/** The report lifetime is owned by the plan. Reset never leaves a late Worker result visible. */
import type { CopyInspection } from "../lib/copy-inspection";
import type { FileChangePlan } from "../lib/file-change-plan";
import { waitForPendingFeedback } from "../lib/pending-feedback";

export type CopyInspectionIssue = "copy-limit" | "copy-conflict" | "source-changed" | "unsupported-hash" | "permission" | "read";

export type CopyInspectionState = Readonly<{
  phase: "idle" | "loading" | "ready" | "error";
  result: CopyInspection | null;
  issue: CopyInspectionIssue | null;
}>;

const initialState: CopyInspectionState = {
  phase: "idle",
  result: null,
  issue: null
};

const inspectionFailures = ["copy-limit", "copy-conflict", "source-changed", "unsupported-hash"] as const;

export class CopyInspectionController {
  private state = initialState;
  private generation = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly read: (plan: FileChangePlan, signal: AbortSignal) => Promise<CopyInspection>,
    private readonly onPermissionLost: () => void,
  ) { }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initialState;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(state: CopyInspectionState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  reset = () => {
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
    this.publish(initialState);
  };

  inspect = async (plan: FileChangePlan) => {
    const startedAt = Date.now();
    const generation = ++this.generation;

    this.abort?.abort();

    const abort = new AbortController();

    this.abort = abort;
    this.publish({
      phase: "loading",
      result: null,
      issue: null
    });

    try {
      const result = await this.read(plan, abort.signal);

      await waitForPendingFeedback(startedAt, abort.signal);

      if (generation !== this.generation) {
        return;
      }

      this.abort = null;
      this.publish({
        phase: "ready",
        result,
        issue: null
      });
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }

      this.abort = null;

      let issue: CopyInspectionIssue = "read";

      if (error instanceof Error) {
        issue = inspectionFailures.find(value => value === error.message) ?? "read";

        if (error.name === "NotAllowedError") {
          issue = "permission";
        }
      }

      this.publish({
        phase: "error",
        result: null,
        issue
      });

      if (issue === "permission") {
        this.onPermissionLost();
      }
    }
  };
}

/**
 * 계획 검토의 입력·읽기·취소 수명이다. connection store가 조립하고 dialog가 구독한다.
 * 선택의 소유자는 listing이다. 그 상태가 바뀌면 계획도 즉시 폐기해 연결/소유자 경계를 함께 따른다.
 */
import {
  buildFileChangePlan,
  classificationFolder,
  comparableName,
  parsePlanDestination,
  type FileChangePlan,
  type PlanDirectory,
  type PlanOperation
} from "./file-change-plan";
import type { FolderListing } from "../../browsing/source-folder-listing";
import type { SourceListingController } from "../../browsing/file-list/source-listing-controller";
import { DestinationPickerController } from "../../destination-picker/destination-picker-controller";
import { CopyInspectionController } from "../copying/copy-inspection-controller";
import type { CopyInspection } from "../copying/copy-inspection-rules";
import { CopyExecutionController, type CopyRunner } from "../copying/copy-execution-controller";
import { waitForPendingFeedback } from "../../pending-feedback";
import { RecoveryBackupController } from "../../recovery/backup/recovery-backup-controller";
import { conflictingBackupPlan } from "../../recovery/backup/recovery-backup-rules";
import type { ManagedResult } from "../managed/managed-files";

export type PlanReadIssue = "invalid-plan-path" | "source-changed" | "missing" | "read";

export type SourcePlanState = Readonly<{
  resumedOutcome?: ManagedResult | null;
  open: boolean;
  operation: PlanOperation;
  destination: string;
  destinationConfirmed: boolean;
  sourcePath: readonly string[];
  selectedNames: readonly string[];
  phase: "draft" | "loading" | "ready" | "error";
  result: FileChangePlan | null;
  issue: PlanReadIssue | null;
}>;

const initialState: SourcePlanState = {
  open: false,
  operation: "move",
  destination: "",
  destinationConfirmed: false,
  sourcePath: [],
  selectedNames: [],
  phase: "draft",
  result: null,
  issue: null
};

export class SourcePlanController {
  readonly destinationPicker: DestinationPickerController;
  readonly inspection: CopyInspectionController;
  readonly execution: CopyExecutionController;
  readonly backup: RecoveryBackupController;
  private state = initialState;
  private generation = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly listing: SourceListingController,
    private readonly read: (path: readonly string[], signal: AbortSignal) => Promise<FolderListing>,
    private readonly onPermissionLost: () => void,
    inspect: (plan: FileChangePlan, signal: AbortSignal) => Promise<CopyInspection> = async () => {
      throw new Error("unsupported-hash");
    },
    execute: CopyRunner = async () => {
      throw new Error("copy-unavailable");
    },
    backup = new RecoveryBackupController(async () => {
      throw Error("backup-unavailable");
    }, async () => {
      throw Error("backup-unavailable");
    }, () => false),
  ) {
    this.backup = backup;
    this.execution = new CopyExecutionController(execute);
    this.inspection = new CopyInspectionController(inspect, () => {
      this.close();
      this.onPermissionLost();
    });
    this.destinationPicker = new DestinationPickerController(read, () => {
      this.close();
      this.onPermissionLost();
    });
    // Both stores have the same owning connection lifetime; no window/global subscription.
    listing.subscribe(() => {
      if (!this.state.open) {
        return;
      }
      // 같은 연결의 갱신은 취소 정산 결과를 유지한다. 연결/소유자 해제는 이전 결과를 노출하지 않는다.

      if (this.execution.getSnapshot().running && listing.getSnapshot().available) {
        this.execution.cancel();

        return;
      }

      if (this.backup.getSnapshot().phase === "running" && listing.getSnapshot().available) {
        this.backup.cancel();

        return;
      }

      this.backup.reset();
      this.execution.reset();
      this.close();
    });
  }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initialState;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(state: SourcePlanState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  private invalidate() {
    this.backup.reset();
    this.execution.reset();
    this.inspection.reset();
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
  }

  open = (operation: "copy" | "move" = "move") => {
    const listing = this.listing.getSnapshot();

    if (!listing.available || listing.phase !== "ready" || listing.stale || !listing.result || !listing.selectedNames.length) {
      return;
    }

    if (listing.selectedNames.some(name => !listing.result!.entries.some(entry => entry.name === name && entry.kind === "file"))) {
      return;
    }

    this.destinationPicker.close();
    this.invalidate();
    this.publish({
      ...initialState,
      open: true,
      operation,
      sourcePath: [...listing.result.path],
      selectedNames: [...listing.selectedNames],
      destination: listing.result.path.join("/")
    });
  };

  close = () => {
    if (this.backup.getSnapshot().phase === "running") {
      this.backup.cancel();

      return;
    }

    if (this.execution.getSnapshot().running) {
      this.execution.cancel();

      return;
    }

    this.destinationPicker.close();
    this.invalidate();
    this.publish(initialState);
  };

  cancel = () => {
    if (this.backup.getSnapshot().phase === "running") return;

    if (this.execution.getSnapshot().running) {
      return;
    }

    this.destinationPicker.close();
    this.invalidate();
    this.publish({
      ...this.state,
      phase: "draft",
      result: null,
      issue: null,
      resumedOutcome: null
    });
  };

  setOperation = (operation: PlanOperation) => {
    if (this.backup.getSnapshot().phase === "running") return;

    if (this.execution.getSnapshot().running) {
      return;
    }

    this.cancel();
    this.publish({ ...this.state, operation });
  };

  setDestination = (destination: string, confirmed = true) => {
    if (this.backup.getSnapshot().phase === "running") return;

    if (this.execution.getSnapshot().running) {
      return;
    }

    this.cancel();
    this.publish({
      ...this.state,
      destination,
      destinationConfirmed: confirmed
    });
  };

  browseDestination = async (pathOverride?: readonly string[]) => {
    if (this.backup.getSnapshot().phase === "running") return;

    if (this.execution.getSnapshot().running) {
      return;
    }

    if (!this.state.open) {
      return;
    }

    this.cancel();

    let path: string[] = [];

    try {
      path = parsePlanDestination(this.state.destination);
    } catch { /* 잘못된 입력은 유지하고 연결 루트부터 다시 고른다. */ }

    await this.destinationPicker.show(pathOverride ?? path);
  };

  chooseDestination = () => {
    if (!this.state.open) {
      return;
    }

    const path = this.destinationPicker.selectedPath();

    if (path !== null) {
      this.setDestination(path.join("/"));
    }
  };

  inspectCopy = async () => {
    if (this.backup.getSnapshot().phase === "running") return;

    if (this.execution.getSnapshot().running) {
      return;
    }

    this.execution.reset();

    const { open, phase, result } = this.state;

    if (!open || phase !== "ready" || !result || result.operation !== "copy" || result.conflictCount
      || this.destinationPicker.getSnapshot().open) {
      return;
    }

    await this.inspection.inspect(result);
  };

  executeCopy = async () => {
    if (this.backup.getSnapshot().phase === "running") return;

    const { result, phase, open } = this.state;
    const inspected = this.inspection.getSnapshot().result;

    if (!open || phase !== "ready" || !result || !inspected || this.destinationPicker.getSnapshot().open) {
      return;
    }

    await this.execution.start(result, inspected);
  };
  /** 성공 확인은 실행을 반복하지 않는다. reset 전에 목적지 경로를 복사해 탐색 소유자에게 돌려준다. */

  completeCopy = (): readonly string[] | null => {
    const execution = this.execution.getSnapshot();

    if (!this.state.open || this.state.result?.operation !== "copy" || execution.running
      || execution.result?.phase !== "completed"
      || !execution.result.journalComplete) {
      return null;
    }

    const row = this.state.result.rows[0];

    if (!row) {
      return null;
    }

    const destination = [...row.to.slice(0, -1)];

    this.close();

    return destination;
  };

  generate = async () => {
    if (this.backup.getSnapshot().phase === "running") return;

    if (this.execution.getSnapshot().running) {
      return;
    }

    if (!this.state.open || !this.state.destinationConfirmed || this.destinationPicker.getSnapshot().open) {
      return;
    }

    this.invalidate();

    const generation = this.generation;
    const request = this.state;
    const startedAt = Date.now();
    const abort = new AbortController();

    this.abort = abort;
    this.publish({
      ...request,
      phase: "loading",
      issue: null
    });

    const read = async (path: readonly string[]) => {
      const result = await this.read(path, abort.signal);

      if (generation !== this.generation) {
        throw new DOMException("Plan cancelled", "AbortError");
      }

      return result;
    };

    try {
      const destinationPath = parsePlanDestination(request.destination);
      const source = await read(request.sourcePath);
      const files = new Set(source.entries.filter(entry => entry.kind === "file").map(entry => entry.name));

      if (request.selectedNames.some(name => !files.has(name))) {
        throw new Error("source-changed");
      }

      const base = await read(destinationPath);
      const destinations: PlanDirectory[] = [];

      if (request.operation !== "classify") {
        destinations.push({ ...base, availability: "existing" });
      } else {
        for (const name of new Set(request.selectedNames.map(classificationFolder))) {
          const path = [...destinationPath, name];
          const matches = base.entries.filter(entry => comparableName(entry.name) === comparableName(name));

          if (matches.length === 1 && matches[0].name === name && matches[0].kind === "directory") {
            destinations.push({ ...await read(path), availability: "existing" });
          } else if (matches.length) {
            destinations.push({
              path,
              entries: [],
              truncated: false,
              availability: "blocked"
            });
          } else {
            // An absent folder in an incomplete parent is unknown, never a safe creation proposal.
            destinations.push({
              path,
              entries: [],
              truncated: base.truncated,
              availability: base.truncated ? "existing" : "planned"
            });
          }
        }
      }

      const result = buildFileChangePlan({
        operation: request.operation,
        source,
        selectedNames: request.selectedNames,
        destinationPath,
        destinations
      });

      await waitForPendingFeedback(startedAt, abort.signal);

      if (generation !== this.generation) {
        return;
      }

      this.abort = null;
      this.publish({
        ...request,
        phase: "ready",
        result,
        issue: null
      });
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }

      this.abort = null;

      if (error instanceof Error && error.name === "NotAllowedError") {
        this.close();
        this.onPermissionLost();

        return;
      }

      let issue: PlanReadIssue = "read";

      if (error instanceof Error) {
        if (error.message === "invalid-plan-path" || error.message === "source-changed") {
          issue = error.message;
        } else if (error.name === "NotFoundError" || error.name === "TypeMismatchError") {
          issue = "missing";
        }
      }

      this.publish({
        ...request,
        phase: "error",
        result: null,
        issue
      });
    }
  };

  inspectBackup = async () => {
    if (!this.state.open || this.state.phase !== "ready" || !this.state.result
      || this.execution.getSnapshot().running
      || this.destinationPicker.getSnapshot().open) return;

    const plan = conflictingBackupPlan(this.state.result);

    if (plan) await this.backup.inspect(plan);
  };
  restoreOutcome = (outcome: ManagedResult) => this.publish({ ...this.state, resumedOutcome: outcome });
}

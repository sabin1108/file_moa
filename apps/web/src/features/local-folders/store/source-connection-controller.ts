/**
 * 연결·재연결·해제의 진행 상태와 결과를 관리한다. hook에서 생성하고 연결 설정 UI가 조작한다.
 * 실제 권한/저장은 services/connection-session에 맡기며, 연결 변경 때 목록·본문 store의 수명을 함께 맞춘다.
 */
import type {
  ConnectionOwner,
  FolderConnectionView,
  FolderHandle,
  SourceFolderConnection,
} from "../types";
import { FolderConnectionSession } from "../services/connection-session";
import { SourceListingController } from "./source-listing-controller";
import { SourcePreviewController } from "./source-preview-controller";
import { SourcePlanController } from "./source-plan-controller";
import { SourceNavigationController } from "./source-navigation-controller";
import { FolderTrailController } from "./folder-trail-controller";
import { FolderSearchController } from "./folder-search-controller";
import { RecoveryBackupController } from "./recovery-backup-controller";
import { OrganizationPreparationController } from "./organization-preparation-controller";
import { OrganizationExecutionController } from "./organization-execution-controller";
import { DocumentFindController } from "./document-find-controller";

type Action = "connect" | "reconnect" | "disconnect";
type Notice = Readonly<{
  state: "success" | "attention" | "error";
  title: string;
  detail?: string;
}>;
export type SourceConnectionState = Readonly<{
  phase:
    | "loading"
    | "ready"
    | "load-error"
    | "disconnect-error"
    | "unsupported";
  view: FolderConnectionView | null;
  pending: Action | null;
  notice: Notice | null;
  sources: readonly SourceFolderConnection[];
}>;
const initialState: SourceConnectionState = {
  phase: "loading",
  view: null,
  pending: null,
  notice: null,
  sources: [],
};

const successes: Record<Action, string> = {
  connect: "자료 폴더를 연결했어요.",
  reconnect: "자료 폴더에 다시 연결했어요.",
  disconnect: "연결 정보를 지웠어요. 원본 폴더는 그대로입니다.",
};
function failure(action: Action, error: unknown): Notice {
  if (action === "disconnect") {
    return {
      state: "error",
      title: "저장된 연결 정보를 지우지 못했어요.",
      detail:
        "현재 화면의 연결은 중지했습니다. 새로고침하면 연결 정보가 다시 나타날 수 있으니 해제를 다시 시도해 주세요.",
    };
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") {
    return {
      state: "attention",
      title: "폴더 연결을 마치지 않았어요.",
      detail:
        "선택 취소 또는 접근 제한일 수 있습니다. 기존 연결은 유지했습니다.",
    };
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      state: "attention",
      title: "폴더 접근을 허용하지 못했어요.",
      detail: "버튼을 다시 눌러 브라우저의 읽기 권한을 확인해 주세요.",
    };
  }
  return {
    state: "error",
    title: "폴더 연결 처리에 실패했어요.",
    detail:
      "권한 확인 또는 연결 정보 저장에 실패했을 수 있습니다. 기존 연결 정보는 유지했습니다. 다시 시도해 주세요.",
  };
}

/** 화면의 작업 상태를 관리한다. 핸들은 session, 구독 수명은 React hook이 맡는다. */
export class SourceConnectionController {
  readonly listing: SourceListingController;
  readonly preview: SourcePreviewController;
  readonly plan: SourcePlanController;
  readonly navigation: SourceNavigationController;
  readonly trail: FolderTrailController;
  readonly search: FolderSearchController;
  readonly organization: OrganizationPreparationController;
  readonly organizationExecution: OrganizationExecutionController;
  readonly finding: DocumentFindController;
  private state = initialState;
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(
    private readonly session: FolderConnectionSession,
    private readonly picker: (options: {
      mode: "read" | "readwrite";
    }) => Promise<FolderHandle>,
  ) {
    this.listing = new SourceListingController(
      (path, signal) => this.session.listSourceFolder(path, signal),
      () => this.permissionLost(),
    );
    this.preview = new SourcePreviewController(
      (path, signal, expectation) => this.session.readSourceFile(path, signal, expectation),
      () => this.permissionLost(),
    );
    this.plan = new SourcePlanController(
      this.listing,
      (path, signal) => this.session.listSourceFolder(path, signal),
      () => this.permissionLost(),
      (plan, signal) => this.session.inspectSourceCopy(plan, signal),
      this.session.executeSourceCopy,
      new RecoveryBackupController(
        this.session.inspectSourceBackup,
        this.session.executeSourceBackup,
        () => this.session.view("recovery").status === "connected",
        this.session.executeSourceOverwrite,
        this.session.discardSourceOverwrite,
      ),
    );
    this.navigation = new SourceNavigationController(
      this.listing,
      this.preview,
    );
    this.trail = new FolderTrailController(this.listing);
    this.search = new FolderSearchController(
      this.listing,
      session.searchSourceFolder,
      () => this.permissionLost(),
    );
    this.organization = new OrganizationPreparationController(
      session.inspectSourceSnapshot,
      (path, signal) => session.listSourceFolder(path, signal),
      () => this.permissionLost(),
      session.recheckSourceSnapshot,
      session.inferOrganization,
    );
    this.organizationExecution = new OrganizationExecutionController(
      this.organization,
      session,
      () => this.permissionLost(),
    );
    this.finding = new DocumentFindController(session.findSourceDocuments, () =>
      this.permissionLost(),
    );
  }

  private permissionLost() {
    this.listing.permissionLost();
    this.preview.permissionLost();
    this.publish({
      ...this.state,
      view: this.session.view("source"),
      notice: null,
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

  private publish(state: SourceConnectionState) {
    this.organization.reset();
    this.finding.reset();
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  async load(owner: ConnectionOwner): Promise<void> {
    const generation = ++this.generation;
    this.listing.reset(false);
    this.preview.reset(false);
    this.publish(initialState);
    try {
      await this.session.switchOwner(owner);
      if (generation !== this.generation) return;
      await this.session.resumeGrantedConnections();
      if (generation !== this.generation) return;
      const available = this.session.view("source").status === "connected";
      this.listing.reset(available);
      this.preview.reset(available);
      this.publish({
        phase: "ready",
        view: this.session.view("source"),
        pending: null,
        notice: null,
        sources: await this.session.listSourceConnections(),
      });
    } catch {
      if (generation !== this.generation) return;
      this.publish({
        phase: "load-error",
        view: null,
        pending: null,
        sources: [],
        notice: {
          state: "error",
          title: "저장된 연결 정보를 불러오지 못했어요.",
          detail:
            "브라우저 저장소를 사용할 수 있는지 확인한 뒤 다시 불러와 주세요.",
        },
      });
    }
  }

  stop() {
    ++this.generation;
    this.listing.reset(false);
    this.preview.reset(false);
    void this.session.switchOwner(null);
    this.publish(initialState);
  }

  unavailable(reason: string) {
    ++this.generation;
    this.listing.reset(false);
    this.preview.reset(false);
    void this.session.switchOwner(null);
    this.publish({
      phase: "unsupported",
      view: null,
      pending: null,
      sources: [],
      notice: {
        state: "attention",
        title: "이 환경에서는 폴더 연결을 사용할 수 없어요.",
        detail: reason,
      },
    });
  }

  connect = () => this.run("connect");
  reconnect = () => this.run("reconnect");
  disconnect = () => this.run("disconnect");
  activateSource = (connectionId: string) => {
    if (this.state.pending || this.state.phase !== "ready" || this.organizationExecution.managed.getSnapshot().phase === "running") return Promise.resolve(false);
    const source = this.state.sources.find(item => item.connectionId === connectionId);
    if (!source) return Promise.resolve(false);
    const permission = source.handle.requestPermission({ mode: "read" });
    return this.runSourceSwitch(() => this.session.activateSourceConnection(connectionId, permission));
  };
  disconnectSource = async (connectionId: string) => this.runSourceSwitch(() => this.session.disconnectSourceConnection(connectionId));

  private async runSourceSwitch(action: () => Promise<void>): Promise<boolean> {
    if (this.state.pending || this.state.phase !== "ready" || this.organizationExecution.managed.getSnapshot().phase === "running") return false;
    const generation = this.generation;
    this.listing.reset(false);
    this.preview.reset(false);
    this.publish({ ...this.state, pending: "reconnect", notice: null });
    try {
      await action();
      const sources = await this.session.listSourceConnections();
      if (generation !== this.generation) return false;
      this.publish({ ...this.state, view: this.session.view("source"), pending: null, sources });
      const connected = this.session.state("source") === "connected";
      this.listing.reset(connected); this.preview.reset(connected);
      return true;
    } catch (error) {
      const sources = await this.session.listSourceConnections();
      if (generation !== this.generation) return false;
      this.publish({ ...this.state, pending: null, notice: failure("reconnect", error), sources });
      return false;
    }
  }

  /** 이번 요청의 완료 여부를 반환한다. 이전 connected 상태로 성공을 추측하지 않도록 한다. */
  private async run(action: Action): Promise<boolean> {
    const canRetryRemoval =
      this.state.phase === "disconnect-error" && action === "disconnect";
    if (
      this.state.pending ||
      (this.state.phase !== "ready" && !canRetryRemoval)
    )
      return false;
    const generation = this.generation;
    if (action === "disconnect") {
      this.listing.reset(false);
      this.preview.reset(false);
    } else {
      this.listing.suspend();
      this.preview.suspend();
    }
    this.publish({ ...this.state, pending: action, notice: null });
    try {
      // 브라우저는 클릭에 이어진 권한 요청만 허용한다. 이 호출 전에 await를 넣지 않는다.
      let task: Promise<void>;
      if (action === "connect") {
        task = this.session.select("source", this.picker);
      } else if (action === "reconnect") {
        task = this.session.reconnect("source");
      } else {
        task = this.session.disconnect("source");
      }
      this.publish({ ...this.state, view: this.session.view("source") });
      await task;
      if (generation !== this.generation) return false;
      this.publish({
        phase: "ready",
        view: this.session.view("source"),
        pending: null,
        notice: { state: "success", title: successes[action] },
        sources: await this.session.listSourceConnections(),
      });
      if (action === "connect") {
        this.listing.reset(true);
        this.preview.reset(true);
      } else if (action === "reconnect") {
        this.listing.resume(true, true);
        this.preview.resume(true, true);
      } else if (this.session.state("source") === "connected") {
        this.listing.reset(true);
        this.preview.reset(true);
      }
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.publish({
        phase: action === "disconnect" ? "disconnect-error" : "ready",
        view: this.session.view("source"),
        pending: null,
        sources: await this.session.listSourceConnections(),
        notice: failure(action, error),
      });
      this.listing.resume(this.session.state("source") === "connected");
      this.preview.resume(this.session.state("source") === "connected");
      return false;
    }
  }
}

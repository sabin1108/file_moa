/**
 * 브라우저 폴더 연결의 핵심 서비스다. 연결 controller가 호출하며 소유자·권한·연결 세대를 검증한다.
 * 핸들 저장은 handle-repository, 직계 목록/원문 읽기는 같은 services의 reader에 위임한다. 실제 로그인 인증 자체는 별도다.
 */
import {
  connectionKey,
  validateFolderHandle,
} from "./connection/connection-validation";
import { LIVE_ORGANIZATION_LIMITS } from "../../shared/live-organization-limits";
import { sourceFileExpectationSchema, type SourceFileExpectation } from "../../shared/grounded-evidence";
import type {
  ConnectionOwner,
  FolderConnectionView,
  FolderHandle,
  FolderKind,
  HandleRepository,
  SourceFolderConnection,
  SourceFolderRepository,
} from "./types";
import {
  readSourceFolderListing,
  type FolderListing,
} from "./browsing/source-folder-listing";
import {
  readSourceFilePreview,
  type SourceFilePreview,
} from "./documents/preview/source-file-preview";
import { searchFolderTree } from "./browsing/search/folder-tree-search";
import { inspectCopyPlan } from "./operations/copying/copy-inspection";
import type { CopyInspection } from "./operations/copying/copy-inspection-rules";
import type { FileChangePlan } from "./operations/planning/file-change-plan";
import { createEntry } from "./creation/create-entry";
import type { EntryKind } from "./creation/new-entry";
import { DirectoryFolderCreationJournal } from "./creation/folder-creation-journal";
import { readFolderHistory } from "./history/folder-history";
import { inspectHistoryTarget } from "./history/history-target-inspection";
import type { HistoryGroup } from "./history/folder-history-rules";
import { executeCopy, type CopyExecution } from "./operations/copying/copy-execution";
import { readCopyHistory } from "./operations/copying/copy-journal-storage";
import { readRestoreHistory } from "./recovery/restore/recovery-restore-history";
import { inspectRestoredFile } from "./history/restore-history-inspection";
import type { RestoreHistoryGroup } from "./recovery/restore/recovery-restore-history-rules";
import { inspectCopyHistoryTargets } from "./operations/copying/copy-history-inspection";
import type { CopyGroup } from "./operations/copying/copy-journal";
import {
  assertVaultLocation,
  assertVaultParentLocation,
} from "./recovery/recovery-vault-location";
import { recoveryStage } from "./recovery/recovery-connection-error";
import { createRecoveryVault } from "./recovery/create-recovery-vault";
import { readVaultIdentity } from "./recovery/recovery-vault";
import {
  inspectRecoveryBackup,
  type BackupEntryIdentity,
} from "./recovery/backup/recovery-backup-input";
import { executeRecoveryBackup, type BackupExecution } from "./recovery/backup/recovery-backup";
import type { BackupInspection } from "./recovery/backup/recovery-backup-rules";
import {
  executeRecoveryOverwrite,
  type OverwriteExecution,
} from "./recovery/backup/recovery-overwrite";
import {
  readRecoveryArchive,
  inspectRecoveryArchiveItem,
  type RecoveryArchiveSnapshot,
} from "./recovery/archive/recovery-archive";
import { createCopyHasher } from "./content/copy-hash";
import { mergeFindDocuments, rankFindDocuments } from "./search/documents/document-find-ranking";
import { SemanticModelController } from "./search/semantic/semantic-model-controller";
import { prepareSemanticSource, semanticSourceMatches } from "./search/semantic/semantic-source";
import { readInstalledModel } from "./search/semantic/model-assets";
import {
  prepareRecoveryRestore,
  executeRecoveryRestore,
  type PreparedRestore,
} from "./recovery/restore/recovery-restore";
import type { RestorePreview, RestoreExecution } from "./recovery/restore/recovery-restore-rules";
import type {
  ManagedRequest,
  ManagedPreview,
  ManagedResult,
} from "./operations/managed/managed-files";
import {
  prepareManagedOperation,
  readManagedEdit,
  type PreparedManaged,
  type EditBaseline,
} from "./operations/managed/managed-inspection";
import { executeManagedOperation } from "./operations/managed/managed-execution";
import { readManagedArchiveList } from "./operations/managed/managed-archive";
import { WorkflowDraftRepository, type WorkflowDraft } from "./workflow/workflow-drafts";
import { InlineEditorSession } from "./documents/editing/inline-editor-session";
import { readSourceSnapshot } from "./organization/source-snapshot";
import { readOrganizationFolders } from "./organization/organization-reference";
import { inferOrganizationConditions } from "./organization/organization-intent";
import { LocalTextIndex, LOCAL_TEXT_INDEX_VERSION, withLocalIndexLock, tryWithLocalIndexLock } from "./search/documents/local-text-index";
import { assertOrganizationBaseline } from "./organization/organization-operation";
import type {
  OrganizationScope,
  SnapshotDocument,
  ReferenceSnapshot,
} from "./organization/source-snapshot-rules";
import type {
  FindQuery,
  FindResult,
  FindableSnapshot,
} from "./search/documents/document-find";

const snapshotRuntime = {
  createReader: createCopyHasher,
  createIndex: () => new LocalTextIndex(),
  now: Date.now,
  parserVersion: LOCAL_TEXT_INDEX_VERSION,
};

type Slot = {
  handle?: FolderHandle;
  connected: boolean;
  sequence: number
};

const emptySlots = (): Record<FolderKind, Slot> => ({
  source: { connected: false, sequence: 0 },
  "ai-records": { connected: false, sequence: 0 },
  recovery: { connected: false, sequence: 0 },
});
const modeFor = (kind: FolderKind) =>
  kind === "source" ? ("read" as const) : ("readwrite" as const);

/** Owner comes from the trusted authentication boundary; this class does not authenticate callers. */

export class FolderConnectionSession {
  private owner: ConnectionOwner | null = null;
  private generation = 0;
  private listingSequence = 0;
  private searchSequence = 0;
  private previewSequence = 0;
  private snapshotSequence = 0;
  private inspectionSequence = 0;
  private ready = false;
  private inspectedCopy: {
    plan: string;
    report: CopyInspection;
    generation: number;
    sequence: number;
  } | null = null;
  private copying = false;
  private backingUp = false;
  private backupSequence = 0;
  private archiveSequence = 0;
  private archiveSnapshot: RecoveryArchiveSnapshot | null = null;
  private restoring = false;
  private managedPrepared: PreparedManaged | null = null;
  private editBaseline: EditBaseline | null = null;
  private managedSequence = 0;
  private managedExecuting = false;
  private readonly drafts = new WorkflowDraftRepository();
  private readonly inlineEditor = new InlineEditorSession(
    () => this.backupContext(),
    () => this.copying || this.backingUp || this.restoring,
    (value) => {
      this.backingUp = value;
    },
    () => typeof navigator === "undefined" || !navigator.userActivation || navigator.userActivation.isActive,
    async work => { await navigator.locks.request("moa-folder-creation", work); },
  );
  private restoreSequence = 0;
  private preparedRestore: PreparedRestore | null = null;
  private inspectedBackup: {
    plan: string;
    report: BackupInspection;
    generation: number;
    sourceSequence: number;
    vaultSequence: number;
  } | null = null;
  private completedBackup: {
    plan: string;
    report: BackupInspection;
    result: BackupExecution;
    sequence: number;
    generation: number;
    sourceSequence: number;
    vaultSequence: number;
    identity: BackupEntryIdentity;
  } | null = null;
  private pendingRecoveryCreation: {
    parent: FolderHandle;
    operation: ReturnType<FolderConnectionSession["recoveryOperation"]>;
  } | null = null;
  private slots = emptySlots();
  private sourceConnectionId = "legacy";
  readonly semanticModel = new SemanticModelController();
  constructor(private readonly repository: HandleRepository) { }

  state(kind: FolderKind): FolderConnectionView["status"] {
    return this.view(kind).status;
  }

  /** A fresh display snapshot; reading it does not request permission or access storage. */
  view(kind: FolderKind): FolderConnectionView {
    if (kind !== "source" && kind !== "ai-records" && kind !== "recovery") {
      throw Error("invalid-folder-kind");
    }

    const slot = this.slots[kind];

    if (!slot.handle) return { status: "disconnected", folderName: null };

    const connected =
      slot.connected && (kind !== "recovery" || this.slots.source.connected);

    return {
      status: connected ? "connected" : "needs-permission",
      folderName: slot.handle.name,
    };
  }

  aiRecordAccess = async () => {
    const owner = this.owner;
    const slot = this.slots["ai-records"];
    const directory = slot.handle;
    const generation = this.generation;
    const sequence = slot.sequence;

    if (!owner || !this.ready || !directory) throw new Error("ai-records-not-connected");

    const assertCurrent = () => {
      if (owner !== this.owner || generation !== this.generation || slot !== this.slots["ai-records"]
        || sequence !== slot.sequence) {
        throw new Error("stale-connection-operation");
      }
    };

    if (await directory.queryPermission({ mode: "readwrite" }) !== "granted") {
      slot.connected = false;

      throw new DOMException("AI records permission required", "NotAllowedError");
    }

    assertCurrent();
    slot.connected = true;

    return { directory, owner, assertCurrent };
  };

  async switchOwner(next: ConnectionOwner | null): Promise<void> {
    this.semanticModel.stop();
    this.inlineEditor.invalidate();
    this.discardManaged();
    this.editBaseline = null;
    this.restoreSequence++;
    this.preparedRestore = null;
    this.archiveSequence++;
    this.archiveSnapshot = null;
    this.completedBackup = null;
    this.pendingRecoveryCreation = null;

    const generation = ++this.generation;

    this.owner = null;
    this.ready = false;
    this.slots = emptySlots();
    this.sourceConnectionId = "legacy";

    if (!next) {
      this.ready = true;

      return;
    }

    connectionKey(next, "source");

    const owner = Object.freeze({
      userId: next.userId,
      workspaceId: next.workspaceId,
    });

    this.owner = owner;

    let source: FolderHandle | undefined,
      records: FolderHandle | undefined,
      recovery: FolderHandle | undefined;

    try {
      [source, records, recovery] = await Promise.all([
        this.repository.read(owner, "source"),
        this.repository.read(owner, "ai-records"),
        this.repository.read(owner, "recovery"),
      ]);
    } catch (error) {
      if (generation !== this.generation)
        throw new Error("stale-connection-operation");

      throw error;
    }

    if (generation !== this.generation)
      throw new Error("stale-connection-operation");

    if ("listSource" in this.repository) {
      const sources = await (this.repository as SourceFolderRepository).listSource(owner);

      if (generation !== this.generation) throw new Error("stale-connection-operation");

      const active = sources.find(item => item.active) ?? sources[0];

      if (active) {
        source = active.handle;
        this.sourceConnectionId = active.connectionId;
      }
    }

    if (source) validateFolderHandle(source);

    if (records) validateFolderHandle(records);

    if (recovery) validateFolderHandle(recovery);

    this.slots.source.handle = source;
    this.slots["ai-records"].handle = records;
    this.slots.recovery.handle = recovery;
    this.ready = true;
  }

  private begin(kind: FolderKind) {
    if (!this.owner) throw new Error("no-connection-owner");

    connectionKey(this.owner, kind);

    if (!this.ready) throw new Error("connection-not-ready");

    if (kind === "source") {
      this.cancelRecovery();
    }

    const owner = this.owner,
      generation = this.generation,
      slot = this.slots[kind];
    const sequence = ++slot.sequence;

    return {
      owner,
      slot,
      assertCurrent: () => {
        if (generation !== this.generation || sequence !== slot.sequence)
          throw new Error("stale-connection-operation");
      },
    };
  }

  /** F5 재진입: 이미 허용된 권한만 확인한다. 권한창/쓰기/자동 실행은 열지 않는다. */
  resumeGrantedConnections = async () => {
    const generation = this.generation;
    const source = this.slots.source;
    const recovery = this.slots.recovery;
    const owner = this.owner;
    const check = () => {
      if (
        generation !== this.generation ||
        source !== this.slots.source ||
        owner !== this.owner
      )
        throw Error("stale-connection-operation");
    };

    if (!owner || !source.handle || !this.ready) return;

    const permission = await source.handle.queryPermission({ mode: "read" });

    check();

    if (permission !== "granted") return;

    source.connected = true;

    if (!recovery.handle) return;

    try {
      if (
        (await recovery.handle.queryPermission({ mode: "read" })) !== "granted"
      )
        return;

      check();
      await this.validateRecovery(
        recovery.handle,
        owner,
        [source.handle],
        check,
      );
      check();
      recovery.connected = true;
    } catch {
      check();
      recovery.connected = false;
    }
  };

  async select(
    kind: FolderKind,
    picker: (options: { mode: "read" | "readwrite" }) => Promise<FolderHandle>,
  ): Promise<void> {
    if (kind === "recovery") throw Error("use-recovery-vault-action");

    const operation = this.begin(kind);

    try {
      const selected = await picker({ mode: modeFor(kind) });

      operation.assertCurrent();
      validateFolderHandle(selected);

      if (
        (await selected.queryPermission({ mode: modeFor(kind) })) !== "granted"
      ) {
        operation.assertCurrent();

        throw new DOMException("Folder permission required", "NotAllowedError");
      }

      operation.assertCurrent();

      if (kind === "source" || kind === "ai-records") {
        const others = kind === "source" ? [this.slots["ai-records"].handle] : [this.slots.source.handle, this.slots.recovery.handle];

        if (kind === "ai-records" && "listSource" in this.repository) {
          const sources = await (this.repository as SourceFolderRepository).listSource(operation.owner);

          operation.assertCurrent();
          others.push(...sources.map(source => source.handle));
        }

        for (const other of others) {
          if (!other) continue;

          if (await selected.isSameEntry(other) || await selected.resolve(other) !== null || await other.resolve(selected) !== null) {
            throw new Error("ai-records-overlap");
          }

          operation.assertCurrent();
        }
      }

      if (kind === "source" && "writeSource" in this.repository) {
        const repository = this.repository as SourceFolderRepository;
        const connections = await repository.listSource(operation.owner);

        operation.assertCurrent();

        let id = `source-${crypto.randomUUID()}`;

        for (const connection of connections) {
          if (await selected.isSameEntry(connection.handle)) {
            id = connection.connectionId;

            break;
          }

          operation.assertCurrent();
        }

        if (id !== "legacy") await repository.writeSource(operation.owner, id, selected);

        await repository.setActiveSource(operation.owner, id);
        operation.assertCurrent();
        this.sourceConnectionId = id;
      } else {
        await this.repository.write(operation.owner, kind, selected);
      }

      operation.assertCurrent();
      operation.slot.handle = selected;
      operation.slot.connected = true;
    } catch (error) {
      operation.assertCurrent();

      throw error;
    }
  }

  async listSourceConnections(): Promise<readonly SourceFolderConnection[]> {
    if (!("listSource" in this.repository) || !this.owner) return [];

    return (this.repository as SourceFolderRepository).listSource(this.owner);
  }

  async activateSourceConnection(connectionId: string, permission?: Promise<PermissionState>): Promise<void> {
    const operation = this.begin("source");

    if (!("readSource" in this.repository)) throw new Error("source-connections-unavailable");

    const repository = this.repository as SourceFolderRepository;
    const handle = await repository.readSource(operation.owner, connectionId);

    operation.assertCurrent();

    if (!handle) throw new Error("source-connection-not-found");

    const records = this.slots["ai-records"].handle;

    if (records
      && (await records.isSameEntry(handle) || await records.resolve(handle) !== null || await handle.resolve(records) !== null)) throw new Error("ai-records-overlap");

    operation.assertCurrent();

    if ((await (permission ?? handle.queryPermission({ mode: "read" }))) !== "granted") throw new DOMException("Folder permission required", "NotAllowedError");

    operation.assertCurrent();
    await repository.setActiveSource(operation.owner, connectionId);
    operation.assertCurrent();
    operation.slot.handle = handle;
    operation.slot.connected = true;
    this.sourceConnectionId = connectionId;
  }

  async disconnectSourceConnection(connectionId: string): Promise<void> {
    const operation = this.begin("source");

    if (!("removeSource" in this.repository)) throw new Error("source-connections-unavailable");

    const repository = this.repository as SourceFolderRepository;

    this.snapshotSequence++;
    const scope = { owner: operation.owner.userId, workspace: operation.owner.workspaceId, connection: connectionId };

    await withLocalIndexLock(scope, async () => {
      operation.assertCurrent();
      await new LocalTextIndex().clear(scope, operation.assertCurrent);
      operation.assertCurrent();
      await repository.removeSource(operation.owner, connectionId);
      operation.assertCurrent();
    });

    const remaining = await repository.listSource(operation.owner);

    operation.assertCurrent();

    if (remaining.length === 0) {
      operation.slot.handle = undefined;
      operation.slot.connected = false;

      return;
    }

    const next = remaining.find(item => item.active) ?? remaining[0];

    await repository.setActiveSource(operation.owner, next.connectionId);
    operation.assertCurrent();
    operation.slot.handle = next.handle;
    operation.slot.connected = (await next.handle.queryPermission({ mode: "read" })) === "granted";
    operation.assertCurrent();
    this.sourceConnectionId = next.connectionId;
  }

  async reconnect(kind: FolderKind): Promise<void> {
    if (kind === "recovery") {
      return this.reconnectRecovery();
    }

    const operation = this.begin(kind);
    const handle = operation.slot.handle;

    if (!handle) throw new Error("no-folder-connection");

    operation.slot.connected = false;

    try {
      // Deliberately no await before requestPermission: called by an explicit user gesture.
      const permission = await handle.requestPermission({
        mode: modeFor(kind),
      });

      operation.assertCurrent();

      if (permission !== "granted")
        throw new DOMException("Folder permission required", "NotAllowedError");

      operation.slot.connected = true;
    } catch (error) {
      operation.assertCurrent();

      throw error;
    }
  }

  cancelRecovery = () => {
    this.inlineEditor.invalidate();
    this.discardManaged();
    this.editBaseline = null;
    this.restoreSequence++;
    this.preparedRestore = null;
    this.archiveSequence++;
    this.archiveSnapshot = null;
    this.completedBackup = null;
    this.pendingRecoveryCreation = null;
    this.backupSequence++;
    this.inspectedBackup = null;
    this.slots.recovery.sequence++;
    this.slots.recovery.connected = false;
  };

  private recoveryOperation() {
    const operation = this.begin("recovery");
    const source = this.slots.source;
    const root = source.handle;
    const sequence = source.sequence;

    if (!root || !source.connected) throw Error("source-folder-not-connected");

    const check = () => {
      operation.assertCurrent();

      if (
        source.handle !== root ||
        source.sequence !== sequence ||
        !source.connected
      ) {
        throw Error("stale-connection-operation");
      }
    };

    return { ...operation, roots: [root], check };
  }

  /** picker는 클릭 흐름에서 즉시 시작한다. 검증된 보관함만 별도 recovery 키에 저장한다. */
  selectRecovery = async (
    picker: (options: { mode: "read" | "readwrite" }) => Promise<FolderHandle>,
    create: boolean,
  ) => {
    const operation = this.recoveryOperation();
    const selected = await recoveryStage("select-location", () =>
      picker({ mode: create ? "readwrite" : "read" }),
    );

    operation.check();
    validateFolderHandle(selected);

    const directory = create
      ? await navigator.locks.request("moa-recovery-vault-creation", () =>
        createRecoveryVault(
          selected,
          operation.owner,
          operation.roots,
          operation.check,
        ),
      )
      : selected;

    operation.check();
    await recoveryStage("verify-identity", () =>
      this.validateRecovery(
        directory,
        operation.owner,
        operation.roots,
        operation.check,
      ),
    );
    await recoveryStage("save-connection", () =>
      this.repository.write(operation.owner, "recovery", directory),
    );
    operation.check();
    operation.slot.handle = directory;
    operation.slot.connected = true;
  };

  /** 1단계는 읽기 picker로 생성 위치만 고른다. 파일/폴더는 만들지 않는다. */
  prepareRecoveryCreation = async (
    picker: (options: { mode: "read" | "readwrite" }) => Promise<FolderHandle>,
  ) => {
    this.pendingRecoveryCreation = null;

    const operation = this.recoveryOperation();
    const parent = await recoveryStage("select-location", () =>
      picker({ mode: "read" }),
    );

    operation.check();
    validateFolderHandle(parent);
    await recoveryStage("check-location", () =>
      assertVaultParentLocation(parent, operation.roots, operation.check),
    );
    operation.check();
    this.pendingRecoveryCreation = { parent, operation };

    return { folderName: parent.name };
  };

  /** 별도 생성 클릭에서 권한을 먼저 요청한다. picker 선택을 실제 생성으로 표시하지 않는다. */
  createPreparedRecovery = async () => {
    const pending = this.pendingRecoveryCreation;

    if (!pending) throw Error("recovery-creation-location-required");

    const { parent, operation } = pending;

    operation.check();
    await recoveryStage("request-write", async () => {
      // 이 호출 앞에는 await가 없다. 생성 버튼의 사용자 제스처를 유지한다.
      const permission = await parent.requestPermission({ mode: "readwrite" });

      operation.check();

      if (permission !== "granted")
        throw new DOMException(
          "Vault write permission required",
          "NotAllowedError",
        );
    });

    const directory = await recoveryStage("create-directory", () =>
      navigator.locks.request("moa-recovery-vault-creation", () =>
        createRecoveryVault(
          parent,
          operation.owner,
          operation.roots,
          operation.check,
        ),
      ),
    );

    operation.check();
    await recoveryStage("verify-identity", () =>
      this.validateRecovery(
        directory,
        operation.owner,
        operation.roots,
        operation.check,
      ),
    );
    await recoveryStage("save-connection", () =>
      this.repository.write(operation.owner, "recovery", directory),
    );
    operation.check();
    operation.slot.handle = directory;
    operation.slot.connected = true;
    this.pendingRecoveryCreation = null;
  };

  private async validateRecovery(
    directory: FolderHandle,
    owner: ConnectionOwner,
    roots: readonly FolderHandle[],
    check: () => void,
  ) {
    await assertVaultLocation(directory, roots, check);

    const identity = await readVaultIdentity(directory, owner, check);

    check();

    if (identity.status !== "ready")
      throw Error(`recovery-vault-${identity.status}`);

    await assertVaultLocation(directory, roots, check);
  }

  reconnectRecovery = async () => {
    const operation = this.recoveryOperation();
    const directory = operation.slot.handle;

    if (!directory) throw Error("no-folder-connection");

    operation.slot.connected = false;

    const permission = await directory.requestPermission({ mode: "read" });

    operation.check();

    if (permission !== "granted")
      throw new DOMException("Vault permission required", "NotAllowedError");

    await this.validateRecovery(
      directory,
      operation.owner,
      operation.roots,
      operation.check,
    );
    operation.check();
    operation.slot.connected = true;
  };

  /** 저장된 핸들/권한을 실제 존재로 간주하지 않는다. 읽기만 하며 사라진 보관함을 만들지 않는다. */
  checkRecoveryPresence = async (): Promise<
    "connected" | "missing" | "permission" | "invalid" | "idle"
  > => {
    const slot = this.slots.recovery;

    if (
      !slot.connected ||
      !slot.handle ||
      !this.slots.source.connected ||
      !this.owner
    )
      return "idle";

    const context = this.backupContext();
    let failure: "missing" | "permission" | "invalid" = "invalid";

    try {
      const identity = await readVaultIdentity(
        context.vault,
        context.owner,
        context.check,
      );

      context.check();

      if (identity.status === "ready") {
        await assertVaultLocation(context.vault, [context.root], context.check);
        context.check();

        return "connected";
      }

      failure = identity.status === "missing" ? "missing" : "invalid";
    } catch (error) {
      context.check();
      failure =
        error instanceof Error && error.name === "NotFoundError"
          ? "missing"
          : error instanceof Error &&
            ["NotAllowedError", "SecurityError"].includes(error.name)
            ? "permission"
            : "invalid";
    }

    context.check();
    this.cancelRecovery();

    return failure;
  };

  /** Read display values without exposing handles or invalidating connection operations. */
  async listSourceFolder(
    path: readonly string[],
    signal?: AbortSignal,
  ): Promise<FolderListing> {
    const listingSequence = ++this.listingSequence;
    const generation = this.generation;
    const slot = this.slots.source;
    const sequence = slot.sequence;
    const handle = slot.handle;

    if (!this.owner || !this.ready || !slot.connected || !handle) {
      throw new Error("source-folder-not-connected");
    }

    const assertCurrent = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        listingSequence !== this.listingSequence
        ||
        handle !== slot.handle
      ) {
        throw new Error("stale-connection-operation");
      }

      if (signal?.aborted)
        throw new DOMException("Folder listing cancelled", "AbortError");
    };

    try {
      assertCurrent();

      const result = await readSourceFolderListing(handle, path, assertCurrent);

      assertCurrent();

      return result;
    } catch (error) {
      // Old failures must not revoke a replacement connection's permission state.
      assertCurrent();

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        slot.connected = false;
      }

      throw error;
    }
  }

  /** Independent from browsing/preview requests; owner/connection changes invalidate the whole batch. */
  private currentSourceIndex() {
    const owner = this.owner;
    const connection = this.sourceConnectionId;
    const generation = this.generation;
    const snapshotSequence = this.snapshotSequence;
    const sequence = this.slots.source.sequence;
    const handle = this.slots.source.handle;

    if (!owner || !this.ready) throw new Error("source-folder-not-connected");

    const check = () => {
      if (snapshotSequence !== this.snapshotSequence || owner !== this.owner || generation !== this.generation || connection !== this.sourceConnectionId
        || sequence !== this.slots.source.sequence || handle !== this.slots.source.handle) throw new Error("stale-connection-operation");
    };

    return { scope: { owner: owner.userId, workspace: owner.workspaceId, connection }, check };
  }

  readSourceIndexStatus = async () => {
    const { scope, check } = this.currentSourceIndex();
    const result = await new LocalTextIndex().status(scope);

    check();

    return result;
  };

  private sourceIndexPending = 0;

  clearSourceIndex = async () => {
    this.snapshotSequence++;
    const { scope, check } = this.currentSourceIndex();

    this.sourceIndexPending++;
    try {
      await withLocalIndexLock(scope, () => new LocalTextIndex().clear(scope, check));
      check();
    } finally { this.sourceIndexPending--; }
  };

  private async refreshSourceIndexBatch(signal: AbortSignal, automatic: boolean) {
    if (automatic && this.sourceIndexPending > 0) return null;
    if (!automatic) this.snapshotSequence++;
    const { scope, check: assertScope } = this.currentSourceIndex();
    const check = () => {
      assertScope();
      if (signal.aborted) throw new DOMException("Snapshot cancelled", "AbortError");
    };
    const handle = this.slots.source.handle;

    if (!handle || !this.slots.source.connected) throw new Error("source-folder-not-connected");

    this.sourceIndexPending++;

    try {
      const run = async () => {
        check();
        await this.assertStoredSourceConnection(scope.connection, check);
        const index = new LocalTextIndex();
        const saved = await index.readScan(scope);
        check();
        const checkpoint = saved && Date.now() - saved.updatedAt < 24 * 60 * 60 * 1000 && saved.updatedAt <= Date.now() ? saved : undefined;
        const result = await readSourceSnapshot(snapshotRuntime, handle, { kind: "all" }, "", check, signal, undefined, scope, { metadataOnly: true, checkpointed: true, checkpoint });

        check();
        try { await index.saveScan(scope, result.checkpoint ?? null, check); }
        catch (error) { await index.saveScan(scope, null, check).catch(() => {}); throw error; }

        return result;
      };
      const result = automatic ? await tryWithLocalIndexLock(scope, run) : await withLocalIndexLock(scope, run, signal);

      check();
      if (!result) return null;

      return { complete: result.complete, resumable: !!result.checkpoint };
    } catch (error) {
      if (automatic && error instanceof Error && error.message === "stale-connection-operation") return null;
      throw error;
    } finally { this.sourceIndexPending--; }
  }

  refreshSourceIndex = async (signal: AbortSignal) => {
    const result = await this.refreshSourceIndexBatch(signal, false);

    if (!result) throw new Error("index-refresh-unavailable");

    return { ...await this.readSourceIndexStatus(), ...result };
  };

  pollSourceIndex = (signal: AbortSignal) => this.refreshSourceIndexBatch(signal, true);

  private async assertStoredSourceConnection(connection: string, check: () => void) {
    check();
    const owner = this.owner;

    if (!owner) throw new Error("source-folder-not-connected");
    if ("listSource" in this.repository) {
      const sources = await (this.repository as SourceFolderRepository).listSource(owner);
      check();
      if (!sources.some(source => source.connectionId === connection)) throw new Error("source-folder-not-connected");
    }
  }

  inspectSourceSnapshot = async (
    scope: OrganizationScope,
    instruction: string,
    signal: AbortSignal,
    reference?: readonly string[],
    find?: FindQuery,
  ): Promise<FindableSnapshot> => {
    const snapshotSequence = ++this.snapshotSequence;
    const generation = this.generation;
    const owner = this.owner;
    const slot = this.slots.source;
    const sequence = slot.sequence;
    const handle = slot.handle;

    if (!owner || !this.ready || !slot.connected || !handle)
      throw Error("source-folder-not-connected");

    const check = () => {
      if (signal.aborted)
        throw new DOMException("Snapshot cancelled", "AbortError");

      if (
        owner !== this.owner ||
        generation !== this.generation ||
        sequence !== slot.sequence
        ||
        handle !== slot.handle
        ||
        !slot.connected
        ||
        snapshotSequence !== this.snapshotSequence
      ) {
        throw Error("stale-connection-operation");
      }
    };

    this.sourceIndexPending++;
    try {
      check();

      const scopeKey = { owner: owner.userId, workspace: owner.workspaceId, connection: this.sourceConnectionId };
      const result = await withLocalIndexLock(scopeKey, async () => {
        check();
        await this.assertStoredSourceConnection(scopeKey.connection, check);
        return readSourceSnapshot(
          snapshotRuntime,
          handle,
          scope,
          instruction,
          check,
          signal,
          find,
          { owner: owner.userId, workspace: owner.workspaceId, connection: this.sourceConnectionId },
        );
      }, signal);

      check();

      if (!reference) return result;

      const tree = await readOrganizationFolders(
        handle,
        reference,
        check,
        signal,
      );

      check();

      return {
        ...result,
        reference: tree,
        complete: result.complete && tree.complete,
        limits: tree.complete
          ? result.limits
          : [...result.limits, "reference-limit"],
      };
    } catch (error) {
      check();

      if (
        error instanceof DOMException &&
        ["NotAllowedError", "SecurityError"].includes(error.name)
      )
        slot.connected = false;

      throw error;
    } finally { this.sourceIndexPending--; }
  };

  findSourceDocuments = async (
    scope: OrganizationScope,
    query: FindQuery,
    signal: AbortSignal,
  ): Promise<FindResult> => {
    const result = await this.inspectSourceSnapshot(
      scope,
      query.terms.join(" "),
      signal,
      undefined,
      query.semantic ? query.semantic.lexical ?? undefined : query,
    );

    let documents = [...result.findings ?? []];
    let notice: string | undefined;
    if (query.semantic) {
      const { scope: key, check } = this.currentSourceIndex();
      try {
        const semantic = await semanticSourceMatches({ createIndex: () => new LocalTextIndex() }, key, result, { ...query, semantic: query.semantic }, this.semanticModel, signal, check);
        check();
        documents = mergeFindDocuments(documents, semantic.documents);
        notice = semantic.notice;
      } catch (error) {
        check();
        if (signal.aborted) throw new DOMException("Semantic cancelled", "AbortError");
        notice = "의미 검색을 사용할 수 없어 설명 문장까지 단어로 검사한 기본 검색 결과를 표시해요. 모델 설치와 선택 범위 준비 상태를 확인해 주세요.";
        if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) throw error;
      }
    }

    return {
      documents: rankFindDocuments(documents),
      complete: result.complete,
      excluded: result.excluded,
      limits: result.limits,
      discoveredFiles: result.discoveredFiles,
      ...(notice ? { notice } : {}),
    };
  };

  prepareSourceSemantic = async (scope: OrganizationScope, signal: AbortSignal, progress: (count: number) => void) => {
    const start = this.currentSourceIndex();
    const installed = await readInstalledModel(location.origin);
    const epoch = await new LocalTextIndex().semanticEpoch(start.scope);
    start.check();
    if (!installed || signal.aborted) throw new Error("semantic-model-missing");
    const snapshot = await this.inspectSourceSnapshot(scope, "", signal);
    const { scope: key, check } = this.currentSourceIndex();
    if (JSON.stringify(key) !== JSON.stringify(start.scope) || (await readInstalledModel(location.origin))?.stamp !== installed.stamp) throw new Error("semantic-model-changed");
    this.sourceIndexPending++;
    try {
      check();
      await this.assertStoredSourceConnection(key.connection, check);
      const result = await prepareSemanticSource({ createIndex: () => new LocalTextIndex(), now: Date.now }, key, snapshot, epoch, this.semanticModel, signal, check, progress);
      const currentInstalled = await readInstalledModel(location.origin);
      check();
      signal.throwIfAborted();
      if (currentInstalled?.stamp !== installed.stamp) throw new Error("semantic-model-changed");
      return result;
    } finally { this.sourceIndexPending--; }
  };

  readSourceSemanticStatus = async () => {
    const { scope, check } = this.currentSourceIndex();
    const status = await new LocalTextIndex().semanticStatus(scope);
    check();
    return status;
  };

  recheckSourceSnapshot = async (
    documents: readonly SnapshotDocument[],
    instruction: string,
    signal: AbortSignal,
    reference?: ReferenceSnapshot,
  ): Promise<ConnectionOwner> => {
    const owner = this.owner;

    if (!owner || documents.length === 0 || documents.length > LIVE_ORGANIZATION_LIMITS.documents)
      throw Error("invalid-snapshot-selection");

    const current = await this.inspectSourceSnapshot(
      {
        kind: "selected",
        entries: documents.map((document) => ({
          path: document.path,
          kind: "file",
        })),
      },
      instruction,
      signal,
      reference?.root,
    );

    if (
      (!current.complete
        &&
        (!reference ||
          current.excluded.length > 0
          ||
          current.limits.some((limit) => limit !== "reference-limit")))
      ||
      current.documents.length !== documents.length
      ||
      owner !== this.owner
    )
      throw Error("source-changed");

    for (const expected of documents) {
      const actual = current.documents.find(
        (document) =>
          JSON.stringify(document.path) === JSON.stringify(expected.path),
      );

      if (
        !actual ||
        actual.sha256 !== expected.sha256 ||
        actual.excerptHash !== expected.excerptHash
        ||
        actual.excerpt !== expected.excerpt
        ||
        actual.size !== expected.size
        ||
        actual.lastModified !== expected.lastModified
      )
        throw Error("source-changed");
    }

    if (
      reference &&
      JSON.stringify(current.reference) !== JSON.stringify(reference)
    )
      throw Error("source-changed");

    return { ...owner };
  };

  inferOrganization = async (request: string, signal: AbortSignal) => {
    const source = this.slots.source,
      root = source.handle,
      owner = this.owner;
    const generation = this.generation,
      sequence = source.sequence;

    if (!this.ready || !owner || !root || !source.connected)
      throw Error("source-folder-not-connected");

    const check = () => {
      signal.throwIfAborted();

      if (
        owner !== this.owner ||
        root !== source.handle ||
        generation !== this.generation
        ||
        sequence !== source.sequence
        ||
        !source.connected
      )
        throw Error("stale-connection-operation");
    };
    const tree = await readOrganizationFolders(root, [], check, signal, 2);

    check();

    return inferOrganizationConditions(request, root.name, tree.directories);
  };

  searchSourceFolder = async (
    path: readonly string[],
    query: string,
    signal: AbortSignal,
  ) => {
    const searchSequence = ++this.searchSequence,
      generation = this.generation;
    const slot = this.slots.source,
      sequence = slot.sequence,
      handle = slot.handle;

    if (!this.owner || !this.ready || !slot.connected || !handle)
      throw Error("source-folder-not-connected");

    const check = () => {
      if (
        signal.aborted ||
        generation !== this.generation ||
        sequence !== slot.sequence
        ||
        handle !== slot.handle
        ||
        searchSequence !== this.searchSequence
      )
        throw new DOMException("Search cancelled", "AbortError");
    };

    try {
      return await searchFolderTree(
        path,
        query,
        (child) => readSourceFolderListing(handle, child, check),
        check,
      );
    } catch (error) {
      check();

      if (error instanceof DOMException && error.name === "NotAllowedError")
        slot.connected = false;

      throw error;
    }
  };

  /** 목록과 본문의 요청 순서는 독립적이지만 소유자·폴더 교체/해제의 수명은 함께 검증한다. */
  async readSourceFile(
    path: readonly string[],
    signal?: AbortSignal,
    expected?: SourceFileExpectation,
  ): Promise<SourceFilePreview> {
    const previewSequence = ++this.previewSequence;
    const generation = this.generation;
    const slot = this.slots.source;
    const sequence = slot.sequence;
    const handle = slot.handle;

    if (!this.owner || !this.ready || !slot.connected || !handle)
      throw new Error("source-folder-not-connected");

    const expectation = expected ? sourceFileExpectationSchema.parse(expected) : undefined;

    if (expectation
      && (expectation.owner.userId !== this.owner.userId || expectation.owner.workspaceId !== this.owner.workspaceId
        || expectation.connectionId !== this.sourceConnectionId
        || JSON.stringify(expectation.path) !== JSON.stringify(path))) throw new Error("citation-connection-mismatch");

    const assertCurrent = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        previewSequence !== this.previewSequence
        ||
        handle !== slot.handle
      ) {
        throw new Error("stale-connection-operation");
      }

      if (signal?.aborted)
        throw new DOMException("File preview cancelled", "AbortError");
    };

    try {
      assertCurrent();

      const result = await readSourceFilePreview(handle, path, assertCurrent, signal, expectation);

      assertCurrent();

      return result;
    } catch (error) {
      assertCurrent();

      if (error instanceof DOMException && error.name === "NotAllowedError")
        slot.connected = false;

      throw error;
    }
  }

  /** Inspection is independent of navigation reads but expires with its source connection. */
  async inspectSourceCopy(
    plan: FileChangePlan,
    signal?: AbortSignal,
  ): Promise<CopyInspection> {
    this.inspectedCopy = null;

    const inspectionSequence = ++this.inspectionSequence;
    const generation = this.generation;
    const slot = this.slots.source;
    const sequence = slot.sequence;
    const handle = slot.handle;

    if (!this.owner || !this.ready || !slot.connected || !handle)
      throw new Error("source-folder-not-connected");

    const assertCurrent = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence
        ||
        inspectionSequence !== this.inspectionSequence
        ||
        handle !== slot.handle
      ) {
        throw new Error("stale-connection-operation");
      }

      if (signal?.aborted)
        throw new DOMException("Copy inspection cancelled", "AbortError");
    };

    try {
      const result = await inspectCopyPlan(handle, plan, assertCurrent, signal);

      assertCurrent();
      this.inspectedCopy = {
        plan: JSON.stringify(plan),
        report: structuredClone(result),
        generation,
        sequence,
      };

      return result;
    } catch (error) {
      assertCurrent();

      if (error instanceof DOMException && error.name === "NotAllowedError")
        slot.connected = false;

      throw error;
    }
  }

  /** 검사한 동일 계획을 사용자의 실행 제스처에서만 복사한다. 승인 snapshot은 서비스 안에 보관한다. */
  executeSourceCopy = async (
    plan: FileChangePlan,
    report: CopyInspection,
    signal: AbortSignal,
    progress: (result: CopyExecution) => void,
  ) => {
    const prepared = this.inspectedCopy,
      generation = this.generation,
      slot = this.slots.source,
      sequence = slot.sequence;
    const root = slot.handle,
      owner = this.owner;

    if (
      !root ||
      !owner ||
      !slot.connected ||
      !prepared ||
      this.copying ||
      this.backingUp
      ||
      this.restoring
      ||
      prepared.generation !== generation
      ||
      prepared.sequence !== sequence
      ||
      prepared.plan !== JSON.stringify(plan)
      ||
      JSON.stringify(prepared.report) !== JSON.stringify(report)
    )
      throw Error("copy-inspection-required");

    if (
      typeof navigator !== "undefined" &&
      navigator.userActivation &&
      !navigator.userActivation.isActive
    )
      throw Error("copy-user-action-required");

    const check = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        root !== slot.handle
      )
        throw Error("stale-connection-operation");
    };

    this.copying = true;
    this.inspectedCopy = null;

    try {
      return await executeCopy(
        root,
        plan,
        prepared.report,
        owner,
        check,
        signal,
        progress,
      );
    } finally {
      this.copying = false;
    }
  };

  private backupContext() {
    const source = this.slots.source;
    const recovery = this.slots.recovery;
    const root = source.handle;
    const vault = recovery.handle;
    const owner = this.owner;
    const generation = this.generation;
    const sourceSequence = source.sequence;
    const vaultSequence = recovery.sequence;

    if (
      !this.ready ||
      !owner ||
      !root ||
      !vault ||
      !source.connected ||
      !recovery.connected
    ) {
      throw Error("backup-connections-required");
    }

    const check = () => {
      if (
        generation !== this.generation ||
        sourceSequence !== source.sequence
        ||
        vaultSequence !== recovery.sequence
        ||
        root !== source.handle
        ||
        vault !== recovery.handle
        ||
        !source.connected
        ||
        !recovery.connected
      ) {
        throw Error("stale-connection-operation");
      }
    };

    return {
      root,
      vault,
      owner,
      generation,
      sourceSequence,
      vaultSequence,
      check,
    };
  }

  recoveryVersion = () =>
    `${this.generation}/${this.slots.source.sequence}/${this.slots.recovery.sequence}`;

  readRecoveryArchiveList = async (signal: AbortSignal) => {
    if (this.restoring) throw Error("restore-operation-running");

    this.discardRecoveryRestore();

    const context = this.backupContext();
    const sequence = ++this.archiveSequence;

    this.archiveSnapshot = null;

    const check = () => {
      context.check();

      if (sequence !== this.archiveSequence)
        throw Error("stale-connection-operation");
    };
    const snapshot = await readRecoveryArchive(
      context.root,
      context.vault,
      context.owner,
      check,
      signal,
    );

    check();
    this.archiveSnapshot = snapshot;

    return structuredClone(snapshot.view);
  };

  inspectRecoveryArchiveDetail = async (id: string, signal: AbortSignal) => {
    if (this.restoring) throw Error("restore-operation-running");

    const snapshot = this.archiveSnapshot;

    if (!snapshot) throw Error("archive-list-required");

    snapshot.check();

    const hasher = createCopyHasher(signal);

    try {
      return await inspectRecoveryArchiveItem(
        snapshot,
        id,
        hasher.hash,
        signal,
      );
    } finally {
      hasher.dispose();
    }
  };

  readRestoreDestination = async (
    path: readonly string[],
    signal: AbortSignal,
  ) => {
    const context = this.backupContext();
    const check = () => {
      context.check();

      if (signal.aborted)
        throw new DOMException("Restore browsing cancelled", "AbortError");
    };

    return readSourceFolderListing(context.root, path, check);
  };

  discardRecoveryRestore = () => {
    this.preparedRestore = null;

    if (!this.restoring) this.restoreSequence++;
  };

  prepareRecoveryRestore = async (
    id: string,
    path: readonly string[],
    signal: AbortSignal,
  ) => {
    if (this.restoring || this.copying || this.backingUp)
      throw Error("restore-operation-running");

    const context = this.backupContext();
    const snapshot = this.archiveSnapshot;

    if (!snapshot) throw Error("archive-list-required");

    this.preparedRestore = null;

    const sequence = ++this.restoreSequence;
    const check = () => {
      context.check();

      if (sequence !== this.restoreSequence)
        throw Error("stale-connection-operation");
    };
    const hasher = createCopyHasher(signal);

    try {
      const prepared = await prepareRecoveryRestore(
        snapshot,
        id,
        path,
        check,
        signal,
        hasher.hash,
      );

      check();
      this.preparedRestore = prepared;

      return structuredClone(prepared.view);
    } finally {
      hasher.dispose();
    }
  };

  executeRecoveryRestore = async (
    view: RestorePreview,
    signal: AbortSignal,
    progress: (result: RestoreExecution) => void,
  ) => {
    const context = this.backupContext();
    const prepared = this.preparedRestore;

    if (
      !prepared ||
      this.restoring ||
      this.copying ||
      this.backingUp
      ||
      JSON.stringify(prepared.view) !== JSON.stringify(view)
    )
      throw Error("restore-inspection-required");

    prepared.snapshot.check();

    if (
      typeof navigator !== "undefined" &&
      navigator.userActivation &&
      !navigator.userActivation.isActive
    )
      throw Error("restore-user-action-required");

    this.preparedRestore = null;
    this.restoring = true;

    const sequence = ++this.restoreSequence;
    const check = () => {
      context.check();

      if (sequence !== this.restoreSequence)
        throw Error("stale-connection-operation");
    };
    const hasher = createCopyHasher(signal);

    try {
      const result = await executeRecoveryRestore(
        prepared,
        context.owner,
        check,
        signal,
        progress,
        hasher.hash,
      );

      check();

      return result;
    } finally {
      hasher.dispose();
      this.restoring = false;
    }
  };

  /** 읽기 검사의 snapshot을 내부에 보관한다. 호출자 DTO를 실행 권한으로 신뢰하지 않는다. */
  inspectSourceBackup = async (
    plan: FileChangePlan,
    signal: AbortSignal,
  ): Promise<BackupInspection> => {
    if (this.backingUp || this.copying || this.restoring)
      throw Error("backup-operation-running");

    this.completedBackup = null;
    this.inspectedBackup = null;

    const sequence = ++this.backupSequence;
    const context = this.backupContext();
    const fixedPlan = structuredClone(plan);
    const check = () => {
      context.check();

      if (sequence !== this.backupSequence)
        throw Error("stale-connection-operation");
    };
    const report = await inspectRecoveryBackup(
      context.root,
      context.vault,
      fixedPlan,
      context.owner,
      check,
      signal,
    );

    check();
    this.inspectedBackup = {
      plan: JSON.stringify(fixedPlan),
      report: structuredClone(report),
      generation: context.generation,
      sourceSequence: context.sourceSequence,
      vaultSequence: context.vaultSequence,
    };

    return report;
  };

  /** 충돌 UI의 후속 연결점. 실제 실행은 새 사용자 제스처·동일 검사·두 연결 수명을 요구한다. */
  executeSourceBackup = async (
    plan: FileChangePlan,
    report: BackupInspection,
    signal: AbortSignal,
    progress: (result: BackupExecution) => void,
  ) => {
    const context = this.backupContext();
    const inspected = this.inspectedBackup;

    if (
      !inspected ||
      this.copying ||
      this.backingUp ||
      this.restoring
      ||
      inspected.plan !== JSON.stringify(plan)
      ||
      JSON.stringify(inspected.report) !== JSON.stringify(report)
      ||
      inspected.generation !== context.generation
      ||
      inspected.sourceSequence !== context.sourceSequence
      ||
      inspected.vaultSequence !== context.vaultSequence
    ) {
      throw Error("backup-inspection-required");
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.userActivation &&
      !navigator.userActivation.isActive
    ) {
      throw Error("backup-user-action-required");
    }

    const sequence = ++this.backupSequence;

    this.inspectedBackup = null;
    this.backingUp = true;
    this.completedBackup = null;

    const check = () => {
      context.check();

      if (sequence !== this.backupSequence)
        throw Error("stale-connection-operation");
    };

    try {
      let identity: BackupEntryIdentity | null = null;
      const result = await executeRecoveryBackup(
        context.root,
        context.vault,
        plan,
        inspected.report,
        context.owner,
        check,
        signal,
        progress,
        undefined,
        undefined,
        (value) => {
          identity = value;
        },
      );

      check();

      if (
        identity &&
        result.phase === "completed" &&
        result.journalComplete
        &&
        result.items.every((item) => item.status === "verified")
      ) {
        this.completedBackup = {
          ...inspected,
          result: structuredClone(result),
          sequence,
          identity,
        };
      }

      return result;
    } finally {
      this.backingUp = false;
    }
  };

  discardSourceOverwrite = () => {
    this.completedBackup = null;
  };

  /** 성공 DTO는 권한이 아니다. 내부 완료 snapshot과 새 사용자 제스처를 한 번만 소비한다. */
  executeSourceOverwrite = async (
    plan: FileChangePlan,
    report: BackupInspection,
    backup: BackupExecution,
    signal: AbortSignal,
    progress: (result: OverwriteExecution) => void,
  ) => {
    const context = this.backupContext();
    const completed = this.completedBackup;

    if (
      !completed ||
      this.copying ||
      this.backingUp ||
      this.restoring
      ||
      completed.plan !== JSON.stringify(plan)
      ||
      JSON.stringify(completed.report) !== JSON.stringify(report)
      ||
      JSON.stringify(completed.result) !== JSON.stringify(backup)
      ||
      completed.generation !== context.generation
      ||
      completed.sourceSequence !== context.sourceSequence
      ||
      completed.vaultSequence !== context.vaultSequence
      ||
      completed.sequence !== this.backupSequence
    )
      throw Error("overwrite-backup-required");

    if (
      typeof navigator !== "undefined" &&
      navigator.userActivation &&
      !navigator.userActivation.isActive
    )
      throw Error("overwrite-user-action-required");

    this.completedBackup = null;
    this.inspectedBackup = null;
    this.backingUp = true;

    const sequence = ++this.backupSequence;
    const check = () => {
      context.check();

      if (sequence !== this.backupSequence)
        throw Error("stale-connection-operation");
    };

    try {
      const result = await executeRecoveryOverwrite(
        context.root,
        context.vault,
        plan,
        completed.report,
        completed.result,
        context.owner,
        check,
        signal,
        progress,
        undefined,
        undefined,
        completed.identity,
      );

      check();

      return result;
    } finally {
      this.backingUp = false;
    }
  };

  async disconnect(kind: FolderKind): Promise<void> {
    if (kind === "source" && "removeSource" in this.repository) return this.disconnectSourceConnection(this.sourceConnectionId);

    const operation = this.begin(kind);

    operation.slot.handle = undefined;
    operation.slot.connected = false;

    try {
      await this.repository.remove(operation.owner, kind);
    } catch (error) {
      operation.assertCurrent();

      throw error;
    }

    operation.assertCurrent();
  }

  /** 생성 권한 거부는 읽기 연결을 해제하지 않는다. journal은 캡처한 소유자에게만 기록한다. */
  createSourceEntry = async (
    path: readonly string[],
    name: string,
    kind: EntryKind = "folder",
  ): Promise<readonly string[]> => {
    if (this.restoring || this.backingUp || this.copying)
      throw Error("managed-operation-running");

    const generation = this.generation,
      slot = this.slots.source,
      sequence = slot.sequence;
    const root = slot.handle,
      owner = this.owner;

    if (!owner || !this.ready || !slot.connected || !root)
      throw new Error("source-folder-not-connected");

    const assertCurrent = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        root !== slot.handle
      )
        throw new Error("stale-connection-operation");
    };

    return createEntry(
      root,
      path,
      name,
      assertCurrent,
      new DirectoryFolderCreationJournal(
        root,
        owner,
        root.name,
        path,
        assertCurrent,
      ),
      async (work) =>
        await navigator.locks.request("moa-folder-creation", work),
      kind,
    );
  };

  /** 기록 조회는 읽기 권한만 확인한다. 생성/목록 요청의 순번은 변경하지 않는다. */
  readSourceHistory = async (path: readonly string[], signal?: AbortSignal) => {
    const generation = this.generation,
      slot = this.slots.source,
      sequence = slot.sequence;
    const root = slot.handle,
      owner = this.owner;

    if (!owner || !this.ready || !slot.connected || !root)
      throw new Error("source-folder-not-connected");

    const assertCurrent = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        root !== slot.handle
      )
        throw new Error("stale-connection-operation");

      if (signal?.aborted)
        throw new DOMException("History reading cancelled", "AbortError");
    };
    const result = await readFolderHistory(root, path, owner, assertCurrent);
    const copies = await readCopyHistory(root, path, owner, assertCurrent);
    const restores = await readRestoreHistory(root, path, owner, assertCurrent);

    assertCurrent();

    return { ...result, copies, restores };
  };

  inspectSourceHistoryTarget = async (
    path: readonly string[],
    group: HistoryGroup,
    signal: AbortSignal,
  ) => {
    const generation = this.generation,
      slot = this.slots.source,
      sequence = slot.sequence;
    const root = slot.handle,
      owner = this.owner;

    if (!owner || !this.ready || !slot.connected || !root)
      throw new Error("source-folder-not-connected");

    const assertCurrent = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        root !== slot.handle
      )
        throw new Error("stale-connection-operation");

      if (signal.aborted)
        throw new DOMException(
          "History target inspection cancelled",
          "AbortError",
        );
    };
    const result = await inspectHistoryTarget(
      root,
      path,
      owner,
      group,
      assertCurrent,
    );

    assertCurrent();

    return result;
  };

  inspectSourceCopyHistory = async (
    path: readonly string[],
    group: CopyGroup,
    signal: AbortSignal,
  ) => {
    const generation = this.generation,
      slot = this.slots.source,
      sequence = slot.sequence,
      root = slot.handle,
      owner = this.owner;

    if (!root || !owner || !slot.connected || !this.ready)
      throw Error("source-folder-not-connected");

    const check = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        root !== slot.handle
      )
        throw Error("stale-connection-operation");
    };

    return inspectCopyHistoryTargets(root, path, group, owner, check, signal);
  };

  inspectSourceRestoreHistory = async (
    path: readonly string[],
    group: RestoreHistoryGroup,
    signal: AbortSignal,
  ) => {
    const generation = this.generation;
    const slot = this.slots.source;
    const sequence = slot.sequence;
    const root = slot.handle;
    const owner = this.owner;

    if (!root || !owner || !slot.connected || !this.ready)
      throw Error("source-folder-not-connected");

    const check = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        root !== slot.handle
      )
        throw Error("stale-connection-operation");

      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    };

    return inspectRestoredFile(root, path, group, owner, check, signal);
  };

  discardManaged = () => {
    this.managedPrepared = null;

    if (!this.managedExecuting) this.managedSequence++;
  };

  readManagedDestination = async (
    path: readonly string[],
    signal: AbortSignal,
  ) => {
    const slot = this.slots.source;
    const root = slot.handle;
    const generation = this.generation;
    const sequence = slot.sequence;

    if (!root || !slot.connected || !this.ready || !this.owner)
      throw Error("source-folder-not-connected");

    const check = () => {
      if (
        generation !== this.generation ||
        sequence !== slot.sequence ||
        root !== slot.handle
      )
        throw Error("stale-connection-operation");

      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    };

    return readSourceFolderListing(root, path, check);
  };

  readManagedArchives = async (signal: AbortSignal) => {
    const context = this.backupContext();
    const check = () => {
      context.check();

      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    };
    const hasher = createCopyHasher(signal);

    try {
      return await readManagedArchiveList({ ...context, check }, hasher.hash);
    } finally {
      hasher.dispose();
    }
  };

  openManagedEditor = async (path: readonly string[], signal: AbortSignal) => {
    if (this.copying || this.backingUp || this.restoring)
      throw Error("managed-operation-running");

    this.editBaseline = null;
    this.managedPrepared = null;

    const context = this.backupContext();
    const sequence = ++this.managedSequence;
    const check = () => {
      context.check();

      if (sequence !== this.managedSequence)
        throw Error("stale-connection-operation");

      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    };
    const hasher = createCopyHasher(signal);

    try {
      const value = await readManagedEdit(
        { ...context, check },
        path,
        hasher.hash,
      );

      check();
      this.editBaseline = value;

      return { id: value.id, text: value.text, path: [...path] };
    } finally {
      hasher.dispose();
    }
  };

  prepareManaged = async (request: ManagedRequest, signal: AbortSignal) => {
    if (this.copying || this.backingUp || this.restoring)
      throw Error("managed-operation-running");

    this.managedPrepared = null;

    const context = this.backupContext();
    const sequence = ++this.managedSequence;
    const check = () => {
      context.check();

      if (sequence !== this.managedSequence)
        throw Error("stale-connection-operation");

      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    };

    if (
      request.kind === "edit" &&
      (!this.editBaseline || this.editBaseline.id !== request.editId)
    )
      throw Error("managed-edit-required");

    const hasher = createCopyHasher(signal);

    try {
      const prepared = await prepareManagedOperation(
        { ...context, check },
        request,
        hasher.hash,
        this.editBaseline ?? undefined,
      );

      check();
      // 검사의 AbortSignal 대신 연결 세대를 실행 수명의 기준으로 보관한다.
      prepared.context = context;
      this.managedPrepared = prepared;

      return structuredClone(prepared.view);
    } finally {
      hasher.dispose();
    }
  };

  prepareOrganizationManaged = async (
    request: ManagedRequest,
    documents: readonly SnapshotDocument[],
    instruction: string,
    signal: AbortSignal,
  ) => {
    try {
      await this.recheckSourceSnapshot(documents, instruction, signal);

      const preview = await this.prepareManaged(request, signal);
      const prepared = this.managedPrepared;

      if (!prepared) throw Error("managed-inspection-required");

      prepared.context.check();
      assertOrganizationBaseline(
        documents,
        prepared.nodes.map((node) => node.view),
      );

      return preview;
    } catch (error) {
      this.discardManaged();

      if (error instanceof Error && error.message === "source-changed")
        throw Error("managed-changed");

      throw error;
    }
  };

  executeManaged = async (
    view: ManagedPreview,
    signal: AbortSignal,
    progress: (result: ManagedResult) => void,
  ) => {
    const prepared = this.managedPrepared;

    if (
      !prepared ||
      JSON.stringify(prepared.view) !== JSON.stringify(view) ||
      this.copying ||
      this.backingUp
      ||
      this.restoring
    )
      throw Error("managed-inspection-required");

    prepared.context.check();

    if (
      typeof navigator !== "undefined" &&
      navigator.userActivation &&
      !navigator.userActivation.isActive
    )
      throw Error("managed-user-action-required");

    this.managedPrepared = null;
    this.managedExecuting = true;
    this.backingUp = true;

    const hasher = createCopyHasher(signal);

    try {
      const result = await executeManagedOperation(
        prepared,
        signal,
        hasher.hash,
        progress,
      );

      prepared.context.check();

      return result;
    } finally {
      hasher.dispose();
      this.managedExecuting = false;
      this.backingUp = false;
    }
  };

  persistWorkflow = async (value: WorkflowDraft) => {
    const source = this.slots.source;
    const root = source.handle;
    const owner = this.owner;

    if (!root || !owner || !source.connected)
      throw Error("source-folder-not-connected");

    await this.drafts.write(
      owner,
      root,
      value,
      value.flow === "edit"
        ? this.inlineEditor.checkpoint(value.id)
        : undefined,
    );
  };
  readWorkflow = async (id: string) => {
    const source = this.slots.source;
    const root = source.handle;
    const owner = this.owner;
    const generation = this.generation;

    if (!root || !owner || !source.connected)
      throw Error("source-folder-not-connected");

    const stored = await this.drafts.read(owner, root, id);

    if (generation !== this.generation || root !== this.slots.source.handle)
      throw Error("stale-connection-operation");

    return stored?.value ?? null;
  };
  removeWorkflow = async (id: string) => {
    const root = this.slots.source.handle;
    const owner = this.owner;

    if (root && owner && (await this.drafts.read(owner, root, id)))
      await this.drafts.remove(id);
  };
  openInlineEditor = async (
    path: readonly string[],
    signal: AbortSignal,
    draftId?: string,
  ) => {
    const context = this.backupContext();
    const stored = draftId
      ? await this.drafts.read(context.owner, context.root, draftId)
      : null;

    context.check();

    if (
      stored
      &&
      (stored.value.flow !== "edit"
        ||
        JSON.stringify([...stored.value.source, ...stored.value.names]) !==
        JSON.stringify(path))
    )
      throw Error("editor-draft-mismatch");

    const result = await this.inlineEditor.open(
      path,
      signal,
      stored ? { id: stored.value.id, checkpoint: stored.editor } : undefined,
    );

    context.check();

    return {
      ...result,
      originalText: result.text,
      text: stored?.value.text ?? result.text,
    };
  };
  saveInlineEditor = (
    id: string,
    text: string,
    signal: AbortSignal,
    manual: boolean,
  ) => this.inlineEditor.save(id, text, signal, manual);
  closeInlineEditor = () => this.inlineEditor.invalidate();
}

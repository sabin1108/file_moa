import type { FolderHandle } from "../types";
import type { FolderConnectionSession } from "../services/connection-session";
import { RecoveryConnectionError, type RecoveryStage } from "../lib/recovery-connection-error";

type Action = "choose" | "create" | "connect" | "reconnect" | "disconnect";

type State = Readonly<{
  pending: Action | null;
  message: string;
  help: string;
  remedy: "choose-location" | "retry-create" | "choose-existing" | null;
  checking: boolean;
  failed: boolean;
  creationParentName: string | null;
  diagnostic: string | null
}>;

const initial: State = {
  pending: null,
  checking: false,
  message: "",
  help: "",
  remedy: null,
  failed: false,
  creationParentName: null,
  diagnostic: null
};
const stages: Record<RecoveryStage, string> = {
  "select-location": "위치 선택",
  "check-location": "위치 확인",
  "request-write": "쓰기 권한 확인",
  "create-directory": "새 폴더 생성",
  "write-identity": "식별 파일 저장",
  "verify-identity": "보관함 검증",
  "save-connection": "브라우저 연결 저장",
};

/** 보관함 UI의 진행/결과를 소유한다. 실제 위치/식별/저장은 session과 파일 서비스가 처리한다. */

export class RecoveryConnectionController {
  private state = initial;
  private sequence = 0;
  private probing = false;
  private listeners = new Set<() => void>();

  constructor(private readonly session: FolderConnectionSession, private readonly picker: (options: { mode: "read" | "readwrite" }) => Promise<FolderHandle>) { }

  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(state: State) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  stop = () => {
    this.sequence++;
    this.session.cancelRecovery();
    this.publish(initial);
  };

  cancel = () => {
    this.stop();
    this.publish({ ...initial, message: "보관함 설정을 중단했습니다." });
  };

  checkPresence = async (silent = true) => {
    if (this.probing || this.state.pending || this.state.creationParentName) return;

    this.probing = true;

    const sequence = this.sequence;

    if (!silent) this.publish({ ...this.state, checking: true });

    try {
      const status = await this.session.checkRecoveryPresence();

      if (sequence !== this.sequence) return;

      if (status === "connected") {
        if (!silent) this.publish({ ...initial, message: "보관함을 확인했어요." });
      } else if (status !== "idle") {
        this.publish({
          ...initial,
          failed: true,
          message: status === "missing" ? "보관함을 찾을 수 없어요." : status === "permission" ? "보관함 접근 권한이 필요해요." : "보관함을 확인할 수 없어요.",
          help: "새 보관함을 만들거나 기존 보관함을 다시 선택하세요.",
          remedy: "choose-existing",
          diagnostic: `presence / ${status}`
        });
      } else if (!silent) this.publish({ ...this.state, checking: false });
    } catch {
      if (sequence === this.sequence && !silent) this.publish({ ...this.state, checking: false });
    } finally {
      this.probing = false;
    }
  };

  run = async (action: Action) => {
    if (this.state.pending) return;

    const sequence = ++this.sequence;

    this.publish({
      ...this.state,
      pending: action,
      message: "",
      help: "",
      remedy: null,
      failed: false,
      diagnostic: null,
      creationParentName: action === "choose" ? null : this.state.creationParentName
    });

    try {
      if (action === "choose") {
        const selected = await this.session.prepareRecoveryCreation(this.picker);

        if (sequence !== this.sequence) return;

        this.publish({ ...initial, creationParentName: selected.folderName, message: "위치를 선택했어요." });

        return;
      } else if (action === "create") {
        await this.session.createPreparedRecovery();
      } else if (action === "connect") {
        await this.session.selectRecovery(this.picker, false);
      } else if (action === "reconnect") {
        await this.session.reconnectRecovery();
      } else {
        await this.session.disconnect("recovery");
      }

      if (sequence !== this.sequence) return;

      this.publish({
        ...initial,
        message: action === "disconnect"
          ? "연결 정보를 지웠습니다. 보관함 파일은 그대로입니다."
          : "복구 보관함을 연결했어요."
      });
    } catch (error) {
      if (sequence !== this.sequence) return;

      const reason = error instanceof Error ? error.message : "";
      const detail = error instanceof RecoveryConnectionError ? error : null;
      let message = detail ? `${stages[detail.stage]} 실패` : "보관함 설정 실패";
      let help = "연결 상태를 확인하고 다시 시도하세요.";
      let remedy: State["remedy"] = null;

      if (detail?.code === "permission") {
        help = "폴더 접근을 허용한 뒤 다시 시도하세요.";
        remedy = action === "create" ? "retry-create" : "choose-existing";
      }

      if (detail?.code === "cancelled") message = "위치 선택 또는 권한 확인을 취소했습니다.";

      if (detail?.code === "storage") {
        help = "생성된 보관함을 ‘기존 보관함 연결’로 선택하세요.";
        remedy = "choose-existing";
      }

      if (reason === "recovery-vault-location") {
        message = "여기에는 만들 수 없어요.";
        help = action === "choose" || action === "create" ? "자료 폴더 최상위를 생성 위치로 선택하세요." : "자료 폴더 바로 아래 보관함을 선택하세요.";
        remedy = action === "choose" || action === "create" ? "choose-location" : "choose-existing";
      }

      if (reason === "recovery-vault-missing" || reason === "recovery-vault-invalid") {
        message = "복구 보관함이 아닙니다.";
        help = "앱에서 만든 보관함을 선택하세요.";
        remedy = "choose-existing";
      }

      if (reason === "recovery-vault-foreign-owner") message = "다른 작업 공간의 복구 보관함입니다.";

      if (action === "create" && detail && ["create-directory", "write-identity", "verify-identity"].includes(detail.stage)) {
        help += " 일부 파일이 남았을 수 있습니다.";
      }

      this.publish({
        ...this.state,
        pending: null,
        message,
        help,
        remedy,
        failed: true,
        diagnostic: detail ? `${detail.stage} / ${detail.code} / ${detail.exceptionName}` : "connection / failed"
      });
    }
  };
}

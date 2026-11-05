export type FolderCreationState = Readonly<{ phase: "idle" | "pending" | "ready" | "error"; message: string }>;
const initial: FolderCreationState = { phase: "idle", message: "" };
const messages: Record<string, string> = {
  "invalid-entry-name": "이름을 확인하세요. 경로, 예약 이름, 끝 공백·점은 사용할 수 없습니다.",
  "entry-name-conflict": "같은 이름의 파일 또는 폴더가 있습니다. 다른 이름을 입력하세요.",
  "journal-permission": "현재 폴더의 쓰기 권한이 필요합니다. 권한을 확인하고 다시 시도하세요.",
  "journal-location-conflict": "현재 위치에 .moa-history라는 파일이 있어 작업 기록 폴더를 준비하지 못했어요. 기존 파일은 변경하지 않았습니다.",
  "entry-result-uncertain": "항목이 만들어졌을 수 있습니다. 다시 생성하지 말고 목록과 .moa-history의 작업 기록을 확인하세요.",
  "stale-connection-operation": "폴더 연결이 변경되어 작업을 중단했습니다. 작업 기록과 실제 폴더를 확인하세요.",
};

/** 생성은 중간 취소/재시도하지 않는다. 화면 수명 종료는 늦은 UI 반영만 막고 journal 정산은 계속한다. */
export class EntryCreationController {
  private state = initial;
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(private readonly create: (path: readonly string[], name: string, kind: EntryKind) => Promise<readonly string[]>) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: FolderCreationState) { this.state = state; this.listeners.forEach(listener => listener()); }
  dispose = () => { ++this.generation; };
  run = async (path: readonly string[], name: string, kind: EntryKind = "folder"): Promise<boolean> => {
    if (this.state.phase === "pending") return false;
    const generation = ++this.generation;
    this.publish({ phase: "pending", message: "권한과 작업 기록을 확인하고 있어요." });
    try {
      const entry = resolveNewEntry(name, kind);
      const result = await this.create(path, entry.name, entry.kind);
      if (generation !== this.generation) return false;
      this.publish({ phase: "ready", message: `‘${result.at(-1)}’ ${entry.kind === "folder" ? "폴더를" : "빈 파일을"} 준비했어요.` });
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      const message = error instanceof Error ? messages[error.message] ?? (error.name === "NotAllowedError" ? "폴더 쓰기 권한이 허용되지 않았습니다. 읽기 연결은 유지합니다." : null) : null;
      this.publish({ phase: "error", message: message ?? "항목을 준비하지 못했어요. 권한·기록 저장소·폴더 상태를 확인하세요." });
      return false;
    }
  };
}
import { resolveNewEntry, type EntryKind } from "../lib/new-entry";


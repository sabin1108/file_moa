import type { AiRecordPayload } from "../../../shared/ai-records";
import type { FolderConnectionSession } from "../../local-folders/services/connection-session";
import type { FolderHandle } from "../../local-folders/types";
import type { AiRecordRepository, SavedAiRecord } from "../services/ai-record-repository";

export type AiLibraryState = Readonly<{
  phase: "disconnected" | "needs-permission" | "loading" | "ready" | "error";
  folderName: string | null; records: readonly SavedAiRecord[]; pending: boolean; notice: string | null;
}>;
const empty: AiLibraryState = { phase: "disconnected", folderName: null, records: [], pending: false, notice: null };
export type AiRecordStorage = Pick<AiRecordRepository, "initialize" | "list" | "save" | "remove" | "revisions">;
type AiRecordConnection = Pick<FolderConnectionSession, "view" | "select" | "reconnect" | "disconnect">;

function message(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "stale-revision") return "다른 탭이나 프로그램에서 기록이 바뀌었어요. 다시 불러온 뒤 내용을 비교해 주세요.";
    if (error.message === "ai-record-owner-mismatch") return "다른 계정의 AI 기록 폴더입니다. 현재 계정의 폴더를 선택해 주세요.";
    if (error.message === "ai-records-overlap") return "AI 기록은 자료 폴더·복구 보관함과 겹치지 않는 폴더에 보관해 주세요.";
    if (error.message === "record-deleted") return "이미 삭제한 기록입니다. 늦게 도착한 결과는 다시 저장하지 않았어요.";
    if (["record-too-large", "record-history-too-large", "revision-limit"].includes(error.message)) return "이 기록의 저장 한도에 도달했어요. 새 대화를 만들거나 필요한 내용을 내보내 주세요.";
  }
  return "AI 기록을 저장하거나 읽지 못했어요. 권한·남은 공간을 확인해 주세요. 화면의 미저장 내용은 유지합니다.";
}

/** Publishes verified local records; owner changes invalidate pending reads and writes. */
export class AiRecordsController {
  private state = empty;
  private generation = 0;
  private listeners = new Set<() => void>();
  private writes = new Map<string, Promise<SavedAiRecord>>();
  constructor(
    private readonly session: AiRecordConnection,
    private readonly picker: (options: { mode: "read" | "readwrite" }) => Promise<FolderHandle>,
    readonly repository: AiRecordStorage,
  ) {}

  getSnapshot = () => this.state;
  getServerSnapshot = () => empty;
  getConnectionRevision = () => this.generation;
  assertConnectionRevision = (revision: number) => {
    if (revision !== this.generation || this.state.pending) throw new Error("stale-record-confirmation");
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: AiLibraryState) { this.state = state; this.listeners.forEach(listener => listener()); }

  stop = () => {
    this.generation++;
    this.writes.clear();
    this.publish(empty);
  };

  load = async () => {
    const generation = ++this.generation;
    const view = this.session.view("ai-records");
    if (view.status === "disconnected") { this.publish(empty); return; }
    this.publish({ ...this.state, phase: "loading", folderName: view.folderName, pending: true, notice: null });
    try {
      const records = await this.repository.list();
      if (generation !== this.generation) return;
      this.publish({ phase: "ready", folderName: view.folderName, records, pending: false, notice: null });
    } catch (error) {
      if (generation !== this.generation) return;
      const permission = error instanceof DOMException && error.name === "NotAllowedError";
      this.publish({ ...this.state, records: [], phase: permission ? "needs-permission" : "error", pending: false, notice: permission ? "AI 기록 폴더의 권한을 다시 확인해 주세요." : message(error) });
    }
  };

  connect = async () => {
    const generation = this.generation;
    this.publish({ ...this.state, pending: true, notice: null });
    try {
      await this.session.select("ai-records", this.picker);
      if (generation !== this.generation) return;
      await this.repository.initialize();
      if (generation !== this.generation) return;
      await this.load();
    } catch (error) {
      if (generation !== this.generation) return;
      this.publish({ ...this.state, pending: false, notice: error instanceof DOMException && error.name === "AbortError" ? null : message(error) });
    }
  };

  reconnect = async () => {
    const generation = this.generation;
    this.publish({ ...this.state, pending: true, notice: null });
    try { await this.session.reconnect("ai-records"); if (generation === this.generation) await this.load(); }
    catch (error) { if (generation === this.generation) this.publish({ ...this.state, pending: false, notice: message(error) }); }
  };

  disconnect = async () => {
    this.stop();
    const generation = this.generation;
    this.publish({ ...empty, pending: true });
    try {
      await this.session.disconnect("ai-records");
      if (generation === this.generation) this.publish(empty);
    } catch (error) {
      if (generation === this.generation) this.publish({ ...empty, notice: "연결은 중지했지만 이 기기의 연결 정보를 지우지 못했어요. 다시 연결한 뒤 확인해 주세요." });
      throw error;
    }
  };

  save(payload: AiRecordPayload): Promise<SavedAiRecord> {
    const generation = this.generation;
    const previous = this.writes.get(payload.id);
    const write = (async () => {
      if (previous) await previous;
      if (generation !== this.generation) throw new Error("stale-connection-operation");
      const current = this.state.records.find(record => record.payload.id === payload.id);
      const saved = await this.repository.save(payload, current?.revisionId ?? null);
      if (generation !== this.generation) throw new Error("stale-connection-operation");
      this.publish({ ...this.state, notice: null, records: [saved, ...this.state.records.filter(record => record.payload.id !== payload.id)] });
      return saved;
    })();
    this.writes.set(payload.id, write);
    void write.catch(error => {
      if (generation === this.generation) this.publish({ ...this.state, notice: message(error) });
    }).finally(() => { if (this.writes.get(payload.id) === write) this.writes.delete(payload.id); });
    return write;
  }

  async remove(id: string, cascade: boolean, connectionRevision: number) {
    this.assertConnectionRevision(connectionRevision);
    const generation = this.generation;
    const target = this.state.records.find(record => record.payload.id === id);
    if (!target) return;
    await this.repository.remove(target.payload.type, id, cascade);
    if (generation !== this.generation) return;
    this.publish({ ...this.state, records: this.state.records.filter(record => record.payload.id !== id) });
    if (!cascade) return;
    const current = await this.repository.list();
    if (generation !== this.generation) return;
    const targets = current.filter(record => "sourceConversationId" in record.payload && record.payload.sourceConversationId === id);
    for (const record of targets) {
      await this.repository.remove(record.payload.type, record.payload.id, cascade);
      if (generation !== this.generation) return;
      this.publish({ ...this.state, records: this.state.records.filter(item => item.payload.id !== record.payload.id) });
    }
  }
}

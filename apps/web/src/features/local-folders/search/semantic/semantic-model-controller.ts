import { LocalTextIndex } from "../documents/local-text-index";
import { MODEL_DOWNLOAD_BYTES, SEMANTIC_MODEL, readInstalledModel } from "./model-assets";
import { isSemanticVector, type SemanticChunk } from "./semantic-record";
import { isFindEvidence, type FindEvidence } from "../documents/document-find";
import type { FindSource } from "../documents/document-field-match";
import type { SemanticFindQuery } from "./semantic-query";

const initial = { phase: "absent" as "absent" | "downloading" | "verifying" | "ready" | "error" | "deleting", loaded: 0, total: MODEL_DOWNLOAD_BYTES, issue: "" };
export type SemanticModelState = typeof initial;
export type SemanticEvidenceInput = { text: string; query: SemanticFindQuery; lastModified: number; source: FindSource; score: number; start: number; end: number };
type Job = { kind: "install" } | { kind: "query"; text: string } | { kind: "score"; text: string; candidates: readonly (readonly SemanticChunk[])[] } | ({ kind: "evidence" } & SemanticEvidenceInput) | { kind: "document"; text: string; name: string; folder: string };
type Reply = { kind: string; vector?: unknown; chunks?: unknown; complete?: unknown; scores?: unknown; finding?: unknown };
type Score = { index: number; score: number; start: number; end: number };

/** Only this controller starts a Worker. Reading installation status never imports the SDK. */
export class SemanticModelController {
  private state = initial;
  private listeners = new Set<() => void>();
  private worker: Worker | null = null;
  private pending: ((error: Error) => void) | null = null;
  private operation: AbortController | null = null;
  private channel: BroadcastChannel | null = null;
  private sequence = 0;
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SemanticModelState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  connect = () => {
    if (!this.channel && typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(SEMANTIC_MODEL.cache);
      this.channel.onmessage = () => { this.stop(); void this.refresh(); };
    }
    void this.refresh();
  };
  dispose = () => { this.stop(); this.channel?.close(); this.channel = null; };
  refresh = async () => {
    if (this.operation) return;
    try { this.publish({ phase: await readInstalledModel(location.origin) ? "ready" : "absent", issue: "" }); }
    catch { this.publish({ phase: "error", issue: "브라우저 저장 공간을 확인하지 못했어요. 기본 검색은 계속 사용할 수 있어요." }); }
  };
  stop = () => {
    this.operation?.abort();
    this.worker?.terminate();
    this.worker = null;
    this.pending?.(new DOMException("Semantic cancelled", "AbortError"));
    this.pending = null;
  };
  private async lock<T>(mode: "shared" | "exclusive", signal: AbortSignal, operation: () => Promise<T>) {
    if (!navigator.locks) throw new Error("semantic-lock-unavailable");
    signal.throwIfAborted();
    if (mode === "shared") return navigator.locks.request(SEMANTIC_MODEL.lock, { mode, ifAvailable: true }, lock => {
      if (!lock) throw new Error("semantic-busy");
      signal.throwIfAborted();
      return operation();
    });
    return navigator.locks.request(SEMANTIC_MODEL.lock, { mode, signal }, operation);
  }
  private job(request: Job, signal: AbortSignal): Promise<Reply> {
    if (signal.aborted) return Promise.reject(new DOMException("Semantic cancelled", "AbortError"));
    if (this.pending) return Promise.reject(new Error("semantic-busy"));
    this.worker ??= new Worker(new URL("./semantic.worker.ts", import.meta.url), { type: "module" });
    const worker = this.worker;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, result?: Reply) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        this.pending = null;
        if (error) { worker.terminate(); if (this.worker === worker) this.worker = null; reject(error); }
        else resolve(result!);
      };
      const abort = () => finish(new DOMException("Semantic cancelled", "AbortError"));
      const timer = setTimeout(() => finish(new Error("semantic-timeout")), request.kind === "install" ? 600_000 : 120_000);
      this.pending = error => finish(error);
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = () => finish(new Error("semantic-worker-failed"));
      worker.onmessage = (event: MessageEvent<Reply & { id?: number; stage?: string; loaded?: number; code?: string }>) => {
        const reply = event.data;
        if (!reply || reply.id !== id) return;
        if (reply.kind === "progress") {
          if (request.kind === "install") this.publish({ phase: reply.stage === "verifying" ? "verifying" : "downloading", loaded: Number.isFinite(reply.loaded) ? Math.max(0, reply.loaded!) : this.state.loaded });
        } else if (reply.kind === "error") finish(new Error(typeof reply.code === "string" ? reply.code : "semantic-worker-failed"));
        else finish(undefined, reply);
      };
      worker.postMessage({ ...request, id });
    });
  }
  install = async () => {
    if (this.operation) return;
    this.stop();
    const abort = new AbortController();
    this.operation = abort;
    this.publish({ phase: "downloading", loaded: 0, issue: "" });
    try {
      await this.lock("exclusive", abort.signal, async () => {
        await this.job({ kind: "install" }, abort.signal);
        if (!await readInstalledModel(location.origin)) throw new Error("semantic-install-incomplete");
      });
      if (!abort.signal.aborted) { this.publish({ phase: "ready", loaded: MODEL_DOWNLOAD_BYTES }); this.channel?.postMessage("changed"); }
    } catch (error) {
      this.publish({ phase: "error", issue: abort.signal.aborted ? "다운로드를 중지했어요. 다시 설치하면 확인된 파일을 재사용해요." : error instanceof Error && error.message === "semantic-asset-integrity" ? "다운로드 파일이 예상 버전과 달라 설치를 중단했어요." : "모델을 준비하지 못했어요. 저장 공간과 네트워크를 확인해 주세요. 기본 검색은 계속 사용할 수 있어요." });
    } finally { if (this.operation === abort) this.operation = null; }
  };
  remove = async () => {
    this.stop();
    const abort = new AbortController();
    this.operation = abort;
    this.publish({ phase: "deleting", issue: "" });
    this.channel?.postMessage("changed");
    try {
      await this.lock("exclusive", abort.signal, async () => {
        await new LocalTextIndex().invalidateSemanticModel();
        await caches.delete(SEMANTIC_MODEL.cache);
      });
      this.publish({ phase: "absent", loaded: 0 });
      this.channel?.postMessage("changed");
    } catch { this.publish({ phase: "error", issue: "모델 삭제를 마치지 못했어요. 다시 삭제해 주세요." }); }
    finally { if (this.operation === abort) this.operation = null; }
  };
  async infer(request: Exclude<Job, { kind: "install" }>, signal: AbortSignal): Promise<Reply> {
    if (this.operation) throw new Error("semantic-busy");
    return this.lock("shared", signal, async () => {
      const installed = await readInstalledModel(location.origin);
      if (!installed || this.operation) throw new Error("semantic-model-missing");
      const result = await this.job(request, signal);
      if (signal.aborted || (await readInstalledModel(location.origin))?.stamp !== installed.stamp) throw new Error("semantic-model-changed");
      return result;
    });
  }
  async query(text: string, signal: AbortSignal): Promise<Float32Array> {
    const reply = await this.infer({ kind: "query", text }, signal);
    if (reply.kind !== "query" || !isSemanticVector(reply.vector)) throw new Error("semantic-invalid-vector");
    return reply.vector;
  }
  async document(text: string, name: string, folder: string, signal: AbortSignal) {
    const reply = await this.infer({ kind: "document", text, name, folder }, signal);
    if (reply.kind !== "document" || !Array.isArray(reply.chunks) || typeof reply.complete !== "boolean") throw new Error("semantic-invalid-record");
    return { chunks: reply.chunks as SemanticChunk[], complete: reply.complete };
  }
  async score(text: string, candidates: readonly (readonly SemanticChunk[])[], signal: AbortSignal): Promise<Score[]> {
    const reply = await this.infer({ kind: "score", text, candidates }, signal);
    if (reply.kind !== "score" || !Array.isArray(reply.scores) || reply.scores.length !== candidates.length) throw new Error("semantic-invalid-scores");
    const seen = new Set<number>();
    for (const value of reply.scores as Score[]) {
      if (!value || !Number.isSafeInteger(value.index) || value.index < 0 || value.index >= candidates.length || seen.has(value.index)
        || !Number.isFinite(value.score) || value.score < -1 || value.score > 1 || !candidates[value.index].some(chunk => chunk.start === value.start && chunk.end === value.end)) throw new Error("semantic-invalid-scores");
      seen.add(value.index);
    }
    return reply.scores;
  }
  async evidence(input: SemanticEvidenceInput, signal: AbortSignal): Promise<FindEvidence | null> {
    const reply = await this.infer({ kind: "evidence", ...input }, signal);
    if (reply.kind !== "evidence" || !("finding" in reply) || !isFindEvidence(reply.finding, input.query)) throw new Error("semantic-invalid-evidence");
    return reply.finding;
  }
}

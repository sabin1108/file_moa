import { managedIssue } from "../lib/managed-files";
import type { WorkflowDraft } from "../services/workflow-drafts";

type LoadedEditor = { id: string; path: string[]; text: string; originalText: string; hasBackup: boolean; conflict: boolean };
export type InlineEditorState = Readonly<{
  open: boolean; phase: "idle" | "loading" | "ready" | "saving" | "error";
  id: string | null; path: readonly string[]; text: string; savedText: string;
  hasBackup: boolean; savedAt: string | null; issue: string | null; draftIssue: boolean; composing: boolean;
  closeRequested: boolean;
}>;
const initial: InlineEditorState = { open: false, phase: "idle", id: null, path: [], text: "", savedText: "",
  hasBackup: false, savedAt: null, issue: null, draftIssue: false, composing: false, closeRequested: false };
export class InlineEditorController {
  private state = initial;
  private sequence = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly load: (path: readonly string[], signal: AbortSignal, id?: string) => Promise<LoadedEditor>,
    private readonly write: (id: string, text: string, signal: AbortSignal, manual: boolean) => Promise<{ hasBackup: boolean; savedAt: string }>,
    private readonly persist: (draft: WorkflowDraft) => Promise<void>, private readonly remove: (id: string) => Promise<void>,
    private readonly release: () => void) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: InlineEditorState) { this.state = value; this.listeners.forEach(listener => listener()); }
  private draft(): WorkflowDraft | null {
    const { id, path, text } = this.state;
    return id ? { id, flow: "edit", source: path.slice(0, -1), names: [path.at(-1)!], destination: [], text, interrupted: false } : null;
  }
  private persistDraft = async () => {
    const draft = this.draft();
    const sequence = this.sequence;
    if (!draft) return;
    try { await this.persist(draft); if (sequence === this.sequence && this.state.draftIssue) this.publish({ ...this.state, draftIssue: false }); }
    catch { if (sequence === this.sequence) this.publish({ ...this.state, draftIssue: true }); }
  };
  open = async (path: readonly string[], id?: string) => {
    this.abort?.abort();
    const sequence = ++this.sequence;
    const abort = new AbortController();
    this.abort = abort;
    this.publish({ ...initial, open: true, phase: "loading", path: [...path] });
    try {
      const value = await this.load(path, abort.signal, id);
      if (sequence !== this.sequence) return;
      this.abort = null;
      this.publish({ ...this.state, id: value.id, phase: value.conflict ? "error" : "ready", text: value.text,
        savedText: value.originalText, hasBackup: value.hasBackup, issue: value.conflict ? "managed-changed" : null });
      await this.persistDraft();
    } catch (error) {
      if (sequence === this.sequence) this.publish({ ...this.state, phase: "error", issue: managedIssue(error) });
    }
  };
  setText = (text: string) => {
    if (!this.state.open || !["ready", "saving"].includes(this.state.phase)) return;
    this.publish({ ...this.state, text });
    void this.persistDraft();
  };
  setComposing = (composing: boolean) => this.publish({ ...this.state, composing });
  save = async (manual = true) => {
    if (this.state.phase !== "ready" || !this.state.id || this.state.composing
      || this.state.text === this.state.savedText || (!manual && !this.state.hasBackup)) return false;
    const text = this.state.text;
    const sequence = this.sequence;
    const abort = new AbortController();
    this.abort = abort;
    this.publish({ ...this.state, phase: "saving", issue: null });
    try {
      const result = await this.write(this.state.id, text, abort.signal, manual);
      if (sequence !== this.sequence) return false;
      this.abort = null;
      this.publish({ ...this.state, phase: "ready", savedText: text, hasBackup: result.hasBackup, savedAt: result.savedAt });
      await this.persistDraft();
      return true;
    } catch (error) {
      if (sequence !== this.sequence) return false;
      this.abort = null;
      this.publish({ ...this.state, phase: "error", issue: managedIssue(error) });
      return false;
    }
  };
  close = (discard = false) => {
    if (this.state.phase === "saving") return false;
    if (!discard && this.state.text !== this.state.savedText) { this.publish({ ...this.state, closeRequested: true }); return false; }
    const id = this.state.id;
    this.sequence++;
    this.abort?.abort();
    this.release();
    this.publish(initial);
    if (id) void this.remove(id).catch(() => {});
    return true;
  };
  retrySave = () => {
    if (this.state.phase !== "error" || !["permission", "managed-operation-running"].includes(this.state.issue ?? "")) return Promise.resolve(false);
    this.publish({ ...this.state, phase: "ready", issue: null });
    return this.save(true);
  };
  dispose = () => {
    this.sequence++;
    this.abort?.abort();
    this.release();
    this.publish(initial);
  };
  continueEditing = () => this.publish({ ...this.state, closeRequested: false });
}

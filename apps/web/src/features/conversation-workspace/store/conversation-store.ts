import { chatReducer, initialChatState, type RestorableChatAction } from "../lib/general-chat-state";
import type { GroundedAnswer } from "../../../shared/grounded-chat";

export type GroundedConversationResult = { taskId: string; key: string; question: string; value: GroundedAnswer };

const initialSelection = { id: null as string | null, temporary: true, projectId: "", status: "임시 대화", lastSaved: "" };

export class ConversationStore {
  private state = initialChatState;
  private listeners = new Set<() => void>();
  private selection = initialSelection;
  private grounded: GroundedConversationResult | null = null;
  getSnapshot = () => this.state;
  getServerSnapshot = () => initialChatState;
  getSelection = () => this.selection;
  getServerSelection = () => initialSelection;
  getGroundedResult = () => this.grounded;
  getServerGroundedResult = () => null;
  setGroundedResult = (value: GroundedConversationResult | null) => {
    this.grounded = value;
    this.listeners.forEach(listener => listener());
  };
  select = (change: Partial<typeof initialSelection>) => {
    this.selection = { ...this.selection, ...change };
    this.listeners.forEach(listener => listener());
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  dispatch = (action: RestorableChatAction) => {
    const next = chatReducer(this.state, action);
    if (next === this.state && !(action.type === "reset" && (this.selection !== initialSelection || this.grounded))) return;
    this.state = next;
    if (action.type === "reset") { this.selection = initialSelection; this.grounded = null; }
    this.listeners.forEach(listener => listener());
  };
}

import type { ConversationPayload } from "../../../shared/ai-records";
import type { AiLibraryState } from "../ai-records-controller";

export type ConversationRecordControls = {
  library: AiLibraryState;
  id: string | null;
  temporary: boolean;
  status: string;
  persist: () => Promise<void>;
  open: (payload: ConversationPayload | null, temporary?: boolean) => Promise<void>;
  needsDiscard: boolean;
  cancelOpen: () => void;
  discardAndOpen: () => void;
  enableStorage: () => Promise<void>;
  detachDeletedConversation: (id: string) => void;
  detachStorage: () => void;
  assertAvailable: () => void;
};

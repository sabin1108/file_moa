import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationStore } from "../../src/features/conversation-workspace/store/conversation-store";
import type { ConversationKind } from "../../src/shared/ai-records";
import type { ChatTurn } from "../../src/features/conversation-workspace/lib/general-chat-state";

const fixture = vi.hoisted(() => ({
  managed: { phase: "idle" },
  finding: { phase: "idle" },
  organization: { phase: "draft", snapshot: null, questions: [] },
  groundedPending: false,
  findCancel: vi.fn(),
  findReset: vi.fn(),
  organizationCancel: vi.fn(),
  organizationReset: vi.fn(),
  previewClose: vi.fn(),
  groundedCancel: vi.fn(),
  groundedReset: vi.fn(),
  route: vi.fn(),
  subscribe: () => () => { },
}));

vi.mock("../../src/features/local-folders/providers/SourceFolderProvider", () => ({
  useSharedSourceFolderConnection: () => ({
    state: { view: { status: "connected" } },
    finding: {
      subscribe: fixture.subscribe,
      getSnapshot: () => fixture.finding,
      getServerSnapshot: () => fixture.finding,
      cancel: fixture.findCancel,
      reset: fixture.findReset
    },
    organization: {
      subscribe: fixture.subscribe,
      getSnapshot: () => fixture.organization,
      getServerSnapshot: () => fixture.organization,
      cancel: fixture.organizationCancel,
      reset: fixture.organizationReset
    },
    organizationExecution: {
      managed: {
        subscribe: fixture.subscribe,
        getSnapshot: () => fixture.managed,
        getServerSnapshot: () => fixture.managed
      }
    },
    preview: { close: fixture.previewClose },
  })
}));
vi.mock(
  "../../src/features/conversation-workspace/hooks/useConversationRequests",
  () => ({ useConversationRequests: () => ({ submitRequest: fixture.route }) })
);
vi.mock(
  "../../src/features/conversation-workspace/hooks/useGroundedConversation",
  () => ({
    useGroundedConversation: () => ({
      documents: [],
      pending: fixture.groundedPending,
      isSending: () => fixture.groundedPending,
      result: null,
      cancel: fixture.groundedCancel,
      reset: fixture.groundedReset
    })
  })
);

import { useWorkspaceConversation } from "../../src/features/conversation-workspace/hooks/useWorkspaceConversation";

function renderWorkflow(store: ConversationStore) {
  const chat = {
    state: store.getSnapshot(),
    getSnapshot: store.getSnapshot,
    send: vi.fn(),
    stop: vi.fn(),
    restore: vi.fn(),
    recordTask: vi.fn((
      kind: Exclude<ConversationKind, "chat">,
      question: string,
      answer: string,
      status: ChatTurn["status"] = "pending") => {
      const id = "task-one";

      store.dispatch({ type: "local", id, kind, question, answer, status });

      return id;
    }),
    updateTask: vi.fn(),
    updateDraft: (value: string) => store.dispatch({ type: "draft", value }),
  };
  let workflow!: ReturnType<typeof useWorkspaceConversation>;

  function Probe() {
    workflow = useWorkspaceConversation(chat);

    return null;
  }

  renderToStaticMarkup(<Probe />);

  return { chat, workflow };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.managed = { phase: "idle" };
  fixture.finding = { phase: "idle" };
  fixture.organization = { phase: "draft", snapshot: null, questions: [] };
  fixture.groundedPending = false;
});

it("stopping an ordinary reply preserves all prepared material state", () => {
  const store = new ConversationStore();

  store.dispatch({ type: "start", id: "chat-one", question: "일반 질문" });

  const { workflow, chat } = renderWorkflow(store);

  workflow.cancel();
  expect(chat.stop).toHaveBeenCalledOnce();
  expect(fixture.findCancel).not.toHaveBeenCalled();
  expect(fixture.organizationCancel).not.toHaveBeenCalled();
  expect(fixture.groundedCancel).not.toHaveBeenCalled();
});

it("checks managed state again before switching or resetting conversation state", () => {
  const { workflow } = renderWorkflow(new ConversationStore());

  fixture.managed = { phase: "running" };
  expect(() => workflow.assertCanChange()).toThrow("managed-operation-running");
  expect(() => workflow.reset()).toThrow("managed-operation-running");
  expect(fixture.findReset).not.toHaveBeenCalled();
  expect(fixture.organizationReset).not.toHaveBeenCalled();
  expect(fixture.previewClose).not.toHaveBeenCalled();
});

it("consumes a local request once even before React renders its cleared draft", async () => {
  const store = new ConversationStore();

  store.dispatch({ type: "draft", value: "자료 찾아줘" });

  const { workflow, chat } = renderWorkflow(store);

  await Promise.all([workflow.submit("find"), workflow.submit("find")]);
  expect(chat.recordTask).toHaveBeenCalledOnce();
  expect(fixture.route).toHaveBeenCalledOnce();
  expect(store.getSnapshot().draft).toBe("");
});

it.each(["chat", "find", "organize", "grounded"])("blocks conversation changes when %s starts after render", kind => {
  const store = new ConversationStore();
  const { workflow } = renderWorkflow(store);

  if (kind === "chat") store.dispatch({ type: "start", id: "in-flight", question: "일반 질문" });

  if (kind === "find") fixture.finding = { phase: "searching" };

  if (kind === "organize") fixture.organization = { phase: "reading", snapshot: null, questions: [] };

  if (kind === "grounded") fixture.groundedPending = true;

  expect(() => workflow.assertCanChange()).toThrow("conversation-response-running");
  expect(() => workflow.reset()).toThrow("conversation-response-running");
  expect(fixture.findReset).not.toHaveBeenCalled();
  expect(fixture.organizationReset).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const fixture = vi.hoisted(() => {
  const owner = { userId: "owner-a", workspaceId: "workspace-a" };
  const document = {
    id: "document-1",
    name: "note.md",
    path: ["note.md"],
    sha256: "a".repeat(64),
    excerptHash: "b".repeat(64)
  };
  const preparation = { snapshot: { documents: [document] }, selectedIds: [document.id], purpose: "grounded", submittedRequest: "자료 질문", request: "자료 질문" };
  const result = {
    taskId: "task-one",
    key: JSON.stringify([owner, "source-one", preparation.purpose, preparation.submittedRequest, [[document.id, document.path, document.sha256, document.excerptHash]]]),
    question: "자료 질문",
    value: { answer: "확인한 답변", citations: [] }
  };

  return {
    owner,
    preparation,
    result,
    selection: { id: "chat-a", temporary: false },
    save: vi.fn(),
    subscribe: () => () => { }
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../src/features/local-folders/SourceFolderProvider", () => ({
  useSharedSourceFolderConnection: () => ({
    owner: fixture.owner,
    sources: [{ active: true, connectionId: "source-one" }],
    organization: {
      subscribe: fixture.subscribe,
      getSnapshot: () => fixture.preparation,
      getServerSnapshot: () => fixture.preparation
    },
    records: { getSnapshot: () => ({ phase: "ready" }), save: fixture.save },
  })
}));
vi.mock("../../../src/features/conversation-workspace/ConversationStateProvider", () => ({
  useConversationStore: () => ({
    subscribe: fixture.subscribe,
    getGroundedResult: () => fixture.result,
    getServerGroundedResult: () => fixture.result,
    setGroundedResult: vi.fn(),
    getSelection: () => fixture.selection,
  })
}));

import { useGroundedConversation } from "../../../src/features/conversation-workspace/grounded/useGroundedConversation";

beforeEach(() => {
  fixture.save.mockReset().mockResolvedValue(undefined);
});

it.each([false, true])("links a grounded artifact to the saved conversation only when temporary=%s is false", temporary => {
  fixture.selection = { id: "chat-a", temporary };

  let grounded!: ReturnType<typeof useGroundedConversation>;

  function Probe() {
    grounded = useGroundedConversation("자료 질문");

    return null;
  }

  renderToStaticMarkup(<Probe />);
  grounded.saveResult();
  expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ type: "artifact", sourceConversationId: temporary ? null : "chat-a", status: "draft" }));
});

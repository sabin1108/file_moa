import { expect, it } from "vitest";
import { selectPersonalContext } from "../../src/features/ai-records/lib/personal-context";
import type { MemoryPayload } from "../../src/shared/ai-records";

it("only uses approved global and matching project memories", () => {
  const base: MemoryPayload = { type: "memory", id: "memory-a", title: "기억", updatedAt: new Date().toISOString(), content: "간단한 답변", sourceConversationId: null, status: "approved", scope: { type: "global" } };
  const context = selectPersonalContext([base, { ...base, id: "proposed", status: "proposed" }, { ...base, id: "inactive", status: "inactive" }, { ...base, id: "project-a", scope: { type: "project", id: "a" } }, { ...base, id: "project-b", scope: { type: "project", id: "b" } }], "a");
  expect(context.entries.map(item => item.id)).toEqual(["memory-a", "project-a"]);
});

import { expect, it } from "vitest";
import { managedWorkflowStep } from "../../../src/features/local-folders/lib/managed-workflow-step";
it("begins with preservation and never returns to it after writing or completion", () => {
  const steps = [
    { phase: "ready", result: null },
    { phase: "running", result: null },
    { phase: "running", result: { phase: "preserving" } },
    { phase: "running", result: { phase: "writing" } },
    { phase: "running", result: { phase: "completed" } },
    { phase: "completed", result: { phase: "completed" } },
  ].map(managedWorkflowStep);
  expect(steps).toEqual(["review", "preserve", "preserve", "execute", "execute", "result"]);
});

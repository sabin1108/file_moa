import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getSampleCatalog } from "../../../src/server/demo/sample-catalog";
import { selectOrganizationCandidates } from "../../../src/features/sample-workspace/organization/organization-candidates";
import expectations from "../../../../../tests/fixtures/classification/organization-expectations.json";

describe("public corpus retrieval", () => {
  it.each(expectations.scenarios)("retains the existing $instruction candidates within the provider budget", scenario => {
    const candidates = selectOrganizationCandidates(getSampleCatalog().documents, scenario.instruction);

    expect(candidates.length).toBeLessThanOrEqual(40);

    for (const id of scenario.matchedIds) expect(candidates.map(document => document.id)).toContain(id);

    expect(candidates.reduce(
      (sum, document) => sum + JSON.stringify({ id: document.id, name: document.name, excerpt: document.excerpt }).length + 100,
      scenario.instruction.length
    )).toBeLessThanOrEqual(6000);
  });
});

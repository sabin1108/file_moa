import { describe, expect, it } from "vitest";
import { canUseMemory, parseLocalRecord } from "../src/local-record";

const valid = () => ({
  schemaVersion: 1,
  recordId: "record-1",
  revisionId: "revision-1",
  parentRevisionId: null,
  kind: "artifact",
  scope: { type: "project", id: "project-1" },
  state: "draft",
  createdAt: "2026-10-25T00:00:00.000Z",
  contentFile: "revision-1.md",
  contentSha256: "a".repeat(64),
});

describe("local record v1 boundary", () => {
  it("round-trips known fields and rejects unsupported versions", () => {
    expect(parseLocalRecord(JSON.parse(JSON.stringify(valid())))).toEqual(valid());
    expect(() => parseLocalRecord({ ...valid(), schemaVersion: 2 })).toThrow();
  });
  it.each(["../outside", "C:\\private", "a/b", "con", "nul", "lpt1", "", "a".repeat(65)])("rejects unsafe ID %s", id => {
    expect(() => parseLocalRecord({ ...valid(), revisionId: id, contentFile: `${id}.md` })).toThrow();
  });
  it("requires exact content name, digest, date and a distinct parent", () => {
    for (const patch of [
      { contentFile: "other.md" }, { contentSha256: "xyz" }, { createdAt: "yesterday" },
      { createdAt: "2026-02-30T00:00:00.000Z" }, { parentRevisionId: "revision-1" },
    ]) expect(() => parseLocalRecord({ ...valid(), ...patch })).toThrow();
  });
  it("rejects missing fields, extra secrets, and malformed scope", () => {
    expect(() => parseLocalRecord(null)).toThrow();
    expect(() => parseLocalRecord({ ...valid(), apiKey: "never-store" })).toThrow();
    expect(() => parseLocalRecord({ ...valid(), scope: { type: "project" } })).toThrow();
    expect(() => parseLocalRecord({ ...valid(), scope: { type: "global", id: "unexpected" } })).toThrow();
    expect(() => parseLocalRecord({ ...valid(), state: undefined })).toThrow();
    expect(() => parseLocalRecord({ ...valid(), kind: ["artifact"] })).toThrow();
    expect(() => parseLocalRecord({ ...valid(), state: ["draft"] })).toThrow();
  });
  it("uses only approved memories in the active scope", () => {
    const memory = parseLocalRecord({ ...valid(), kind: "memory", state: "approved" });

    expect(canUseMemory(memory, "project-1")).toBe(true);
    expect(canUseMemory(memory, "project-2")).toBe(false);
    expect(canUseMemory(memory)).toBe(false);
    expect(canUseMemory(parseLocalRecord({ ...memory, scope: { type: "global" } }))).toBe(true);

    for (const state of ["proposed", "inactive"]) {
      expect(canUseMemory(parseLocalRecord({ ...memory, state }), "project-1")).toBe(false);
    }

    expect(canUseMemory(parseLocalRecord(valid()), "project-1")).toBe(false);
  });
  it("does not turn task instructions or draft artifacts into approved memories", () => {
    expect(() => parseLocalRecord({ ...valid(), kind: "memory", state: "approved", scope: { type: "task", id: "task-1" } })).toThrow();
    expect(() => parseLocalRecord({ ...valid(), kind: "memory", state: "final" })).toThrow();
    expect(() => parseLocalRecord({ ...valid(), state: "approved" })).toThrow();
  });
});

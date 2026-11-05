import { describe, expect, it } from "vitest";
import { parseCopyEvent, summarizeCopyEvents, type CopyEvent } from "../../../src/features/local-folders/lib/copy-journal";

const owner = { userId: "test", workspaceId: "work" };
const id = "11111111-1111-4111-8111-111111111111";
const sha256 = "a".repeat(64);
function chain(types = ["prepared", "item-started", "item-verified", "stopped"]): CopyEvent[] {
  return types.map((type, revision) => {
    const eventId = `22222222-2222-4222-8222-${String(revision).padStart(12, "0")}`;
    const value = { schemaVersion: 1, operation: "copy", operationId: id, eventId, revision,
      previousEventId: revision ? `22222222-2222-4222-8222-${String(revision - 1).padStart(12, "0")}` : null,
      owner, sourceParent: ["from"], destinationParent: ["to"], createdAt: "2026-11-01T00:00:00.000Z", type,
      payload: type === "prepared" ? { items: [{ itemId: "item-0001", from: ["from", "노트.md"], to: ["to", "노트.md"], size: 3, lastModified: 1, sha256 }] }
        : type === "stopped" ? { reason: "completed", notRunItemIds: [] }
          : type === "item-verified" ? { itemId: "item-0001", size: 3, sha256 } : { itemId: "item-0001" } };
    const event = parseCopyEvent(value);
    if (!event) throw Error("invalid fixture");
    return event;
  });
}
describe("copy journal evidence", () => {
  it("reconstructs a complete chain regardless of directory order", () => {
    const group = summarizeCopyEvents(chain().reverse(), false)[0];
    expect(group.status).toBe("completed"); expect(group.items[0].status).toBe("verified");
  });
  it("never treats a prepared-only or started-only history as not-run certainty", () => {
    for (const count of [1, 2]) expect(summarizeCopyEvents(chain().slice(0, count), false)[0]).toMatchObject({ status: "uncertain", items: [expect.objectContaining({ status: "uncertain" })] });
  });
  it("marks a missing event, fork and incomplete read uncertain", () => {
    const events = chain();
    for (const input of [events.filter(e => e.revision !== 1), [...events, { ...events[2], eventId: crypto.randomUUID() }]]) {
      expect(summarizeCopyEvents(input, false)[0].status).toBe("uncertain");
    }
    expect(summarizeCopyEvents(events, true)[0].status).toBe("uncertain");
  });
  it("deduplicates exact event redelivery but rejects changed content", () => {
    const events = chain();
    expect(summarizeCopyEvents([...events, events[1]], false)[0].status).toBe("completed");
    expect(summarizeCopyEvents([...events, { ...events[1], createdAt: "2026-11-01T00:00:01.000Z" }], false)[0].status).toBe("uncertain");
  });
  it("rejects terminal without start, early completed, hash mismatch and events after stop", () => {
    const events = chain();
    const invalid = [chain(["prepared", "item-verified", "stopped"]), chain(["prepared", "stopped"]),
      [...events, { ...events[1], revision: 4, previousEventId: events[3].eventId, eventId: crypto.randomUUID() }],
      events.map(e => e.type === "item-verified" ? { ...e, payload: { ...e.payload, sha256: "b".repeat(64) } } : e)];
    for (const input of invalid) expect(summarizeCopyEvents(input, false)[0].status).toBe("uncertain");
  });
  it("validates owner, path, type, time and manifest boundaries from unknown JSON", () => {
    const event = chain()[0];
    for (const value of [null, { ...event, schemaVersion: 2 }, { ...event, owner: {} }, { ...event, destinationParent: [".."] },
      { ...event, type: "deleted" }, { ...event, createdAt: "2026-02-30T00:00:00.000Z" },
      { ...event, payload: { items: [] } }, { ...event, destinationParent: [".moa-history"] }]) expect(parseCopyEvent(value)).toBeNull();
  });
});

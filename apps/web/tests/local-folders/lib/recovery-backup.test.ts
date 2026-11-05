import { describe, expect, it } from "vitest";
import { backupPlanInput, conflictingBackupPlan, parseBackupManifest } from "../../../src/features/local-folders/lib/recovery-backup";

describe("BACKUP-001/006 input boundaries", () => {
  it("narrows a mixed selection to exact conflicts and blocks other risk signals", () => {
    const conflict = { from: ["from", "a.txt"], to: ["to", "a.txt"], issues: ["name-conflict" as const] };
    const plan = { operation: "copy" as const, conflictCount: 1, directoriesToCreate: [],
      rows: [conflict, { from: ["from", "b.txt"], to: ["to", "b.txt"], issues: [] }] };
    expect(conflictingBackupPlan(plan)?.rows).toEqual([conflict]);
    expect(conflictingBackupPlan({ ...plan, operation: "move" })).toBeNull();
    expect(conflictingBackupPlan({ ...plan, rows: [{ ...conflict, issues: ["ambiguous-name"] }] })).toBeNull();
  });
  it("accepts exact-name conflicts but rejects traversal, same location, duplicates and ambiguous conflicts", () => {
    const plan = { operation: "copy" as const, rows: [{ from: ["from", "a.txt"], to: ["to", "a.txt"], issues: ["name-conflict" as const] }], conflictCount: 1, directoriesToCreate: [] };
    expect(backupPlanInput(plan).rows).toHaveLength(1);
    for (const value of [
      { ...plan, operation: "move" },
      { ...plan, rows: [...plan.rows, ...plan.rows] },
      { ...plan, rows: [{ ...plan.rows[0], from: ["..", "a.txt"] }] },
      { ...plan, rows: [{ ...plan.rows[0], to: ["from", "a.txt"] }] },
      { ...plan, rows: [{ ...plan.rows[0], issues: ["ambiguous-name"] }] },
    ]) {
      expect(() => backupPlanInput(value)).toThrow();
    }
  });

  it("rejects unknown external JSON and incomplete success claims", () => {
    for (const value of [null, {}, { schemaVersion: 1, state: "verified" }, { body: "private" }]) {
      expect(parseBackupManifest(value)).toBeNull();
    }
  });

  it("rejects duplicated stopped item IDs and completed records carrying an error", () => {
    const stopped = { schemaVersion: 1, operation: "recovery-backup", operationId: "11111111-1111-4111-8111-111111111111",
      vaultId: "22222222-2222-4222-8222-222222222222", owner: { userId: "u", workspaceId: "w" },
      createdAt: "2026-11-04T00:00:00.000Z", type: "stopped", reason: "completed", issue: null,
      items: [{ itemId: "item-0001", status: "verified" }] };
    expect(parseBackupManifest(stopped)).not.toBeNull();
    expect(parseBackupManifest({ ...stopped, issue: "backup-failed" })).toBeNull();
    expect(parseBackupManifest({ ...stopped, items: [...stopped.items, ...stopped.items] })).toBeNull();
  });
});

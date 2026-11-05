/** Read-only inspection values. These are neither file handles nor permission to execute a copy. */
import { comparableName, parsePlanDestination, type FileChangePlan } from "./file-change-plan";

export const COPY_INSPECTION_LIMITS = Object.freeze({ files: 100, fileBytes: 16 * 1024 * 1024, totalBytes: 64 * 1024 * 1024 });
export type CopyInspectionFile = Readonly<{
  from: readonly string[];
  to: readonly string[];
  size: number;
  lastModified: number;
  sha256: string;
}>;
export type CopyInspection = Readonly<{ files: readonly CopyInspectionFile[]; totalBytes: number }>;

export function copyInspectionInput(plan: FileChangePlan) {
  if (plan.operation !== "copy" || plan.conflictCount !== 0 || plan.directoriesToCreate.length || !plan.rows.length) throw new Error("invalid-copy-plan");
  if (plan.rows.length > COPY_INSPECTION_LIMITS.files) throw new Error("copy-limit");
  const path = (value: readonly string[]) => {
    if (!Array.isArray(value) || !value.length || value.some(segment => typeof segment !== "string" || !segment || /[/\\]/u.test(segment))) throw new Error("invalid-copy-plan");
    return Object.freeze(parsePlanDestination(value.join("/")));
  };
  const rows = plan.rows.map(row => {
    const from = path(row.from), to = path(row.to);
    if (row.issues.length || from.at(-1) !== to.at(-1)) throw new Error("invalid-copy-plan");
    return Object.freeze({ from, to });
  });
  const sourcePath = rows[0].from.slice(0, -1);
  const destinationPath = rows[0].to.slice(0, -1);
  const names = new Set<string>();
  for (const row of rows) {
    const key = comparableName(row.from.at(-1)!);
    if (names.has(key) || JSON.stringify(row.from.slice(0, -1)) !== JSON.stringify(sourcePath)
      || JSON.stringify(row.to.slice(0, -1)) !== JSON.stringify(destinationPath)) throw new Error("invalid-copy-plan");
    names.add(key);
  }
  return { rows, sourcePath, destinationPath };
}

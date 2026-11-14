import { z } from "zod";
import { ownerSchema, recoveryIdSchema, createdAtSchema } from "../../recovery/recovery-vault-rules";
import { restoreDestinationPath } from "../../recovery/restore/recovery-restore-rules";
import { resolveEntryName } from "../../creation/new-entry";

export const MANAGED_LIMITS = {
  entries: 500,
  depth: 16,
  selection: 100,
  fileBytes: 16 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  editBytes: 2 * 1024 * 1024,
  manifestBytes: 1024 * 1024
};

export type ManagedKind = "copy" | "move" | "trash" | "edit" | "recover";

export type ManagedRequest = Readonly<{
  kind: ManagedKind;
  source: readonly string[];
  names: readonly string[];
  destination: readonly string[];
  text?: string;
  archiveId?: string;
  editId?: string;
}>;

export type ManagedNode = Readonly<{
  path: readonly string[];
  kind: "file" | "directory";
  size: number;
  modified: number;
  sha256: string | null;
  payload: string | null;
}>;

export type ManagedPreview = Readonly<{
  id: string;
  kind: ManagedKind;
  roots: readonly (readonly string[])[];
  destination: readonly string[];
  files: number;
  folders: number;
  bytes: number;
  paths: readonly (readonly string[])[];
  skipped: boolean;
}>;

export type ManagedResult = Readonly<{
  id: string;
  phase: "preserving" | "writing" | "removing" | "completed" | "cancelled" | "error";
  status: "not-run" | "uncertain" | "verified";
  copied: number;
  removed: number;
  preserved: boolean;
  issue: string | null;
}>;

const pathSchema = z.array(z.string()).min(1).max(32).refine(value => {
  try {
    return JSON.stringify(restoreDestinationPath(value)) === JSON.stringify(value);
  }
  catch {
    return false;
  }
});

/** 일반 폴더의 하위 작업 기록만 보존한다. 직접 선택·목적지 경계는 기존 검증을 쓴다. */

export function managedTreePath(path: readonly string[]): string[] {
  const masked = path.map(part => part.toLowerCase() === ".moa-history" ? "moa-history" : part);

  restoreDestinationPath(masked);

  if (!path.length || path[0].toLowerCase() === ".moa-history"
    || masked.some(part => resolveEntryName(part, "folder") !== part)) throw Error("managed-name");

  return [...path];
}

const treePathSchema = z.array(z.string()).min(1).max(32).refine(value => {
  try {
    managedTreePath(value);

    return true;
  } catch {
    return false;
  }
});
const nodeSchema = z.strictObject({
  path: treePathSchema,
  kind: z.enum(["file", "directory"]),
  size: z.number().int().min(0).max(MANAGED_LIMITS.fileBytes),
  modified: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  payload: recoveryIdSchema.nullable(),
}).refine(node => node.kind === "directory"
  ? node.size === 0 && node.sha256 === null && node.payload === null
  : node.sha256 !== null && node.payload !== null);
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operation: z.literal("managed-files"),
  operationId: recoveryIdSchema,
  kind: z.enum(["copy", "move", "trash", "edit", "recover"]),
  owner: ownerSchema,
  vaultId: recoveryIdSchema,
  createdAt: createdAtSchema,
  roots: z.array(pathSchema).min(1).max(MANAGED_LIMITS.selection),
  historyParent: z.array(z.string()).max(32).refine(value => {
    try {
      restoreDestinationPath(value);

      return true;
    } catch {
      return false;
    }
  }),
  targets: z.array(treePathSchema).min(1).max(MANAGED_LIMITS.entries),
  nodes: z.array(nodeSchema).min(1).max(MANAGED_LIMITS.entries),
}).superRefine((value, context) => {
  // Zod가 배열 길이 오류도 수집하는 동안 이 교차 검증이 호출될 수 있다.
  if (!value.roots.length || !value.nodes.length || value.roots.some(path => !path.length)
    || value.nodes.some(node => !node.path.length)) return;

  const keys = new Set<string>();
  const payloads = new Set<string>();
  let bytes = 0;
  const roots = new Set(value.roots.map(path => JSON.stringify(path)));
  const rootParent = JSON.stringify(value.roots[0].slice(0, -1));
  const siblingKeys = new Set<string>();

  if (roots.size !== value.roots.length || value.roots.some(path => JSON.stringify(path.slice(0, -1)) !== rootParent)) {
    context.addIssue({ code: "custom", message: "invalid roots" });
  }

  for (const node of value.nodes) {
    const key = JSON.stringify(node.path);
    const root = value.roots.find(path => path.length <= node.path.length && path.every((part, index) => node.path[index] === part));

    if (!root || keys.has(key) || node.path.length - root.length > MANAGED_LIMITS.depth
      || (node.payload !== null && payloads.has(node.payload))) context.addIssue({ code: "custom", message: "invalid tree" });

    keys.add(key);

    const siblingKey = JSON.stringify(node.path.slice(0, -1)) + "/" + node.path.at(-1)!.normalize("NFC").toLocaleLowerCase("en-US");

    if (siblingKeys.has(siblingKey) || node.kind !== "directory" && node.path.at(-1)!.toLowerCase() === ".moa-history") context.addIssue({ code: "custom", message: "invalid name" });

    siblingKeys.add(siblingKey);

    if (node.payload) payloads.add(node.payload);

    bytes += node.size;
  }

  if (bytes > MANAGED_LIMITS.totalBytes || value.targets.length !== value.nodes.length
    || new Set(value.targets.map(path => JSON.stringify(path))).size !== value.targets.length
    || value.roots.some(path => !keys.has(JSON.stringify(path)))) {
    context.addIssue({ code: "custom", message: "incomplete tree" });
  }

  for (const node of value.nodes) {
    if (value.roots.some(path => JSON.stringify(path) === JSON.stringify(node.path))) continue;

    const parent = value.nodes.find(parent => JSON.stringify(parent.path) === JSON.stringify(node.path.slice(0, -1)));

    if (parent?.kind !== "directory") context.addIssue({ code: "custom", message: "invalid parent" });
  }
});

export type ManagedManifest = z.infer<typeof manifestSchema>;

export function parseManagedManifest(value: unknown): ManagedManifest | null {
  const result = manifestSchema.safeParse(value);

  return result.success ? result.data : null;
}

export function managedNames(names: readonly string[]) {
  if (!names.length || names.length > MANAGED_LIMITS.selection || new Set(names).size !== names.length) throw Error("managed-selection");

  return names.map(name => {
    restoreDestinationPath([name]);

    if (resolveEntryName(name, "folder") !== name) throw Error("managed-name");

    return name;
  });
}

export function managedIssue(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (error instanceof Error && ["NotAllowedError", "SecurityError"].includes(error.name)) return "permission";

  if (/^(managed|source|backup)-[a-z-]{1,55}$/u.test(message)) return message;

  return "managed-failed";
}

export const managedMessages: Record<string, string> = {
  "workflow-interrupted": "저장된 작업 위치를 복원했습니다. 중단된 실행은 자동으로 반복하지 않으니 보존 기록과 남은 파일을 확인한 뒤 다시 검사하세요.",
  permission: "폴더와 보관함의 쓰기 권한을 허용해 주세요.",
  "backup-connections-required": "자료 폴더와 복구 보관함을 먼저 연결해 주세요.",
  "managed-conflict": "같은 이름이 있습니다. 다른 목적지를 선택하세요.",
  "managed-nested": "같은 위치나 선택한 폴더 안으로 옮길 수 없습니다.",
  "managed-limit": "파일16MiB·전체64MiB·500항목·깊이16 한도를 넘었습니다. 범위를 줄여 주세요.",
  "managed-protected": "보관함이나 관리 기록이 포함되어 있습니다. 일반 자료만 선택해 주세요.",
  "managed-changed": "파일이나 폴더가 바뀌었습니다. 다시 검사해 주세요.",
  "managed-edit-limit": "UTF-8 MD/TXT 파일은2MiB까지 편집할 수 있습니다.",
  "managed-failed": "작업을 마치지 못했습니다. 보존 기록과 남은 파일을 확인해 주세요.",
};

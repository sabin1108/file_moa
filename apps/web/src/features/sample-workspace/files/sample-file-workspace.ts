import { z } from "zod";
import type { SampleCatalog } from "../../../shared/sample-contract";
import { comparableName } from "../../local-folders/operations/planning/file-change-plan";
import { resolveEntryName, type EntryKind } from "../../local-folders/creation/new-entry";
import type { ManagedRequest, ManagedPreview } from "../../local-folders/operations/managed/managed-files";

const pathSchema = z.array(z.string().min(1).max(255)).min(1).max(20).refine(path => {
  try { return path.every(part => resolveEntryName(part) === part); }
  catch { return false; }
});
const nodeSchema = z.strictObject({
  id: z.string().min(1).max(100), path: pathSchema, kind: z.enum(["file", "directory"]),
  text: z.string().max(64_000).nullable(), assetId: z.string().min(1).max(100).nullable(),
}).refine(node => node.kind === "directory" ? node.text === null && node.assetId === null : node.text !== null);
const archiveSchema = z.strictObject({
  id: z.uuid(), kind: z.enum(["copy", "move", "trash", "edit", "recover"]),
  time: z.iso.datetime(), roots: z.array(pathSchema).min(1).max(100), nodes: z.array(nodeSchema).min(1).max(300),
});
export const sampleFilesSchema = z.strictObject({
  nodes: z.array(nodeSchema).min(2).max(300), archives: z.array(archiveSchema).max(30),
  selected: z.array(z.string().min(1).max(100)).max(200).default([]),
});
export type SampleFiles = z.infer<typeof sampleFilesSchema>;
export type SampleFileNode = SampleFiles["nodes"][number];
const key = (path: readonly string[]) => JSON.stringify(path.map(comparableName));
const within = (path: readonly string[], parent: readonly string[]) => path.length >= parent.length
  && parent.every((part, index) => comparableName(part) === comparableName(path[index]));
const equal = (first: readonly string[], second: readonly string[]) => key(first) === key(second);

function validateNodes(nodes: readonly SampleFileNode[], parents: boolean) {
  if (new Set(nodes.map(node => node.id)).size !== nodes.length || new Set(nodes.map(node => key(node.path))).size !== nodes.length) throw Error("managed-name-conflict");
  if (parents && nodes.some(node => node.path.length > 1 && !nodes.some(parent => parent.kind === "directory" && equal(parent.path, node.path.slice(0, -1))))) throw Error("managed-missing");
}

function validateFiles(value: SampleFiles): SampleFiles {
  sampleFilesSchema.parse(value);
  validateNodes(value.nodes, true);
  if (new Set(value.selected).size !== value.selected.length || value.selected.some(id => !value.nodes.some(node => node.id === id))) throw Error("managed-selection");
  if (["받은 자료", "정리한 자료"].some(name => !value.nodes.some(node => node.kind === "directory" && equal(node.path, [name])))) throw Error("managed-missing");
  if (value.nodes.some(node => !["받은 자료", "정리한 자료"].includes(node.path[0]))) throw Error("managed-name");
  if (new Set(value.archives.map(item => item.id)).size !== value.archives.length) throw Error("managed-archive-invalid");
  for (const archive of value.archives) {
    validateNodes(archive.nodes, false);
    if (archive.nodes.some(node => !archive.roots.some(root => within(node.path, root)))
      || archive.roots.some(root => !archive.nodes.some(node => equal(node.path, root)))) throw Error("managed-archive-invalid");
  }
  return value;
}

export function parseSampleFiles(catalog: SampleCatalog, input: unknown): SampleFiles {
  const value = validateFiles(sampleFilesSchema.parse(input));
  for (const node of [...value.nodes, ...value.archives.flatMap(item => item.nodes)]) {
    if (node.assetId !== null) {
      const source = catalog.documents.find(document => document.id === node.assetId);
      if (!source || node.text !== source.excerpt || node.path.at(-1) !== source.name) throw Error("invalid-sample-asset");
    } else if (node.kind === "file" && !/\.(md|txt)$/i.test(node.path.at(-1)!)) throw Error("managed-encoding");
  }
  return value;
}

export function createSampleFiles(catalog: SampleCatalog, locations: Readonly<Record<string, string | null>>): SampleFiles {
  const nodes: SampleFileNode[] = [];
  const folder = (path: string[]) => {
    for (let length = 1; length <= path.length; length++) {
      const parent = path.slice(0, length);
      if (!nodes.some(node => equal(node.path, parent))) nodes.push({ id: crypto.randomUUID(), path: parent, kind: "directory", text: null, assetId: null });
    }
  };
  const folderPath = (id: string | null) => {
    if (id === null) return ["받은 자료"];
    const label = catalog.folders.find(item => item.id === id)?.label;
    if (!label) throw Error("managed-missing");
    return label.startsWith("받은 자료/") ? label.split("/") : ["정리한 자료", ...label.split("/")];
  };
  folder(["받은 자료"]);
  folder(["정리한 자료"]);
  catalog.folders.forEach(item => folder(folderPath(item.id)));
  for (const document of catalog.documents) {
    const path = folderPath(locations[document.id] ?? null);
    folder(path);
    nodes.push({ id: document.id, path: [...path, document.name], kind: "file", text: document.excerpt, assetId: document.id });
  }
  return validateFiles({ nodes, archives: [], selected: [] });
}

function directory(state: SampleFiles, path: readonly string[]) {
  if (!path.length || !state.nodes.some(node => node.kind === "directory" && equal(node.path, path))) throw Error("managed-missing");
}

export function createSampleEntry(state: SampleFiles, path: readonly string[], name: string, kind: EntryKind): SampleFiles {
  directory(state, path);
  const resolved = resolveEntryName(name, kind);
  const target = [...path, resolved];
  if (state.nodes.some(node => equal(node.path, target))) throw Error("name-conflict");
  return validateFiles({ ...state, nodes: [...state.nodes, { id: crypto.randomUUID(), path: target, kind: kind === "folder" ? "directory" : "file", text: kind === "folder" ? null : "", assetId: null }] });
}

/** 계획은 다음 상태만 계산한다. 실행 시 어댑터가 현재 상태와 계획 snapshot을 다시 비교한다. */
export function prepareSampleFileOperation(state: SampleFiles, request: ManagedRequest): { next: SampleFiles; preview: ManagedPreview } {
  const recovering = request.kind === "recover";
  const archive = recovering ? state.archives.find(item => item.id === request.archiveId) : undefined;
  if (recovering && !archive) throw Error("managed-archive-invalid");
  const roots = archive?.roots ?? request.names.map(name => [...request.source, name]);
  if (!roots.length || roots.length > 100 || new Set(roots.map(key)).size !== roots.length) throw Error("managed-selection");
  if (roots.some(path => path.length < 2 || !state.nodes.some(node => equal(node.path, path))) && !recovering) throw Error("managed-missing");
  const selected = archive?.nodes ?? state.nodes.filter(node => roots.some(root => within(node.path, root)));
  const editing = request.kind === "edit";
  if (editing && (selected.length !== 1 || selected[0].kind !== "file" || !/\.(md|txt)$/i.test(selected[0].path.at(-1)!)
    || typeof request.text !== "string" || request.text.length > 64_000)) throw Error("managed-encoding");
  const destination = editing ? request.source : request.destination;
  const writing = request.kind !== "trash" && !editing;
  if (writing) {
    directory(state, destination);
    if (!recovering && roots.some(root => within(destination, root) || equal(destination, root.slice(0, -1)))) throw Error("managed-name-conflict");
  }
  const targets = selected.map(node => {
    const root = roots.find(root => within(node.path, root))!;
    return editing ? node.path : [...destination, root.at(-1)!, ...node.path.slice(root.length)];
  });
  if (writing && (new Set(targets.map(key)).size !== targets.length || targets.some(path => state.nodes.some(node => equal(node.path, path))))) throw Error("managed-name-conflict");
  const id = crypto.randomUUID();
  const preserved = request.kind === "move" || request.kind === "trash" || editing;
  const retained = preserved ? state.nodes.filter(node => !selected.includes(node)) : state.nodes;
  const additions = request.kind === "trash" ? [] : selected.map((node, index) => ({
    ...node, id: preserved ? node.id : crypto.randomUUID(), path: [...targets[index]],
    ...(editing ? { text: request.text!, assetId: null } : {}),
  }));
  const archives = preserved ? [...state.archives, { id, kind: request.kind, time: new Date().toISOString(), roots: roots.map(path => [...path]), nodes: selected.map(node => ({ ...node, path: [...node.path] })) }] : state.archives;
  const next = validateFiles({ nodes: [...retained, ...additions], archives, selected: [] });
  return { next, preview: {
    id, kind: request.kind, roots: roots.map(path => [...path]), destination: [...destination],
    files: selected.filter(node => node.kind === "file").length,
    folders: selected.filter(node => node.kind === "directory").length,
    bytes: selected.reduce((sum, node) => sum + new TextEncoder().encode(node.text ?? "").byteLength, 0),
    paths: targets.map(path => [...path]), skipped: false,
  } };
}

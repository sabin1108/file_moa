import type { WorkspaceFolderNode } from "./WorkspaceFolderTree";

export function workspaceFolderNodes(root: string, paths: readonly (readonly string[])[]): WorkspaceFolderNode[] {
  const nodes = new Map<string, WorkspaceFolderNode>([["[]", { path: [], label: root }]]);
  for (const path of paths) for (let length = 1; length <= path.length; length++) {
    const prefix = path.slice(0, length);
    nodes.set(JSON.stringify(prefix), { path: prefix, label: prefix.at(-1)! });
  }
  return [...nodes.values()].sort((a, b) => {
    for (let index = 0; index < Math.min(a.path.length, b.path.length); index++) {
      const order = a.path[index].localeCompare(b.path[index], "ko");
      if (order) return order;
    }
    return a.path.length - b.path.length;
  });
}

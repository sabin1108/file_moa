export type PathChange = Readonly<{
  from: readonly string[];
  to: readonly string[];
  kind?: "file" | "directory";
}>;
export type ComparisonNode = {
  name: string;
  kind: "file" | "directory" | "entry";
  count: number;
  children: ComparisonNode[];
};

/** 선택 항목의 표시 구조만 만든다. 경로 승인·충돌 판정·파일 접근은 기존 계획/검사에 남긴다. */
export function buildComparisonTrees(
  changes: readonly PathChange[],
  operation: "copy" | "move" | null,
) {
  const tree = (
    entries: readonly { path: readonly string[]; kind?: PathChange["kind"] }[],
  ) => {
    const roots: ComparisonNode[] = [];
    for (const entry of entries) {
      let siblings = roots;
      entry.path.forEach((name, index) => {
        const leaf = index === entry.path.length - 1;
        let node = siblings.find((node) => node.name === name);
        if (!node) {
          node = {
            name,
            kind: leaf ? (entry.kind ?? "entry") : "directory",
            count: 0,
            children: [],
          };
          siblings.push(node);
        }
        if (leaf) node.count++;
        siblings = node.children;
      });
    }
    return roots;
  };
  const originals = changes.map((change) => ({
    path: change.from,
    kind: change.kind,
  }));
  return {
    before: tree(originals),
    after: tree([
      ...(operation === "copy" ? originals : []),
      ...changes.map((change) => ({ path: change.to, kind: change.kind })),
    ]),
  };
}

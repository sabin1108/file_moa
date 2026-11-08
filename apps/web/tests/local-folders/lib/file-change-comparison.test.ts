import { expect, it } from "vitest";
import { buildComparisonTrees } from "../../../src/features/local-folders/lib/file-change-comparison";

const changes = [
  { from: ["보고.md"], to: ["정리", "성능", "보고.md"], kind: "file" as const },
  {
    from: ["혼합.txt"],
    to: ["정리", "혼합", "혼합.txt"],
    kind: "file" as const,
  },
];
it("groups shared ancestors without mutating source changes", () => {
  const before = JSON.stringify(changes);
  const trees = buildComparisonTrees(changes, null);
  expect(trees.before.map((node) => node.name)).toEqual([
    "보고.md",
    "혼합.txt",
  ]);
  expect(trees.after).toHaveLength(1);
  expect(trees.after[0].children.map((node) => node.name)).toEqual([
    "성능",
    "혼합",
  ]);
  expect(JSON.stringify(changes)).toBe(before);
});
it("shows retained originals only for copy, including folders and repeated paths", () => {
  expect(
    buildComparisonTrees(changes, "copy").after.map((node) => node.name),
  ).toEqual(["보고.md", "혼합.txt", "정리"]);
  expect(
    buildComparisonTrees(changes, "move").after.map((node) => node.name),
  ).toEqual(["정리"]);
  const folder = buildComparisonTrees(
    [{ from: ["자료"], to: ["정리", "자료"], kind: "directory" }],
    "move",
  );
  expect(folder.before[0].kind).toBe("directory");
  const repeated = buildComparisonTrees([...changes, changes[0]], "move");
  expect(repeated.after[0].children[0].children[0].count).toBe(2);
});
it("keeps unknown entry types neutral, preserves exact names, and handles empty selections", () => {
  expect(buildComparisonTrees([], null)).toEqual({ before: [], after: [] });
  const tree = buildComparisonTrees([{ from: ["A"], to: ["a"] }], "move");
  expect(tree.before[0].kind).toBe("entry");
  expect(tree.after[0].name).toBe("a");
});

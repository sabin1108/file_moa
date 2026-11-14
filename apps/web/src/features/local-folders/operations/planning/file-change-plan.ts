/**
 * 선택 파일의 검토용 계획을 계산한다. plan store가 확인한 이름 목록만 받으며 I/O나 쓰기 권한을 갖지 않는다.
 * 이름 비교는 보수적인 충돌 후보 검사다. 실제 파일시스템의 동일성·적용 가능 여부를 보증하지 않는다.
 */
export type PlanOperation = "move" | "copy" | "classify";

type PlanEntry = Readonly<{
  name: string;
  kind: "file" | "directory"
}>;

type Directory = Readonly<{
  path: readonly string[];
  entries: readonly PlanEntry[];
  truncated: boolean
}>;

export type PlanDirectory = Directory & Readonly<{ availability: "existing" | "planned" | "blocked" }>;

export type PlanIssue = "same-path" | "name-conflict" | "ambiguous-name" | "duplicate-target" | "incomplete-destination" | "blocked-directory";

export type FileChangePlan = Readonly<{
  operation: PlanOperation;
  rows: readonly Readonly<{
    from: readonly string[];
    to: readonly string[];
    issues: readonly PlanIssue[]
  }>[];
  directoriesToCreate: readonly (readonly string[])[];
  conflictCount: number;
}>;

function validatePath(path: readonly string[]) {
  if (!Array.isArray(path)
    || path.some(segment => typeof segment !== "string" || !segment || segment === "." || segment === ".."
      || /[/\\:\u0000-\u001f\u007f]/u.test(segment))) {
    throw new Error("invalid-plan-path");
  }
}

export function parsePlanDestination(text: string): string[] {
  const path = text === "" ? [] : text.split("/");

  validatePath(path);

  return path;
}

export function classificationFolder(name: string): string {
  if (/\.md$/i.test(name)) return "마크다운";

  if (/\.txt$/i.test(name)) return "텍스트";

  return "기타";
}

export function comparableName(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

const pathKey = (path: readonly string[]) => JSON.stringify(path);
const comparablePath = (path: readonly string[]) => pathKey(path.map(comparableName));

export function buildFileChangePlan(input: {
  operation: PlanOperation;
  source: Directory;
  selectedNames: readonly string[];
  destinationPath: readonly string[];
  destinations: readonly PlanDirectory[];
}): FileChangePlan {
  const { operation, source, selectedNames, destinationPath, destinations } = input;

  validatePath(source.path);
  validatePath(destinationPath);

  if (!["move", "copy", "classify"].includes(operation)) throw new Error("invalid-operation");

  if (!selectedNames.length) throw new Error("empty-selection");

  if (new Set(selectedNames).size !== selectedNames.length) throw new Error("duplicate-selection");

  const sourceFiles = new Set(source.entries.filter(entry => entry.kind === "file").map(entry => entry.name));
  const targetDirectories = new Map(destinations.map(directory => {
    validatePath(directory.path);

    return [pathKey(directory.path), directory] as const;
  }));
  // Build indexes once: the 1,000-file case must not scan each 1,000-entry destination for every row.
  const namesByDirectory = new Map(destinations.map(directory => [pathKey(directory.path), {
    exact: new Set(directory.entries.map(entry => entry.name)),
    comparable: new Set(directory.entries.map(entry => comparableName(entry.name))),
  }]));
  const directoriesToCreate = new Map<string, readonly string[]>();
  const rows = selectedNames.map(name => {
    validatePath([name]);

    if (!sourceFiles.has(name)) throw new Error("source-changed");

    const targetPath = operation === "classify" ? [...destinationPath, classificationFolder(name)] : [...destinationPath];
    const directory = targetDirectories.get(pathKey(targetPath));
    const names = namesByDirectory.get(pathKey(targetPath));
    const from = [...source.path, name];
    const to = [...targetPath, name];
    const issues: PlanIssue[] = [];

    if (comparablePath(from) === comparablePath(to)) issues.push("same-path");

    if (!directory || directory.truncated) issues.push("incomplete-destination");

    if (directory?.availability === "blocked") issues.push("blocked-directory");

    if (names?.exact.has(name)) issues.push("name-conflict");
    else if (names?.comparable.has(comparableName(name))) issues.push("ambiguous-name");

    if (directory?.availability === "planned" && !directory.truncated) directoriesToCreate.set(pathKey(targetPath), targetPath);

    return { from, to, issues };
  });
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = comparablePath(row.to);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const row of rows) {
    if ((counts.get(comparablePath(row.to)) ?? 0) > 1) row.issues.push("duplicate-target");
  }

  return {
    operation,
    rows,
    directoriesToCreate: [...directoriesToCreate.values()],
    conflictCount: rows.filter(row => row.issues.length > 0).length
  };
}

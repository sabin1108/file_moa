export type OrganizationScope = Readonly<
  | { kind: "all" }
  | {
    kind: "folder";
    path: readonly string[]
  }
  | {
    kind: "selected";
    entries: readonly Readonly<{
      path: readonly string[];
      kind: "file" | "directory"
    }>[];
  }
>;

export type SnapshotDocument = Readonly<{
  id: string;
  name: string;
  path: readonly string[];
  excerpt: string;
  excerptHash: string;
  sha256: string;
  size: number;
  lastModified: number;
  pdf?: Readonly<{
    pages: number;
    complete: boolean
  }>;
  ocr?: Readonly<{
    pages: number;
    complete: boolean
  }>;
}>;

export type SourceSnapshot = Readonly<{
  reference?: ReferenceSnapshot;
  documents: readonly SnapshotDocument[];
  excluded: readonly Readonly<{
    path: readonly string[];
    reason: string
  }>[];
  complete: boolean;
  limits: readonly string[];
  discoveredFiles: number;
  directories: number;
  bytes: number;
}>;

export type ReferenceSnapshot = Readonly<{
  root: readonly string[];
  directories: readonly (readonly string[])[];
  complete: boolean;
}>;

export type SampleFolder = Readonly<{
  id: string;
  label: string
}>;

export type SampleDocument = Readonly<{
  id: string;
  name: string;
  format: "md" | "txt" | "pdf" | "xlsx";
  excerpt: string;
  sourceFolderId?: string;
  proposal: Readonly<{
    folderId: string | null;
    reason: string;
    reviewRequired: boolean
  }>;
  pageCount?: number;
  sheet?: Readonly<{
    name: string;
    rows: readonly (readonly (string | number)[])[]
  }>;
}>;

export type SampleCatalog = Readonly<{
  version: "1";
  folders: readonly SampleFolder[];
  documents: readonly SampleDocument[];
}>;

export type SampleSession = Readonly<{
  kind: "sample";
  id: string;
  expiresAt: number;
  version: "1"
}>;

export const SAMPLE_LIFETIME_MS = 3_600_000;

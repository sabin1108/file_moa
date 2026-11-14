import type { OrganizationResponse } from "../../../shared/organization";
import type { SnapshotDocument } from "./source-snapshot-rules";
import type { ManagedNode, ManagedRequest } from "../operations/managed/managed-files";
import { restoreDestinationPath } from "../recovery/restore/recovery-restore-rules";
import { comparableName } from "../operations/planning/file-change-plan";

export type OrganizationBatch = Readonly<{
  key: string;
  request: ManagedRequest;
  documents: readonly SnapshotDocument[];
}>;

/** Local capability projection only; classification and evidence stay exactly as validated by the server. */

export function buildOrganizationBatches(
  response: OrganizationResponse,
  documents: readonly SnapshotDocument[],
  base: readonly string[],
  kind: "copy" | "move"
): OrganizationBatch[] {
  if (response.held.length || !response.matches.length) throw Error("organization-unresolved");

  const batches = new Map<
    string,
    {
      key: string;
      request: ManagedRequest;
      documents: SnapshotDocument[]
    }
  >();
  const targets = new Set<string>();
  const sources = new Set<string>();

  for (const match of response.matches) {
    const document = documents.find(document => document.id === match.documentId);

    if (!document || sources.has(document.id)) throw Error("source-changed");

    sources.add(document.id);

    const source = restoreDestinationPath(document.path.slice(0, -1));
    const destination = restoreDestinationPath([...base, ...match.destination]);
    const target = JSON.stringify([...destination, document.name].map(comparableName));

    if (targets.has(target) || target === JSON.stringify(document.path.map(comparableName)))
      throw Error("managed-conflict");

    targets.add(target);

    const key = JSON.stringify([source, destination]);
    const batch = batches.get(key) ?? {
      key,
      request: { kind, source, destination, names: [] },
      documents: []
    };

    batch.request = { ...batch.request, names: [...batch.request.names, document.name] };
    batch.documents.push(document);
    batches.set(key, batch);
  }

  return [...batches.values()];
}

export function assertOrganizationBaseline(
  documents: readonly SnapshotDocument[],
  nodes: readonly Pick<ManagedNode, "path" | "kind" | "size" | "modified" | "sha256">[]
) {
  if (!documents.length || nodes.length !== documents.length) throw Error("managed-changed");

  for (const expected of documents) {
    const actual = nodes.find(node => JSON.stringify(node.path) === JSON.stringify(expected.path));

    if (
      !actual ||
      actual.kind !== "file" ||
      actual.sha256 !== expected.sha256
      ||
      actual.size !== expected.size
      ||
      actual.modified !== expected.lastModified
    )
      throw Error("managed-changed");
  }
}

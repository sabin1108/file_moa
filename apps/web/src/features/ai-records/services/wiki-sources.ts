import { groundedEvidenceSchema, type GroundedEvidence, type SourceFileExpectation } from "../../../shared/grounded-evidence";

export type WikiSourceStatus = "current" | "needs-update" | "unavailable" | "wrong-connection";

export async function checkWikiSources(
  input: GroundedEvidence,
  current: {
    owner: GroundedEvidence["owner"] | null;
    connectionId: string | undefined
  },
  read: (source: SourceFileExpectation, signal: AbortSignal) => Promise<unknown>,
  signal: AbortSignal,
): Promise<WikiSourceStatus> {
  const evidence = groundedEvidenceSchema.parse(input);

  signal.throwIfAborted();

  if (!evidence.citations.length) return "unavailable";

  if (evidence.owner.userId !== current.owner?.userId || evidence.owner.workspaceId !== current.owner?.workspaceId
    || evidence.connectionId !== current.connectionId) return "wrong-connection";

  let status: WikiSourceStatus = "current";
  const checked = new Set<string>();

  for (const source of evidence.citations) {
    const key = JSON.stringify([source.path, source.sha256, source.size]);

    if (checked.has(key)) continue;

    checked.add(key);

    try {
      await read({ ...source, owner: evidence.owner, connectionId: evidence.connectionId }, signal);
    }
    catch (error) {
      signal.throwIfAborted();

      const code = error instanceof Error ? error.message : "";

      if (["citation-changed", "source-changed", "file-size-changed"].includes(code)
        || error instanceof DOMException && error.name === "NotFoundError") status = "needs-update";
      else if (status !== "needs-update") status = "unavailable";
    }

    signal.throwIfAborted();
  }

  return status;
}

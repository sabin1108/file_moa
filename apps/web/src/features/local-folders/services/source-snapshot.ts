import { checkDocumentCandidate, DOCUMENT_LIMITS } from "@personal-ai/domain";
import type {
  OrganizationScope,
  SnapshotDocument,
} from "../lib/source-snapshot";
import { copyFolderPath } from "../lib/folder-path";
import type { FolderHandle } from "../types";
import { createCopyHasher } from "./copy-hash";
import { readSourceFolderListing } from "./source-folder-listing";
import { openSourceDirectory } from "./source-directory";
import type {
  FindDocument,
  FindQuery,
  FindableSnapshot,
} from "../lib/document-find";

/** Bounded point-in-time snapshot. No persistence, network, permission prompt or writes. */
export async function readSourceSnapshot(
  root: FolderHandle,
  scope: OrganizationScope,
  instruction: string,
  assertCurrent: () => void,
  signal?: AbortSignal,
  find?: FindQuery,
): Promise<FindableSnapshot> {
  const starts =
    scope.kind === "all"
      ? [{ path: [], kind: "directory" as const }]
      : scope.kind === "folder"
        ? [{ path: copyFolderPath(scope.path), kind: "directory" as const }]
        : scope.entries.map((entry) => ({
            path: copyFolderPath(entry.path),
            kind: entry.kind,
          }));
  if (!starts.length || starts.length > DOCUMENT_LIMITS.workspaceDocuments)
    throw Error("invalid-snapshot-scope");
  const queue = [...starts];
  const seen = new Set<string>();
  const documents: SnapshotDocument[] = [];
  const findings: FindDocument[] = [];
  const excluded: { path: readonly string[]; reason: string }[] = [];
  const limits = new Set<string>();
  let discoveredFiles = 0,
    directories = 0,
    bytes = 0,
    scanned = 0,
    failed = false;
  const started = Date.now();
  const check = () => {
    assertCurrent();
    if (signal?.aborted)
      throw new DOMException("Snapshot cancelled", "AbortError");
  };
  const reader = createCopyHasher(signal);

  try {
    for (let index = 0; index < queue.length; index++) {
      check();
      if (
        scanned >= 20000 ||
        directories >= 1000 ||
        Date.now() - started > 15000
      ) {
        limits.add("scan-limit");
        break;
      }
      const entry = queue[index];
      const key = JSON.stringify(entry.path);
      if (
        seen.has(key) ||
        entry.path.some((part) => part.toLowerCase() === ".moa-history")
      )
        continue;
      seen.add(key);
      scanned++;

      if (entry.kind === "directory") {
        if (entry.path.length > 64) {
          limits.add("depth-limit");
          continue;
        }
        try {
          const listing = await readSourceFolderListing(
            root,
            entry.path,
            check,
          );
          check();
          directories++;
          if (listing.truncated) limits.add("listing-limit");
          for (const child of listing.entries) {
            if (queue.length >= 20000) {
              limits.add("scan-limit");
              break;
            }
            queue.push({ path: [...entry.path, child.name], kind: child.kind });
          }
        } catch (error) {
          check();
          if (
            !(error instanceof DOMException) ||
            ![
              "NotFoundError",
              "NotReadableError",
              "TypeMismatchError",
            ].includes(error.name)
          )
            throw error;
          failed = true;
          excluded.push({ path: entry.path, reason: "unreadable-folder" });
        }
        continue;
      }

      discoveredFiles++;
      const name = entry.path.at(-1);
      if (!name) throw Error("invalid-file-path");
      const extensionIssue = checkDocumentCandidate(name, 0);
      if (extensionIssue) {
        excluded.push({ path: entry.path, reason: extensionIssue });
        continue;
      }
      if (documents.length >= DOCUMENT_LIMITS.workspaceDocuments) {
        limits.add("document-limit");
        break;
      }
      try {
        const permission = await root.queryPermission({ mode: "read" });
        check();
        if (permission !== "granted")
          throw new DOMException("Read permission required", "NotAllowedError");
        const directory = await openSourceDirectory(
          root,
          entry.path.slice(0, -1),
          check,
        );
        const handle = await directory.getFileHandle(name, { create: false });
        check();
        const file = await handle.getFile();
        check();
        const issue = checkDocumentCandidate(name, file.size);
        if (issue) {
          excluded.push({ path: entry.path, reason: issue });
          continue;
        }
        if (bytes + file.size > DOCUMENT_LIMITS.workspaceTextBytes) {
          limits.add("bytes-limit");
          break;
        }
        const content = await reader.readText(file, instruction, find);
        check();
        const current = await handle.getFile();
        check();
        if (
          current.size !== file.size ||
          current.lastModified !== file.lastModified
        )
          throw Error("source-changed");
        if ((await root.queryPermission({ mode: "read" })) !== "granted")
          throw new DOMException("Read permission required", "NotAllowedError");
        check();
        const { finding, ...documentContent } = content;
        if (finding) findings.push({ name, path: entry.path, finding });
        documents.push({
          ...documentContent,
          id: `document-${documents.length + 1}`,
          name,
          path: entry.path,
          lastModified: file.lastModified,
        });
        bytes += file.size;
      } catch (error) {
        check();
        const reason = error instanceof Error ? error.message : "read-failed";
        if (
          error instanceof DOMException &&
          ["NotAllowedError", "SecurityError", "AbortError"].includes(
            error.name,
          )
        )
          throw error;
        if (["unsupported-hash", "hash-read-failed"].includes(reason))
          throw error;
        failed = true;
        excluded.push({
          path: entry.path,
          reason:
            reason === "invalid-utf8" || reason === "source-changed"
              ? reason
              : "unreadable-file",
        });
      }
    }
    check();
    return {
      documents,
      excluded,
      complete: !failed && !limits.size,
      limits: [...limits],
      discoveredFiles,
      directories,
      bytes,
      ...(find ? { findings } : {}),
    };
  } finally {
    reader.dispose();
  }
}

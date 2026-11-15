import { checkDocumentCandidate, DOCUMENT_LIMITS } from "@personal-ai/domain";
import type {
  OrganizationScope,
  SnapshotDocument,
} from "./source-snapshot-rules";
import { copyFolderPath } from "../folder-path";
import type { FolderHandle } from "../types";
import { createCopyHasher, type TextIndexContext } from "../content/copy-hash";
import { readSourceFolderListing } from "../browsing/source-folder-listing";
import { openSourceDirectory } from "../source-directory";
import { LocalTextIndex, LOCAL_TEXT_INDEX_VERSION } from "../search/documents/local-text-index";
import type {
  FindDocument,
  FindQuery,
  FindableSnapshot,
} from "../search/documents/document-find";
import { findTextEvidence } from "../search/documents/document-find";
import { retainFindCandidate } from "../search/documents/document-find-ranking";

/** Bounded source snapshot. Optional extracted-text cache stays in this browser. */

export async function readSourceSnapshot(
  root: FolderHandle,
  scope: OrganizationScope,
  instruction: string,
  assertCurrent: () => void,
  signal?: AbortSignal,
  find?: FindQuery,
  indexContext?: Omit<TextIndexContext, "path">,
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
  const excluded: {
    path: readonly string[];
    reason: string
  }[] = [];
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
  let contentBudgetExhausted = false;
  const addFinding = (document: FindDocument) => {
    if (retainFindCandidate(findings, document, DOCUMENT_LIMITS.workspaceDocuments)) limits.add("result-limit");
  };
  const addMetadataFinding = (name: string, path: readonly string[], lastModified?: number) => {
    if (!find) return;

    const finding = findTextEvidence("", find, lastModified, { name, path });

    if (finding) addFinding({ name, path, finding, contentAvailable: false });
  };

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
        entry.path.some((part) => [".moa-history", ".moa-ai-v1"].includes(part.toLowerCase()))
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
            !(error instanceof DOMException)
            ||
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

      if (extensionIssue && (!find || !findTextEvidence("", find, undefined, { name, path: entry.path }))) {
        excluded.push({ path: entry.path, reason: extensionIssue });

        continue;
      }

      if (documents.length >= DOCUMENT_LIMITS.workspaceDocuments) {
        limits.add("document-limit");

        if (!find) break;

        contentBudgetExhausted = true;
      }

      if (find && contentBudgetExhausted && !findTextEvidence("", find, undefined, { name, path: entry.path })) continue;

      let metadata: File | undefined;

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

        metadata = file;

        check();

        const issue = checkDocumentCandidate(name, file.size);

        if (issue) {
          addMetadataFinding(name, entry.path, file.lastModified);
          excluded.push({ path: entry.path, reason: issue });

          continue;
        }

        if (find && contentBudgetExhausted) {
          addMetadataFinding(name, entry.path, file.lastModified);

          continue;
        }

        if (bytes + file.size > DOCUMENT_LIMITS.workspaceTextBytes) {
          limits.add("bytes-limit");

          if (!find) break;

          contentBudgetExhausted = true;
          addMetadataFinding(name, entry.path, file.lastModified);

          continue;
        }

        const cached = indexContext ? await new LocalTextIndex().readPath(indexContext, entry.path).catch(() => undefined) : undefined;

        check();

        const content = await reader.readText(
          file,
          instruction,
          find,
          indexContext ? { ...indexContext, path: entry.path } : undefined,
          cached,
          find ? { name, path: entry.path } : undefined,
        );

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

        const { finding } = content;

        if (content.pdf && !content.pdf.complete) limits.add("pdf-text-limit");

        if (content.ocr && !content.ocr.complete) limits.add("ocr-limit");

        if (indexContext && typeof content.fullText === "string" && !content.cacheHit) {
          await new LocalTextIndex().put(
            { ...indexContext, path: entry.path, hash: content.sha256, parserVersion: LOCAL_TEXT_INDEX_VERSION },
            content.fullText,
            check,
            content.cacheMetadata,
          ).catch(() => {
            check();
          });
          check();
        }

        if (finding) addFinding({ name, path: entry.path, finding, contentAvailable: true, ...(content.ocr ? { ocr: true } : {}) });

        documents.push({
          sha256: content.sha256,
          size: content.size,
          excerpt: content.excerpt,
          excerptHash: content.excerptHash,
          ...(content.pdf ? { pdf: content.pdf } : {}),
          ...(content.ocr ? { ocr: content.ocr } : {}),
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
          error instanceof DOMException
          &&
          ["NotAllowedError", "SecurityError", "AbortError"].includes(
            error.name,
          )
        )
          throw error;

        if (["unsupported-hash", "hash-read-failed"].includes(reason))
          throw error;

        addMetadataFinding(name, entry.path, reason === "source-changed" ? undefined : metadata?.lastModified);

        failed = true;
        excluded.push({
          path: entry.path,
          reason:
            reason === "invalid-utf8" || reason === "source-changed" || reason.startsWith("pdf-") || reason.startsWith("ocr-")
              ? reason
              : "unreadable-file",
        });
      }
    }

    check();

    if (find && (await root.queryPermission({ mode: "read" })) !== "granted") {
      throw new DOMException("Read permission required", "NotAllowedError");
    }

    check();

    if (indexContext && scope.kind === "all" && !failed && !limits.size) {
      await new LocalTextIndex().retain(indexContext, documents.map(document => document.path), check).catch(() => {
        check();
      });
      check();
    }

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

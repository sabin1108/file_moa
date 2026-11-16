import { checkDocumentCandidate, DOCUMENT_LIMITS } from "@personal-ai/domain";
import type {
  OrganizationScope,
  SnapshotDocument,
} from "./source-snapshot-rules";
import { copyFolderPath } from "../folder-path";
import type { FolderHandle } from "../types";
import type { createCopyHasher, TextIndexContext } from "../content/copy-hash";
import { readSourceFolderListing } from "../browsing/source-folder-listing";
import { openSourceDirectory } from "../source-directory";
import type { LocalTextIndex, CatalogFile } from "../search/documents/local-text-index";
import type {
  FindDocument,
  FindQuery,
  FindableSnapshot,
} from "../search/documents/document-find";
import { findTextEvidence } from "../search/documents/document-find";
import { retainFindCandidate } from "../search/documents/document-find-ranking";
import { matchesDocumentMetadata } from "../search/documents/document-field-match";
import { isLocalIndexScan, type LocalIndexScan } from "../search/documents/local-index-scan";

/** Bounded source snapshot. Optional extracted-text cache stays in this browser. */

type SnapshotReader = Pick<ReturnType<typeof createCopyHasher>, "readText" | "dispose">;
export type SnapshotIndex = Pick<LocalTextIndex, "observe" | "readPath" | "put" | "retain" | "retainCatalog" | "retainSemantic">;
export type SnapshotRuntime = {
  createReader: (signal?: AbortSignal) => SnapshotReader;
  createIndex: () => SnapshotIndex;
  now: () => number;
  parserVersion: number;
};

export async function readSourceSnapshot(
  runtime: SnapshotRuntime,
  root: FolderHandle,
  scope: OrganizationScope,
  instruction: string,
  assertCurrent: () => void,
  signal?: AbortSignal,
  find?: FindQuery,
  indexContext?: Omit<TextIndexContext, "path">,
  options?: Readonly<{ metadataOnly: boolean; checkpointed?: boolean; checkpoint?: LocalIndexScan }>,
): Promise<FindableSnapshot & { checkpoint?: LocalIndexScan }> {
  const previous = options?.metadataOnly && options.checkpointed ? options.checkpoint : undefined;
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

  const queue = previous ? previous.queue.map(entry => ({ ...entry, path: [...entry.path] })) : [...starts];
  let cursor = previous?.cursor ?? 0;
  const seen = new Set(queue.slice(0, cursor).map(entry => JSON.stringify(entry.path)));
  const documents: SnapshotDocument[] = [];
  const findings: FindDocument[] = [];
  const excluded: {
    path: readonly string[];
    reason: string
  }[] = [];
  const limits = new Set<string>(previous?.limits);
  let discoveredFiles = previous?.discoveredFiles ?? 0,
    directories = previous?.directories ?? 0,
    bytes = 0,
    scanned = previous?.scanned ?? 0,
    failed = previous?.failed ?? false;
  const started = runtime.now();
  const check = () => {
    assertCurrent();

    if (signal?.aborted)
      throw new DOMException("Snapshot cancelled", "AbortError");
  };
  const reader = runtime.createReader(signal);
  let indexStore: SnapshotIndex | null = null;
  const observedPaths: (readonly string[])[] = [...(previous?.observed ?? [])];
  let catalogHealthy = true;
  const observe = async (file: CatalogFile) => {
    if (!indexStore || !indexContext) return;

    await indexStore.observe(indexContext, file, check).catch(() => { check(); catalogHealthy = false; });
    check();
  };
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
    indexStore = indexContext ? runtime.createIndex() : null;
    let batchEntries = 0;
    for (; cursor < queue.length; cursor++) {
      check();

      if (options?.checkpointed && (batchEntries >= 250 || runtime.now() - started > 1000)) break;

      if (
        scanned >= 20000 ||
        directories >= 1000 ||
        runtime.now() - started > 15000
      ) {
        limits.add("scan-limit");

        break;
      }

      const entry = queue[cursor];
      batchEntries++;
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

      if (!options?.metadataOnly && documents.length >= DOCUMENT_LIMITS.workspaceDocuments) {
        limits.add("document-limit");

        if (!find) break;

        contentBudgetExhausted = true;
      }

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
        observedPaths.push(entry.path);
        await observe({ path: entry.path, size: file.size, lastModified: file.lastModified, status: issue ? "unsupported" : "listed", ...(issue ? { reason: issue } : {}) });

        if (issue) {
          addMetadataFinding(name, entry.path, file.lastModified);
          excluded.push({ path: entry.path, reason: issue });

          continue;
        }

        if (options?.metadataOnly) continue;

        if (find?.plan && !matchesDocumentMetadata({ name, path: entry.path }, find.plan)) continue;

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

        const cached = indexContext ? await indexStore?.readPath(indexContext, entry.path).catch(() => undefined) : undefined;

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
          await indexStore?.put(
            { ...indexContext, path: entry.path, hash: content.sha256, parserVersion: runtime.parserVersion },
            content.fullText,
            check,
            content.cacheMetadata,
          ).catch(() => {
            check();
          });
          check();
        }

        await observe({ path: entry.path, size: file.size, lastModified: file.lastModified, hash: content.sha256, status: "indexed" });

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

        await observe({ path: entry.path, size: reason === "source-changed" ? null : metadata?.size ?? null,
          lastModified: reason === "source-changed" ? null : metadata?.lastModified ?? null,
          status: reason === "source-changed" ? "changed" : "unreadable", reason: reason === "invalid-utf8" || reason === "source-changed" || reason.startsWith("pdf-") || reason.startsWith("ocr-") ? reason : "unreadable-file" });

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

    if ((find || options?.metadataOnly) && (await root.queryPermission({ mode: "read" })) !== "granted") {
      throw new DOMException("Read permission required", "NotAllowedError");
    }

    check();

    let checkpoint: LocalIndexScan | undefined;

    if (options?.checkpointed && cursor < queue.length && scanned < 20000 && directories < 1000) {
      const candidate: LocalIndexScan = { version: 1, queue, cursor, observed: observedPaths, discoveredFiles, directories, scanned, failed, limits: [...limits], createdAt: previous?.createdAt ?? started, updatedAt: runtime.now() };
      if (isLocalIndexScan(candidate)) checkpoint = candidate;
      else limits.add("scan-limit");
    }
    const paused = !!checkpoint;

    if (indexContext && scope.kind === "all" && !paused && !failed && !limits.size) {
      await indexStore?.retain(indexContext, observedPaths, check).catch(() => {
        check();
      });

      if (catalogHealthy) await indexStore?.retainCatalog(indexContext, observedPaths, check).catch(() => { check(); catalogHealthy = false; });
      await indexStore?.retainSemantic(indexContext, observedPaths, check).catch(() => { check(); });
      check();
    }

    if (options?.metadataOnly && !catalogHealthy) throw new Error("index-storage-unavailable");

    return {
      documents,
      excluded,
      complete: !paused && !failed && !limits.size,
      limits: [...limits],
      discoveredFiles,
      directories,
      bytes,
      ...(find ? { findings } : {}),
      ...(checkpoint ? { checkpoint } : {}),
    };
  } finally {
    reader.dispose();
  }
}

import type { RestoreHistoryGroup } from "../recovery/restore/recovery-restore-history-rules";
import type { ConnectionOwner, FolderHandle } from "../types";
import { readRestoreHistory } from "../recovery/restore/recovery-restore-history";
import { openSourceDirectory } from "../source-directory";
import { createCopyHasher } from "../content/copy-hash";

export type RestoreObservation = Readonly<{
  time: string;
  status: "matches" | "different" | "missing" | "directory";
}>;

export async function inspectRestoredFile(
  root: FolderHandle,
  path: readonly string[],
  requested: RestoreHistoryGroup,
  owner: ConnectionOwner,
  check: () => void,
  signal: AbortSignal,
  hashOverride?: (file: File) => Promise<string>): Promise<RestoreObservation> {
  const current = async () => {
    check();

    if (signal.aborted) throw new DOMException("cancelled", "AbortError");

    const history = await readRestoreHistory(root, path, owner, check);
    const group = history.groups.find(value => value.id === requested.id);

    if (history.incomplete || !group?.to || !group.sha256 || group.status !== "completed" || group.fileStatus !== "verified"
      || JSON.stringify(group) !== JSON.stringify(requested)) {
      throw Error("history-record-changed");
    }

    return group;
  };
  const group = await current();
  const parent = await openSourceDirectory(root, path, check);
  const name = group.to!.at(-1)!;
  const hasher = hashOverride ? null : createCopyHasher(signal);
  const hash = hashOverride ?? hasher!.hash;
  let status: RestoreObservation["status"];

  try {
    let handle: FileSystemFileHandle | null = null;

    try {
      handle = await parent.getFileHandle(name, { create: false });
    } catch (error) {
      check();

      if (!(error instanceof Error) || !["NotFoundError", "TypeMismatchError"].includes(error.name)) throw error;

      const reason = error.name;

      try {
        await parent.getFileHandle(name, { create: false });

        throw Error("history-target-changed");
      } catch (again) {
        check();

        if (!(again instanceof Error) || again.name !== reason) throw Error("history-target-changed");
      }

      status = reason === "NotFoundError" ? "missing" : "directory";
    }

    if (handle) {
      const file = await handle.getFile();

      check();

      const digest = file.size === group.size ? await hash(file) : null;

      check();

      const latestHandle = await parent.getFileHandle(name, { create: false });
      const same = await handle.isSameEntry(latestHandle);
      const latest = await latestHandle.getFile();

      check();

      if (!same || latest.size !== file.size || latest.lastModified !== file.lastModified
        || (digest !== null && await hash(latest) !== digest)) throw Error("history-target-changed");

      status = digest === group.sha256 ? "matches" : "different";
    }

    const latestParent = await openSourceDirectory(root, path, check);

    if (!await parent.isSameEntry(latestParent)) throw Error("history-target-changed");

    await current();

    return { status: status!, time: new Date().toISOString() };
  } finally {
    hasher?.dispose();
  }
}

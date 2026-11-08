import type { SampleCatalog } from "../../../shared/sample-contract";
import type { FolderListing } from "../../local-folders/services/source-folder-listing";
import { copyFolderPath } from "../../local-folders/lib/folder-path";
import { sampleFolderPath } from "./sample-state";

export function listSampleDestinations(catalog: SampleCatalog, requested: readonly string[]): FolderListing {
  const path = copyFolderPath(requested);
  const paths = catalog.folders.map(folder => sampleFolderPath(catalog, folder.id));
  const descendants = paths.filter(candidate => path.every((part, index) => candidate[index] === part));
  if (!descendants.length) throw new DOMException("Sample folder not found", "NotFoundError");
  const names = [...new Set(descendants.flatMap(candidate => candidate.length > path.length ? [candidate[path.length]] : []))];
  return { path, entries: names.map(name => ({ name, kind: "directory" })), truncated: false };
}

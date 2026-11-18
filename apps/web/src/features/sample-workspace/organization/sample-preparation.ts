import type { SampleCatalog } from "../../../shared/sample-contract";
import type { SourceSnapshot } from "../../../shared/source-snapshot";
import { OrganizationPreparationController } from "../../local-folders/organization/organization-preparation-controller";
import { inferOrganizationConditions } from "../../local-folders/organization/organization-intent";
import { sampleActiveCatalog, sampleFolderPath, type SampleState } from "../sample-state";
import { sampleFolderListing } from "../files/SampleFolderPanel";
import { listSampleDestinations } from "./sample-destinations";

/** 카탈로그를 읽는 부분만 바꾸고 질문·선택·검토는 실사용 제어기를 공유한다. */
export function createSamplePreparation(catalog: SampleCatalog, getState: () => SampleState) {
  const folders = () => {
    const active = sampleActiveCatalog(catalog, getState());
    const paths = active.folders.flatMap(folder => {
      const path = sampleFolderPath(active, folder.id);
      return path.map((_, index) => path.slice(0, index + 1));
    });
    return [[], ...new Map(paths.map(path => [JSON.stringify(path), path])).values()];
  };
  return new OrganizationPreparationController(async (scope, _instruction, signal) => {
    const state = getState();
    const active = sampleActiveCatalog(catalog, state);
    const documents = await Promise.all(active.documents.flatMap(document => {
      const path = [...sampleFolderPath(active, state.locations[document.id]), document.name];
      const prefix = (candidate: readonly string[]) => candidate.every((part, index) => path[index] === part);
      const included = scope.kind === "all" || (scope.kind === "folder" ? prefix(scope.path)
        : scope.entries.some(entry => entry.kind === "directory" ? prefix(entry.path) : JSON.stringify(entry.path) === JSON.stringify(path)));
      if (!included) return [];
      return [(async () => {
        const bytes = new TextEncoder().encode(document.excerpt);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
        return { id: document.id, name: document.name, path, excerpt: document.excerpt, size: bytes.length, lastModified: 0, sha256: hash, excerptHash: hash };
      })()];
    }));
    signal.throwIfAborted();
    const snapshot: SourceSnapshot = { documents, excluded: [], complete: true, limits: [], discoveredFiles: documents.length,
      directories: folders().length, bytes: documents.reduce((sum, document) => sum + document.size, 0) };
    return snapshot;
  }, async (path, signal) => {
    signal.throwIfAborted();
    const state = getState();
    const active = sampleActiveCatalog(catalog, state);
    listSampleDestinations(active, path);
    return sampleFolderListing(active, state, path);
  }, undefined, undefined, async (request, signal) => {
    signal.throwIfAborted();
    return inferOrganizationConditions(request, "예시 자료", folders());
  });
}

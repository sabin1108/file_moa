import { WorkspaceFolderTree } from "../../../components/layout/WorkspaceFolderTree";
import { workspaceFolderNodes } from "../../../components/layout/workspace-folder-nodes";
import type { SampleCatalog } from "../../../shared/sample-contract";
import { sampleFolderPath } from "../lib/sample-state";

export function SampleFolderTree({ catalog, path, onOpen }: { catalog: SampleCatalog; path: readonly string[]; onOpen: (path: readonly string[]) => void }) {
  const paths = [["받은 자료"], ...catalog.folders.map(folder => sampleFolderPath(catalog, folder.id))];
  return <WorkspaceFolderTree title="샘플 폴더" nodes={workspaceFolderNodes("샘플 자료", paths)} currentPath={path} onOpen={onOpen} />;
}

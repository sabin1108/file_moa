"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SampleCatalog } from "../../../shared/sample-contract";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { DestinationFolderPicker } from "../../local-folders/destination-picker/DestinationFolderPicker";
import { DestinationPickerController } from "../../local-folders/destination-picker/destination-picker-controller";
import { listSampleDestinations } from "./sample-destinations";
import { sampleFolderPath } from "../sample-state";
import styles from "../sample-workspace.module.css";
import { SelectionWorkspaceDialog } from "../../local-folders/destination-picker/SelectionWorkspaceDialog";

export function SampleDestinationPicker({ catalog, initialFolderId, disabled, onChoose, onClose }: {
  catalog: SampleCatalog;
  initialFolderId: string | null;
  disabled: boolean;
  onChoose: (folderId: string) => void;
  onClose: () => void;
}) {
  const [controller] = useState(() => new DestinationPickerController(async (path, signal) => {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

    return listSampleDestinations(catalog, path);
  }, () => { }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const [needsFolder, setNeedsFolder] = useState(false);

  useEffect(() => {
    void controller.show(initialFolderId ? sampleFolderPath(catalog, initialFolderId) : []);

    return controller.close;
  }, [controller, catalog, initialFolderId]);

  const choose = () => {
    const path = controller.selectedPath();
    const folder = catalog.folders.find(candidate => JSON.stringify(sampleFolderPath(catalog, candidate.id)) === JSON.stringify(path));

    if (!folder) {
      setNeedsFolder(true);

      return;
    }

    onChoose(folder.id);
  };

  return <SelectionWorkspaceDialog title="목적지 폴더 선택" onClose={onClose}><fieldset disabled={disabled} className={styles.pickerPanel}>
    <legend>샘플 목적지 탐색</legend>
    <DestinationFolderPicker
      controller={controller}
      state={state}
      folderName="샘플 자료"
      allowCreation={false}
      showFiles
      hideHeader
      onChoose={choose}
      onCancel={() => {
        controller.close();
        onClose();
      }}
    />
    {needsFolder && <StatusNotice
      state="attention"
      title="등록된 하위 폴더를 선택해 주세요"
      detail="목록에서 등록된 목적지 폴더를 열고 ‘이 폴더 선택’을 눌러 주세요."
    />}
  </fieldset></SelectionWorkspaceDialog>;
}

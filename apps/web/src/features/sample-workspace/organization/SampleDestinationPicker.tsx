"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SampleCatalog } from "../../../shared/sample-contract";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { DestinationFolderPicker } from "../../local-folders/destination-picker/DestinationFolderPicker";
import { DestinationPickerController } from "../../local-folders/destination-picker/destination-picker-controller";
import { listSampleDestinations } from "./sample-destinations";
import { sampleFolderPath } from "../sample-state";
import styles from "../sample-workspace.module.css";

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

  return <fieldset disabled={disabled} className={styles.pickerPanel}>
    <legend>샘플 목적지 탐색</legend>
    <DestinationFolderPicker
      controller={controller}
      state={state}
      folderName="샘플 자료"
      allowCreation={false}
      onChoose={choose}
      onCancel={() => {
        controller.close();
        onClose();
      }}
    />
    {needsFolder && <StatusNotice
      state="attention"
      title="등록된 하위 폴더를 선택해 주세요"
      detail="샘플에서는 회의·재무·개발·학습·생활·여행 폴더만 목적지로 사용할 수 있어요."
    />}
  </fieldset>;
}

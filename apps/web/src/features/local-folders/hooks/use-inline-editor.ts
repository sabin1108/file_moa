"use client";
import { useEffect, useState } from "react";
import { useSharedSourceFolderConnection } from "../providers/SourceFolderProvider";
import { InlineEditorController } from "../store/inline-editor-controller";

export function useInlineEditor() {
  const connection = useSharedSourceFolderConnection();
  const [controller] = useState(() => new InlineEditorController(connection.openInlineEditor, connection.saveInlineEditor,
    connection.persistWorkflow, connection.removeWorkflow, connection.closeInlineEditor));
  useEffect(() => {
    const fallback = () => {
      const value = controller.getSnapshot();
      if (value.open && value.id) {
        try { sessionStorage.setItem(`moa-editor-emergency-${value.id}`, JSON.stringify({ text: value.text })); } catch { /* 초안 저장 오류는 화면에도 표시한다. */ }
      }
    };
    window.addEventListener("pagehide", fallback);
    return () => { fallback(); window.removeEventListener("pagehide", fallback); controller.dispose(); };
  }, [controller, connection.recoveryKey]);
  return controller;
}

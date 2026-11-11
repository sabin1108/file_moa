"use client";

import type { SceneProps } from "./scene-data";
import { ConnectScenes } from "./scenes/ConnectScenes";
import { DocumentScenes } from "./scenes/DocumentScenes";
import { MoveScenes } from "./scenes/MoveScenes";
import { RecoveryScenes } from "./scenes/RecoveryScenes";
import { SearchScene } from "./scenes/SearchScene";
import { DataScenes } from "./scenes/DataScenes";
import { StartupDemo } from "./scenes/feedback/StartupDemo";
import { ContentLoadingDemo } from "./scenes/feedback/ContentLoadingDemo";
import { AnswerDemo } from "./scenes/feedback/AnswerDemo";
import { ActionFeedbackDemo } from "./scenes/feedback/ActionFeedbackDemo";
import { SessionRecoveryDemo } from "./scenes/feedback/SessionRecoveryDemo";
import { FileIssuesDemo } from "./scenes/feedback/FileIssuesDemo";
import { FolderConnectionDemo } from "./scenes/FolderConnectionDemo";

export function SceneBody(props: SceneProps) {
  if (props.scene === "folder-connection") return <FolderConnectionDemo />;

  if (props.scene === "startup") return <StartupDemo />;

  if (props.scene === "content-loading") return <ContentLoadingDemo />;

  if (props.scene === "answer-progress") return <AnswerDemo />;

  if (props.scene === "action-feedback") return <ActionFeedbackDemo />;

  if (props.scene === "session-recovery") return <SessionRecoveryDemo />;

  if (props.scene === "file-issues") return <FileIssuesDemo />;

  if (props.scene === "search") return <SearchScene />;

  if (["export", "export-ready", "delete-confirm", "deleted"].includes(props.scene)) return <DataScenes key={props.scene} {...props} />;

  if (["connect", "connected", "permission"].includes(props.scene)) return <ConnectScenes key={props.scene} {...props} />;

  if (["document", "transfer", "indexing"].includes(props.scene)) return <DocumentScenes key={props.scene} {...props} />;

  if (
    [
      "destination",
      "conflict",
      "move-progress",
      "move-result",
      "move-partial",
      "move-skipped",
      "copy-result",
    ].includes(props.scene)
  )
    return <MoveScenes key={props.scene} {...props} />;

  return <RecoveryScenes key={props.scene} {...props} />;
}

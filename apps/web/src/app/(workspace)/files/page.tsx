/**
 * /files 라우트 진입점이다. 폴더 전용 frame은 local-folders 안에서 목록·미리보기 열을 조합한다.
 * 연결·선택·본문 구현은 features/local-folders 아래에서 확인한다.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { SourceFolderBrowser } from "../../../features/local-folders/components/listing/SourceFolderBrowser";
import ui from "../../../styles/workspace-ui.module.css";
import styles from "../../../features/local-folders/components/listing/folder-workspace.module.css";

export const metadata: Metadata = { title: "내 파일 — 모아" };

export default function FilesPage() {
  return (
    <div className={`${ui.system} ${styles.theme}`}><Suspense fallback={<p>파일 작업 공간을 준비하고 있습니다.</p>}><SourceFolderBrowser /></Suspense></div>
  );
}

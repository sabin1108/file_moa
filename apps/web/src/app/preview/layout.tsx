/**
 * /preview 전용 시안 경계다. 승인된 화면 예시와 실제 기능을 구분하는 안내를 제공한다.
 * 시안 구현은 src/prototypes에만 있으며 실제 작업 경로의 Provider를 공유하지 않는다.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../../prototypes/styles/preview-notice.module.css";
import ui from "../../styles/workspace-ui.module.css";
import { requireWorkspace } from "../../server/session-guards";
import { SessionBoundary } from "../../features/auth/components/SessionBoundary";
import { checkAuthSessionAction } from "../actions/auth";

export default async function PreviewLayout({ children }: { children: ReactNode }) {
  const owner = await requireWorkspace();
  return (
    <SessionBoundary userId={owner.sessionUserId} initialExpiresAt={owner.sessionExpiresAt} checkSessionAction={checkAuthSessionAction}>
      <aside className={`${ui.system} ${styles.previewNotice}`} aria-label="시안 안내">
        <p><strong>시안 보관함</strong> · 합성 데이터로 화면을 검토합니다. 실제 계정·파일·작업 결과가 아닙니다.</p>
        <Link href="/settings">실제 폴더 연결로 돌아가기</Link>
      </aside>
      {children}
    </SessionBoundary>
  );
}

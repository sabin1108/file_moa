/**
 * Next.js가 모든 경로를 감싸는 루트 layout이다. 전역 스타일과 문서 언어/메타데이터를 설정한다.
 * 실제 작업 화면의 폴더 공유 수명은 (workspace)/layout.tsx에서 별도로 제공한다.
 */
import type { Metadata } from "next";
import "../styles/globals.css";
import { WorkspaceQuickSwitch } from "../features/quick-switch/WorkspaceQuickSwitch";
import { NavigationGuardProvider } from "../components/navigation/NavigationGuard";

export const metadata: Metadata = { title: "개인 AI 작업 공간", description: "채팅과 로컬 자료를 연결하는 개인 작업 공간" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" style={{ background: "#e4e8e6", colorScheme: "light" }}>
    <body>
      <NavigationGuardProvider>
        {children}
        <WorkspaceQuickSwitch />
      </NavigationGuardProvider>
    </body>
  </html>;
}


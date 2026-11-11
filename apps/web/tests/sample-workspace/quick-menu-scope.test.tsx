import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceShell } from "../../src/components/layout/WorkspaceShell";

vi.mock(
  "../../src/components/ui/feedback/NavigationProgress",
  () => ({ NavigationProgress: () => null })
);

describe("workspace quick menu opt-in", () => {
  it("enables future work screens through their shared frame without a route list", () => {
    const html = renderToStaticMarkup(<WorkspaceShell title="새 작업 화면">
      <div>새 기능</div>
    </WorkspaceShell>);

    expect(html).toContain('data-workspace-quick-menu="true"');
    expect(html).not.toContain('aria-label="빠른 전환 열기"');
  });
  it("lets introductions or tutorials reuse the frame with quick menu disabled", () => {
    const html = renderToStaticMarkup(<WorkspaceShell title="튜토리얼" quickMenu={false}>
      <div>안내</div>
    </WorkspaceShell>);

    expect(html).not.toContain("data-workspace-quick-menu");
  });
});

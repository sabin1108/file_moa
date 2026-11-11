import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageLoading } from "../../src/components/ui/feedback/PageLoading";
import { MoaLoader } from "../../src/components/ui/feedback/MoaLoader";
import { PaperStepper } from "../../src/components/ui/PaperStepper";

const steps = [{ id: "email", label: "이메일" }, { id: "password", label: "비밀번호" }, { id: "complete", label: "완료" }];

it("replaces the decorative logo with ten papers while the parent announces loading once", () => {
  const visual = renderToStaticMarkup(<MoaLoader />);

  expect(visual.match(/data-loader-paper=/gu)).toHaveLength(10);
  expect(visual).toContain('aria-hidden="true"');
  expect(visual).not.toContain("<svg");

  const page = renderToStaticMarkup(<PageLoading compact message="로그인 확인 중" />);

  expect(page.match(/role="status"/gu)).toHaveLength(1);
  expect(page).toContain('aria-busy="true"');
  expect(page).toContain("로그인 확인 중");
  expect(page).not.toContain("%");
});

it("keeps real step names and current-step semantics without introducing form or URL ownership", () => {
  const html = renderToStaticMarkup(<PaperStepper steps={steps} current="password" label="회원가입 진행 단계" />);

  expect(html).toContain('aria-label="회원가입 진행 단계"');
  expect(html.match(/aria-current="step"/gu)).toHaveLength(1);
  expect(html).toContain("2 / 3 · 비밀번호");
  expect(html).not.toMatch(/<input|<form|가입이 완료/u);
  expect(html).not.toContain("data-paper-flight");
});

it("does not invent progress for empty steps and safely falls back for an unknown current ID", () => {
  expect(renderToStaticMarkup(<PaperStepper steps={[]} current="missing" />)).toBe("");
  expect(renderToStaticMarkup(<PaperStepper steps={steps} current="missing" />)).toContain("1 / 3 · 이메일");
});

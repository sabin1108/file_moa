import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { OnboardingPage } from "../../src/features/onboarding/OnboardingPage";
import { metadata as demoMetadata } from "../../src/app/demo/layout";

describe("introduction entry points", () => {
  it("shows one meeting note emerging from the hero folder without the gathering cards", () => {
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    const folder = html.indexOf('data-intro-folder');
    const document = html.indexOf('data-extracted-document');
    const front = html.indexOf('data-folder-front');

    expect(folder).toBeLessThan(document);
    expect(document).toBeLessThan(front);
    const hero = html.slice(html.indexOf('data-scroll-hero'), html.indexOf('id="find"'));
    expect(hero.match(/data-extracted-document/g)).toHaveLength(1);
    expect(hero).toContain("프로젝트 회의록.md");
    expect(hero).toContain("자료 정리 회의");
    expect(hero).not.toContain("data-intro-paper");
    expect(hero).not.toContain("data-hero-workspace");
    expect(hero).not.toContain("나의 자료, 다음 생각으로.");
  });

  it("keeps one stable paper and preview for all three functions", () => {
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    const section = html.slice(html.indexOf('id="find"'), html.indexOf('aria-labelledby="materials-heading"'));

    expect(section.match(/data-knowledge-example=/g)).toHaveLength(1);
    expect(section.match(/data-feature-folder/g)).toHaveLength(1);
    expect(section.match(/data-shared-paper=/g)).toHaveLength(1);
    expect(section).toContain("data-knowledge-answer");
    expect(section).toContain('data-guided-example="true"');
    expect(section).toContain("회의에서 결정한 내용은?");
    expect(section).not.toContain("data-phase=");
    expect(section).not.toContain('data-scroll-story="knowledge"');
    expect(section).not.toContain('data-story-panel=');
    expect(section).toContain("외부로 보낼 내용은 먼저 확인해요.");
  });

  it("keeps the organization files in one scene with destinations in the same rows", () => {
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    const section = html.slice(html.indexOf('id="organize"'), html.indexOf('id="records"'));

    expect(section.match(/data-organization-scene/g)).toHaveLength(1);
    expect(section.match(/data-organization-row/g)).toHaveLength(3);
    expect(section.match(/data-organization-destination/g)).toHaveLength(3);
    expect(section).not.toContain("data-story-panel");
    expect(section).not.toContain("data-organization-step");
    expect(section.match(/data-organization-marker=/g)).toHaveLength(3);
    expect(section).not.toContain("정리 과정 다시 보기");
    expect(section).toContain("이동 전 복구용 보존본을 준비해요.");
  });

  it("keeps the public introduction free of sample entry links", () => {
    const html = renderToStaticMarkup(createElement(OnboardingPage));

    expect(html).toContain('href="/welcome"');
    expect(html).toContain('href="/login"');
    expect(html).not.toMatch(/href="\/demo/);
  });

  it("keeps the shared sample introduction in sample scope and preserves its destination", () => {
    const html = renderToStaticMarkup(createElement(OnboardingPage, { mode: "sample", initialView: "files" }));

    expect(html).toContain('href="/demo/start?intro=done&amp;view=files"');
    expect(html).not.toContain('href="/welcome"');
    expect(html).not.toContain('href="/login"');
    expect(demoMetadata.robots).toEqual({ index: false, follow: false });
  });
});

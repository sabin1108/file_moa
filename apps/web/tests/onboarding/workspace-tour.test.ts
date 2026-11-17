import { expect, it } from "vitest";
import { tourRouteMatches, workspaceTourSteps } from "../../src/features/onboarding/workspace-tour-steps";

it("covers folders, conversation, settings and quick controls using real workspace routes", () => {
  const routes = new Set(workspaceTourSteps.map(step => step.route));
  expect(routes).toEqual(new Set([null, "/files", "/", "/settings?tab=account", "/settings?tab=controls"]));
  expect(workspaceTourSteps.some(step => step.selector.includes("folder-connection"))).toBe(true);
  expect(workspaceTourSteps.some(step => step.selector.includes("quick-settings"))).toBe(true);
});

it("waits for the requested settings panel and never matches an unrelated page", () => {
  expect(tourRouteMatches("/settings?tab=controls", "/settings", "account")).toBe(false);
  expect(tourRouteMatches("/settings?tab=controls", "/settings", "controls")).toBe(true);
  expect(tourRouteMatches("/files", "/", null)).toBe(false);
  expect(tourRouteMatches(null, "/files", null)).toBe(true);
});

it("introduces AI verification, saved records and preservation before folder actions", () => {
  const early = workspaceTourSteps.slice(1, 3);
  expect(early.every(step => step.route === null && !step.recordKind)).toBe(true);
  expect(early[0].text).toContain("동의한 뒤 전송");
  expect(early[0].text).toContain("대화 저장을 켜");
  expect(early[1].text).toContain("보존본 검증과 직접 실행");
  expect(early[1].text).toContain("데모의 개인 파일 변경·로컬 영구 저장은 연결되지 않아요");
  expect(workspaceTourSteps[3].selector).toContain("folder-connection");
});

it("explains each conversation task and each record kind separately", () => {
  for (const task of ["chat", "find", "grounded", "organize"]) {
    expect(workspaceTourSteps.some(step => step.selector.includes(`task-${task}`))).toBe(true);
  }

  for (const kind of ["conversation", "artifact", "wiki", "memory", "profile"]) {
    expect(workspaceTourSteps.some(step => step.selector.includes(`record-${kind}`))).toBe(true);
  }
});

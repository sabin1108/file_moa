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

import { expect, it } from "vitest";
import { tourCardPosition, type TourRect } from "../../src/features/onboarding/tour-card-position";

function assertClear(target: TourRect, width: number, height: number, cardHeight: number) {
  const card = { width: Math.min(460, width - 32), height: cardHeight };
  const position = tourCardPosition(target, card, { width, height });

  expect(position.highlight).toBe(true);
  expect(position.left).toBeGreaterThanOrEqual(16);
  expect(position.left + card.width).toBeLessThanOrEqual(width - 16);
  expect(position.top).toBeGreaterThanOrEqual(16);
  expect(position.top + Math.min(position.maxHeight, card.height)).toBeLessThanOrEqual(height - 16);
  expect(position.left + card.width <= target.left || position.left >= target.left + target.width
    || position.top + Math.min(position.maxHeight, card.height) <= target.top || position.top >= target.top + target.height).toBe(true);

  return position;
}

it("places the quick-settings explanation below a wide panel", () => {
  const position = assertClear({ left: 534, top: 242, width: 854, height: 244 }, 1440, 900, 310);
  expect(position.top).toBe(502);
});

it("uses the free side of an open record drawer and fits tablet and phone targets", () => {
  assertClear({ left: 945, top: 220, width: 80, height: 48 }, 1440, 900, 320);
  assertClear({ left: 24, top: 210, width: 720, height: 48 }, 768, 1024, 320);
  assertClear({ left: 24, top: 190, width: 70, height: 48 }, 390, 700, 320);
});

it("scrolls a compact explanation instead of covering a tall target", () => {
  const position = assertClear({ left: 16, top: 300, width: 358, height: 240 }, 390, 700, 360);
  expect(position.maxHeight).toBe(268);
});

it("does not draw a misleading spotlight when no readable region exists", () => {
  expect(tourCardPosition({ left: 0, top: 0, width: 390, height: 300 }, { width: 358, height: 280 }, { width: 390, height: 300 }).highlight).toBe(false);
});

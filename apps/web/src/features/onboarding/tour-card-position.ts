export type TourRect = { top: number; left: number; width: number; height: number };

export function tourCardPosition(target: TourRect | null, card: { width: number; height: number }, viewport: { width: number; height: number }) {
  const gap = 16;
  const bottom = viewport.height - gap;
  const maxHeight = Math.max(1, viewport.height - gap * 2);
  const center = Math.max(gap, (viewport.width - card.width) / 2);
  const fallback = { top: Math.max(gap, bottom - card.height), left: center, maxHeight, highlight: false };

  if (!target) return fallback;

  const right = target.left + target.width;
  const targetBottom = target.top + target.height;
  const alignTop = Math.max(gap, Math.min(target.top + (target.height - card.height) / 2, bottom - card.height));
  const alignLeft = Math.max(gap, Math.min(target.left + (target.width - card.width) / 2, viewport.width - card.width - gap));
  const sides = [
    { top: alignTop, left: right + gap, maxHeight, fitsWidth: right + gap + card.width <= viewport.width - gap },
    { top: alignTop, left: target.left - gap - card.width, maxHeight, fitsWidth: target.left - gap - card.width >= gap },
  ];
  const vertical = [
    { top: targetBottom + gap, left: alignLeft, maxHeight: bottom - targetBottom - gap, fitsWidth: true },
    { top: Math.max(gap, target.top - gap - card.height), left: alignLeft, maxHeight: target.top - gap * 2, fitsWidth: true },
  ];
  const candidates = (target.width >= viewport.width / 2 ? [...vertical, ...sides] : [...sides, ...vertical]).filter(candidate => candidate.fitsWidth);
  const position = candidates.find(candidate => candidate.maxHeight >= card.height)
    ?? candidates.filter(candidate => candidate.maxHeight >= 120).sort((a, b) => b.maxHeight - a.maxHeight)[0];

  if (!position) return fallback;

  return { top: position.top, left: position.left, maxHeight: position.maxHeight, highlight: true };
}

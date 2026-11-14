export const QUICK_HOLD_MS = 500;

export type QuickShortcut = string;

export type QuickPreferences = Readonly<{
  trigger: "both" | "hold" | "keyboard" | "off";
  shortcut: QuickShortcut
}>;

export const defaultQuickPreferences: QuickPreferences = { trigger: "both", shortcut: "Alt+Q" };

type ShortcutEvent = Pick<KeyboardEvent, "code" | "altKey" | "ctrlKey" | "shiftKey" | "metaKey" | "isComposing" | "repeat">;

const modifiers = ["Ctrl", "Alt", "Shift", "Meta"];
const keyPattern = /^(?:[A-Z0-9]|F[1-9]|F1[0-2]|CapsLock|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Insert)$/;

function validShortcut(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;

  const parts = value.split("+");
  const key = parts.pop();

  return !!key && keyPattern.test(key)
    && parts.every((part, index) => modifiers.includes(part) && (index === 0 || modifiers.indexOf(parts[index - 1]) < modifiers.indexOf(part)));
}

export function shortcutFromEvent(event: ShortcutEvent): string | null {
  if (event.isComposing || event.repeat) return null;

  const key = event.code.replace(
    /^Key([A-Z])$|^Digit([0-9])$/,
    (_match, letter: string | undefined, digit: string | undefined) => letter ?? digit!
  );
  const value = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta", key].filter(Boolean).join("+");

  return validShortcut(value) ? value : null;
}

export function parseQuickPreferences(value: string | null): QuickPreferences {
  try {
    const parsed = JSON.parse(value ?? "null") as Partial<QuickPreferences> | null;

    if (
      parsed &&
      ["both", "hold", "keyboard", "off"].includes(parsed.trigger ?? "")
      &&
      validShortcut(parsed.shortcut)
    )
      return { trigger: parsed.trigger!, shortcut: parsed.shortcut };
  } catch { /* Invalid device preferences use the defaults. */ }

  return defaultQuickPreferences;
}

export function matchesQuickShortcut(event: ShortcutEvent, shortcut: QuickShortcut) {
  return shortcutFromEvent(event) === shortcut;
}

export function quickDirection(dx: number, dy: number): number | null {
  if (Math.hypot(dx, dy) < 42) return null;

  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  return Math.round((angle + 90 + 360) / 120) % 3;
}

export function clampQuickPosition(x: number, y: number, width: number, height: number) {
  const edge = Math.min(120, width / 2 - 8, height / 2 - 8);

  return { x: Math.max(edge, Math.min(width - edge, x)), y: Math.max(edge, Math.min(height - edge, y)) };
}

export function canStartQuickHold(input: {
  button: number;
  primary: boolean;
  pointerType: string;
  blocked: boolean;
  hasSelection: boolean
}) {
  return input.button === 0 && input.primary && input.pointerType === "mouse" && !input.blocked && !input.hasSelection;
}

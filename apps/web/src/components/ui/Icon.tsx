import type { CSSProperties } from "react";

const paths = {
  warning: "M12 3 2 21h20L12 3Zm0 6v5m0 3h.01",
  plus: "M12 5v14M5 12h14",
  search: "m20 20-4.5-4.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  chat: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z",
  folder: "M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  person: "M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  panel: "M14 4v16M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1",
  settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm6 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h5",
  copy: "M9 8h10v13H9V8ZM15 8V3H4v13h5",
  thumb: "M7 10v11H3V10h4Zm0 0 5-7a2 2 0 0 1 2 2l-1 5h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7",
  retry: "M20 11a8 8 0 1 0-2.4 6.7M20 4v7h-7",
  arrow: "M12 19V5m-6 6 6-6 6 6",
  link: "m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M14 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  attach: "m8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
  check: "m5 12 4 4L19 6",
  external: "M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
  close: "m6 6 12 12M6 18 18 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  leaf: "M20 3C9 2 3 7 5 15c8 5 15-1 15-12ZM5 21l10-12",
} satisfies Record<string, string>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, className, style }: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function MoaMark({ size = 30 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <path
      d="M6 24V12c0-4 5-5 8-2l4 4 4-4c3-3 8-2 8 2v12c0 4-5 5-8 2l-4-4-4 4c-3 3-8 2-8-2Z"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path d="m13 13 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}

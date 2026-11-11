"use client";

import { Icon } from "./Icon";
import { actionClasses } from "./action-classes";

export function QuickSwitchButton({ onOpen }: {
  onOpen: (point: Readonly<{
    x: number;
    y: number
  }>) => void
}) {
  return <button
    type="button"
    className={actionClasses("ghost")}
    aria-label="빠른 전환 열기"
    onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect();

      onOpen({ x: rect.right + 100, y: rect.top - 80 });
    }}
    title="퀵메뉴 열어보기"
  >
    <Icon name="plus" size={18} />
    <span>퀵메뉴 열어보기</span>
  </button>;
}

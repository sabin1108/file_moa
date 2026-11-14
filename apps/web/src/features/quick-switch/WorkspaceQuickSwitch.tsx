"use client";

import { useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "../../components/ui/Icon";
import { LoadingOverlay } from "../../components/ui/feedback/LoadingOverlay";
import { workspaceHref } from "../../shared/workspace-navigation";
import { useQuickSwitch } from "./use-quick-switch";
import { useNavigationGuard } from "../../components/navigation/NavigationGuard";
import styles from "./quick-switch.module.css";

const items = [
  { id: "files", label: "폴더", icon: "folder" },
  { id: "chat", label: "채팅", icon: "chat" },
  { id: "settings", label: "설정", icon: "settings" },
] as const;
const angles = [-90, 30, 150];
const offset = (index: number) => ({ x: Math.cos(angles[index] * Math.PI / 180) * 72, y: Math.sin(angles[index] * Math.PI / 180) * 72 });
const transform = (index: number) => {
  const point = offset(index);

  return "translate(" + point.x + "px, " + point.y + "px)";
};

export function WorkspaceQuickSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const guard = useNavigationGuard();
  const [pending, startTransition] = useTransition();
  const mode = pathname.startsWith("/demo") ? "sample" : "live";
  const navigate = useCallback((index: number) => {
    const item = items[index];
    const destination = workspaceHref(mode, item.id);

    const move = () => startTransition(() => router.push(item.id === "settings" ? destination + "?tab=controls" : destination));

    if (!guard.intercept(move)) move();
  }, [mode, router, startTransition, guard]);
  const { menu, root, close, choose, select } = useQuickSwitch(pathname, navigate);

  if (!menu || menu.route !== pathname) return pending ? <LoadingOverlay /> : null;

  return createPortal(<div
    ref={root}
    popover="manual"
    role="dialog"
    tabIndex={-1}
    aria-label="빠른 전환"
    aria-describedby="quick-switch-hint"
    aria-modal="false"
    data-quick-switch-menu
    data-quick-mode={menu.trigger}
    className={styles.menu}
    style={{ left: menu.position.x, top: menu.position.y }}
    onBlur={event => {
      if (event.relatedTarget instanceof Node && !root.current?.contains(event.relatedTarget)) close(false);
    }}
    onKeyDown={event => {
      const active = menu.active;
      const next = event.key === "ArrowRight" || event.key === "ArrowDown"
        ? active === null ? 0 : (active + 1) % 3
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? active === null ? 2 : (active + 2) % 3
          : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;

      if (next !== null) {
        event.preventDefault();
        select(next, true);
      }
    }}
  >
    {menu.active !== null && <div
      className={styles.indicator}
      aria-hidden="true"
      style={{ transform: transform(menu.active) }}
    />}
    <nav aria-label="빠른 이동 메뉴">
      {items.map((item, index) => <button
        key={item.id}
        type="button"
        data-quick-target={item.id}
        data-active={menu.active === index}
        aria-current={workspaceHref(mode, item.id) === pathname ? "page" : undefined}
        tabIndex={menu.active === index || menu.active === null && index === 0 ? 0 : -1}
        style={{ transform: transform(index) }}
        onPointerEnter={event => {
          if (menu.trigger === "click") event.currentTarget.focus({ preventScroll: true });
        }}
        onFocus={() => select(index)}
        onClick={() => choose(index)}
      >
        <Icon name={item.icon} size={21} />
        <span>
          {item.label}
        </span>
      </button>)}
    </nav>
    <button type="button" className={styles.center} aria-label="빠른 전환 닫기" onClick={() => close()}>
      <Icon name="close" size={20} />
    </button>
    <span id="quick-switch-hint" className={styles.hint}>
      {menu.trigger === "click" ? "클릭 또는 Enter로 이동" : "방향을 고르고 놓으세요"}
    </span>
  </div>, menu.host);
}

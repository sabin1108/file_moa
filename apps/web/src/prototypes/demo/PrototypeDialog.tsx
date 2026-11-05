"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ActionVariant } from "../../components/ui/action-classes";
import { DemoButton } from "./DemoButton";
import { SceneSurface, sceneLayout } from "./SceneSurface";
import { type SceneId } from "./scene-data";
import styles from "./demo.module.css";
import ui from "../../styles/workspace-ui.module.css";

export function PrototypeDialog({ initial, children, variant = "ghost", className, label, documentName }: {
  initial: SceneId; children: ReactNode; variant?: ActionVariant; className?: string; label?: string; documentName?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [scene, setScene] = useState(initial);
  const headingId = useId();
  const close = () => dialog.current?.close();

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  return (
    <>
      <span ref={opener} className={styles.trigger}>
        <DemoButton variant={variant} className={className} aria-label={label}
          onClick={() => { setScene(initial); setOpen(true); }}>{children}</DemoButton>
      </span>
      {open && createPortal(
        <dialog ref={dialog} aria-labelledby={headingId} data-scene={scene} data-layout={sceneLayout(scene)} className={`${styles.dialog} ${ui.system} ${ui.sheet}`}
          onClose={() => { setOpen(false); opener.current?.querySelector("button")?.focus(); }}
          onKeyDown={event => {
            if (event.key !== "Tab") return;
            const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
              'button, a[href], input, select, textarea, [tabindex]'
            )].filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          onClick={event => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
          }}>
          <SceneSurface headingId={headingId} documentName={documentName} scene={scene} navigate={setScene} dismiss={close} />
        </dialog>, document.body
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { StatusNotice, type StatusNoticeProps } from "./StatusNotice";
import styles from "./status-notice.module.css";

type Props = Omit<StatusNoticeProps, "onDismiss"> & { autoDismissMs?: number };

/** 일시 안내의 수명만 관리한다. 중요한 오류/확인/진행은 StatusNotice를 유지한다. */

export function DismissibleNotice(props: Props) {
  return <NoticeLifetime key={`${props.state}/${props.title}/${props.detail ?? ""}`} {...props} />;
}

function NoticeLifetime({ autoDismissMs = 5000, ...notice }: Props) {
  const [closed, setClosed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusWithin = useRef(false);
  const hovered = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);

    timer.current = null;
  };
  const schedule = () => {
    clear();

    if (autoDismissMs > 0 && !focusWithin.current && !hovered.current) timer.current = setTimeout(() => setClosed(true), autoDismissMs);
  };

  useEffect(() => {
    const timeout = autoDismissMs > 0 ? setTimeout(() => setClosed(true), autoDismissMs) : null;

    timer.current = timeout;

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [autoDismissMs]);

  if (closed) return null;

  return <div
    className={styles.toast}
    data-transient-notice
    onMouseEnter={() => {
      hovered.current = true;
      clear();
    }}
    onMouseLeave={() => {
      hovered.current = false;
      schedule();
    }}
    onFocusCapture={() => {
      focusWithin.current = true;
      clear();
    }}
    onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        focusWithin.current = false;
        schedule();
      }
    }}
  >
    <StatusNotice
      {...notice}
      onDismiss={() => {
        clear();
        setClosed(true);
      }}
    />
  </div>;
}

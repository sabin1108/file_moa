"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Resume = () => void;
type Blocker = (resume: Resume) => void;
const NavigationGuard = createContext<{ register: (blocker: Blocker) => Resume; intercept: (resume: Resume) => boolean }>({
  register: () => () => {},
  intercept: () => false
});

type HistoryNavigationEvent = Event & {
  navigationType: string;
  destination: { sameDocument: boolean; key: string };
};
type BrowserNavigation = {
  addEventListener: (type: "navigate", listener: (event: HistoryNavigationEvent) => void) => void;
  removeEventListener: (type: "navigate", listener: (event: HistoryNavigationEvent) => void) => void;
  traverseTo: (key: string) => { finished: Promise<unknown> };
};

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const blockers = useRef(new Set<Blocker>());
  const register = useCallback((blocker: Blocker) => {
    blockers.current.add(blocker);

    return () => { blockers.current.delete(blocker); };
  }, []);
  const intercept = useCallback((resume: Resume) => {
    const blocker = blockers.current.values().next().value;

    if (!blocker) return false;

    blocker(resume);

    return true;
  }, []);
  const guard = useMemo(() => ({ register, intercept }), [register, intercept]);

  useEffect(() => {
    const navigation = (window as unknown as { navigation?: BrowserNavigation }).navigation;

    if (!navigation) return;

    let allowedKey: string | null = null;
    const leaving = (event: HistoryNavigationEvent) => {
      if (event.navigationType !== "traverse" || !event.destination.sameDocument) return;

      const key = event.destination.key;

      if (key === allowedKey) {
        allowedKey = null;

        return;
      }

      // shortcut: browsers may forbid cancelling repeated Back, native unload guards cover document exits.
      if (!event.cancelable) return;

      if (intercept(() => {
        allowedKey = key;
        void navigation.traverseTo(key).finished.catch(() => { allowedKey = null; });
      })) event.preventDefault();
    };

    navigation.addEventListener("navigate", leaving);

    return () => navigation.removeEventListener("navigate", leaving);
  }, [intercept]);

  return <NavigationGuard.Provider value={guard}>{children}</NavigationGuard.Provider>;
}

export const useNavigationGuard = () => useContext(NavigationGuard);

export function GuardedLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & { href: string }) {
  const guard = useNavigationGuard();
  const router = useRouter();

  return <Link {...props} href={href} onNavigate={event => {
    if (guard.intercept(() => {
      if (props.replace) router.replace(href, { scroll: props.scroll });
      else router.push(href, { scroll: props.scroll });
    })) event.preventDefault();
  }} />;
}

export function useNavigationBlocker(active: boolean, onRequest: () => void) {
  const guard = useNavigationGuard();
  const pendingNavigation = useRef<Resume | null>(null);

  useEffect(() => {
    if (!active) return;

    const unregister = guard.register(resume => {
      pendingNavigation.current = resume;
      onRequest();
    });
    const leaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", leaving);

    return () => {
      unregister();
      window.removeEventListener("beforeunload", leaving);
    };
  }, [active, guard, onRequest]);

  return {
    cancelNavigation: () => { pendingNavigation.current = null; },
    confirmNavigation: () => {
      const resume = pendingNavigation.current;

      pendingNavigation.current = null;
      resume?.();

      return !!resume;
    }
  };
}

import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";

if (typeof window !== "undefined") {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History[typeof method]>) => {
      original(...args);
      window.dispatchEvent(new Event("fixture-location"));
    };
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("fixture-location", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("fixture-location", listener);
    window.removeEventListener("popstate", listener);
  };
}

function navigate(href: string, replace = false) {
  window.dispatchEvent(new CustomEvent("fixture-navigation", { detail: { href, replace } }));
}

export default function Link({ onNavigate, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean; onNavigate?: (event: { preventDefault: () => void }) => void }) {
  return <a {...props} onClick={event => {
    props.onClick?.(event);
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || props.target === "_blank" || props.download) return;

    let prevented = false;
    onNavigate?.({ preventDefault: () => { prevented = true; } });

    if (onNavigate) {
      event.preventDefault();
      if (!prevented && props.href) navigate(props.href);
    }
  }} />;
}

export const useLinkStatus = () => ({ pending: false });
export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname, () => "/");
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe, () => location.search, () => ""));
export const useRouter = () => ({ push: (href: string) => navigate(href), replace: (href: string) => navigate(href, true), refresh: () => { } });

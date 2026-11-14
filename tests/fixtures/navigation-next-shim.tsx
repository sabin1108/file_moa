import type { AnchorHTMLAttributes } from "react";

function navigate(href: string, replace = false) {
  window.dispatchEvent(new CustomEvent("fixture-navigation", { detail: { href, replace } }));
}

export default function Link({ onNavigate, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: (event: { preventDefault: () => void }) => void }) {
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
export const usePathname = () => typeof window === "undefined" ? "/" : window.location.pathname;
export const useSearchParams = () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
export const useRouter = () => ({ push: (href: string) => navigate(href), replace: (href: string) => navigate(href, true), refresh: () => { } });

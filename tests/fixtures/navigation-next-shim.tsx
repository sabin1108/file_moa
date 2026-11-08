import type { AnchorHTMLAttributes } from "react";
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} />; }
export const useLinkStatus = () => ({ pending: false });
export const usePathname = () => typeof window === "undefined" ? "/" : window.location.pathname;
export const useSearchParams = () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
export const useRouter = () => ({ push: () => {}, replace: () => {}, refresh: () => {} });

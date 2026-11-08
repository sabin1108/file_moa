import type { AnchorHTMLAttributes } from "react";
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} />; }
export const useLinkStatus = () => ({ pending: false });
export const usePathname = () => "/";
export const useSearchParams = () => new URLSearchParams();
export const useRouter = () => ({ push: () => {}, replace: () => {}, refresh: () => {} });

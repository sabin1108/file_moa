import type { AnchorHTMLAttributes } from "react";

export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}

export const usePathname = () => "/preview/screens/chat-first";
export const useSearchParams = () => new URLSearchParams();
const router = { push: () => { }, replace: () => { }, refresh: () => { } };
export const useRouter = () => router;
export const useLinkStatus = () => ({ pending: false });

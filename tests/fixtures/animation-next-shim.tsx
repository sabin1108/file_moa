import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
const location = () => window.location.pathname + window.location.search;
export function useSearchParams() {
  const path = useSyncExternalStore(subscribe, location, () => "/");
  return new URLSearchParams(path.split("?")[1]);
}
export const usePathname = () => window.location.pathname;
const router = {
  push: (path: string) => { window.history.pushState(null, "", path); window.dispatchEvent(new PopStateEvent("popstate")); },
  replace: (path: string) => { window.history.replaceState(null, "", path); window.dispatchEvent(new PopStateEvent("popstate")); },
  refresh: () => {},
};
export const useRouter = () => router;

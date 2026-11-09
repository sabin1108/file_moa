export const usePathname = () => window.location.pathname;
export const useSearchParams = () => new URLSearchParams(window.location.search);
export const useRouter = () => ({
  push: (path: string) => window.dispatchEvent(new CustomEvent("fixture-grounded-navigation", { detail: path })),
  replace: () => {}, refresh: () => {},
});

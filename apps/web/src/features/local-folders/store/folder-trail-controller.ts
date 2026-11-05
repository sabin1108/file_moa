import type { FolderListing } from "../services/source-folder-listing";
import type { SourceListingController } from "./source-listing-controller";
const empty: readonly FolderListing[] = [];

/** 이미 읽은 방문 경로만 열로 재사용한다. 추가 I/O 없이 연결 세대마다 비우고 40개로 제한한다. */
export class FolderTrailController {
  private cache = new Map<string, FolderListing>();
  private state = empty;
  private listeners = new Set<() => void>();
  constructor(listing: SourceListingController) {
    let epoch = listing.getEpoch();
    listing.subscribe(() => {
      if (epoch !== listing.getEpoch()) { epoch = listing.getEpoch(); this.cache.clear(); }
      const current = listing.getSnapshot();
      if (current.phase === "ready" && !current.stale && current.result) {
        const key = JSON.stringify(current.result.path);
        this.cache.delete(key); this.cache.set(key, current.result);
        if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
      }
      const path = current.result?.path ?? [];
      this.state = path.map((_, index) => this.cache.get(JSON.stringify(path.slice(0, index)))).filter((item): item is FolderListing => !!item);
      this.listeners.forEach(listener => listener());
    });
  }
  getSnapshot = () => this.state;
  getServerSnapshot = () => empty;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
}

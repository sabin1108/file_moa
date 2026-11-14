import "server-only";

import { revalidateTag } from "next/cache";

// shortcut: 관계 변경은 전체 표시 캐시를 갱신한다. 사용자가 늘면 연결별 tag로 좁힌다.

export const settingsConnectionsTag = "settings-display:connections";
export const settingsDisplayTag = (userId: string) => `settings-display:${userId}`;

function expire(tag: string) {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch {
    // A committed account change must not become a failed authentication response.
    console.error("Settings display invalidation failed.");
  }
}

export function expireSettingsDisplay(userId: string) {
  expire(settingsDisplayTag(userId));
}

export function expireConnectedSettingsDisplay() {
  expire(settingsConnectionsTag);
}

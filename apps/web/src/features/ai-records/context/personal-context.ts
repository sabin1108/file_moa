import type { AiRecordPayload } from "../../../shared/ai-records";
import type { PersonalContext } from "../../../shared/personal-context";

export function selectPersonalContext(records: readonly AiRecordPayload[], projectId: string | null): PersonalContext {
  const entries: PersonalContext["entries"] = [];

  for (const record of records) {
    if (record.type === "memory" && record.status === "approved"
      && (record.scope.type === "global" || record.scope.id === projectId)) {
      entries.push({ id: record.id, text: record.content, scope: record.scope.type });
    }
  }

  const profile = records.find(record => record.type === "profile");

  if (profile?.type === "profile") entries.unshift({
    id: profile.id,
    text: [profile.displayName, profile.description, profile.preferences].filter(Boolean).join("\n").slice(
      0,
      4000
    )
      || "프로필 정보 없음",
    scope: "profile"
  });

  if (entries.length > 10 || entries.reduce((sum, item) => sum + item.text.length, 0) > 6000) throw new Error("personal-context-too-large");

  return { consent: true, projectId, entries };
}

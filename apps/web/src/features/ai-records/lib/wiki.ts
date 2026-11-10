import { artifactPayloadSchema, type AiRecordPayload, type WikiArtifact } from "../../../shared/ai-records";
import type { GroundedEvidence } from "../../../shared/grounded-evidence";

type WikiDraftInput = {
  id: string; title: string; markdown: string; evidence: GroundedEvidence;
  model: string | null; sourceConversationId: string | null; now: string;
};

export function isWiki(record: AiRecordPayload): record is WikiArtifact {
  return record.type === "artifact" && record.wiki !== undefined;
}

export function makeWikiDraft(input: WikiDraftInput): WikiArtifact {
  return artifactPayloadSchema.parse({
    type: "artifact", id: input.id, title: input.title, updatedAt: input.now,
    markdown: input.markdown, sourceConversationId: input.sourceConversationId, status: "draft",
    wiki: { version: 1, generationVersion: 1, sourceConversationIds: input.sourceConversationId ? [input.sourceConversationId] : [], generatedAt: input.now, model: input.model, generatedMarkdown: input.markdown, evidence: input.evidence },
  }) as WikiArtifact;
}

export function proposeWikiUpdate(current: WikiArtifact, input: WikiDraftInput): WikiArtifact {
  const draft = makeWikiDraft(input);
  return artifactPayloadSchema.parse({ ...current, updatedAt: input.now, wiki: { ...current.wiki, sourceConversationIds: [...new Set([...current.wiki.sourceConversationIds, ...draft.wiki.sourceConversationIds])], proposal: { generatedAt: input.now, model: input.model, markdown: draft.markdown, evidence: draft.wiki.evidence } } }) as WikiArtifact;
}

export function acceptWikiUpdate(current: WikiArtifact): WikiArtifact {
  const next = current.wiki.proposal;
  if (!next) return current;
  return artifactPayloadSchema.parse({ ...current, markdown: next.markdown, status: "draft", wiki: {
    version: 1, generationVersion: current.wiki.generationVersion + 1,
    sourceConversationIds: current.wiki.sourceConversationIds,
    generatedAt: next.generatedAt, model: next.model, generatedMarkdown: next.markdown, evidence: next.evidence,
  } }) as WikiArtifact;
}

export function wikiMarkdown(record: WikiArtifact) {
  return `${record.markdown}\n\n## 출처\n${record.wiki.evidence.citations.map((citation, index) => `${index + 1}. ${citation.path.join(" / ")}\n   ${citation.quote}`).join("\n")}\n\n생성 버전 ${record.wiki.generationVersion} · ${record.wiki.generatedAt}\n`;
}

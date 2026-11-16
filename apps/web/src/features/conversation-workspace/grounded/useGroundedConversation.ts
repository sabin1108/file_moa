"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useNavigationGuard } from "../../../components/navigation/NavigationGuard";
import { LIVE_AI_MESSAGES } from "../../../shared/live-organization";
import {
  createGroundedEvidence,
  groundedRequestSchema,
  validateGroundedAnswer,
  type GroundedAction,
  type GroundedAnswer
} from "../../../shared/grounded-chat";
import { groundedEvidenceSchema, type GroundedEvidence } from "../../../shared/grounded-evidence";
import { useSharedSourceFolderConnection } from "../../local-folders/SourceFolderProvider";
import { useConversationStore } from "../ConversationStateProvider";
import { isWiki, makeWikiDraft, proposeWikiUpdate } from "../../ai-records/wiki/wiki";

export function useGroundedConversation(question: string, action?: GroundedAction) {
  const local = useSharedSourceFolderConnection();
  const router = useRouter();
  const guard = useNavigationGuard();
  const preparation = useSyncExternalStore(
    local.organization.subscribe,
    local.organization.getSnapshot,
    local.organization.getServerSnapshot
  );
  const [consent, setConsent] = useState<string | null>(null);
  const [pendingKey, setPending] = useState<string | null>(null);
  const store = useConversationStore();
  const result = useSyncExternalStore(store.subscribe, store.getGroundedResult, store.getServerGroundedResult);
  const setResult = store.setGroundedResult;
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const navigation = useRef<AbortController | null>(null);
  const isSending = useCallback(() => active.current !== null, []);
  const connection = local.sources.find(source => source.active)?.connectionId ?? "legacy";
  const documents = preparation.snapshot?.documents.filter(document => preparation.selectedIds.includes(document.id)) ?? [];
  const sourceKey = JSON.stringify([local.owner, connection, preparation.purpose, preparation.submittedRequest, documents.map(document => [document.id, document.path, document.sha256, document.excerptHash])]);
  const key = JSON.stringify([sourceKey, question]);
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    navigation.current?.abort();
    navigation.current = null;
    setPending(null);
    setConsent(null);
  }, []);
  const reset = useCallback(() => {
    cancel();
    store.setGroundedResult(null);
  }, [cancel, store]);

  useEffect(() => () => cancel(), [key, cancel]);

  const pending = pendingKey === key;
  const matchesQuestion = preparation.purpose === "grounded" && preparation.submittedRequest === question.trim();
  const prepared = matchesQuestion && preparation.phase === "ready" && !!preparation.snapshot && (preparation.snapshot.complete || preparation.partialAccepted);

  const send = async (taskId: string): Promise<(GroundedAnswer & { evidence: GroundedEvidence }) | null> => {
    if (!action || active.current || !prepared || consent !== key || !question.trim() || !documents.length) return null;

    const operation = new AbortController();

    active.current = operation;
    setPending(key);
    setResult(null);
    setNotice("");

    try {
      const owner = await local.recheckSourceSnapshot(documents, preparation.request, operation.signal);
      const input = groundedRequestSchema.parse({
        requestId: `${Date.now()}:${crypto.randomUUID()}`,
        owner,
        consent: true,
        question,
        documents: documents.map(({ id, name, path, excerpt, excerptHash, sha256, size, lastModified }) => ({ id, name, path, excerpt, excerptHash, sha256, size, lastModified }))
      });

      if (operation.signal.aborted) return null;

      let release!: () => void;
      const cancelled = new Promise<null>(resolve => {
        release = () => resolve(null);
      });

      operation.signal.addEventListener("abort", release, { once: true });

      let response: Awaited<ReturnType<GroundedAction>> | null;

      try {
        response = await Promise.race([action(input), cancelled]);
      }
      finally {
        operation.signal.removeEventListener("abort", release);
      }

      if (!response || operation.signal.aborted) return null;

      if (!response.ok) {
        setNotice(LIVE_AI_MESSAGES[response.code] + (response.retryAfter ? ` 약 ${response.retryAfter}초 뒤 다시 시도할 수 있어요.` : ""));

        return null;
      }

      await local.recheckSourceSnapshot(documents, preparation.request, operation.signal);

      if (operation.signal.aborted) return null;

      const value = validateGroundedAnswer(response.answer, input.documents);

      setResult({ taskId, key: sourceKey, question, value, model: response.model });

      return { ...value, evidence: createGroundedEvidence(owner, connection, input.documents, value) };
    } catch {
      if (!operation.signal.aborted) setNotice("자료·권한이 바뀌었거나 답변을 확인하지 못했어요. 자료를 다시 준비해 주세요. 늦은 답변은 표시하지 않습니다.");

      return null;
    } finally {
      if (active.current === operation) {
        active.current = null;
        setPending(null);
        setConsent(null);
      }
    }
  };

  const openCitation = (documentId: string) => {
    if (!local.owner || !result || result.key !== sourceKey) return;

    const index = result.value.citations.findIndex(citation => citation.documentId === documentId);

    if (index < 0) return;

    const evidence = createGroundedEvidence(
      local.owner,
      connection,
      documents.map(document => ({ ...document, path: [...document.path] })),
      result.value
    );

    void openSavedCitation(evidence, index).then(
      setNotice,
      () => setNotice("원본이 바뀌었거나 권한이 없습니다. 근거를 다시 준비해 주세요.")
    );
  };
  const openSavedCitation = async (saved: GroundedEvidence, index: number): Promise<string> => {
    const evidence = groundedEvidenceSchema.parse(saved);
    const citation = evidence.citations[index];

    if (!citation) return "근거를 찾지 못했어요.";

    navigation.current?.abort();
    navigation.current = null;

    if (evidence.owner.userId !== local.owner?.userId || evidence.owner.workspaceId !== local.owner?.workspaceId
      || evidence.connectionId !== local.sources.find(source => source.active)?.connectionId) return "이 답변에 사용한 원래 자료 폴더를 연결·선택해 주세요.";

    const check = new AbortController();

    navigation.current = check;

    try {
      const opened = await local.preview.open(
        citation.path,
        { ...citation, owner: evidence.owner, connectionId: evidence.connectionId },
        check.signal
      );

      if (check.signal.aborted) return "";

      if (!opened) return "근거를 열지 못했어요. 원본 변경 여부와 폴더 읽기 권한을 확인해 주세요.";

      const move = () => router.push("/files");

      if (!guard.intercept(move)) move();

      return "";
    } finally {
      if (navigation.current === check) navigation.current = null;
    }
  };
  const saveResult = () => {
    if (!result || result.key !== sourceKey) return;

    const selection = store.getSelection();

    void local.records.save({
      type: "artifact",
      id: `artifact-${crypto.randomUUID()}`,
      title: result.question.slice(0, 120),
      updatedAt: new Date().toISOString(),
      markdown: `${result.value.answer}\n\n## 확인한 근거\n${result.value.citations.map(citation => `- ${documents.find(document => document.id === citation.documentId)?.name}: ${citation.quote}`).join("\n")}`,
      sourceConversationId: selection.temporary ? null : selection.id,
      status: "draft"
    }).then(
      () => setNotice("답변과 근거를 내 AI 폴더의 결과물 초안으로 저장했습니다."),
      () => setNotice("저장하지 못했어요. 답변을 복사해 보관해 주세요.")
    );
  };
  const wikiTargets = (local.records.getSnapshot().records ?? []).filter(record => isWiki(record.payload)).map(record => ({ id: record.payload.id, title: record.payload.title }));
  const saveWiki = (targetId?: string) => {
    if (!result || result.key !== sourceKey || !local.owner || !result.value.citations.length
      || local.records.getSnapshot().phase !== "ready") return;

    const evidence = createGroundedEvidence(
      local.owner,
      connection,
      documents.map(document => ({ ...document, path: [...document.path] })),
      result.value
    );
    const selection = store.getSelection();
    const input = {
      id: `wiki-${crypto.randomUUID()}`,
      title: result.question.slice(0, 120),
      markdown: result.value.answer,
      evidence,
      model: result.model ?? null,
      sourceConversationId: selection.temporary ? null : selection.id,
      now: new Date().toISOString()
    };
    const target = targetId ? local.records.getSnapshot().records.find(record => record.payload.id === targetId)?.payload : undefined;

    if (targetId && (!target || !isWiki(target))) {
      setNotice("갱신할 위키를 다시 선택해 주세요.");

      return;
    }

    const payload = target && isWiki(target) ? proposeWikiUpdate(target, input) : makeWikiDraft(input);

    void local.records.save(payload).then(
      () => setNotice(target ? "새 초안을 위키에 보관했습니다. 위키 편집에서 검토 후 반영해 주세요. 기존 본문은 유지합니다." : "출처가 연결된 위키 초안을 기록함에 저장했습니다."),
      () => setNotice("위키를 저장하지 못했어요. 답변과 편집 내용은 유지합니다.")
    );
  };

  return {
    documents,
    matchesQuestion,
    pending,
    consented: consent === key,
    canSend: !!action && prepared && !!documents.length && !!question.trim() && consent === key && !pending,
    setConsent: (value: boolean) => setConsent(value ? key : null),
    result: result?.key === sourceKey ? result : null,
    notice,
    send,
    cancel,
    reset,
    openCitation,
    openSavedCitation,
    saveResult,
    canSave: local.records.getSnapshot().phase === "ready",
    isSending,
    saveWiki,
    wikiTargets,
  };
}

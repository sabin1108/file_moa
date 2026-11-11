"use client";

import { useRef, useState } from "react";
import { ConversationWorkspace, type ConversationMessage } from "../../../components/layout/ConversationWorkspace";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import { actionClasses } from "../../../components/ui/action-classes";
import { AI_PROVIDER_LABELS, type AiProvider } from "../../../shared/ai-provider";
import { CHAT_ERROR_MESSAGES } from "../../../shared/general-chat";
import type { LiveOrganizationAction } from "../../../shared/live-organization";
import { SourceFolderTree } from "../../local-folders/components/listing/SourceFolderTree";
import { useSharedSourceFolderConnection } from "../../local-folders/providers/SourceFolderProvider";
import { useGeneralChat } from "../hooks/useGeneralChat";
import { MaterialWorkPanel } from "./MaterialWorkPanel";
import { RequestIntentChoice } from "./RequestIntentChoice";
import { GroundedAnswerView, GroundedConsent, SavedGroundedAnswer } from "./GroundedAnswerView";
import { SourceConnectionControl } from "../../local-folders/components/connection/SourceConnectionControl";
import { useWorkspaceConversation } from "../hooks/useWorkspaceConversation";
import { useConversationStore } from "../providers/ConversationStateProvider";
import { ConversationContextBar, type ConversationPanelView } from "./ConversationContextBar";
import { ConversationSettingsPanel } from "./ConversationSettingsPanel";
import options from "./conversation-options.module.css";
import { Icon } from "../../../components/ui/Icon";
import { useConversationRecords } from "../../ai-records/hooks/useConversationRecords";
import { AiLibraryPanel } from "../../ai-records/components/AiLibraryPanel";
import type { AiRecordPayload, ConversationPayload } from "../../../shared/ai-records";
import { selectPersonalContext } from "../../ai-records/lib/personal-context";
import type { GroundedAction } from "../../../shared/grounded-chat";
import type { GroundedEvidence } from "../../../shared/grounded-evidence";
import type { UsageSummary } from "../../../shared/ai-usage";
import { makeWikiDraft } from "../../ai-records/lib/wiki";

export function LiveConversation({ organizeAction, groundedAction, readUsage, aiProvider = "gemini" }: {
  organizeAction?: LiveOrganizationAction;
  aiProvider?: AiProvider | null;
  groundedAction?: GroundedAction;
  readUsage?: () => Promise<UsageSummary | null>;
}) {
  const local = useSharedSourceFolderConnection();
  const [includeMemory, setIncludeMemory] = useState(false);
  const conversationStore = useConversationStore();
  const chat = useGeneralChat(local.owner, aiProvider, async () => {
    if (!includeMemory) return undefined;

    const records = await local.records.repository.list();

    return selectPersonalContext(
      records.map(record => record.payload),
      conversationStore.getSelection().projectId || null
    );
  });
  const workflow = useWorkspaceConversation(chat, groundedAction);
  const conversation = useConversationRecords(
    local.records,
    chat,
    { beforeRestore: workflow.reset, assertAvailable: workflow.assertCanChange }
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [panelView, setPanelView] = useState<ConversationPanelView>("records");
  const panelTrigger = useRef<HTMLElement | null>(null);
  const openPanel = (view: ConversationPanelView, trigger?: HTMLElement) => {
    if (trigger) panelTrigger.current = trigger;

    setPanelView(view);
    setLibraryOpen(true);
  };
  const [editor, setEditor] = useState<Exclude<AiRecordPayload, ConversationPayload> | null>(null);
  const scrollMemoryRef = useRef({ top: 0, follow: true });
  const pending = workflow.pending;
  const last = chat.state.turns.at(-1);
  const chatNotice = last && (!last.kind || last.kind === "chat") ? last : null;
  const savedEvidence = new Map<string, GroundedEvidence>(chat.state.turns.flatMap(turn => turn.evidence ? [[`${turn.id}:answer`, turn.evidence] as const] : []));
  const savedModels = new Map(chat.state.turns.map(turn => [`${turn.id}:answer`, turn.model ?? null]));
  const messages = chat.state.turns.flatMap(turn => {
    const messages: ConversationMessage[] = [{ id: `${turn.id}:question`, author: "user", text: turn.question }];
    const answer = turn.answer.slice(0, turn.visibleLength);

    if (answer) {
      let status: string | undefined;

      if (turn.status === "completed") status = turn.kind && turn.kind !== "chat" ? "작업 기록" : "답변 완료";
      else if (turn.status !== "pending") status = "미완료 답변";

      messages.push({ id: `${turn.id}:answer`, author: "assistant", text: answer, status });
    }

    return messages;
  });

  return <WorkspaceShell title="채팅" active="chat" folderTree={<SourceFolderTree />}>
    <ConversationWorkspace
      messages={messages}
      scrollMemoryRef={scrollMemoryRef}
      draft={chat.state.draft}
      onDraftChange={chat.updateDraft}
      onSend={() => {
        void workflow.submit();
      }}
      canSend={!workflow.blocked && (workflow.intent !== "chat" || !!aiProvider)
        && (workflow.intent !== "grounded" || workflow.grounded.canSend)}
      pending={pending}
      pendingLabel={chat.state.active ? last?.answer ? "답변을 작성하고 있어요…" : "AI 응답을 기다리고 있어요…" : "자료를 확인하고 있어요…"}
      onCancel={workflow.cancel}
      cancelLabel={chat.state.active ? "답변 중지" : "작업 대기 중지"}
      inputLabel="AI에게 질문하기"
      inputPlaceholder="질문하거나 찾고 정리할 자료를 적어 주세요"
      submitLabel="보내기"
      panel={<>
        <nav className={options.panelNavigation} aria-label="대화 도구">
          {([["records", "기록", "folder"], ["sources", "자료", "attach"], ["settings", "설정", "settings"]] as const).map(([view, text, icon]) => <button
            type="button"
            key={view}
            aria-pressed={view === panelView || view === "records" && panelView === "storage"}
            onClick={() => setPanelView(view)}
          >
            <Icon name={icon} />
            {text}
          </button>)}
        </nav>
        <div hidden={panelView !== "records" && panelView !== "storage"}>
          <AiLibraryPanel
            controller={local.records}
            conversation={conversation}
            editor={editor}
            onEditorChange={setEditor}
            onOpen={() => setLibraryOpen(false)}
            canSwitchConversation={!workflow.blocked}
            storageOpen={panelView === "storage"}
            onStorageChange={open => setPanelView(open ? "storage" : "records")}
            onCreateWiki={() => {
              chat.updateDraft("선택한 자료를 요약해 주세요.");
              setLibraryOpen(false);
            }}
          />
        </div>
        <div hidden={panelView !== "sources"}>
          <section className={options.sourcePanel} aria-label="대화에 참고할 자료">
            <h3>참고할 자료 폴더</h3>
            <p>이 기기의 자료를 읽어 찾고 정리합니다. AI에 보낼 발췌는 전송 전에 확인해요.</p>
            <SourceConnectionControl />
          </section>
        </div>
        <div hidden={panelView !== "settings"}>
          <ConversationSettingsPanel
            includeMemory={includeMemory}
            onIncludeMemory={setIncludeMemory}
            projectId={conversation.projectId}
            onProjectId={conversation.setProjectId}
            canUseMemory={conversation.library.phase === "ready"}
            disabled={pending}
            provider={aiProvider ? AI_PROVIDER_LABELS[aiProvider] : null}
            temporary={conversation.temporary}
            onStorage={() => setPanelView("storage")}
            readUsage={readUsage}
          />
        </div>
      </>}
      panelOpen={libraryOpen}
      onPanelChange={open => {
        if (open) setPanelView("records");

        setLibraryOpen(open);
      }}
      panelTrigger={panelTrigger}
      panelLabel="기록함"
      panelTitle={{ records: "기록함", storage: "저장 위치", sources: "참고 자료", settings: "대화 설정" }[panelView]}
      messageActions={message => message.author === "assistant" && workflow.task && (workflow.task.kind !== "grounded" || workflow.grounded.result)
        && message.id === `${workflow.task.id}:answer`
        ? (
          workflow.task.kind === "grounded"
            ? <GroundedAnswerView conversation={workflow.grounded} allowWikiSave={!editor} />
            : <MaterialWorkPanel
              kind={workflow.task.kind}
              onPrepare={workflow.prepareFound}
              canStart={workflow.canStart}
              organizeAction={organizeAction}
              aiProvider={aiProvider}
              waitingForSource={workflow.task.waitingForSource}
              onContinue={workflow.resume}
            />
        )
        : message.author === "assistant"
          ? <div className={options.messageActions}>
            {savedEvidence.has(message.id) && <SavedGroundedAnswer
              evidence={savedEvidence.get(message.id)!}
              onOpen={workflow.grounded.openSavedCitation}
              disabled={workflow.blocked}
            />}
            {!pending && <>
              {savedEvidence.get(message.id)?.citations.length && !editor
                ? <button
                  type="button"
                  className={actionClasses("secondary")}
                  onClick={event => {
                    setEditor(makeWikiDraft({
                      id: `wiki-${crypto.randomUUID()}`,
                      title: "자료 답변에서 만든 위키",
                      markdown: message.text,
                      evidence: savedEvidence.get(message.id)!,
                      model: savedModels.get(message.id) ?? null,
                      sourceConversationId: conversation.temporary ? null : conversation.id,
                      now: new Date().toISOString()
                    }));
                    openPanel("records", event.currentTarget);
                  }}
                >
                  <Icon name="file" />
                  위키로 편집
                </button>
                : null}
              <button
                className={actionClasses("secondary")}
                onClick={event => {
                  setEditor({
                    type: "artifact",
                    id: `artifact-${crypto.randomUUID()}`,
                    title: "답변에서 만든 초안",
                    updatedAt: new Date().toISOString(),
                    markdown: message.text,
                    status: "draft",
                    sourceConversationId: conversation.temporary ? null : conversation.id
                  });
                  openPanel("records", event.currentTarget);
                }}
              >
                <Icon name="file" />
                결과물로 편집
              </button>
              <button
                className={actionClasses("secondary")}
                onClick={event => {
                  setEditor({
                    type: "memory",
                    id: `memory-${crypto.randomUUID()}`,
                    title: "답변에서 제안한 기억",
                    updatedAt: new Date().toISOString(),
                    content: message.text.slice(0, 4000),
                    status: "proposed",
                    sourceConversationId: conversation.temporary ? null : conversation.id,
                    scope: { type: "global" }
                  });
                  openPanel("records", event.currentTarget);
                }}
              >
                <Icon name="leaf" />
                기억으로 검토
              </button>
            </>}
          </div>
          : null}
      intro={<>
        <h2 tabIndex={-1} data-conversation-title>무엇을 도와드릴까요?</h2>
        <p>바로 질문하거나, 자료를 연결해 함께 살펴보세요.</p>
      </>}
      scope={<div>
        <ConversationContextBar
          temporary={conversation.temporary}
          status={conversation.status}
          sourceName={local.state.view?.folderName ?? null}
          provider={aiProvider ? AI_PROVIDER_LABELS[aiProvider] : null}
          onOpen={openPanel}
        />
        {workflow.intent === "grounded" && <GroundedConsent conversation={workflow.grounded} />}
      </div>}
      interaction={workflow.choice
        ? <RequestIntentChoice
          disabled={workflow.blocked}
          onChoose={kind => {
            void workflow.submit(kind);
          }}
          onChat={() => {
            void workflow.submit("chat");
          }}
          onGrounded={workflow.grounded.documents.length ? () => {
            void workflow.submit("grounded");
          } : undefined}
          onCancel={workflow.cancelChoice}
        />
        : undefined}
      notice={chatNotice?.status === "error"
        ? <p role="status">
          {CHAT_ERROR_MESSAGES[chatNotice.error ?? "unavailable"]}
        </p>
        : chatNotice?.status === "stopped" ? <p role="status">답변을 중지했어요. 여기까지 받은 내용은 미완료이며 자동으로 다시 보내지 않습니다.</p> : undefined}
    />
  </WorkspaceShell>;
}

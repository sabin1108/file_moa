"use client";

import { useEffect, useRef, useState } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import { Icon } from "../../../components/ui/Icon";
import type { AiRecordPayload, ConversationPayload } from "../../../shared/ai-records";
import type { AiRecordsController } from "../ai-records-controller";
import type { ConversationRecordControls } from "./conversation-record-controls";
import { RecordEditor } from "../editing/RecordEditor";
import { AiStorageSettings } from "./AiStorageSettings";
import styles from "./ai-library.module.css";
import { isWiki } from "../wiki/wiki";
import { recordKinds as kinds } from "../../../shared/record-kinds";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { RecordKindTabs } from "./RecordKindTabs";

type Editable = Exclude<AiRecordPayload, ConversationPayload>;

const category = (payload: AiRecordPayload) => isWiki(payload) ? "wiki" : payload.type;
const statusLabels = { draft: "초안", final: "확정본", proposed: "검토 중", approved: "사용 중", inactive: "사용 안 함" } as const;

export function AiLibraryPanel({ controller, conversation, editor, onEditorChange, onOpen, canSwitchConversation = true, storageOpen, onStorageChange, onCreateWiki, previewKind, onRevealEditor }: {
  controller: AiRecordsController;
  conversation: ConversationRecordControls;
  editor: Editable | null;
  onEditorChange: (value: Editable | null) => void;
  onOpen: () => void;
  canSwitchConversation?: boolean;
  storageOpen: boolean;
  onStorageChange: (open: boolean) => void;
  onCreateWiki?: () => void;
  previewKind?: typeof kinds[number][0];
  onRevealEditor?: () => void;
}) {
  const [selectedTab, setTab] = useState<typeof kinds[number][0]>("conversation");
  const tab = previewKind ?? selectedTab;
  const [query, setQuery] = useState("");
  const [deletion, setDeletion] = useState<(AiRecordPayload & { connectionRevision: number }) | null>(null);
  const [cascade, setCascade] = useState(false);
  const [notice, setNotice] = useState("");
  const confirmation = useRef<HTMLHeadingElement>(null);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const storageTrigger = useRef<HTMLButtonElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const deleteReturn = useRef<HTMLElement | null>(null);
  const previousStorage = useRef(storageOpen);
  const editorReturn = useRef<HTMLElement | null>(null);
  const previousEditor = useRef(editor);
  const { library } = conversation;
  const ready = library.phase === "ready";
  const selectedKind = kinds.find(([type]) => type === tab)!;
  const records = ready
    ? library.records.filter(item => category(item.payload) === tab && item.payload.title.toLocaleLowerCase().includes((previewKind ? "" : query).trim().toLocaleLowerCase()))
    : [];

  useEffect(() => {
    if (deletion) confirmation.current?.focus();
    else {
      deleteReturn.current?.focus();
      deleteReturn.current = null;
    }
  }, [deletion]);

  useEffect(() => {
    if (previousStorage.current && !storageOpen && storageTrigger.current?.checkVisibility()) storageTrigger.current.focus();

    previousStorage.current = storageOpen;
  }, [storageOpen]);

  useEffect(() => {
    if (previousEditor.current && !editor) {
      const target = editorReturn.current?.isConnected ? editorReturn.current : listHeading.current;

      target?.focus();
    }

    previousEditor.current = editor;
  }, [editor]);

  const perform = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
      setNotice("");
    }
    catch (error) {
      if (error instanceof Error && error.message === "unsaved-conversation") {
        setNotice("");

        return;
      }

      if (error instanceof Error && error.message === "stale-conversation-confirmation") {
        conversation.cancelOpen();
        setNotice("대화 내용이 바뀌었어요. 현재 내용을 확인한 뒤 전환할 대화를 다시 선택해 주세요.");

        return;
      }

      setNotice(error instanceof Error && error.message === "stale-record-confirmation"
        ? "저장 위치가 바뀌었어요. 현재 폴더에서 삭제할 기록을 다시 확인해 주세요."
        : error instanceof Error && error.message === "record-delete-incomplete"
        ? "일부 기록을 삭제하지 못했어요. 같은 삭제 버튼으로 이어서 시도할 수 있어요."
        : error instanceof Error && error.message === "record-delete-mode-changed"
        ? "이미 시작한 삭제 범위는 바꿀 수 없어요. 처음 선택한 범위로 다시 시도해 주세요."
        : "작업을 마치지 못했어요. 미저장 내용과 폴더 권한을 확인해 주세요.");
    }
  };
  const create = () => {
    if (tab === "wiki") {
      if (onCreateWiki) onCreateWiki();
      else setNotice("자료 답변의 ‘위키로 저장’에서 출처가 있는 초안을 만들 수 있어요.");

      return;
    }

    if (tab === "conversation") {
      void perform(async () => {
        await conversation.open(null, !ready);
        onOpen();
      });

      return;
    }

    const base = {
      id: `${tab}-${crypto.randomUUID()}`,
      title: tab === "artifact" ? "새 결과물" : tab === "memory" ? "새 기억" : "내 프로필",
      updatedAt: new Date().toISOString()
    };

    if (tab === "artifact") onEditorChange({ ...base, type: "artifact", markdown: "", sourceConversationId: null, status: "draft" });

    if (tab === "memory") onEditorChange({
      ...base,
      type: "memory",
      content: "",
      sourceConversationId: null,
      status: "proposed",
      scope: { type: "global" }
    });

    if (tab === "profile") onEditorChange({ ...base, type: "profile", displayName: "", description: "", preferences: "" });
  };
  const cancelDelete = () => {
    deleteReturn.current = deleteTrigger.current;
    setDeletion(null);
  };
  const storageLocked = !canSwitchConversation || !!editor || !!deletion || conversation.needsDiscard || library.pending;
  const chooseStorage = () => void perform(async () => {
    if (storageLocked) return;

    conversation.assertAvailable();

    if (library.phase === "needs-permission" && library.folderName) await controller.reconnect();
    else await controller.connect();
  });

  return <div className={styles.library}>
    {conversation.needsDiscard && <StatusNotice
      state="attention"
      role="alert"
      title="저장하지 않은 대화 내용이 있어요"
      detail="계속 편집하거나, 현재 화면의 미저장 내용을 버리고 대화를 전환할 수 있어요. 이미 저장한 파일은 남습니다."
      action={<>
        <button type="button" className={actionClasses("secondary")} onClick={() => {
          conversation.cancelOpen();
          onOpen();
        }}>계속 편집</button>
        <button type="button" className={actionClasses("secondary", styles.danger)} disabled={!canSwitchConversation} onClick={() => void perform(async () => {
          conversation.discardAndOpen();
          onOpen();
        })}>미저장 내용 버리고 전환</button>
      </>}
    />}
    <div hidden={!storageOpen}>
      <AiStorageSettings
        controller={controller}
        conversation={conversation}
        locked={!canSwitchConversation || !!editor || !!deletion || conversation.needsDiscard}
        onBack={() => onStorageChange(false)}
        onOpen={onOpen}
      />
    </div>
    <div hidden={storageOpen}>
      <div className={styles.location}>
        <span>
          <Icon name="folder" />
          <span>
            {library.folderName ?? "저장 위치 없음"}
          </span>
        </span>
        <button
          ref={storageTrigger}
          type="button"
          className={actionClasses("secondary")}
          disabled={storageLocked}
          onClick={() => ready ? onStorageChange(true) : chooseStorage()}
        >저장 위치</button>
      </div>
      {(library.notice || notice) && <p role="status" className={styles.notice}>
        {notice || library.notice}
      </p>}
      <div hidden={!previewKind && (!!editor || !!deletion)}>
        <RecordKindTabs selected={tab} onChange={type => { setTab(type); setQuery(""); }}
          counts={ready ? Object.fromEntries(kinds.map(([type]) => [type, library.records.filter(item => category(item.payload) === type).length])) : undefined} />
        <section aria-label="저장 기록" className={styles.browser}>
          <div className={styles.listHeading}>
            <h3 ref={listHeading} tabIndex={-1}>
              {selectedKind[1]}
            </h3>
            <button
              type="button"
              className={actionClasses("primary")}
              disabled={(tab === "conversation" || tab === "wiki") && (!canSwitchConversation || library.pending)}
              onClick={event => {
                editorReturn.current = event.currentTarget;
                create();
              }}
            >
              <Icon name="plus" />
              {tab === "conversation"
                ? "새 대화"
                : tab === "wiki" ? "자료 답변에서 만들기" : tab === "profile" ? "프로필 만들기" : `새 ${selectedKind[1]}`}
            </button>
          </div>
          {ready && library.records.some(item => category(item.payload) === tab) && <label className={styles.search}>
            <Icon name="search" />
            <input
              type="search"
              aria-label="저장 기록 검색"
              value={previewKind ? "" : query}
              onChange={event => setQuery(event.target.value)}
              placeholder={`${selectedKind[1]} 검색`}
            />
          </label>}
          {!ready
            ? <div className={styles.empty}>
              <Icon name="folder" size={32} />
              <strong>
                {library.pending ? "기록을 불러오고 있어요" : "기록을 보관할 폴더를 연결하세요"}
              </strong>
              <p>
                {library.pending ? "연결한 저장 위치를 확인합니다." : "선택한 폴더에 모아 기록 파일을 만듭니다. 저장 파일은 암호화되지 않습니다."}
              </p>
              <button type="button" className={actionClasses("primary")} disabled={storageLocked} onClick={chooseStorage}>{library.phase === "needs-permission" ? "저장 폴더 다시 연결" : "저장 위치 선택"}</button>
            </div>
            : records.length
              ? <ul className={styles.list}>
                {records.map(item => <li key={item.payload.id}>
                  <button
                    type="button"
                    className={styles.recordOpen}
                    disabled={item.payload.type === "conversation" && !canSwitchConversation}
                    onClick={event => {
                      editorReturn.current = event.currentTarget;
                      const payload = item.payload;

                      if (payload.type === "conversation") void perform(async () => {
                        await conversation.open(payload);
                        onOpen();
                      });
                      else onEditorChange(payload);
                    }}
                  >
                    <Icon name={selectedKind[2]} size={20} />
                    <span>
                      <strong>
                        {item.payload.title}
                      </strong>
                      <small>{new Date(item.payload.updatedAt).toLocaleDateString("ko-KR")} · {"status" in item.payload ? statusLabels[item.payload.status] : `${item.revisions}개 버전`}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                  <details
                    className={styles.recordMenu}
                    onKeyDown={event => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        event.currentTarget.open = false;
                        event.currentTarget.querySelector("summary")?.focus();
                      }
                    }}
                  >
                    <summary aria-label={`${item.payload.title} 관리`}>
                      <Icon name="more" />
                    </summary>
                    <button
                      type="button"
                      disabled={item.payload.type === "conversation" && !canSwitchConversation}
                      onClick={event => {
                        deleteTrigger.current = event.currentTarget.closest("details")?.querySelector("summary") ?? null;
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        setDeletion({ ...item.payload, connectionRevision: controller.getConnectionRevision() });
                        setCascade(false);
                      }}
                    >삭제</button>
                  </details>
                </li>)}
              </ul>
              : <div className={styles.empty}>
                <Icon name={selectedKind[2]} size={30} />
                <strong>
                  {query ? "검색 결과가 없어요" : `아직 저장한 ${selectedKind[1]}${tab === "conversation" ? "가" : "이"} 없어요`}
                </strong>
                <p>
                  {query ? "다른 제목으로 찾아보세요." : "위의 새 항목 버튼으로 시작하세요."}
                </p>
              </div>}
          {ready && conversation.temporary && tab === "conversation" && <button
            type="button"
            className={actionClasses("secondary")}
            disabled={!canSwitchConversation}
            onClick={() => void perform(async () => {
              conversation.assertAvailable();
              await conversation.enableStorage();
            })}
          >이 대화 저장</button>}
        </section>
      </div>
      <div hidden={!!previewKind || !!deletion}>
        {editor && <RecordEditor
          key={editor.id}
          initial={editor}
          controller={controller}
          onClose={() => onEditorChange(null)}
          onReveal={onRevealEditor}
        />}
      </div>
      {deletion && <section hidden={!!previewKind} className={styles.deletion} aria-label="기록 삭제 확인">
        <h3 ref={confirmation} tabIndex={-1}>‘{deletion.title}’ 삭제할까요?</h3>
        <p>저장한 모든 버전이 삭제됩니다. 내보낸 사본은 남아요.</p>
        {deletion.type === "conversation" && deletion.id === conversation.id && <p>현재 화면의 대화와 미저장 내용은 임시 대화로 남깁니다.</p>}
        {deletion.type === "conversation" && <label className={styles.checkRow}>
          <input type="checkbox" checked={cascade} onChange={event => setCascade(event.target.checked)} />
          이 대화의 결과물·위키·기억도 삭제
        </label>}
        {deletion.type === "conversation" && !cascade && <p>결과물·위키·기억은 보존합니다.</p>}
        <div className={styles.actions}>
          <button type="button" className={actionClasses("secondary")} onClick={cancelDelete}>취소</button>
          <button
            type="button"
            className={actionClasses("primary", styles.danger)}
            disabled={deletion.type === "conversation" && !canSwitchConversation}
            onClick={() => void perform(async () => {
              controller.assertConnectionRevision(deletion.connectionRevision);

              await controller.remove(deletion.id, cascade, deletion.connectionRevision,
                () => conversation.detachDeletedConversation(deletion.id));
              deleteReturn.current = listHeading.current;
              setDeletion(null);
            })}
          >모든 버전 삭제</button>
        </div>
      </section>}
    </div>
  </div>;
}

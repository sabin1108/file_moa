import { afterEach, describe, expect, it, vi } from "vitest";
import type { SampleCatalog, SampleSession } from "../../src/shared/sample-contract";
import { SampleWorkspaceStore } from "../../src/features/sample-workspace/sample-workspace-store";
import { SampleFileController } from "../../src/features/sample-workspace/files/sample-file-controller";
import { createSampleFiles, prepareSampleFileOperation } from "../../src/features/sample-workspace/files/sample-file-workspace";
import { restoreSampleState, sampleActiveCatalog, sampleFolderPath, createSampleState } from "../../src/features/sample-workspace/sample-state";
import type { SampleAnswerAction, SampleAnswerResult } from "../../src/shared/sample-answer";

const catalog: SampleCatalog = { version: "1", folders: [{ id: "work", label: "업무" }], documents: [
  { id: "note", name: "회의.md", format: "md", excerpt: "초기 문서의 첫 번째 설명입니다.", proposal: { folderId: "work", reason: "업무", reviewRequired: false } },
] };
const session: SampleSession = { kind: "sample", id: "sync-test", version: "1", expiresAt: Date.now() + 3_600_000 };
const cleanup: (()=>void)[] = [];
function setup() {
  const saved = new Map<string,string>();
  const store = new SampleWorkspaceStore(catalog, session, ()=>({getItem:key=>saved.get(key)??null,setItem:(key,value)=>{saved.set(key,value);}}));
  cleanup.push(store.subscribe(()=>{}));
  return {store,files:new SampleFileController(catalog,store)};
}
afterEach(()=>cleanup.splice(0).forEach(close=>close()));
async function changed() {
  const state=setup();
  await state.files.create(["받은 자료"],"새 초안","md");
  const node=state.files.files().nodes.find(node=>node.path.at(-1)==="새 초안.md")!;
  const edited=prepareSampleFileOperation(state.files.files(),{kind:"edit",source:["받은 자료"],names:["새 초안.md"],destination:[],text:"현재 편집한 문서의 기술 설명입니다."}).next;
  expect(state.store.dispatch({type:"file-workspace",files:edited})).toBe(true);
  return {...state,id:node.id};
}
describe("데모 파일과 AI가 같은 현재 자료를 사용한다",()=>{
  it("파일 체크만 바꾸면 준비한 자료·동의를 유지하고 편집하면 무효화한다",async()=>{
    const {store,files}=await changed();
    store.organization.update({request:"주제별 정리",basis:"주제별",scope:{kind:"all"}});
    await store.organization.prepare();
    const snapshot=store.organization.getSnapshot().snapshot;
    const revision=store.getSnapshot().state.materialRevision;
    files.toggle("note");
    expect(store.organization.getSnapshot().snapshot).toBe(snapshot);
    expect(store.getSnapshot().state.materialRevision).toBe(revision);
    const next=prepareSampleFileOperation(files.files(),{kind:"edit",source:["받은 자료"],names:["회의.md"],destination:[],text:"달라진 최신 내용입니다."}).next;
    store.dispatch({type:"file-workspace",files:next});
    expect(store.getSnapshot().state.materialRevision).toBe(revision+1);
    expect(store.organization.getSnapshot().snapshot).toBeNull();
  });
  it("기존 분리 저장 상태를 현재 파일 기준으로 이관하며 대화·기록을 보존한다",async()=>{
    const {store,files,id}=await changed();
    store.dispatch({type:"save-record",record:{id:"old",kind:"conversation",title:"이전 기록",content:"남겨 둘 내용",approved:true,sources:[id]}});
    store.dispatch({type:"conversation",author:"user",text:"이전 대화"});
    const legacy={...store.getSnapshot().state,materialsVersion:undefined,locations:createSampleState(catalog).locations};
    const restored=restoreSampleState(catalog,JSON.stringify(legacy));
    expect(Object.keys(restored.locations)).toContain(id);
    expect(restored.materialsVersion).toBe(1);
    expect(restored.records).toEqual(legacy.records);
    expect(restored.messages).toEqual(legacy.messages);
    expect(restored.files?.nodes).toEqual(files.files().nodes);
    expect(restoreSampleState(catalog,JSON.stringify(restored))).toEqual(restored);
  });
  it("복사·휴지통·복구한 자료도 현재 선택과 본문으로 복원한다",async()=>{
    const {store,files,id}=await changed();
    const copied=prepareSampleFileOperation(files.files(),{kind:"copy",source:["받은 자료"],names:["새 초안.md"],destination:["정리한 자료","업무"]}).next;
    store.dispatch({type:"file-workspace",files:copied});
    const copy=copied.nodes.find(node=>node.kind==="file"&&node.id!==id&&node.path.at(-1)==="새 초안.md")!;
    store.dispatch({type:"select-question",ids:[copy.id]});
    const trashed=prepareSampleFileOperation(files.files(),{kind:"trash",source:["정리한 자료","업무"],names:["새 초안.md"],destination:[]}).next;
    store.dispatch({type:"file-workspace",files:trashed});
    expect(store.getSnapshot().state.questionSelected).toEqual([]);
    const recovered=prepareSampleFileOperation(files.files(),{kind:"recover",source:[],names:[],destination:["정리한 자료","업무"],archiveId:trashed.archives.at(-1)!.id}).next;
    store.dispatch({type:"file-workspace",files:recovered});
    const restored=restoreSampleState(catalog,JSON.stringify(store.getSnapshot().state));
    expect(sampleActiveCatalog(catalog,restored).documents.filter(doc=>doc.excerpt.includes("현재 편집한"))).toHaveLength(2);
    expect(restored.files?.archives).toEqual(recovered.archives);
  });
  it("편집 후 질문 발췌 한도를 넘으면 선택을 해제하고 새로고침을 보존한다",async()=>{
    const {store,files,id}=await changed();
    store.dispatch({type:"select-question",ids:[id]});
    const edited=prepareSampleFileOperation(files.files(),{kind:"edit",source:["받은 자료"],names:["새 초안.md"],destination:[],text:"가".repeat(50_001)}).next;
    store.dispatch({type:"file-workspace",files:edited});
    expect(store.getSnapshot().state.questionSelected).toEqual([]);
    expect(restoreSampleState(catalog,JSON.stringify(store.getSnapshot().state)).files?.nodes).toEqual(edited.nodes);
  });
  it("신규·편집 문서와 이동 경로를 질문 전송 및 준비 snapshot에 반영한다",async()=>{
    const {store,files,id}=await changed();
    const moved=prepareSampleFileOperation(files.files(),{kind:"move",source:["받은 자료"],names:["새 초안.md"],destination:["정리한 자료","업무"]}).next;
    store.dispatch({type:"file-workspace",files:moved});
    expect(sampleActiveCatalog(catalog,store.getSnapshot().state).documents.find(doc=>doc.id===id)?.excerpt).toContain("현재 편집한");
    expect(store.dispatch({type:"select-question",ids:[id]})).toBe(true);
    store.dispatch({type:"draft",value:"이 문서를 설명해줘"});
    const action=vi.fn<SampleAnswerAction>(async()=>({ok:true as const,answer:{answer:"현재 내용입니다.",citations:[{documentId:id,quote:"현재 편집한 문서의 기술 설명"}]},model:"fixture",usage:{inputTokens:1,outputTokens:1,totalTokens:2}}));
    await store.requestAnswer(action,"grounded");
    expect(action.mock.calls[0]?.[0]).toMatchObject({documentIds:[id],documents:[{id,excerpt:"현재 편집한 문서의 기술 설명입니다.",sourcePath:["정리한 자료","업무"]}]});
    store.organization.update({request:"기술 자료 정리",basis:"주제별로",scope:{kind:"all"}});
    await store.organization.prepare();
    expect(store.organization.getSnapshot().snapshot?.documents.find(doc=>doc.id===id)).toMatchObject({excerpt:"현재 편집한 문서의 기술 설명입니다.",path:["정리한 자료","업무","새 초안.md"]});
  });
  it("AI 계획 적용·되돌리기·F5가 파일 tree와 함께 움직인다",async()=>{
    const {store,files,id}=await changed();
    const before=structuredClone(files.files().nodes);
    expect(store.dispatch({type:"organization-propose",instruction:"기술별로 정리",candidateIds:[id],result:{ok:true,organization:{summary:"기술로 이동",matches:[{documentId:id,destination:["기술"],evidence:"현재 편집한 문서의 기술 설명입니다.",date:null}],held:[]},model:"fixture",usage:{inputTokens:1,outputTokens:1,totalTokens:2}}})).toBe(true);
    expect(store.dispatch({type:"apply"})).toBe(true);
    expect(files.files().nodes.find(node=>node.id===id)?.path).toEqual(["정리한 자료","기술","새 초안.md"]);
    expect(()=>restoreSampleState(catalog,JSON.stringify(store.getSnapshot().state))).not.toThrow();
    expect(store.dispatch({type:"undo"})).toBe(true);
    expect(files.files().nodes).toEqual(before);
    const restored=restoreSampleState(catalog,JSON.stringify(store.getSnapshot().state));
    expect(sampleFolderPath(sampleActiveCatalog(catalog,restored),restored.locations[id])).toEqual(["받은 자료"]);
  });
  it("삭제한 자료는 선택에서 빼되 기존 답변·기록과 보존본은 유지한다",async()=>{
    const {store,files,id}=await changed();
    store.dispatch({type:"select-question",ids:[id]});
    store.dispatch({type:"save-record",record:{id:"saved",kind:"conversation",title:"보관 기록",content:"이전 설명",approved:true,sources:[id]}});
    const trashed=prepareSampleFileOperation(files.files(),{kind:"trash",source:["받은 자료"],names:["새 초안.md"],destination:[]}).next;
    store.dispatch({type:"file-workspace",files:trashed});
    expect(store.getSnapshot().state.questionSelected).toEqual([]);
    expect(sampleActiveCatalog(catalog,store.getSnapshot().state).documents.some(doc=>doc.id===id)).toBe(false);
    const restored=restoreSampleState(catalog,JSON.stringify(store.getSnapshot().state));
    expect(restored.records[0]?.sources).toEqual([id]);
    expect(restored.files?.archives.some(archive=>archive.kind==="trash")).toBe(true);
  });
  it("전송 후 파일이 바뀌면 이전 응답을 게시하거나 자동 재전송하지 않는다",async()=>{
    const {store,id}=await changed();
    store.dispatch({type:"select-question",ids:[id]});
    store.dispatch({type:"draft",value:"설명해줘"});
    let finish!:(value:SampleAnswerResult)=>void;
    const action=vi.fn(()=>new Promise<SampleAnswerResult>(resolve=>{finish=resolve;}));
    const pending=store.requestAnswer(action,"grounded");
    const original=createSampleFiles(catalog,{note:null});
    store.dispatch({type:"file-workspace",files:original});
    finish({ok:true,answer:{answer:"늦은 이전 응답",citations:[]},model:"fixture",usage:{inputTokens:1,outputTokens:1,totalTokens:2}});
    await pending;
    expect(store.getSnapshot().state.messages.some(message=>message.text==="늦은 이전 응답")).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

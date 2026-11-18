import { z } from "zod";
import type { SampleCatalog } from "../../shared/sample-contract";
import { buildFileChangePlan, comparableName, type FileChangePlan, type PlanIssue } from "../local-folders/operations/planning/file-change-plan";
import { classificationResponseSchema, parseClassificationRequest, parseClassificationResponse } from "../../shared/ai-classification";
import type { SampleAiResult } from "../../shared/sample-ai";
import { organizationResponseSchema, parseOrganizationResponse } from "../../shared/organization";
import { SAMPLE_ORGANIZATION_LIMITS, sampleOrganizationContextSchema, type SampleOrganizationContext, type SampleOrganizationResult } from "../../shared/sample-organization";
import { conversationKinds } from "../../shared/ai-records";
import { prepareSampleReply } from "./sample-experience";
import { SAMPLE_ANSWER_LIMITS, sampleAnswerSchema, type SampleAnswerResult } from "../../shared/sample-answer";
import { recordKinds } from "../../shared/record-kinds";
import { parseSampleFiles, sampleFilesSchema, type SampleFiles } from "./files/sample-file-workspace";

export const sampleRecordSchema = z.strictObject({
  id: z.string().min(1).max(80),
  kind: z.enum(recordKinds.map(([kind]) => kind)),
  title: z.string().trim().min(1).max(120),
  content: z.string().max(8000),
  approved: z.boolean(),
  sources: z.array(z.string()).max(5),
});
export type SampleRecord = z.infer<typeof sampleRecordSchema>;

const locationsSchema = z.record(z.string(), z.string().nullable());
export const SAMPLE_STATE_CHARACTER_LIMIT = 512000;
const createdFolderPathSchema = sampleOrganizationContextSchema.shape.destination.unwrap().min(1);
const createdFoldersSchema = z.array(z.strictObject({ id: z.string().regex(/^custom-\d+$/), label: z.string().min(1).max(1024) })).max(200);
const usageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});
const fileFolderSelectionSchema = z.array(z.array(z.string().min(1).max(120)).min(1).max(20)).max(200);
const stateSchema = z.strictObject({
  version: z.literal("1"),
  files: sampleFilesSchema.nullable().default(null),
  mode: z.enum(conversationKinds).nullable().default(null),
  findings: z.array(z.string()).max(200).default([]),
  citations: z.array(z.string()).max(5).default([]),
  sourceReply: z.string().max(8000).default(""),
  records: z.array(sampleRecordSchema).max(20).default([]),
  guideStep: z.number().int().min(0).max(5).default(0),
  guideDismissed: z.boolean().default(false),
  scope: z.enum(["all", "selected", "folder"]).default("all"),
  path: z.array(z.string().min(1).max(120)).min(1).max(20).default(["받은 자료"]),
  phase: z.enum(["select", "review", "result"]),
  selected: z.array(z.string()).max(200),
  fileSelected: z.array(z.string()).max(200).default([]),
  fileSelectedFolders: fileFolderSelectionSchema.default([]),
  questionSelected: z.array(z.string()).max(SAMPLE_ANSWER_LIMITS.documents).nullable().default(null),
  createdFolders: createdFoldersSchema.default([]),
  draft: z.string().max(800).default(""),
  messages: z.array(z.strictObject({ id: z.string(), author: z.enum(["user", "assistant"]), text: z.string().max(8000), model: z.string().min(1).max(200).optional() })).max(40).default([]),
  organization: z.strictObject({
    instruction: z.string().max(800),
    candidateIds: z.array(z.string()).max(SAMPLE_ORGANIZATION_LIMITS.documents),
    context: sampleOrganizationContextSchema.optional(),
    response: organizationResponseSchema,
    model: z.string().min(1).max(64),
    usage: usageSchema,
    foldersBefore: createdFoldersSchema
  }).nullable().default(null),
  locations: locationsSchema,
  targets: locationsSchema,
  ai: z.strictObject({
    proposals: classificationResponseSchema.shape.proposals,
    model: z.string().min(1).max(64),
    usage: usageSchema,
  }).nullable().default(null),
  lastApplied: z.strictObject({
    before: locationsSchema,
    after: locationsSchema,
    documentIds: z.array(z.string()).min(1).max(200),
    foldersBefore: createdFoldersSchema.default([]),
    foldersAfter: createdFoldersSchema.default([])
  }).nullable(),
});

export type SampleState = z.infer<typeof stateSchema>;

export type SampleAction =
  | Readonly<{ type: "file-workspace"; files: SampleFiles }>
  | Readonly<{ type: "conversation"; author: "user" | "assistant"; text: string }>
  | Readonly<{ type: "select-file-folders"; paths: readonly (readonly string[])[] }>
  | Readonly<{ type: "select-files"; ids: readonly string[] }>
  | Readonly<{ type: "select-question"; ids: readonly string[] }>
  | Readonly<{ type: "ai-answer"; requestId: string; mode: "chat" | "grounded"; question: string; result: Extract<SampleAnswerResult, { ok: true }> }>
  | Readonly<{ type: "mode"; mode: typeof conversationKinds[number] | null }>
  | Readonly<{ type: "guide"; step: number; dismissed: boolean }>
  | Readonly<{ type: "sample-reply"; mode: "chat" | "find" | "grounded"; question: string; selectedIds: readonly string[]; referenceYear: number }>
  | Readonly<{ type: "save-record"; record: SampleRecord }>
  | Readonly<{ type: "remove-record"; id: string }>
  | Readonly<{ type: "scope"; scope: SampleState["scope"]; path?: readonly string[] }>
  | Readonly<{
    type: "select";
    ids: readonly string[]
  }>
  | Readonly<{
    type: "destination";
    id: string;
    folderId: string | null
  }>
  | Readonly<{
    type: "ai-propose";
    result: Extract<SampleAiResult, { ok: true }>
  }>
  | Readonly<{
    type: "draft";
    value: string
  }>
  | Readonly<{
    type: "intent";
    instruction: string;
    recordMessage?: boolean
  }>
  | Readonly<{
    type: "organization-propose";
    instruction: string;
    candidateIds: readonly string[];
    context?: SampleOrganizationContext;
    result: Extract<SampleOrganizationResult, { ok: true }>
  }>
  | Readonly<{ type: "propose" | "back" | "apply" | "undo" | "reset" }>;

export function createSampleState(catalog: SampleCatalog): SampleState {
  return {
    version: "1",
    files: null,
    mode: null, findings: [], citations: [], sourceReply: "", records: [], guideStep: 0, guideDismissed: false,
    scope: "all", path: ["받은 자료"],
    phase: "select",
    selected: [],
    fileSelected: [],
    fileSelectedFolders: [],
    questionSelected: null,
    locations: Object.fromEntries(catalog.documents.map(document => [document.id, document.sourceFolderId ?? null])),
    targets: {},
    ai: null,
    organization: null,
    createdFolders: [],
    draft: "",
    messages: [],
    lastApplied: null,
  };
}

function equalLocations(first: SampleState["locations"], second: SampleState["locations"]) {
  return Object.keys(first).length === Object.keys(second).length && Object.keys(first).every(id => first[id] === second[id]);
}

export function restoreSampleState(catalog: SampleCatalog, serialized: string): SampleState {
  if (serialized.length > SAMPLE_STATE_CHARACTER_LIMIT) throw new Error("invalid-sample-state");

  const state = stateSchema.parse(JSON.parse(serialized));
  if (state.files) parseSampleFiles(catalog, state.files);

  for (const folder of state.createdFolders) createdFolderPathSchema.parse(folder.label.split("/"));

  if (
    state.createdFolders.some(folder =>
      catalog.folders.some(
        base =>
          base.id === folder.id || comparableName(base.label) === comparableName(folder.label),
      ),
    )
  )
    throw new Error("invalid-sample-folders");

  if (new Set(state.createdFolders.map(folder => folder.id)).size !== state.createdFolders.length
    || new Set(state.createdFolders.map(folder => comparableName(folder.label))).size !== state.createdFolders.length) throw new Error("invalid-sample-folders");

  catalog = sampleActiveCatalog(catalog, state);

  const documents = new Set(catalog.documents.map(document => document.id));
  const folders = new Set(catalog.folders.map(folder => folder.id));
  const validIds = (ids: readonly string[]) => new Set(ids).size === ids.length && ids.every(id => documents.has(id));
  if (!validIds(state.findings) || !validIds(state.citations)
    || new Set(state.records.map(record => record.id)).size !== state.records.length
    || state.records.some(record => !validIds(record.sources))) throw Error("invalid-sample-experience");
  const validLocations = (locations: SampleState["locations"]) => Object.keys(locations).length === documents.size
    && Object.entries(locations).every(([id, folder]) => documents.has(id) && (folder === null || folders.has(folder)));

  if (!validIds(state.selected) || !validIds(state.fileSelected) || !validFolderSelection(catalog, state.fileSelectedFolders) || (state.questionSelected !== null && !validQuestionSelection(catalog, state.questionSelected)) || !validLocations(state.locations)
    || Object.entries(state.targets).some(([id, folder]) => !state.selected.includes(id) || (folder !== null && !folders.has(folder)))
    || (state.phase === "review" && (!state.selected.length || Object.keys(state.targets).length !== state.selected.length))) {
    throw new Error("invalid-sample-state");
  }

  if (state.lastApplied
    && (!validLocations(state.lastApplied.before) || !validLocations(state.lastApplied.after)
      || !validIds(state.lastApplied.documentIds)
      || !equalLocations(state.locations, state.lastApplied.after))) {
    throw new Error("invalid-sample-history");
  }

  if (state.lastApplied) {
    for (const list of [state.lastApplied.foldersBefore, state.lastApplied.foldersAfter]) {
      for (const folder of list) createdFolderPathSchema.parse(folder.label.split("/"));

      if (new Set(list.map(folder => folder.id)).size !== list.length) throw new Error("invalid-sample-history");
    }

    const committed = state.phase === "review" && state.organization ? state.organization.foldersBefore : state.createdFolders;

    if (
      JSON.stringify(state.lastApplied.foldersAfter) !== JSON.stringify(committed)
      ||
      state.lastApplied.foldersBefore.some(
        folder =>
          !state.lastApplied!.foldersAfter.some(
            after => after.id === folder.id && after.label === folder.label,
          ),
      )
    )
      throw new Error("invalid-sample-history");

    const changed = Object.keys(state.lastApplied.before).filter(id => state.lastApplied!.before[id] !== state.lastApplied!.after[id]);

    if (changed.length !== state.lastApplied.documentIds.length
      || changed.some(id => !state.lastApplied!.documentIds.includes(id))) {
      throw new Error("invalid-sample-history");
    }
  }

  if (state.phase === "result" && !state.lastApplied) throw new Error("invalid-sample-history");

  if (state.ai) {
    if (state.phase === "select") throw new Error("invalid-sample-proposal");

    parseClassificationResponse(
      { proposals: state.ai.proposals },
      sampleRequest(catalog, state.selected)
    );
  }

  if (state.organization) {
    if (!validIds(state.organization.candidateIds)) throw new Error("invalid-sample-organization");

    parseOrganizationResponse(
      state.organization.response,
      organizationRequest(catalog, state.organization.instruction, state.organization.candidateIds, state.organization.context)
    );

    if (state.organization.foldersBefore.some(folder => !state.createdFolders.some(current => current.id === folder.id && current.label === folder.label))
      || state.organization.response.matches.length !== state.selected.length
      || state.organization.response.matches.some(match => !state.selected.includes(match.documentId))) throw new Error("invalid-sample-organization");
  }

  return state;
}

export function sampleActiveCatalog(catalog: SampleCatalog, state: Pick<SampleState, "createdFolders">): SampleCatalog {
  return {
    ...catalog,
    folders: [...catalog.folders.filter(folder => !state.createdFolders.some(created => created.id === folder.id)), ...state.createdFolders]
  };
}

function validQuestionSelection(catalog: SampleCatalog, ids: readonly string[]) {
  const documents = ids.map(id => catalog.documents.find(document => document.id === id));
  return ids.length <= SAMPLE_ANSWER_LIMITS.documents && new Set(ids).size === ids.length
    && documents.every(document => !!document)
    && documents.reduce((sum, document) => sum + (document?.excerpt.length ?? 0), 0) <= SAMPLE_ANSWER_LIMITS.excerptCharacters;
}

function validFolderSelection(catalog: SampleCatalog, paths: readonly (readonly string[])[]) {
  if (!fileFolderSelectionSchema.safeParse(paths).success || new Set(paths.map(path => JSON.stringify(path))).size !== paths.length) return false;
  const folders = [["받은 자료"], ...catalog.folders.map(folder => sampleFolderPath(catalog, folder.id))];
  return paths.every(path => folders.some(folder => path.length <= folder.length && path.every((part, index) => folder[index] === part)));
}

/** 질문 선택은 폴더 관리·정리 계획의 선택과 별도로 보관한다. null만 첫 체험 기본값을 뜻한다. */
export function sampleQuestionSelection(catalog: SampleCatalog, state: Pick<SampleState, "questionSelected" | "locations" | "createdFolders">): string[] {
  if (state.questionSelected !== null) return state.questionSelected;
  const active = sampleActiveCatalog(catalog, state);
  const ids: string[] = [];
  let characters = 0;
  for (const document of catalog.documents) {
    const folder = active.folders.find(folder => folder.id === state.locations[document.id]);
    if (folder?.label.split("/").at(-1) !== "웹사이트 문서") continue;
    if (ids.length >= SAMPLE_ANSWER_LIMITS.documents || characters + document.excerpt.length > SAMPLE_ANSWER_LIMITS.excerptCharacters) continue;
    ids.push(document.id);
    characters += document.excerpt.length;
  }
  return ids;
}

export function organizationRequest(catalog: SampleCatalog, instruction: string, candidateIds: readonly string[], context?: SampleOrganizationContext) {
  if (new Set(candidateIds).size !== candidateIds.length || !candidateIds.length || candidateIds.length > SAMPLE_ORGANIZATION_LIMITS.documents) throw new Error("invalid-organization-scope");

  return {
    instruction,
    ...(context ? { context: { ...context,
      dateSelections: Object.fromEntries(context.answers.filter(answer => answer.date !== undefined).map(answer => [answer.documentId, answer.date!])),
      destinationSelections: Object.fromEntries(context.answers.filter(answer => answer.destination).map(answer => [answer.documentId, answer.destination!])),
    } } : {}),
    documents: candidateIds.map(id => {
      const document = catalog.documents.find(document => document.id === id);

      if (!document) throw new Error("invalid-organization-scope");

      return {
        id,
        name: document.name,
        excerpt: document.excerpt,
        sourcePath: catalog.folders.find(folder => folder.id === document.sourceFolderId)?.label.split("/") ?? ["받은 자료"]
      };
    })
  };
}

function sampleRequest(catalog: SampleCatalog, selected: readonly string[]) {
  return parseClassificationRequest({
    documents: selected.map(id => {
      const { name, excerpt } = catalog.documents.find(document => document.id === id)!;

      return { id, name, excerpt };
    }),
    folders: catalog.folders,
  }, { mode: "sample", documents: catalog.documents, folders: catalog.folders });
}

export function sampleFolderPath(catalog: SampleCatalog, id: string | null): string[] {
  if (id === null) return ["받은 자료"];

  const folder = catalog.folders.find(candidate => candidate.id === id);

  if (!folder) throw new Error("invalid-sample-folder");
  if (!folder.label) return ["정리한 자료"];

  return folder.label.startsWith("받은 자료/") ? folder.label.split("/") : ["정리한 자료", ...folder.label.split("/")];
}

export function sampleChangePlan(catalog: SampleCatalog, state: SampleState): FileChangePlan {
  catalog = sampleActiveCatalog(catalog, state);

  if (state.phase !== "review") throw new Error("sample-review-required");

  const rows: {
    from: readonly string[];
    to: readonly string[];
    issues: PlanIssue[]
  }[] = [];
  const directoriesToCreate = new Map<string, readonly string[]>();

  for (const id of state.selected) {
    const document = catalog.documents.find(candidate => candidate.id === id);
    const destination = state.targets[id];

    if (!document || destination === null || destination === undefined) throw new Error("sample-review-required");

    const sourceId = state.locations[id];
    const entries = (folder: string | null) => catalog.documents.filter(candidate => state.locations[candidate.id] === folder)
      .map(candidate => ({ name: candidate.name, kind: "file" as const }));
    const destinationPath = sampleFolderPath(catalog, destination);
    const plan = buildFileChangePlan({
      operation: "move",
      source: {
        path: sampleFolderPath(catalog, sourceId),
        entries: entries(sourceId),
        truncated: false,
      },
      selectedNames: [document.name],
      destinationPath,
      destinations: [
        {
          path: destinationPath,
          entries: entries(destination),
          truncated: false,
          availability:
            state.organization?.foldersBefore.some(folder => folder.id === destination) === false
              &&
              state.createdFolders.some(folder => folder.id === destination)
              ? "planned"
              : "existing",
        },
      ],
    });

    rows.push(...plan.rows.map(row => ({ ...row, issues: [...row.issues] })));

    for (const path of plan.directoriesToCreate) directoriesToCreate.set(JSON.stringify(path), path);
  }

  // Multiple source folders can propose the same target; retain the shared duplicate-target rule across their plans.

  const targetKey = (row: FileChangePlan["rows"][number]) => JSON.stringify(row.to.map(comparableName));
  const counts = new Map<string, number>();

  for (const row of rows) counts.set(targetKey(row), (counts.get(targetKey(row)) ?? 0) + 1);

  for (const row of rows) if ((counts.get(targetKey(row)) ?? 0) > 1) row.issues.push("duplicate-target");

  return {
    operation: "move",
    rows,
    directoriesToCreate: [...directoriesToCreate.values()],
    conflictCount: rows.filter(row => row.issues.length).length
  };
}

export function transitionSampleState(catalog: SampleCatalog, state: SampleState, action: SampleAction): SampleState {
  if (action.type === "reset") return createSampleState(catalog);
  if (action.type === "file-workspace") {
    if (state.phase === "review") throw Error("sample-review-required");
    return { ...state, files: parseSampleFiles(catalog, action.files) };
  }
  if (action.type === "conversation") {
    if (!action.text.trim() || action.text.length > 8000) throw Error("invalid-sample-message");
    return { ...state, draft: "", messages: [...state.messages, { id: `org-${crypto.randomUUID()}`, author: action.author, text: action.text }].slice(-40) };
  }
  if (action.type === "scope") {
    const scope = stateSchema.shape.scope.parse(action.scope);
    const path = stateSchema.shape.path.parse(action.path ?? state.path);
    if (state.phase === "review") throw Error("sample-review-required");
    return { ...state, scope, path };
  }

  if (action.type === "mode") {
    if (state.phase === "review" || (action.mode !== null && !conversationKinds.includes(action.mode))) throw Error("sample-review-required");
    if (action.mode === "grounded" && state.questionSelected === null) {
      const ids = sampleQuestionSelection(catalog, state);
      const folderId = ids.length ? state.locations[ids[0]] : null;
      return { ...state, mode: action.mode, questionSelected: ids, path: folderId ? sampleFolderPath(sampleActiveCatalog(catalog, state), folderId) : state.path };
    }
    return { ...state, mode: action.mode };
  }
  if (action.type === "select-question") {
    if (state.phase === "review" || !validQuestionSelection(catalog, action.ids)) throw Error("invalid-sample-question-selection");
    return { ...state, questionSelected: [...action.ids] };
  }
  if (action.type === "select-files") {
    if (action.ids.length > 200 || new Set(action.ids).size !== action.ids.length
      || action.ids.some(id => !catalog.documents.some(document => document.id === id))) throw Error("invalid-sample-selection");
    return { ...state, fileSelected: [...action.ids] };
  }
  if (action.type === "select-file-folders") {
    if (!validFolderSelection(sampleActiveCatalog(catalog, state), action.paths)) throw Error("invalid-sample-folder-selection");
    return { ...state, fileSelectedFolders: action.paths.map(path => [...path]) };
  }
  if (action.type === "guide") {
    if (!Number.isInteger(action.step) || action.step < 0 || action.step > 5) throw Error("invalid-sample-guide");
    return { ...state, guideStep: action.step, guideDismissed: action.dismissed };
  }
  if (action.type === "ai-answer") {
    const id = action.requestId;
    const answer = sampleAnswerSchema.parse(action.result.answer);
    const citations = answer.citations.map(citation => citation.documentId);
    if (citations.some(id => !sampleQuestionSelection(catalog, state).includes(id))) throw Error("invalid-sample-citation");
    return { ...state, mode: action.mode, draft: "", citations: action.mode === "grounded" ? [...new Set(citations)] : state.citations,
      sourceReply: action.mode === "grounded" ? answer.answer : state.sourceReply,
      messages: [...state.messages, { id: `ai-question-${id}`, author: "user" as const, text: action.question.trim() },
        { id: `ai-answer-${id}`, author: "assistant" as const, text: answer.answer, model: action.result.model }].slice(-40) };
  }
  if (action.type === "sample-reply") {
    if (state.phase === "review") throw Error("sample-review-required");
    const result = prepareSampleReply(catalog, state, action);
    const id = crypto.randomUUID();
    return { ...state, mode: action.mode, draft: "",
      findings: action.mode === "find" ? result.findings : state.findings,
      citations: action.mode === "grounded" ? result.citations : state.citations,
      sourceReply: action.mode === "grounded" ? result.answer : state.sourceReply,
      messages: [...state.messages, { id: `question-${id}`, author: "user" as const, text: action.question.trim() },
        { id: `reply-${id}`, author: "assistant" as const, text: result.answer }].slice(-40) };
  }
  if (action.type === "save-record") {
    const record = sampleRecordSchema.parse(action.record);
    if (record.sources.some(id => !catalog.documents.some(document => document.id === id))) throw Error("invalid-sample-record");
    const records = [record, ...state.records.filter(item => item.id !== record.id)];
    if (records.length > 20 || JSON.stringify(records).length > 60_000) throw Error("sample-record-limit");
    return { ...state, records };
  }
  if (action.type === "remove-record") return { ...state, records: state.records.filter(record => record.id !== action.id) };

  if (action.type === "draft") {
    if (action.value.length > 800) throw new Error("invalid-sample-draft");

    return { ...state, draft: action.value };
  }

  if (action.type === "intent") {
    if (!action.instruction.trim() || action.instruction.length > 800) throw new Error("invalid-sample-intent");

    return {
      ...state,
      phase: "select",
      mode: "organize",
      targets: {},
      ai: null,
      organization: null,
      draft: action.recordMessage === false ? state.draft : action.instruction,
      createdFolders: state.phase === "review" && state.organization ? state.organization.foldersBefore : state.createdFolders,
      messages: action.recordMessage === false ? state.messages : [...state.messages, {
        id: `message-${state.messages.length}-${Date.now()}`,
        author: "user" as const,
        text: action.instruction
      }].slice(-40)
    };
  }

  if (action.type === "organization-propose") {
    const response = parseOrganizationResponse(
      action.result.organization,
      organizationRequest(catalog, action.instruction, action.candidateIds, action.context)
    );
    const createdFolders = [...state.createdFolders];
    const targets: Record<string, string> = {};

    for (const match of response.matches) {
      const destination = [...(action.context?.destination ?? ["정리한 자료"]), ...match.destination];
      const label = (destination[0] === "정리한 자료" ? destination.slice(1) : destination).join("/");
      let folder = [...catalog.folders, ...createdFolders].find(folder => comparableName(sampleFolderPath({ ...catalog, folders: [...catalog.folders, ...createdFolders] }, folder.id).join("/")) === comparableName(destination.join("/")));

      if (!folder) {
        let index = 1;

        while ([...catalog.folders, ...createdFolders].some(candidate => candidate.id === `custom-${index}`)) index++;

        folder = { id: `custom-${index}`, label };
        createdFolders.push(folder);
      }

      targets[match.documentId] = folder.id;
    }

    return {
      ...state,
      phase: response.matches.length ? "review" : "select",
      mode: "organize",
      selected: response.matches.map(match => match.documentId),
      targets,
      createdFolders,
      ai: null,
      draft: "",
      organization: {
        instruction: action.instruction,
        candidateIds: [...action.candidateIds],
        ...(action.context ? { context: action.context } : {}),
        response,
        model: action.result.model,
        usage: action.result.usage,
        foldersBefore: state.createdFolders,
      },
      messages: [
        ...state.messages,
        {
          id: `answer-${state.messages.length}-${Date.now()}`,
          author: "assistant" as const,
          text: response.summary,
        },
      ].slice(-40),
    };
  }

  if (action.type === "select") {
    if (state.phase !== "select" || action.ids.length > 200 || new Set(action.ids).size !== action.ids.length
      || action.ids.some(id => !catalog.documents.some(document => document.id === id))) throw new Error("invalid-sample-selection");

    return { ...state, selected: [...action.ids], targets: {}, ai: null, organization: null };
  }

  if (action.type === "back") {
    const createdFolders = state.phase === "review" && state.organization ? state.organization.foldersBefore : state.createdFolders;
    const folders = sampleActiveCatalog(catalog, { createdFolders });
    return {
      ...state,
      phase: "select",
      targets: {},
      ai: null,
      organization: null,
      createdFolders,
      fileSelectedFolders: state.fileSelectedFolders.filter(path => validFolderSelection(folders, [path]))
    };
  }

  if (action.type === "propose" || action.type === "ai-propose") {
    if (state.phase !== "select" || !state.selected.length) throw new Error("sample-review-required");

    const documents = catalog.documents.filter(document => state.selected.includes(document.id));
    const proposals = action.type === "ai-propose"
      ? parseClassificationResponse(
        { proposals: action.result.proposals },
        sampleRequest(catalog, state.selected)
      ).proposals
      : documents.flatMap((_document, index) => {
        if (index % 20) return [];

        const batch = documents.slice(index, index + 20);

        return parseClassificationResponse(
          { proposals: batch.map(document => ({ documentId: document.id, ...document.proposal })) },
          sampleRequest(
            catalog,
            batch.map(document => document.id),
          ),
        ).proposals;
      });
    const response = { proposals };
    const ai = action.type === "ai-propose"
      ? { proposals: response.proposals, model: action.result.model, usage: action.result.usage }
      : null;

    return {
      ...state,
      phase: "review",
      mode: "organize",
      ai,
      targets: Object.fromEntries(response.proposals.map(proposal => [proposal.documentId, proposal.folderId]))
    };
  }

  if (action.type === "destination") {
    if (state.phase !== "review" || !state.selected.includes(action.id)
      || (action.folderId !== null && !sampleActiveCatalog(catalog, state).folders.some(folder => folder.id === action.folderId))) throw new Error("invalid-sample-folder");

    return { ...state, targets: { ...state.targets, [action.id]: action.folderId } };
  }

  if (action.type === "apply") {
    const plan = sampleChangePlan(catalog, state);

    if (plan.conflictCount) throw new Error("sample-plan-conflict");

    const locations = { ...state.locations, ...state.targets };
    const foldersBefore = state.organization?.foldersBefore ?? state.createdFolders;
    const createdFolders = state.createdFolders.filter(folder => foldersBefore.some(before => before.id === folder.id) || Object.values(locations).includes(folder.id));

    return {
      ...state,
      phase: "result",
      locations,
      createdFolders,
      lastApplied: {
        before: { ...state.locations },
        after: { ...locations },
        documentIds: [...state.selected],
        foldersBefore,
        foldersAfter: createdFolders,
      },
      messages: [
        ...state.messages,
        {
          id: `applied-${state.messages.length}-${Date.now()}`,
          author: "assistant" as const,
          text: `${state.selected.length}개 자료를 검토한 위치로 정리했어요. 이 작업은 되돌릴 수 있어요.`,
        },
      ].slice(-40),
    };
  }

  if (!state.lastApplied || !equalLocations(state.locations, state.lastApplied.after)) throw new Error("sample-restore-unavailable");

  return {
    ...state,
    phase: "select",
    locations: { ...state.lastApplied.before },
    targets: {},
    ai: null,
    organization: null,
    createdFolders: state.lastApplied.foldersBefore,
    fileSelectedFolders: state.fileSelectedFolders.filter(path => validFolderSelection(sampleActiveCatalog(catalog, { createdFolders: state.lastApplied!.foldersBefore }), [path])),
    lastApplied: null,
    messages: [
      ...state.messages,
      {
        id: `undo-${state.messages.length}-${Date.now()}`,
        author: "assistant" as const,
        text: "이번 정리를 되돌렸어요. 자료와 새 폴더를 정리 전 상태로 복원했어요.",
      },
    ].slice(-40),
  };
}

import { z } from "zod";
import type { SampleCatalog } from "../../shared/sample-contract";
import { buildFileChangePlan, comparableName, type FileChangePlan, type PlanIssue } from "../local-folders/operations/planning/file-change-plan";
import { classificationResponseSchema, parseClassificationRequest, parseClassificationResponse } from "../../shared/ai-classification";
import type { SampleAiResult } from "../../shared/sample-ai";
import { organizationPathSchema, organizationResponseSchema, parseOrganizationResponse } from "../../shared/organization";
import type { SampleOrganizationResult } from "../../shared/sample-organization";

const locationsSchema = z.record(z.string(), z.string().nullable());
const createdFoldersSchema = z.array(z.strictObject({ id: z.string().regex(/^custom-\d+$/), label: z.string().min(1).max(120) })).max(80);
const usageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});
const stateSchema = z.strictObject({
  version: z.literal("1"),
  phase: z.enum(["select", "review", "result"]),
  selected: z.array(z.string()).max(200),
  createdFolders: createdFoldersSchema.default([]),
  draft: z.string().max(800).default(""),
  messages: z.array(z.strictObject({ id: z.string(), author: z.enum(["user", "assistant"]), text: z.string().max(1500) })).max(40).default([]),
  organization: z.strictObject({
    instruction: z.string().max(800),
    candidateIds: z.array(z.string()).max(40),
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
    instruction: string
  }>
  | Readonly<{
    type: "organization-propose";
    instruction: string;
    candidateIds: readonly string[];
    result: Extract<SampleOrganizationResult, { ok: true }>
  }>
  | Readonly<{ type: "propose" | "back" | "apply" | "undo" | "reset" }>;

export function createSampleState(catalog: SampleCatalog): SampleState {
  return {
    version: "1",
    phase: "select",
    selected: catalog.documents.filter((document, index) => index === 0 || document.format === "pdf" || document.format === "xlsx").slice(
      0,
      3
    ).map(document => document.id),
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
  if (serialized.length > 128_000) throw new Error("invalid-sample-state");

  const state = stateSchema.parse(JSON.parse(serialized));

  for (const folder of state.createdFolders) organizationPathSchema.parse(folder.label.split("/"));

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
  const validLocations = (locations: SampleState["locations"]) => Object.keys(locations).length === documents.size
    && Object.entries(locations).every(([id, folder]) => documents.has(id) && (folder === null || folders.has(folder)));

  if (!validIds(state.selected) || !validLocations(state.locations)
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
      for (const folder of list) organizationPathSchema.parse(folder.label.split("/"));

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
      organizationRequest(catalog, state.organization.instruction, state.organization.candidateIds)
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

export function organizationRequest(catalog: SampleCatalog, instruction: string, candidateIds: readonly string[]) {
  if (new Set(candidateIds).size !== candidateIds.length || !candidateIds.length || candidateIds.length > 40) throw new Error("invalid-organization-scope");

  return {
    instruction,
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

  if (action.type === "draft") {
    if (action.value.length > 800) throw new Error("invalid-sample-draft");

    return { ...state, draft: action.value };
  }

  if (action.type === "intent") {
    if (!action.instruction.trim() || action.instruction.length > 800) throw new Error("invalid-sample-intent");

    return {
      ...state,
      phase: "select",
      targets: {},
      ai: null,
      organization: null,
      draft: action.instruction,
      createdFolders: state.phase === "review" && state.organization ? state.organization.foldersBefore : state.createdFolders,
      messages: [...state.messages, {
        id: `message-${state.messages.length}-${Date.now()}`,
        author: "user" as const,
        text: action.instruction
      }].slice(-40)
    };
  }

  if (action.type === "organization-propose") {
    const response = parseOrganizationResponse(
      action.result.organization,
      organizationRequest(catalog, action.instruction, action.candidateIds)
    );
    const createdFolders = [...state.createdFolders];
    const targets: Record<string, string> = {};

    for (const match of response.matches) {
      const label = match.destination.join("/");
      let folder = [...catalog.folders, ...createdFolders].find(folder => comparableName(folder.label) === comparableName(label));

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
      selected: response.matches.map(match => match.documentId),
      targets,
      createdFolders,
      ai: null,
      draft: "",
      organization: {
        instruction: action.instruction,
        candidateIds: [...action.candidateIds],
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

  if (action.type === "back") return {
    ...state,
    phase: "select",
    targets: {},
    ai: null,
    organization: null,
    createdFolders: state.phase === "review" && state.organization ? state.organization.foldersBefore : state.createdFolders
  };

  if (action.type === "propose" || action.type === "ai-propose") {
    if (state.phase !== "select") throw new Error("sample-review-required");

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

import { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { OrganizationSnapshotView } from "../../src/features/local-folders/components/organization/OrganizationSnapshotView";
import { OrganizationPreparationController } from "../../src/features/local-folders/store/organization-preparation-controller";
import type { AiProvider } from "../../src/shared/ai-provider";
import "../../src/styles/globals.css";
import ui from "../../src/styles/workspace-ui.module.css";
import files from "../../src/features/local-folders/components/listing/folder-workspace.module.css";

// External files, identity and transport are synthetic; the actual controller and consent UI run.

const controller = new OrganizationPreparationController(
  async () => ({
    documents: [{
      id: "document-1",
      name: "memo.md",
      path: ["memo.md"],
      excerpt: "성능 보고",
      size: 20,
      lastModified: 42,
      sha256: "a".repeat(64),
      excerptHash: "b".repeat(64)
    }],
    excluded: [],
    complete: true,
    limits: [],
    discoveredFiles: 1,
    directories: 0,
    bytes: 20,
  }),
  async () => ({ path: [], entries: [], truncated: false }),
  undefined,
  async () => ({ userId: "fixture", workspaceId: "fixture" }),
);

controller.update({ request: "성능 보고", scope: { kind: "all" } });
await controller.prepare();

function Fixture() {
  const [provider, setProvider] = useState<AiProvider | null>("openai");
  const [calls, setCalls] = useState(0);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  return <div className={`${ui.system} ${files.theme}`}>
    <label>검증용 공급자 <select
      data-provider
      value={provider ?? ""}
      onChange={event => setProvider(event.target.value as AiProvider || null)}
    >
      <option value="openai">OpenAI</option>
      <option value="gemini">Google Gemini</option>
      <option value="">설정 없음</option>
    </select></label>
    <output data-calls>
      {calls}
    </output>
    <OrganizationSnapshotView
      controller={controller}
      state={state}
      aiProvider={provider}
      folderName="합성 자료"
      organizeAction={async () => {
        setCalls(value => value + 1);

        return { ok: false, code: "unavailable" };
      }}
    />
  </div>;
}

createRoot(document.getElementById("fixture")!).render(<Fixture />);

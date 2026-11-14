import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? "docs/verification/workspace-nine/browser");

mkdirSync(output, { recursive: true });

let generations = 0;
const server = await createServer({
  configFile: false,
  root: resolve("apps/web"),
  logLevel: "error",
  cacheDir: resolve(".omx/browser-cache/records"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: {
    alias: {
      "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "@personal-ai/domain": resolve("packages/domain/src/index.ts")
    }
  },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: {
    include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"]
  },
  plugins: [{
    name: "records-fixture",
    configureServer(server) {
      server.middlewares.use("/__records", (_request, response) => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>');
      });
      server.middlewares.use("/api/chat", async (request, response) => {
        let body = "";

        for await (const chunk of request) body += chunk;

        const input = JSON.parse(body);

        generations++;
        response.writeHead(200, { "content-type": "text/event-stream" });

        for (const event of [{ type: "accepted" }, { type: "text_delta", text: "저장할 합성 답변입니다." }, { type: "completed", model: "fixture", usage: null }]) response.write(`data: ${JSON.stringify({
          generationId: input.requestId,
          sequence: ["accepted", "text_delta", "completed"].indexOf(event.type),
          ...event
        })}\n\n`);

        response.end();
      });
    }
  }]
});

await server.listen();

const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
const checks = [];
let page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, pass) => {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
  assert.ok(pass, name);
};

async function until(predicate, argument) {
  for (let i = 0; i < 1000; i++) {
    if (await page.eval(`(async () => Boolean(await (${predicate.toString()})(${JSON.stringify(argument)})))()`)) return;

    await pause(30);
  }

  throw new Error("Timeout: " + predicate);
}

async function click(text) {
  if (text === "목록으로" || text === "기록으로") text = "기록 목록으로 돌아가기";

  if (["다른 저장 위치 선택", "권한 확인·다시 읽기", "연결 해제", "저장 없이 새 대화"].includes(text)) {
    await page.eval(() => { const settings = document.querySelector('[aria-label="기록 저장 위치"]'); const details = settings?.querySelector("details"); if (details) details.open = true; });
  }
  await page.eval(text => {
    const button = [...document.querySelectorAll("button")].find(node => (node.textContent.trim() === text || node.querySelector("strong")?.textContent === text
      || node.querySelector(":scope > span")?.textContent === text)
      && node.getClientRects().length);

    if (!button || button.disabled) throw new Error("Missing control " + text);

    button.focus();
    button.click();
  }, text);
}

async function fill(selector, text) {
  if (selector === "#message-draft" && !await page.eval(() => !!document.getElementById("message-draft"))) await click("일반 대화");
  await until(selector => {
    const node = document.querySelector(selector);

    if (!node && selector === "#message-draft") {
      [...document.querySelectorAll('[aria-label="시작할 작업 선택"] button')].find(button => button.querySelector("strong")?.textContent === "일반 대화")?.click();
    }

    return node && (!document.querySelector('dialog:modal') || node.closest('dialog:modal'));
  }, selector);
  await page.eval(selector => {
    const node = document.querySelector(selector);

    node.focus();
    node.select();
  }, selector);
  await page.send("Input.insertText", { text });
  assert.equal(
    await page.eval(selector => document.querySelector(selector).value, selector),
    text,
    "Text must reach the intended input"
  );
}

async function closeLibrary() {
  await page.eval(() => document.querySelector('[data-drawer-close]').click());
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `(${installFolderBrowserFixture.toString()})();window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('내 AI 검증',{create:true});};`
    }
  );

  const url = `http://127.0.0.1:${server.httpServer.address().port}/__records?general`;

  await page.goto(url, { settleMs: 500 });
  await click("일반 대화");
  await until(() => document.getElementById("message-draft"));
  check(
    "composer shows three controls and no inline settings essay",
    await page.eval(() => document.querySelectorAll('[data-conversation-context] button').length === 3
      && !document.getElementById('message-draft').closest('form').querySelector('details'))
  );
  await page.screenshot({ path: resolve(output, "chat-1440.png"), format: "png" });
  await click("저장 안 함");
  await click("저장 폴더 선택");
  await until(() => document.body.innerText.includes("내 AI 검증"));
  await until(() => [...document.querySelectorAll("button")].some(button => button.textContent === "이 대화 저장" && !button.disabled));
  await click("이 대화 저장");
  await closeLibrary();
  await fill("#message-draft", "기록 검증 질문");
  await click("보내기");
  await until(() => document.querySelector('[data-conversation-context]').textContent.includes("저장됨"));
  check(
    "completed chat is saved after verified file close",
    generations === 1 && await page.eval(() => document.body.innerText.includes("저장할 합성 답변입니다."))
  );
  await page.eval(() => document.querySelector('[data-fixture-view="files"]').click());
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  if (!await page.eval(() => !!document.getElementById("message-draft"))) await click("일반 대화");
  await until(() => document.getElementById("message-draft"));
  check(
    "file navigation retains the active saved conversation and storage mode",
    generations === 1
    && await page.eval(() => document.body.innerText.includes("저장할 합성 답변입니다.")
      && document.querySelector('[data-conversation-context]').textContent.includes("저장됨"))
  );
  await fill("#message-draft", "왕복 뒤 같은 대화에 저장할 초안");

  const savedAfterNavigation = async () => {
    try {
      const { AiRecordRepository } = await import("/src/features/ai-records/storage/ai-record-repository.ts");
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
      const repository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-A", workspaceId: "fixture" }, assertCurrent() { } }));
      const records = (await repository.list()).records.filter(record => record.payload.type === "conversation");

      return records.length === 1 && records[0].payload.draft === "왕복 뒤 같은 대화에 저장할 초안";
    } catch {
      return false;
    }
  };

  await until(savedAfterNavigation);
  check(
    "post-navigation autosave updates one conversation instead of creating a duplicate",
    await page.eval(savedAfterNavigation)
  );
  await click("기록함");
  await click("새 대화");
  check(
    "new chat clears the current thread without generating",
    await page.eval(() => !document.body.innerText.includes("저장할 합성 답변입니다.")) && generations === 1
  );
  await click("기록함");
  await click("기록 검증 질문");
  check(
    "saved chat restores text without replay",
    await page.eval(() => document.body.innerText.includes("저장할 합성 답변입니다.")) && generations === 1
  );
  await click("결과물로 편집");
  await until(() => document.body.innerText.includes("초안을 자동 저장했습니다."));
  await closeLibrary();
  await until(() => document.activeElement?.textContent === "결과물로 편집");
  check(
    "closing an answer editor returns focus to the answer action",
    await page.eval(() => document.activeElement.textContent === "결과물로 편집")
  );
  await click("기록함");
  await fill("textarea[data-document]", "편집한 결과물 본문");
  await click("저장");
  await until(() => document.body.innerText.includes("로컬 폴더에 저장했습니다."));
  check(
    "artifact can be edited and versioned",
    await page.eval(() => document.querySelectorAll('[aria-label="기록 편집"] option').length >= 3)
  );
  await click("목록으로");
  await click("기억");
  await click("새 기억");
  await fill('[aria-label="기록 편집"] textarea', "짧고 구체적인 답변을 선호함");
  check("dirty memory prevents document unload", await page.eval(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    return leaving.defaultPrevented;
  }));
  await page.eval(() => document.querySelector('[data-workspace-sidebar] a[href="/files"]').click());
  await until(() => document.querySelector('[aria-label="기록 편집"] [role="alert"]'));
  check("internal navigation asks before discarding memory edits", await page.eval(() => location.pathname === "/__records" && document.querySelector('[aria-label="기록 편집"] textarea').value === "짧고 구체적인 답변을 선호함"));
  await click("계속 편집");
  check("keeping edits cancels the pending route", await page.eval(() => location.pathname === "/__records" && !document.querySelector('[aria-label="기록 편집"] [role="alert"]')));
  await page.eval(async () => {
    const { AiRecordsController } = await import('/src/features/ai-records/ai-records-controller.ts');
    const save = AiRecordsController.prototype.save;
    window.restoreRecordSave = () => { AiRecordsController.prototype.save = save; };
    AiRecordsController.prototype.save = function (payload) {
      if (payload.type !== "memory") return save.call(this, payload);
      return new Promise((_resolve, reject) => { window.rejectMemorySave = reject; });
    };
  });
  await click("저장");
  await until(() => typeof window.rejectMemorySave === "function");
  check("pending save still protects document unload", await page.eval(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    return leaving.defaultPrevented;
  }));
  await page.eval(() => { window.rejectMemorySave(new Error("synthetic save failure")); window.restoreRecordSave(); });
  await until(() => document.body.innerText.includes("저장하지 못했어요. 편집 내용은 유지합니다."));
  check("save failure retains memory edits and leave protection", await page.eval(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    return leaving.defaultPrevented && document.querySelector('[aria-label="기록 편집"] textarea').value === "짧고 구체적인 답변을 선호함";
  }));
  await click("설정");
  check(
    "settings disclose advanced policy without displaying the whole essay",
    await page.eval(() => [...document.querySelectorAll('details')].filter(node => node.getClientRects().length && !node.closest('[hidden]')).every(node => !node.open)
      && !!document.querySelector('[aria-label="대화 설정"]'))
  );
  await page.screenshot({ path: resolve(output, "settings-1440.png"), format: "png" });
  await click("기록");
  check(
    "switching tools preserves the unfinished editor",
    await page.eval(() => document.querySelector('[aria-label="기록 편집"] textarea').value === "짧고 구체적인 답변을 선호함")
  );
  await click("목록으로");
  check(
    "leaving an unsaved memory still requires an explicit discard",
    await page.eval(() => !!document.querySelector('[aria-label="기록 편집"] [role="alert"]'))
  );
  await click("계속 편집");
  await click("저장");
  await until(() => document.body.innerText.includes("로컬 폴더에 저장했습니다."));
  check("a clean saved editor releases document unload protection", await page.eval(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    return !leaving.defaultPrevented;
  }));
  check(
    "new memory remains proposed until explicit approval",
    await page.eval(() => document.querySelector('[aria-label="기록 편집"] select').value === "proposed")
  );
  await click("목록으로");
  await fill('input[aria-label="저장 기록 검색"]', "찾을 수 없는 제목");
  check(
    "record title search filters the list locally",
    await page.eval(() => document.body.innerText.includes("검색 결과가 없어요") && !document.querySelector('[aria-label="저장 기록"] li'))
    && generations === 1
  );
  await fill('input[aria-label="저장 기록 검색"]', "");
  await page.eval(() => document.querySelector('[aria-label="새 기억 관리"]').click());
  await click("삭제");
  check(
    "contextual delete presents a focused explicit confirmation",
    await page.eval(() => document.activeElement === document.querySelector('[aria-label="기록 삭제 확인"] h3')
      && document.body.innerText.includes("저장한 모든 버전이 삭제됩니다"))
  );
  await click("취소");
  await until(() => document.activeElement?.getAttribute('aria-label') === '새 기억 관리');
  check(
    "cancelling deletion restores focus and leaves the record",
    await page.eval(() => !!document.querySelector('[aria-label="새 기억 관리"]'))
  );
  await closeLibrary();
  await page.setViewport({ width: 390, height: 844 });
  await click("기록함");
  check(
    "narrow record drawer fits viewport",
    await page.eval(() => document.querySelector('dialog').getBoundingClientRect().width <= innerWidth
      && document.documentElement.scrollWidth <= innerWidth)
  );
  await page.screenshot({ path: resolve(output, "records-390.png"), format: "png" });
  await page.eval(() => document.querySelector('[aria-label="새 기억 관리"]').click());
  await click("삭제");
  await click("모든 버전 삭제");
  await until(() => document.activeElement === document.querySelector('[aria-label="저장 기록"] h3'));
  check(
    "successful delete returns focus to the surviving list heading",
    await page.eval(() => !document.querySelector('[aria-label="새 기억 관리"]'))
  );
  await click("새 기억");
  await fill('[aria-label="기록 편집"] textarea', "이탈 확인 전 보존할 기억");
  let unloadDialogs = 0;
  const stopDialogs = browser.on(page.sessionId, "Page.javascriptDialogOpening", event => {
    if (event.type === "beforeunload") unloadDialogs++;
  });
  await page.send("Page.reload");
  await pause(300);
  check("native reload prompts and cancelling preserves the dirty editor", unloadDialogs === 1 && await page.eval(() => document.querySelector('[aria-label="기록 편집"] textarea')?.value === "이탈 확인 전 보존할 기억"));
  stopDialogs();
  await page.eval(() => {
    history.replaceState(null, "", "/files?general");
    history.pushState(null, "", "/__records?general");
    history.back();
  });
  await until(() => document.querySelector('[aria-label="기록 편집"] [role="alert"]'));
  check("same-document Back opens the unsaved-edit confirmation", await page.eval(() => location.pathname === "/__records" && document.querySelector('[aria-label="기록 편집"] textarea').value === "이탈 확인 전 보존할 기억"));
  await click("계속 편집");
  await page.eval(() => history.back());
  await until(() => document.querySelector('[aria-label="기록 편집"] [role="alert"]'));
  await click("변경 버리고 나가기");
  await until(() => location.pathname === "/files" && !document.querySelector('[aria-label="기록 편집"]'));
  check("confirming Back resumes the exact history entry", await page.eval(() => location.pathname === "/files"));
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  await click("기록함");
  await click("기억");
  await click("새 기억");
  await fill('[aria-label="기록 편집"] textarea', "내부 이동에서 버릴 기억");
  await page.eval(() => document.querySelector('[data-workspace-sidebar] a[href="/files"]').click());
  await until(() => document.querySelector('[aria-label="기록 편집"] [role="alert"]'));
  await click("변경 버리고 나가기");
  await until(() => location.pathname === "/files" && !document.querySelector('[aria-label="기록 편집"]'));
  check("explicit discard resumes the intended internal route", await page.eval(() => location.pathname === "/files"));
  check("unmount removes the editor unload guard", await page.eval(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    return !leaving.defaultPrevented;
  }));
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  await click("기록함");
  await closeLibrary();
  await page.goto(url, { settleMs: 700 });
  await click("기록함");
  await until(() => document.body.innerText.includes("기록 검증 질문"));
  await click("기록 검증 질문");
  check(
    "reload restores directory records without another model request",
    generations === 1 && await page.eval(() => document.body.innerText.includes("저장할 합성 답변입니다."))
  );
  await page.eval(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts");

    await parent.getDirectoryHandle("artifact-empty", { create: true });

    const metadata = await (await parent.getDirectoryHandle("artifact-interrupted", { create: true })).getFileHandle("rev-empty.json", { create: true });
    const writer = await metadata.createWritable();

    await writer.close();
  });
  await click("기록함");
  await click("저장 위치");
  await click("권한 확인·다시 읽기");
  await click("기록으로");
  await until(() => document.body.innerText.includes("읽지 못한 기록 2개"));
  check("incomplete record folders show a warning while the healthy conversation remains visible", await page.eval(() => document.body.innerText.includes("기록 검증 질문")));
  check("list reading preserves the incomplete record files", await page.eval(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts");

    await parent.getDirectoryHandle("artifact-empty");

    return (await (await (await parent.getDirectoryHandle("artifact-interrupted")).getFileHandle("rev-empty.json")).getFile()).size === 0;
  }));
  await closeLibrary();
  await fill("#message-draft", "손상 기록 경고가 남아야 하는 자동 저장 초안");
  await until(async () => {
    const { AiRecordRepository } = await import("/src/features/ai-records/storage/ai-record-repository.ts");
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const repository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-A", workspaceId: "fixture" }, assertCurrent() { } }));
    const result = await repository.list();

    return result.unreadable.length === 2 && result.records.some(record => record.payload.type === "conversation" && record.payload.draft === "손상 기록 경고가 남아야 하는 자동 저장 초안");
  });
  await click("기록함");
  check("successful conversation autosave preserves the unresolved storage warning", await page.eval(() => document.body.innerText.includes("읽지 못한 기록 2개")));
  await page.eval(async () => {
    const { AiRecordRepository } = await import("/src/features/ai-records/storage/ai-record-repository.ts");
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const repository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-A", workspaceId: "fixture" }, assertCurrent() { } }));

    await repository.save({ type: "artifact", id: "artifact-delete-retry", title: "중단 삭제 결과물", updatedAt: new Date().toISOString(), markdown: "합성 결과물", status: "draft", sourceConversationId: "chat-delete-retry" }, null);
    await repository.remove("conversation", "chat-delete-retry", true);

    const remove = FileSystemDirectoryHandle.prototype.removeEntry;

    FileSystemDirectoryHandle.prototype.removeEntry = function (name, options) {
      if (name === "artifact-delete-retry" && window.recordDeleteFailure) throw new DOMException("synthetic delete failure", "NoModificationAllowedError");

      return remove.call(this, name, options);
    };
    window.recordDeleteFailure = true;
  });
  await click("저장 위치");
  await click("권한 확인·다시 읽기");
  await click("기록으로");
  await until(() => document.body.innerText.includes("삭제를 마치지 못했어요"));
  check("interrupted deletion keeps healthy records and displays a resumable warning", await page.eval(() => document.body.innerText.includes("기록 검증 질문") && document.body.innerText.includes("삭제를 마치지 못했어요")));
  await page.eval(() => {
    window.recordDeleteFailure = false;
  });
  await page.goto(url, { settleMs: 500 });
  await until(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts");

    try {
      await parent.getDirectoryHandle("artifact-delete-retry");

      return false;
    } catch (error) {
      return error.name === "NotFoundError";
    }
  });
  check("reload resumes persisted deletion without another model call", generations === 1);
  if (!await page.eval(() => !!document.getElementById("message-draft"))) await click("일반 대화");
  await until(() => document.getElementById("message-draft"));
  await page.eval(async () => {
    const { AiRecordRepository } = await import("/src/features/ai-records/storage/ai-record-repository.ts");
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const repository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-A", workspaceId: "fixture" }, assertCurrent() { } }));
    const updatedAt = new Date().toISOString();

    await repository.save({ type: "conversation", id: "chat-ui-delete", title: "삭제 재시도 대화", updatedAt, draft: "", projectId: null, turns: [] }, null);
    await repository.save({ type: "artifact", id: "artifact-ui-delete", title: "삭제 재시도 결과물", updatedAt, markdown: "합성 본문", status: "draft", sourceConversationId: "chat-ui-delete" }, null);

    const remove = FileSystemDirectoryHandle.prototype.removeEntry;

    FileSystemDirectoryHandle.prototype.removeEntry = function (name, options) {
      if (name === "artifact-ui-delete" && window.uiDeleteFailure) throw new DOMException("synthetic UI delete failure", "NoModificationAllowedError");

      return remove.call(this, name, options);
    };
    window.uiDeleteFailure = true;
  });
  await click("기록함");
  await click("저장 위치");
  await click("권한 확인·다시 읽기");
  await click("기록으로");
  await until(() => document.querySelector('summary[aria-label="삭제 재시도 대화 관리"]'));
  await page.eval(() => document.querySelector('summary[aria-label="삭제 재시도 대화 관리"]').click());
  await click("삭제");
  await page.eval(() => document.querySelector('[aria-label="기록 삭제 확인"] input[type="checkbox"]').click());
  await click("모든 버전 삭제");
  await until(() => document.body.innerText.includes("같은 삭제 버튼으로 이어서"));
  check("partial cascade deletion keeps the same confirmation available for retry", await page.eval(() => !!document.querySelector('[aria-label="기록 삭제 확인"]') && !![...document.querySelectorAll('[aria-label="저장 기록"] strong')].find(node => node.textContent === "기록 검증 질문")));
  await page.eval(() => {
    window.uiDeleteFailure = false;
  });
  await click("모든 버전 삭제");
  await until(() => !document.querySelector('[aria-label="기록 삭제 확인"]'));
  check("the same delete button completes the remaining artifact after its parent is absent", await page.eval(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const parent = await (await root.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts");

    try {
      await parent.getDirectoryHandle("artifact-ui-delete");

      return false;
    } catch (error) {
      return error.name === "NotFoundError" && document.body.innerText.includes("기록 검증 질문");
    }
  }));
  await page.eval(async () => {
    const { AiRecordRepository } = await import("/src/features/ai-records/storage/ai-record-repository.ts");
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    window.preservationRepository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-A", workspaceId: "fixture" }, assertCurrent() {} }));
    await window.preservationRepository.save({ type: "conversation", id: "chat-ui-preserve", title: "삭제 보존 검증", updatedAt: new Date().toISOString(), draft: "저장된 내용", projectId: null, turns: [{ id: "preserved-turn", question: "합성 질문", answer: "합성 답변", visibleLength: 5, status: "completed" }] }, null);
  });
  await click("저장 위치");
  await click("권한 확인·다시 읽기");
  await click("기록으로");
  await until(() => document.querySelector('summary[aria-label="삭제 보존 검증 관리"]'));
  await click("삭제 보존 검증");
  await fill("#message-draft", "삭제 실패에도 보존할 미저장 초안");
  await click("기록함");
  await page.eval(() => document.querySelector('summary[aria-label="삭제 보존 검증 관리"]').click());
  await click("삭제");
  await page.eval(() => {
    const getDirectory = FileSystemDirectoryHandle.prototype.getDirectoryHandle;
    window.restoreRecordAccess = () => { FileSystemDirectoryHandle.prototype.getDirectoryHandle = getDirectory; };
    FileSystemDirectoryHandle.prototype.getDirectoryHandle = function (name, options) {
      if (name === ".moa-ai-v1") return Promise.reject(new DOMException("synthetic permission failure", "NotAllowedError"));
      return getDirectory.call(this, name, options);
    };
  });
  await click("모든 버전 삭제");
  await until(() => document.body.innerText.includes("작업을 마치지 못했어요"));
  check("pre-commit permission failure preserves the live draft and transcript", await page.eval(() => window.conversationFixtureStore.getSnapshot().draft === "삭제 실패에도 보존할 미저장 초안" && window.conversationFixtureStore.getSnapshot().turns.length === 1 && window.conversationFixtureStore.getSelection().id === "chat-ui-preserve"));
  await page.eval(() => window.restoreRecordAccess());
  check("pre-commit failure also preserves the original saved record", await page.eval(async () => (await window.preservationRepository.read("conversation", "chat-ui-preserve")).payload.type === "conversation"));
  await click("모든 버전 삭제");
  await until(() => !document.querySelector('[aria-label="기록 삭제 확인"]'));
  check("committed deletion preserves current content as a temporary conversation", await page.eval(() => {
    const store = window.conversationFixtureStore;
    return store.getSnapshot().draft === "삭제 실패에도 보존할 미저장 초안" && store.getSnapshot().turns.length === 1 && store.getSelection().id === null && store.getSelection().temporary;
  }));
  await click("기록 검증 질문");
  await until(() => document.body.innerText.includes("저장하지 않은 대화 내용이 있어요"));
  await click("미저장 내용 버리고 전환");
  await click("기록함");
  await closeLibrary();
  await page.eval(async () => {
    const { AiRecordRepository } = await import("/src/features/ai-records/storage/ai-record-repository.ts");
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const repository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-A", workspaceId: "fixture" }, assertCurrent() { } }));

    for (const count of [100, 500]) {
      const answer = "긴 대화의 읽기와 입력을 확인하는 합성 문장입니다. ".repeat(6);

      await repository.save(
        {
          id: `chat-long-${count}`,
          type: "conversation",
          title: `긴 대화 ${count}`,
          updatedAt: new Date().toISOString(),
          draft: "",
          projectId: null,
          turns: Array.from(
            { length: count },
            (_, index) => ({
              id: `turn-${index}`,
              question: `합성 질문 ${index}`,
              answer,
              visibleLength: answer.length,
              status: "completed"
            })
          )
        },
        null
      );
    }
  });
  await click("기록함");
  await click("저장 위치");
  await click("권한 확인·다시 읽기");
  await click("기록으로");
  await until(() => document.body.innerText.includes("긴 대화 500"));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.send("Performance.enable");

  const heapBefore = (await page.send("Performance.getMetrics")).metrics.find(metric => metric.name === "JSHeapUsedSize")?.value;
  const longSamples = [];

  for (let run = 0; run < 3; run++) for (const count of [100, 500]) {
    if (run || count === 500) await click("기록함");

    const elapsedMs = await page.eval(async title => {
      const start = performance.now();

      [...document.querySelectorAll('[aria-label="저장 기록"] button')].find(button => button.querySelector('strong')?.textContent === title).click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      return performance.now() - start;
    }, `긴 대화 ${count}`);

    await until(
      count => document.querySelectorAll('[aria-label="대화 내용"] article').length === count * 2,
      count
    );

    const heapBytes = (await page.send("Performance.getMetrics")).metrics.find(metric => metric.name === "JSHeapUsedSize")?.value;

    longSamples.push({ run, turns: count, elapsedMs: Math.round(elapsedMs * 10) / 10, heapBytes });
  }

  check(
    "100 and 500 saved turns restore without truncation or another model call",
    generations === 1 && longSamples.length === 6
  );
  check(
    "repeated transcript opens retain exactly the current DOM and expose six heap samples",
    Number.isFinite(heapBefore) && longSamples.every(sample => Number.isFinite(sample.heapBytes))
    && await page.eval(() => document.querySelectorAll('[aria-label="대화 내용"] article').length === 1000)
  );
  await page.setViewport({ width: 390, height: 844 });
  await fill("#message-draft", "긴 대화에서도 보존할 초안");
  await page.eval(() => {
    const input = document.getElementById("message-draft");

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  await page.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      modifiers: 8,
      text: "\r"
    }
  );
  await page.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 }
  );
  check(
    "500-turn narrow chat keeps keyboard newline and fits the viewport",
    await page.eval(() => document.getElementById("message-draft").value.includes("\n") && document.documentElement.scrollWidth <= innerWidth)
    && generations === 1
  );
  writeFileSync(
    resolve(output, "long-conversation.json"),
    JSON.stringify(
      {
        heapBefore,
        samples: longSamples,
        condition: "Isolated Chromium 1440px, actual product repository and OPFS, 100/500 synthetic saved turns, three alternating opens measured through two animation frames; followed by 390px keyboard newline. Heap is CDP JSHeapUsedSize with uncontrolled GC, not browser RSS or a leak proof. DOM equals the current turn count rather than accumulating previous opens. Timing measures already-loaded transcript rendering, not disk startup, field INP, live model speed or a stable percentile."
      },
      null,
      2
    )
  );
  await click("기록함");
  await click("저장 위치");
  await click("저장 없이 새 대화");
  await fill("#message-draft", "지속 저장하지 않을 임시 내용");
  await pause(2200);
  await click("기록함");
  check(
    "temporary draft is absent from saved conversation list",
    !await page.eval(() => [...document.querySelectorAll('[aria-label="저장 기록"] button')].some(button => button.textContent.includes("지속 저장하지 않을 임시 내용")))
  );
  await page.screenshot({ path: resolve(output, "records-1440.png"), format: "png" });
  await click("저장 위치");
  await click("기록으로");
  await until(() => document.activeElement?.textContent === "저장 위치");
  check(
    "returning from storage focuses its visible entry control",
    await page.eval(() => document.activeElement.textContent === "저장 위치")
  );
  await click("저장 위치");
  await page.eval(async () => {
    const { FolderConnectionSession } = await import('/src/features/local-folders/connection-session.ts');
    const original = FolderConnectionSession.prototype.disconnect;

    FolderConnectionSession.prototype.disconnect = async function (kind) {
      FolderConnectionSession.prototype.disconnect = original;

      throw new Error('fixture-disconnect-failure');
    };
  });
  await click("연결 해제");
  await until(() => document.querySelector('[aria-label="기록 저장 위치"]').textContent.includes("저장을 마치지 못했어요"));
  check(
    "failed disconnect retains the temporary draft and stops storage",
    await page.eval(() => document.getElementById('message-draft').value === "지속 저장하지 않을 임시 내용"
      && document.querySelector('[data-conversation-context]').textContent.includes('저장 안 함'))
  );
  await click("저장 폴더 선택");
  await until(() => [...document.querySelectorAll('button')].some(button => button.textContent === '연결 해제' && !button.disabled));
  await click("연결 해제");
  await until(() => document.querySelector('[aria-label="기록 저장 위치"] h3').textContent === '대화를 보관할 폴더'
    && [...document.querySelectorAll('button')].some(button => button.textContent === '저장 폴더 선택' && !button.disabled));
  check(
    "successful disconnect keeps the current conversation temporary",
    await page.eval(() => document.getElementById('message-draft').value === "지속 저장하지 않을 임시 내용"
      && !document.querySelector('[aria-label="기록 저장 위치"] h3').textContent.includes('내 AI 검증'))
  );
  await closeLibrary();
  await page.eval(async () => {
    await listingProbe.prepare();
    window.showDirectoryPicker = async () => listingProbe.name === "검증 자료 A" ? listingProbe.a : listingProbe.b;
    document.querySelector('[data-fixture-view="settings"]').click();
  });
  await until(() => document.querySelector('[aria-label="설정 분류"]'));
  await page.eval(() => [...document.querySelectorAll('[aria-label="설정 분류"] a')].find(link => link.textContent.trim() === "폴더 연결").click());
  await until(() => document.querySelector('[aria-label="자료 폴더 연결 설정"]')?.checkVisibility());
  await click("폴더 연결");
  await until(() => document.body.innerText.includes("검증 자료 A"));
  await page.eval(() => {
    listingProbe.name = "검증 자료 B";
  });
  await click("다른 폴더 선택");
  await until(() => document.querySelector('[aria-label="연결된 자료 폴더 목록"]'));
  check(
    "multiple source references remain independently listed",
    await page.eval(() => {
      const text = document.querySelector('[aria-label="연결된 자료 폴더 목록"]').textContent;

      return text.includes("검증 자료 A") && text.includes("검증 자료 B (사용 중)");
    })
  );
  await page.eval(() => [...document.querySelectorAll('[aria-label="연결된 자료 폴더 목록"] > div')].find(row => row.textContent.includes("검증 자료 A")).querySelector("button").click());
  await until(() => document.querySelector('[aria-label="연결된 자료 폴더 목록"]').textContent.includes("검증 자료 A (사용 중)"));
  check(
    "source root switches without modifying originals",
    await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before))
  );
  await page.eval(() => document.querySelector('[data-fixture-owner]').click());
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  await click("일반 대화");
  await until(() => document.getElementById("message-draft"));
  await click("기록함");
  check(
    "another account sees neither saved records nor another owner's AI folder",
    !await page.eval(() => document.body.innerText.includes("기록 검증 질문") || document.body.innerText.includes("내 AI 검증"))
  );
  await page.eval(async () => {
    const { AiRecordRepository } = await import("/src/features/ai-records/storage/ai-record-repository.ts");
    const { encodeRecord } = await import("/src/features/ai-records/storage/record-codec.ts");
    const { digest } = await import("/src/features/ai-records/storage/record-store.ts");
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("기록 한도 검증", { create: true });
    const repository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-B", workspaceId: "fixture" }, assertCurrent() { } }));
    const turns = Array.from({ length: 500 }, (_, index) => ({ id: `limit-turn-${index}`, question: "경계 질문", answer: "경계 답변", visibleLength: 5, status: "completed" }));

    await repository.initialize();
    await repository.save({ type: "conversation", id: "chat-boundary", title: "경계 대화", updatedAt: new Date().toISOString(), draft: "", projectId: null, turns }, null);
    window.showDirectoryPicker = async () => directory;
    window.recordLimitsFixture = {
      repository,
      turns,
      seed: async id => {
        const payload = { type: "artifact", id, title: id, updatedAt: "2026-11-13T00:00:00.000Z", markdown: "합성 경계 본문", status: "draft", sourceConversationId: null };
        const body = encodeRecord(payload);
        const parent = await (await directory.getDirectoryHandle(".moa-ai-v1")).getDirectoryHandle("artifacts", { create: true });
        const target = await parent.getDirectoryHandle(id, { create: true });
        const metadata = { schemaVersion: 1, recordId: id, revisionId: "rev-fixture", parentRevisionId: null, kind: "artifact", scope: { type: "global" }, state: "draft", createdAt: payload.updatedAt, contentFile: "rev-fixture.md", contentSha256: await digest(body) };

        for (const [name, text] of [["rev-fixture.md", body], ["rev-fixture.json", JSON.stringify(metadata)]]) {
          const writer = await (await target.getFileHandle(name, { create: true })).createWritable();

          await writer.write(text);
          await writer.close();
        }
      },
      restoreLegacy: () => {
        const store = window.conversationFixtureStore;

        store.dispatch({ type: "restore", state: { draft: "버리기 동의 전 보존할 질문", turns: [...turns, { ...turns[0], id: "legacy-overflow" }], active: null, sequence: -1 } });
        store.select({ id: "chat-boundary", temporary: false, projectId: "", lastSaved: "previous-checkpoint", status: "미저장" });
      }
    };
  });
  const collision = await page.eval(async () => {
    const { repository, seed } = window.recordLimitsFixture;
    let rejected = false;
    try {
      await repository.save({ type: "artifact", id: "chat-boundary", title: "같은 ID의 별도 기록", updatedAt: new Date().toISOString(), markdown: "합성 본문", status: "draft", sourceConversationId: null }, null);
    } catch (error) { rejected = error.message === "record-id-collision"; }
    await seed("chat-boundary");
    const result = await repository.list();
    let refusedDelete = false;
    try { await repository.resumeDelete({ type: "conversation", id: "chat-boundary" }); }
    catch (error) { refusedDelete = error.message === "record-id-collision"; }
    const directory = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("기록 한도 검증")).getDirectoryHandle(".moa-ai-v1");
    await (await directory.getDirectoryHandle("conversations")).getDirectoryHandle("chat-boundary");
    const artifacts = await directory.getDirectoryHandle("artifacts");
    await artifacts.getDirectoryHandle("chat-boundary");
    await artifacts.removeEntry("chat-boundary", { recursive: true });
    return rejected && refusedDelete && result.conflicts.length === 2 && result.pendingDeletes.length === 0;
  });
  check("actual OPFS rejects cross-kind ID creation and preserves preexisting duplicate kinds from deletion", collision);
  await click("저장 위치");
  await until(() => [...document.querySelectorAll('[aria-label="저장 기록"] strong')].some(node => node.textContent === "경계 대화"));
  await click("경계 대화");
  await fill("#message-draft", "500턴 뒤에도 보존할 질문");
  check("500-turn boundary blocks send while keeping the new draft and the new-conversation route", await page.eval(() => {
    const store = window.conversationFixtureStore;

    store.dispatch({ type: "local", id: "must-not-append", kind: "find", question: "새 작업", answer: "차단", status: "completed" });

    return store.getSnapshot().turns.length === 500 && store.getSnapshot().draft === "500턴 뒤에도 보존할 질문"
      && document.querySelector('#message-draft').closest('form').querySelector('button[type="submit"]').disabled
      && document.body.innerText.includes("500턴 한도");
  }));
  await click("기록함");
  await click("새 대화");
  await until(() => window.conversationFixtureStore.getSnapshot().turns.length === 0);
  check("a valid 500-turn conversation can be saved before a new stored conversation opens", await page.eval(() => window.conversationFixtureStore.getSnapshot().turns.length === 0 && !window.conversationFixtureStore.getSelection().temporary));

  for (const temporary of [false, true]) {
    await page.eval(() => window.recordLimitsFixture.restoreLegacy());
    await click("기록함");

    if (temporary) {
      await click("저장 위치");
      await click("저장 없이 새 대화");
    } else await click("새 대화");

    await until(() => document.body.innerText.includes("저장하지 않은 대화 내용이 있어요"));
    if (!temporary) await page.screenshot({ path: resolve(output, "unsaved-conversation-confirmation.png"), format: "png" });
    await click("계속 편집");
    check(`legacy overflow stays intact when ${temporary ? "temporary" : "stored"} switch is cancelled`, await page.eval(() => window.conversationFixtureStore.getSnapshot().turns.length === 501 && window.conversationFixtureStore.getSnapshot().draft === "버리기 동의 전 보존할 질문" && window.conversationFixtureStore.getSelection().id === "chat-boundary"));
    await click("기록함");

    if (temporary) {
      await click("저장 위치");
      await click("저장 없이 새 대화");
    } else await click("새 대화");

    await until(() => document.body.innerText.includes("저장하지 않은 대화 내용이 있어요"));
    await click("미저장 내용 버리고 전환");
    await until(() => window.conversationFixtureStore.getSnapshot().turns.length === 0);
    check(`explicit discard opens a new ${temporary ? "temporary" : "stored"} conversation and preserves the old saved checkpoint`, await page.eval(async expected => window.conversationFixtureStore.getSnapshot().turns.length === 0 && window.conversationFixtureStore.getSelection().temporary === expected && (await window.recordLimitsFixture.repository.read("conversation", "chat-boundary")).payload.turns.length === 500, temporary));
  }

  const capacity = await page.eval(async () => {
    const { repository, seed } = window.recordLimitsFixture;

    for (let batch = 0; batch < 498; batch += 20) await Promise.all(Array.from({ length: Math.min(20, 498 - batch) }, (_, offset) => seed(`artifact-cap-${batch + offset}`)));

    const payload = id => ({ type: "artifact", id, title: id, updatedAt: new Date().toISOString(), markdown: "합성 본문", status: "draft", sourceConversationId: null });
    const results = await Promise.allSettled([repository.save(payload("artifact-concurrent-a"), null), repository.save(payload("artifact-concurrent-b"), null)]);

    return { successful: results.filter(result => result.status === "fulfilled").length, rejected: results.filter(result => result.status === "rejected").map(result => result.reason.message), count: (await repository.list()).records.length };
  });
  check("real OPFS and Web Locks reserve only one remaining record slot", capacity.successful === 1 && capacity.rejected[0] === "record-count-limit" && capacity.count === 500);
  await page.eval(async () => {
    await window.recordLimitsFixture.seed("artifact-legacy-a");
    await window.recordLimitsFixture.seed("artifact-legacy-b");
  });
  await click("기록함");
  await click("저장 위치");
  await click("권한 확인·다시 읽기");
  await click("기록으로");
  await until(() => document.body.innerText.includes("최대 501개만 표시"));
  check("an already over-limit folder shows a bounded recovery listing instead of an empty library", await page.eval(async () => (await window.recordLimitsFixture.repository.list()).records.length === 501 && document.body.innerText.includes("경계 질문")));
  await click("결과물");

  for (let index = 0; index < 3; index++) {
    const title = await page.eval(async () => (await window.recordLimitsFixture.repository.list()).records.find(record => record.payload.type === "artifact").payload.title);

    await page.eval(title => document.querySelector(`summary[aria-label="${CSS.escape(title)} 관리"]`).click(), title);
    await click("삭제");
    await click("모든 버전 삭제");
    await until(() => !document.querySelector('[aria-label="기록 삭제 확인"]'));
  }

  check("explicit UI cleanup frees capacity without erasing unrelated saved content", await page.eval(async () => {
    const { repository } = window.recordLimitsFixture;

    await repository.save({ type: "artifact", id: "artifact-after-cleanup", title: "정리 뒤 신규 기록", updatedAt: new Date().toISOString(), markdown: "새 기록", status: "draft", sourceConversationId: null }, null);

    return (await repository.list()).records.length === 500 && (await repository.read("conversation", "chat-boundary")).payload.turns.length === 500;
  }));
  check("limit recovery starts no additional model requests", generations === 1);
  check("record UI has no browser exceptions", page.consoleErrors.length === 0);
  writeFileSync(
    resolve(output, "records-checks.json"),
    JSON.stringify(
      {
        checks,
        generations,
        condition: "Actual product components/services with isolated OPFS and fixture SSE; no personal folders or paid model calls."
      },
      null,
      2
    )
  );
  console.log(`${checks.length} AI record browser checks passed.`);
} catch (error) {
  writeFileSync(
    resolve(output, "records-failure.json"),
    JSON.stringify(
      {
        checks,
        error: String(error),
        consoleErrors: page?.consoleErrors,
        active: page ? await page.eval(() => document.activeElement?.outerHTML.slice(0, 800)) : "",
        text: page ? await page.eval(() => document.body.innerText) : ""
      },
      null,
      2
    )
  );

  throw error;
} finally {
  await browser.close();
  await server.close();
}

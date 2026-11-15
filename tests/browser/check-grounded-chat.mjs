import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? "docs/verification/follow-through/browser");

mkdirSync(output, { recursive: true });

const server = await createServer({
  configFile: false,
  root: resolve("apps/web"),
  cacheDir: resolve(".omx/browser-cache/grounded"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: {
    alias: {
      "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "next/navigation": resolve("apps/web/tests/browser-fixtures/grounded-navigation.tsx"),
      "@personal-ai/domain": resolve("packages/domain/src/index.ts")
    }
  },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: {
    include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"]
  },
  plugins: [{
    name: "grounded-fixture",
    configureServer(server) {
      server.middlewares.use("/__grounded", (_request, response) => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/grounded-chat.tsx"></script></html>');
      });
    }
  }]
});

await server.listen();

const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
const checks = [];
let page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(predicate) {
  for (let i = 0; i < 800; i++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;

    await pause(30);
  }

  throw new Error("Timed out: " + predicate);
}

const check = (name, pass) => {
  checks.push({ name, pass: !!pass });
  assert.ok(pass, name);
};

async function click(selector) {
  await page.eval(selector => {
    const node = document.querySelector(selector);

    if (!node || node.disabled) throw new Error("Missing active " + selector);

    node.click();
  }, selector);
}

async function fill(text) {
  await page.eval(() => {
    const input = document.querySelector('#message-draft');

    input.focus();
    input.select();
  });
  await page.send("Input.insertText", { text: "이 자료를 요약해 주세요. " + text });
  if (await page.eval(() => !!document.querySelector('[data-grounded-reread]'))) {
    await click('[data-grounded-reread]');
    await until(() => document.querySelector('[aria-label="선택 자료 전송 확인"]'));
  }
}

async function prepare() {
  if (await page.eval(() => !!document.querySelector('[data-tour="task-grounded"]'))) {
    await click('[data-tour="task-grounded"]');
  }
  await click("[data-grounded-prepare]");
  await until(() => document.querySelector('[data-grounded-prepare][data-ready="ready"]')
    && document.querySelector('#message-draft') && !document.querySelector('#message-draft').readOnly);
}

async function consentAndSend() {
  await click('[aria-label="선택 자료 전송 확인"] input[type="checkbox"]');
  await click('[data-action="organization-send"]');
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__grounded`, { settleMs: 500 });
  await until(() => document.querySelector("[data-grounded-connect]"));
  await page.eval(async () => {
    await listingProbe.prepare();

    const stream = await (await listingProbe.a.getFileHandle("evidence.md", { create: true })).createWritable();

    await stream.write("근거 자료의 확인 가능한 문장입니다. 합성 검증 본문입니다.");
    await stream.close();
  });
  await click("[data-grounded-connect]");
  await until(() => document.body.innerText.includes("검증 자료 A"));
  if (process.argv.includes("--long-multi")) {
    await click('[data-tour="task-grounded"]');
    await page.eval(async () => {
      window.listingProbe.preparing = true;
      const prefix = "사전 논의에서 확정하지 않은 내용입니다. ".repeat(3000);
      const sources = [
        ["evidence.md", prefix + "\n납품일: 2026-12-03. 첫 문서는 이 날짜를 제안했다."],
        ["addendum.md", "납품일: 2026-12-10. 두 번째 문서는 다른 날짜를 제안했다. 두 문서는 합의된 최종 날짜를 정하지 않았다."],
      ];
      const { createSyntheticPdf } = await import("/tests/browser-fixtures/cache-equivalence.ts");
      sources.push(["report.pdf", createSyntheticPdf(24, 0)]);
      for (const [name, text] of sources) {
        const stream = await (await window.listingProbe.a.getFileHandle(name, { create: true })).createWritable();
        await stream.write(text); await stream.close();
      }
      window.listingProbe.preparing = false;
      window.listingProbe.productWrites = 0;
      window.groundedProbe.paths = ["evidence.md", "addendum.md", "report.pdf"];
      window.groundedProbe.citationMode = "all";
      window.groundedProbe.answer = "두 문서의 납품일이 서로 다릅니다. 제공된 발췌만으로 최종 날짜를 확정할 수 없습니다.";
    });
    await fill("납품일 page23 근거를 비교해 주세요.");
    await prepare();
    const prepared = await page.eval(() => window.groundedProbe.prepared);
    check("long Markdown is read fully while the current question selects a bounded excerpt", prepared.documents.some(document => document.name === "evidence.md" && document.size > 100000 && document.excerpt.includes("2026-12-03") && document.excerpt.length <= 1200 && document.sha256 !== document.excerptHash));
    check("multiple selected files preserve separate paths and source hashes", prepared.documents.length === 3 && new Set(prepared.documents.map(document => document.path.join("/"))).size === 3 && prepared.documents.every(document => /^[a-f0-9]{64}$/u.test(document.sha256)));
    check("real PDF extraction covers 24 pages before the question excerpt is selected", prepared.documents.some(document => document.name === "report.pdf" && document.pdf?.pages === 24 && document.pdf?.complete && document.excerpt.includes("page23")));
    check("conflicting dates remain present as separate source excerpts", prepared.documents.some(document => document.excerpt.includes("2026-12-03")) && prepared.documents.some(document => document.excerpt.includes("2026-12-10")));
    check("a complete file read does not claim the whole text will be sent", await page.eval(() => document.querySelector('[data-grounded-preparation]').textContent.includes("전체 원문")));
    check("multi-source question requires explicit consent and no action ran during preparation", await page.eval(() => !document.querySelector('[aria-label="선택 자료 전송 확인"] input').checked && document.querySelector('[data-action="organization-send"]').disabled && groundedProbe.calls.length === 0));
    await consentAndSend();
    await until(() => document.querySelector('[aria-label="자료 근거 답변"] q'));
    const first = await page.eval(() => window.groundedProbe.calls[0]);
    check("the action receives three bounded excerpts, not full long documents", first.documents.length === 3 && first.documents.every(document => document.excerpt.length <= 1200) && first.documents.reduce((sum, document) => sum + document.excerpt.length, 0) <= 6000);
    check("each citation quote belongs to its own selected document", await page.eval(() => [...document.querySelectorAll('[aria-label="자료 근거 답변"] q')].length === 3 && [...document.querySelectorAll('[aria-label="자료 근거 답변"] q')].every(node => groundedProbe.calls[0].documents.some(document => document.excerpt.includes(node.textContent)))));
    check("a synthetic conflict answer can preserve uncertainty without selecting a winner", await page.eval(() => document.body.textContent.includes("최종 날짜를 확정할 수 없습니다")));

    await page.eval(() => { groundedProbe.citationMode = "none"; groundedProbe.answer = "제공된 자료에서 이 질문의 근거를 찾을 수 없습니다."; });
    await fill("위성의 공전 주기를 알려 주세요.");
    check("changing to an unsupported question removes the old transmission consent", await page.eval(() => groundedProbe.calls.length === 1 && !document.querySelector('[aria-label="선택 자료 전송 확인"] input').checked));
    await consentAndSend();
    await until(() => document.body.textContent.includes("제공된 자료에서 이 질문의 근거를 찾을 수 없습니다."));
    check("a synthetic no-evidence response creates no invented source citation", await page.eval(() => groundedProbe.calls.length === 2 && document.querySelectorAll('[aria-label="자료 근거 답변"]').length === 1 && document.querySelectorAll('[aria-label="자료 근거 답변"] q').length === 0));

    await fill("납품일 변경 여부를 확인해 주세요.");
    await page.eval(async () => {
      listingProbe.preparing = true;
      const stream = await (await listingProbe.a.getFileHandle("evidence.md")).createWritable();
      await stream.write("납품일: 2027-01-05. 검토 뒤 외부에서 바뀐 합성 원본이다."); await stream.close();
      listingProbe.preparing = false;
    });
    await consentAndSend();
    await until(() => document.body.textContent.includes("자료·권한이 바뀌었거나 답변을 확인하지 못했어요."));
    check("a changed long source is stopped before another action receives old excerpts", await page.eval(() => groundedProbe.calls.length === 2));
    check("long and multi-source flow never writes source files through product code", await page.eval(() => listingProbe.productWrites === 0));
    writeFileSync(resolve(output, "long-multi-evidence.json"), JSON.stringify({ prepared, firstAction: first, checks, condition: "Actual UI, current-source Worker/hash, 24-page PDF extraction and OPFS. Synthetic answer provider; no real new AI calls or semantic answer-quality claim." }, null, 2));
    console.log(`${checks.length} long/multi-source browser checks passed.`);
  } else {
  await click('[data-tour="task-grounded"]');
  await until(() => document.querySelector('#message-draft'));
  await page.eval(() => { const input = document.querySelector('#message-draft'); input.focus(); });
  await page.send("Input.insertText", { text: "내가 여태까지 쓴 이력서 어떤거 있는지 말해볼래?" });
  check("unprepared questions explain how to select sources instead of silently blocking", await page.eval(() => !!document.querySelector('[data-grounded-select]') && !!document.querySelector('[data-grounded-find]') && document.querySelector('[data-action="organization-send"]').disabled));
  await click('[data-grounded-find]');
  check("switching to file finding keeps the original question", await page.eval(() => document.querySelector('[aria-label="대화 작업"]').value === "find" && document.getElementById('message-draft').value === "내가 여태까지 쓴 이력서 어떤거 있는지 말해볼래?" && groundedProbe.calls.length === 0));
  await page.eval(() => { const mode = document.querySelector('[aria-label="대화 작업"]'); mode.value = "grounded"; mode.dispatchEvent(new Event("change", { bubbles: true })); });
  await click('[data-grounded-select]');
  await until(() => document.querySelector('[aria-label="evidence.md 미리보기"]'));
  await page.eval(() => document.querySelector('[aria-label="evidence.md 미리보기"]').dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
  await click('[data-grounded-return]');
  await until(() => document.querySelector('[data-grounded-read]'));
  await click('[data-grounded-read]');
  await until(() => document.querySelector('[aria-label="선택 자료 전송 확인"]') && document.querySelector('[data-grounded-prepare]').dataset.ready === "ready");
  check("actual file selection prepares question sources without organization or model calls", await page.eval(() => document.querySelector('[aria-label="대화 작업"]').value === "grounded" && document.getElementById('message-draft').value === "내가 여태까지 쓴 이력서 어떤거 있는지 말해볼래?" && groundedProbe.calls.length === 0));
  await page.screenshot({ path: resolve(output, "question-source-ready-1440.png"), format: "png" });
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 844 });
    await page.eval(() => { document.querySelector('[data-grounded-preparation] details').open = true; });
    check(`${width}: source excerpts scroll without hiding the input or send button`, await page.eval(() => {
      const input = document.querySelector('#message-draft').getBoundingClientRect();
      const button = document.querySelector('[data-action="organization-send"]').getBoundingClientRect();
      return input.top >= 0 && input.bottom <= innerHeight && button.top >= 0 && button.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
    }));
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.eval(() => document.querySelector('#message-draft').focus());
  await page.send("Input.insertText", { text: " 다른 질문" });
  check("a changed question requires fresh excerpts instead of reusing an old consent", await page.eval(() => !!document.querySelector('[data-grounded-reread]') && !document.querySelector('[aria-label="선택 자료 전송 확인"]') && document.querySelector('[data-action="organization-send"]').disabled && groundedProbe.calls.length === 0));
  await click('[data-grounded-reread]');
  await until(() => document.querySelector('[aria-label="선택 자료 전송 확인"]'));
  await click('[data-grounded-prepare-partial]');
  await until(() => document.querySelector('[aria-label="일부 자료만 사용"]'));
  await page.eval(() => document.querySelector('#message-draft').focus());
  await page.send("Input.insertText", { text: " 부분 자료의 새 질문" });
  await click('[data-grounded-reread]');
  await until(() => document.querySelector('[aria-label="일부 자료만 사용"]'));
  check("changing the question retains unresolved paths and still requires partial acceptance", await page.eval(() => !document.querySelector('[aria-label="일부 자료만 사용"]').checked && document.querySelector('[data-action="organization-send"]').disabled));
  await click('[aria-label="선택 자료 전송 확인"] input');
  check("incomplete source preparation cannot send without accepting the partial scope", await page.eval(() => document.querySelector('[data-action="organization-send"]').disabled && groundedProbe.calls.length === 0));
  await click('[aria-label="일부 자료만 사용"]');
  check("accepting the visible partial scope unlocks the consented question", await page.eval(() => !document.querySelector('[data-action="organization-send"]').disabled));
  await prepare();
  await fill("자료를 요약해 주세요");
  check(
    "consent is required before transmission",
    await page.eval(() => document.querySelector('[data-action="organization-send"]').disabled && groundedProbe.calls.length === 0)
  );
  await click('[aria-label="선택 자료 전송 확인"] input');
  await fill("다른 질문입니다");
  check(
    "changing the question invalidates previous consent",
    await page.eval(() => !document.querySelector('[aria-label="선택 자료 전송 확인"] input').checked)
  );
  await consentAndSend();
  await until(() => document.querySelector('[aria-label="자료 근거 답변"]'));
  await until(() => {
    const answer = document.querySelector('[aria-label="자료 근거 답변"]')?.getBoundingClientRect();
    const thread = document.querySelector('[aria-label="대화 내용"]').getBoundingClientRect();
    return answer && answer.top < thread.bottom && answer.bottom > thread.top;
  });
  check("the finished answer remains visible above the composer", true);
  check(
    "verified answer includes an exact source quotation",
    await page.eval(() => document.querySelector('[aria-label="자료 근거 답변"] q').textContent === groundedProbe.calls[0].documents[0].excerpt.slice(0, 20))
  );
  await page.eval(() => document.querySelector('[aria-label="자료 근거 답변"] li button').click());
  await until(() => document.querySelector('[aria-label="문서 본문"]')?.textContent.includes("합성 검증 본문"));
  check(
    "citation opens the shared full document preview",
    await page.eval(() => groundedProbe.navigations.at(-1) === "/files")
  );
  await click("[data-grounded-return]");
  await until(() => document.querySelector('#message-draft'));
  check(
    "citation and save controls survive the file preview round trip",
    await page.eval(() => !!document.querySelector('[aria-label="자료 근거 답변"] q')
      && [...document.querySelectorAll('button')].some(button => button.textContent === "답변·근거를 결과물로 저장"))
  );

  const beforeLateNavigation = await page.eval(() => groundedProbe.navigations.length);

  await page.eval(() => {
    const original = FileSystemFileHandle.prototype.getFile;

    groundedProbe.releaseCitation = null;
    FileSystemFileHandle.prototype.getFile = function () {
      if (this.name !== "evidence.md") return original.call(this);

      return new Promise(resolve => {
        groundedProbe.releaseCitation = () => {
          FileSystemFileHandle.prototype.getFile = original;
          resolve(original.call(this));
        };
      });
    };
    document.querySelector('[aria-label="자료 근거 답변"] li button').click();
  });
  await until(() => groundedProbe.releaseCitation);
  await page.eval(() => [...document.querySelectorAll('[data-conversation-context] button')].find(button => button.textContent === "저장 안 함").click());
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === "저장 없이 새 대화").click());
  await until(() => [...document.querySelectorAll('button')].some(button => button.textContent === "미저장 내용 버리고 전환"));
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === "미저장 내용 버리고 전환").click());
  await until(() => !document.querySelector('[aria-label="자료 근거 답변"]'));
  await page.eval(() => groundedProbe.releaseCitation());
  await pause(200);
  check(
    "a new conversation cancels a pending citation navigation",
    await page.eval(() => groundedProbe.navigations.length) === beforeLateNavigation
  );
  await prepare();
  await fill("원본 변경 검사");
  await page.eval(() => {
    groundedProbe.mode = "hold";
    groundedProbe.finish = null;
  });
  await consentAndSend();
  await until(() => groundedProbe.finish);
  await page.eval(async () => {
    const stream = await (await listingProbe.a.getFileHandle("evidence.md")).createWritable();

    await stream.write("외부에서 바뀐 합성 자료입니다. 새 버전을 확인해야 합니다.");
    await stream.close();
    groundedProbe.finish();
  });
  await until(() => document.body.innerText.includes("늦은 답변은 표시하지 않습니다"));
  check(
    "source changes during generation suppress the answer",
    !await page.eval(() => !!document.querySelector('[aria-label="자료 근거 답변"]'))
  );
  await prepare();
  await fill("중지 검사");
  await page.eval(() => {
    groundedProbe.mode = "hold";
    groundedProbe.finish = null;
  });
  await consentAndSend();
  await until(() => groundedProbe.finish);
  await page.eval(() => [...document.querySelectorAll('form button')].find(button => button.textContent === "작업 대기 중지").click());
  await page.eval(() => {
    groundedProbe.previousFinish = groundedProbe.finish;
    groundedProbe.finish = null;
  });
  check(
    "cancelled action cannot publish a late answer",
    !await page.eval(() => !!document.querySelector('[aria-label="자료 근거 답변"]'))
  );
  await fill("취소 뒤 즉시 새 질문");
  await consentAndSend();
  await until(() => groundedProbe.finish);
  check(
    "cancelling an action immediately permits a new request",
    await page.eval(() => groundedProbe.calls.at(-1).question.includes("취소 뒤 즉시 새 질문"))
  );
  await page.eval(() => groundedProbe.previousFinish());
  await pause(100);
  check(
    "an old action cannot unlock or complete the new request",
    await page.eval(() => document.getElementById('message-draft').readOnly && !document.querySelector('[aria-label="자료 근거 답변"]'))
  );
  await page.eval(() => groundedProbe.finish());
  await until(() => document.querySelector('[aria-label="자료 근거 답변"]'));
  await prepare();
  await fill("권한 검사");
  await page.eval(() => {
    groundedProbe.mode = "hold";
    groundedProbe.finish = null;
  });
  await consentAndSend();
  await until(() => groundedProbe.finish);
  await page.eval(() => {
    listingProbe.permission = "denied";
    groundedProbe.finish();
  });
  await until(() => document.body.innerText.includes("늦은 답변은 표시하지 않습니다"));
  check(
    "revoked source permission blocks publication",
    !await page.eval(() => !!document.querySelector('[aria-label="자료 근거 답변"]'))
  );
  await page.eval(() => {
    listingProbe.permission = "granted";
  });
  await click("[data-grounded-connect]");
  await until(() => !document.querySelector('[data-grounded-connect]').disabled);
  await prepare();
  await fill("잘못된 인용 검사");
  await page.eval(() => {
    groundedProbe.mode = "forged";
  });
  await consentAndSend();
  await until(() => document.body.innerText.includes("늦은 답변은 표시하지 않습니다"));
  check(
    "invalid action citations fail safely at the client boundary",
    page.consoleErrors.length === 0 && !await page.eval(() => !!document.querySelector('[aria-label="자료 근거 답변"]'))
  );
  await page.setViewport({ width: 390, height: 844 });
  check(
    "narrow material question does not overflow",
    await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
  );
  await page.screenshot({ path: resolve(output, "grounded-390.png"), format: "png" });
  await prepare();
  await fill("전송 전 원본 변경 검사");

  const beforeChanged = await page.eval(() => groundedProbe.calls.length);

  await page.eval(async () => {
    const stream = await (await listingProbe.a.getFileHandle("evidence.md")).createWritable();

    await stream.write("전송 전에 변경된 합성 자료입니다. 최신 본문으로 다시 준비해야 합니다.");
    await stream.close();
  });
  await consentAndSend();
  await until(() => document.body.innerText.includes("늦은 답변은 표시하지 않습니다"));
  check(
    "changed source before sending never reaches the action",
    await page.eval(() => groundedProbe.calls.length) === beforeChanged
  );
  await prepare();
  await fill("계정 전환 검사");
  await page.eval(() => {
    groundedProbe.mode = "hold";
    groundedProbe.finish = null;
  });
  await consentAndSend();
  await until(() => groundedProbe.finish);
  await click("[data-grounded-owner]");
  await page.eval(() => groundedProbe.finish());
  await pause(200);
  check(
    "owner change discards the previous owner's pending answer",
    !await page.eval(() => !!document.querySelector('[aria-label="자료 근거 답변"]'))
  );
  await click("[data-grounded-owner]");
  await until(() => document.querySelector('[data-tour="task-grounded"]'));
  await click('[data-tour="task-grounded"]');
  await until(() => !document.querySelector('[data-grounded-connect]').disabled);
  await click("[data-grounded-connect]");
  await until(() => !document.querySelector('[data-grounded-connect]').disabled);
  await prepare();
  await fill("저장한 근거 복원 검사");
  await page.eval(() => {
    groundedProbe.mode = "success";
  });
  await consentAndSend();
  await until(() => document.querySelector('[aria-label="자료 근거 답변"]'));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.eval(() => [...document.querySelectorAll('[data-conversation-context] button')].find(button => button.textContent === "저장 안 함").click());
  await page.eval(async () => {
    const original = window.showDirectoryPicker;

    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(
      "saved-evidence-records",
      { create: true }
    );
    [...document.querySelectorAll('button')].find(button => button.textContent === "저장 폴더 선택").click();
    setTimeout(() => {
      window.showDirectoryPicker = original;
    }, 1000);
  });
  await until(() => [...document.querySelectorAll('button')].some(button => button.textContent === "이 대화 저장" && !button.disabled));
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === "이 대화 저장").click());
  await click('[data-drawer-close]');
  await until(() => document.querySelector('[data-conversation-context]').textContent.includes("저장됨"));

  const savedSource = await page.eval(async () => (await (await listingProbe.a.getFileHandle("evidence.md")).getFile()).text());

  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__grounded`, { settleMs: 500 });
  await until(() => document.querySelector('[data-tour="task-grounded"]'));
  await page.eval(async () => {
    await listingProbe.prepare();
  });
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === "기록함").click());
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === "저장 위치").click());
  await until(() => [...document.querySelectorAll('button')].some(button => button.textContent === "권한 확인·다시 읽기"));
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === "권한 확인·다시 읽기").click());
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === "기록 목록으로 돌아가기").click());
  await until(() => document.querySelector('[aria-label="저장 기록"] li button'));
  await click('[aria-label="저장 기록"] li button');
  await until(() => document.querySelector('[aria-label="저장된 자료 근거"]'));
  check(
    "reload and reopen restore citation references without another model call",
    await page.eval(() => groundedProbe.calls.length === 0 && document.querySelectorAll('[aria-label="저장된 자료 근거"] q').length === 1)
  );
  await page.setViewport({ width: 390, height: 844 });
  await page.eval(() => {
    const quote = document.querySelector('[aria-label="저장된 자료 근거"] q');
    const button = document.querySelector('[aria-label="저장된 자료 근거"] li button');

    groundedProbe.originalLabels = [quote.textContent, button.textContent];
    quote.textContent = "q".repeat(200);
    button.textContent = "n".repeat(230) + ".md 원문 열기";
  });
  check(
    "saved citation text and long file names fit a narrow conversation",
    await page.eval(() => {
      const thread = document.querySelector('[aria-label="대화 내용"]');

      return thread.scrollWidth <= thread.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    })
  );
  await page.screenshot({ path: resolve(output, "saved-citation-390.png"), format: "png" });
  await page.eval(() => {
    document.querySelector('[aria-label="저장된 자료 근거"] q').textContent = groundedProbe.originalLabels[0];
    document.querySelector('[aria-label="저장된 자료 근거"] li button').textContent = groundedProbe.originalLabels[1];
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await click('[aria-label="저장된 자료 근거"] li button');
  await until(() => document.body.innerText.includes("저장한 근거와 현재 파일·인용문이 일치합니다"));
  check(
    "restored citation rehashes the actual file before navigating",
    await page.eval(() => groundedProbe.navigations.at(-1) === "/files" && document.querySelector('[aria-label="문서 본문"]')?.textContent.length > 0)
  );
  await click("[data-grounded-return]");
  await until(() => document.querySelector('[aria-label="저장된 자료 근거"]'));

  const restoredNavigations = await page.eval(() => groundedProbe.navigations.length);

  await page.eval(() => {
    const original = FileSystemFileHandle.prototype.getFile;

    groundedProbe.releaseCitation = null;
    FileSystemFileHandle.prototype.getFile = function () {
      if (this.name !== "evidence.md") return original.call(this);

      return new Promise(resolve => {
        groundedProbe.releaseCitation = () => {
          FileSystemFileHandle.prototype.getFile = original;
          resolve(original.call(this));
        };
      });
    };
    document.querySelector('[aria-label="저장된 자료 근거"] li button').click();
  });
  await until(() => groundedProbe.releaseCitation);
  await fill("읽는 도중 질문 변경");
  await page.eval(() => groundedProbe.releaseCitation());
  await pause(100);
  await click("[data-grounded-files]");
  check(
    "changing the draft cancels the saved citation read and leaves no stale preview",
    !await page.eval(() => document.querySelector('[aria-label="문서 본문"]'))
    && await page.eval(() => groundedProbe.navigations.length) === restoredNavigations
  );
  await click("[data-grounded-return]");
  await until(() => document.querySelector('[aria-label="저장된 자료 근거"]'));
  await page.eval(async () => {
    const stream = await (await listingProbe.a.getFileHandle("evidence.md")).createWritable();

    await stream.write("같은 위치지만 다른 내용입니다. 저장한 답변의 근거로 쓰면 안 됩니다.");
    await stream.close();
  });
  await click('[aria-label="저장된 자료 근거"] li button');
  await until(() => document.querySelector('[aria-label="저장된 자료 근거"]').textContent.includes("근거를 열지 못했어요"));
  check(
    "changed stored source cannot be presented as the old answer's evidence",
    await page.eval(() => groundedProbe.navigations.length) === restoredNavigations
  );
  await page.eval(async text => {
    const stream = await (await listingProbe.a.getFileHandle("evidence.md")).createWritable();

    await stream.write(text);
    await stream.close();
    listingProbe.permission = "denied";
  }, savedSource);
  await click('[aria-label="저장된 자료 근거"] li button');
  await until(() => document.querySelector('[aria-label="저장된 자료 근거"]').textContent.includes("근거를 열지 못했어요"));
  check(
    "revoked permission blocks a restored reference without navigation",
    await page.eval(() => groundedProbe.navigations.length) === restoredNavigations
  );
  await page.eval(() => {
    listingProbe.permission = "granted";
    window.showDirectoryPicker = async () => listingProbe.b;
  });
  await click("[data-grounded-connect]");
  await until(() => document.body.innerText.includes("검증 자료 B"));
  await click('[aria-label="저장된 자료 근거"] li button');
  await until(() => document.querySelector('[aria-label="저장된 자료 근거"]').textContent.includes("원래 자료 폴더"));
  check(
    "a different active source is never silently used for a saved reference",
    await page.eval(() => groundedProbe.navigations.length === 1 && groundedProbe.calls.length === 0)
  );
  }
  writeFileSync(
    resolve(output, "grounded-checks.json"),
    JSON.stringify(
      {
        checks,
        condition: "Actual product components/session/hash Worker and isolated OPFS; synthetic Server Action and permissions; no live model or native permission claims."
      },
      null,
      2
    )
  );
  console.log(`${checks.length} grounded conversation browser checks passed.`);
} catch (error) {
  writeFileSync(
    resolve(output, "grounded-failure.json"),
    JSON.stringify(
      {
        checks,
        error: String(error),
        consoleErrors: page?.consoleErrors,
        text: page ? await page.eval(() => document.body.innerText) : "",
        bootstrap: page ? await page.eval(() => ({ url: location.href, probe: typeof window.groundedProbe, scripts: [...document.scripts].map(script => script.src), resources: performance.getEntriesByType("resource").map(entry => ({ name: entry.name, status: entry.responseStatus })) })) : null,
      },
      null,
      2
    )
  );

  throw error;
}
finally {
  await browser.close();
  await server.close();
}

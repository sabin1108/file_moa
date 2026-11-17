import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = process.argv[2] ?? "docs/verification/live-organization-completion";

mkdirSync(output, { recursive: true });

const server = await createServer({
  configFile: false,
  cacheDir: resolve(".omx/browser-cache/check-live-organization-completion"),
  root: resolve("apps/web"),
  logLevel: "error",
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
  plugins: [
    {
      name: "local-organization-fixture",
      configureServer(server) {
        server.middlewares.use("/__local-organization", (_req, res) => {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            '<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>'
          );
        });
      }
    }
  ]
});

await server.listen();

const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await Browser.launch({
  extraArgs: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-software-rasterizer",
    "--disable-dev-shm-usage",
    "--no-sandbox"
  ]
});
const checks = [],
  timings = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, name);
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const body = "관련 없는 첫부분 ".repeat(500) + "LCP 성능 테스트 실측 결과\r\n합성 자료입니다.";
let page;

async function until(predicate) {
  for (let index = 0; index < 300; index++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;

    await pause(30);
  }

  writeFileSync(
    `${output}/browser-failure.json`,
    JSON.stringify(
      { text: await page.eval(() => document.body.innerText), errors: page.consoleErrors },
      null,
      2
    )
  );

  throw Error("Local preparation fixture timed out");
}

async function click(selector) {
  await page.eval(selector => {
    const node = document.querySelector(selector);

    for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS" && parent.querySelector(":scope > summary") !== node) parent.open = true;
    }
  }, selector);

  for (let index = 0; index < 200; index++) {
    const ready = await page.eval(selector => {
      const node = document.querySelector(selector);
      const drawer = node?.closest("dialog");

      return (
        node?.checkVisibility() &&
        !node.disabled
        &&
        (!drawer || !drawer.dataset.drawerState || drawer.dataset.drawerState === "open")
      );
    }, selector);

    if (ready) break;

    if (index === 199) throw Error("Control not ready: " + selector);

    await pause(30);
  }

  const point = await page.eval(selector => {
    const node = document.querySelector(selector);

    assertNode(node, selector);

    function assertNode(node, selector) {
      if (!node) throw Error("Missing " + selector);
    }

    node.scrollIntoView({ block: "center", behavior: "instant" });

    const rect = node.getBoundingClientRect();

    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);

  for (const type of ["mousePressed", "mouseReleased"])
    await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
}

async function fill(selector, text) {
  await page.eval(selector => {
    const node = document.querySelector(selector);

    node.focus();
    node.select();
  }, selector);
  await page.send("Input.insertText", { text });
}

async function openPanel() {
  await until(() => document.querySelector("[data-conversation-interaction]"));

  const closed = await page.eval(() => {
    const details = document.querySelector("[data-local-snapshot] > details");

    return details && !details.open;
  });

  if (closed) await click("[data-local-snapshot] > details > summary");
}

async function closePanel() {
  const open = await page.eval(() => !!document.querySelector("[data-local-snapshot] > details")?.open);

  if (open) await click("[data-local-snapshot] > details > summary");
}

async function prepare() {
  await until(() => document.querySelector("[data-local-prepare]"));

  const start = performance.now();

  await click("[data-local-prepare]");
  await pause(80);
  await until(() => document.querySelector("[data-local-snapshot]"));
  timings.push({
    elapsedMs: Math.round(performance.now() - start),
    width: await page.eval(() => innerWidth)
  });
}

async function clickText(label) {
  const selector = await page.eval(label => {
    const root = [...document.querySelectorAll("dialog:modal")].at(-1) ?? document;
    const node = [...root.querySelectorAll("button,summary")].find(node => node.checkVisibility() && !node.matches(":disabled")
      &&
      (node.textContent.trim() === label || node.getAttribute("aria-label") === label));

    if (!node) throw Error("Missing enabled control: " + label);

    node.setAttribute("data-completion-click", "true");

    return '[data-completion-click="true"]';
  }, label);

  await click(selector);
  await page.eval(() => document.querySelector('[data-completion-click]')?.removeAttribute("data-completion-click"));
}

async function closeManaged() {
  await clickText("파일 작업 닫기");
  await until(() => !document.querySelector("[data-managed-dialog-phase]"));
}

async function reviewManaged() {
  await clickText("계획 만들기");
  await until(() => ["ready", "error"].includes(document.querySelector("[data-managed-phase]")?.dataset.managedPhase));

  const state = await page.eval(() => document.querySelector("[data-managed-phase]").dataset.managedPhase);

  assert.equal(state, "ready", await page.eval(() => document.body.innerText));
}

async function runManaged(label) {
  await clickText(label);
  await until(() => ["completed", "error", "cancelled"].includes(document.querySelector("[data-managed-phase]")?.dataset.managedPhase));
  assert.equal(
    await page.eval(() => document.querySelector("[data-managed-phase]").dataset.managedPhase),
    "completed",
    await page.eval(() => document.body.innerText)
  );
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });

  let external = 0;

  await page.send("Network.enable");
  browser.on(page.sessionId, "Network.requestWillBeSent", event => {
    if (/^https?:/.test(event.request.url) && !event.request.url.startsWith(base)) external++;
  });
  await page.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.goto(base + "/__local-organization?transfer", { settleMs: 400 });
  await until(() => typeof liveTransferProbe !== "undefined" && !!document.querySelector('[data-fixture-view="chat"]'));
  await page.eval(async () => {
    await listingProbe.prepare();
    listingProbe.preparing = true;

    try {
      const root = listingProbe.a;
      const write = async (parent, name, text) => {
        const stream = await (await parent.getFileHandle(name, { create: true })).createWritable();

        await stream.write(text);
        await stream.close();
      };

      await write(
        root,
        "날짜보고.md",
        "# 성능 보고서\n작성일: 2026-10-01\n검토 기준일: 2026-10-15\n성능 측정 결과 LCP 2.8초입니다. 실제 합성 측정 자료입니다."
      );

      const child = await root.getDirectoryHandle("하위 자료");

      await write(child, "혼합.txt", "회사 성능 테스트와 개인 학습이 섞여 있습니다. 성능 측정 결과 LCP 2.6초와 학습 노트입니다.");
      const many = await root.getDirectoryHandle("추가자료", { create: true });
      for (let index = 0; index < 14; index++) {
        const folder = await many.getDirectoryHandle(`분류${index}`, { create: true });
        await write(folder, `성능${index}.md`, "성능 측정 자료입니다. 합성 테스트용 내용입니다.");
      }
      for (let index = 0; index < 200; index++) {
        const folder = await root.getDirectoryHandle(`정리대상${String(index).padStart(3, '0')}`, { create: true });
        await write(folder, `추가${index}.md`, "합성 자료 내용 ".repeat(50));
      }

      const reference = await root.getDirectoryHandle("참고", { create: true });

      await reference.getDirectoryHandle("월별", { create: true });
      await write(reference, "본문아님.bin", "Reference metadata must never expose this body.");

      const destination = await root.getDirectoryHandle("정리", { create: true });
      const dates = await destination.getDirectoryHandle("날짜자료", { create: true });

      await dates.getDirectoryHandle("2026-10-15", { create: true });
      await destination.getDirectoryHandle("혼합자료", { create: true });
      liveTransferProbe.mode = "review";
    } finally {
      listingProbe.preparing = false;
    }
  });
  await click('[aria-label="자료 폴더 연결"] button');
  await until(() => [...document.querySelectorAll('[aria-label="자료 폴더 연결"] button')].some(button => button.textContent === "다른 폴더 선택" && !button.disabled));
  await click('[data-fixture-view="settings"]');
  await click('[data-tour="settings-tabs"] a[href*="tab=folders"]');
  await until(() => [...document.querySelectorAll("button")].some(button => button.textContent === "새 보관함 만들기" && !button.disabled));
  await page.eval(() => {
    listingProbe.name = "검증 자료 B";
  });
  await clickText("새 보관함 만들기");
  await clickText("만들 위치 선택");
  await until(() => document.body.textContent.includes("생성 위치: 검증 자료 B"));
  await clickText("이 위치에 보관함 생성");
  await until(() => document.body.textContent.includes("위치·식별 확인됨"));
  check("actual recovery vault created and verified through existing settings", true);
  await click('[data-fixture-view="chat"]');
  await until(() => document.querySelector('[data-tour="task-organize"]'));
  await page.eval(() => document.querySelector('[data-tour="task-organize"]').click());
  await until(() => document.querySelector('[aria-label="대화 작업"]')?.value === 'organize');
  async function reply(text) {
    await fill("#message-draft", text);
    await click('[data-action="organization-send"]');
    await until(() => !document.querySelector('#message-draft').readOnly);
  }
  await until(() => document.querySelector('#message-draft').placeholder.includes('현재 폴더만'));
  check('organize card immediately asks a single scope question with no typed request, file read or AI send', await page.eval(() => !document.querySelector('[data-local-snapshot]') && liveTransferProbe.calls.length === 0 && document.querySelector('#message-draft').value === ''));
  await fill('#message-draft', '남겨 둔 초안');
  await clickText('작업 선택');
  check('task chooser is reachable without onboarding or clearing draft', await page.eval(() => !!document.querySelector('[data-tour="task-organize"]') && !document.querySelector('#message-draft')));
  await click('[data-tour="task-organize"]');
  check('returning to organize resumes the current question and retained draft', await page.eval(() => document.querySelector('#message-draft').value === '남겨 둔 초안' && !document.querySelector('[data-local-snapshot]')));
  await fill('#message-draft', '');
  await clickText('폴더 선택');
  await until(() => document.querySelector('[data-destination-phase="ready"]'));
  check('folder chooser escapes the narrow chat and keeps full-size rows for 200 folders', await page.eval(() => {
    const dialog = document.querySelector('[data-selection-workspace]');
    const list = document.querySelector('[aria-label="탐색 범위 하위 폴더"]');
    return dialog.matches(':modal') && dialog.clientWidth >= 1000 && list.clientHeight >= 480 && list.children.length >= 200 && list.querySelector('button').getBoundingClientRect().height >= 48;
  }));
  check('200 sidebar folders scroll inside the sidebar without stretching the page', await page.eval(() => document.documentElement.scrollHeight <= innerHeight + 100));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await pause(150);
    check(`${width}: large folder chooser remains inside viewport`, await page.eval(() => {
      const rect = document.querySelector('[data-selection-workspace]').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1;
    }));
    await page.screenshot({ path: `${output}/folder-selector-${width}.png`, format: 'png', fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await clickText('검증 자료 A 폴더를 탐색 범위로 선택');
  await until(() => document.querySelector('#message-draft').placeholder.includes('하위 폴더까지'));
  check('choosing a folder asks only coverage and removes the duplicate criteria form', await page.eval(() => !document.querySelector('[data-organization-conditions]') && !document.querySelector('[data-local-snapshot]') && !document.querySelector('[data-local-preparation] textarea')));
  await reply('이 폴더 파일만');
  await until(() => document.querySelector('#message-draft').placeholder.includes('본문 내용을 보고 주제별로'));
  await clickText('이전 질문');
  await until(() => document.querySelector('#message-draft').placeholder.includes('하위 폴더까지'));
  await clickText('이전 질문');
  await until(() => document.querySelector('#message-draft').placeholder.includes('현재 폴더만'));
  await reply('전체');
  await until(() => document.querySelector('#message-draft').placeholder.includes('본문 내용을 보고 주제별로'));
  await reply('날짜별로');
  await until(() => document.querySelector('#message-draft').placeholder.includes('정리 폴더로 또는 나중에'));
  await reply('정리 폴더로');
  await reply('참고는 참고');
  check('chat conditions preserve actual folders and keep earlier history collapsed', await page.eval(() => document.body.textContent.includes('검증 자료 A / 정리') && [...document.querySelectorAll('details')].some(node => node.querySelector(':scope > summary')?.textContent.includes('이전 메시지') && !node.open) && liveTransferProbe.calls.length === 0));
  await reply('이대로 자료 확인해줘');
  await until(() => document.querySelector("[data-local-snapshot]"));
  await click('[data-organization-select-documents]');
  await until(() => document.querySelector('[data-source-excerpts]'));
  check('already-read documents outside suggestions are editable in the selection workspace', await page.eval(() => !document.querySelector('[aria-label="혼합.txt 선택"]').disabled && !!document.querySelector('[data-selection-workspace]:modal')));
  if (!await page.eval(() => document.querySelector('[aria-label="혼합.txt 선택"]').checked)) await click('[aria-label="혼합.txt 선택"]');
  check('manual document inclusion preserves local-only preparation and clears consent', await page.eval(() => document.querySelector('[aria-label="혼합.txt 선택"]').checked && !document.querySelector('[data-local-consent]').checked && liveTransferProbe.calls.length === 0));
  await clickText('선택 완료 · 채팅으로 돌아가기');

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await pause(200);
    check(
      `${width}: preparation stays in the conversation without a material dialog or horizontal overflow`,
      await page.eval(() => !!document.querySelector('[data-conversation-workspace] [data-live-send]') && !document.querySelector('dialog[open]')
        && document.documentElement.scrollWidth <= innerWidth)
    );
    await page.screenshot({ path: `${output}/ready-${width}.png`, format: "png", fullPage: true });
  }

  await page.setViewport({ width: 1440, height: 1000 });
  const expandStructure = await page.eval(() => [...document.querySelectorAll('[data-organization-conversation] button')].find(node => /^전체 \d+개 보기$/u.test(node.textContent))?.textContent);
  assert.ok(expandStructure, 'many documents offer a bounded preview and explicit expansion');
  await clickText(expandStructure);
  check('expanded structure keeps a bounded keyboard-scroll area without sending', await page.eval(() => {
    const tree = document.querySelector('[aria-label="정리할 자료 구조"]');
    return tree.querySelectorAll('li').length > 8 && tree.parentElement.tabIndex === 0 && tree.parentElement.clientHeight <= 240 && liveTransferProbe.calls.length === 0;
  }));
  await clickText('작게 보기');
  check(
    "natural language resolves root scope, separate reference and destination without a scope wizard",
    await page.eval(() => !document.querySelector('[data-organization-conditions]')
      && document.querySelector("[data-local-preparation]").textContent.includes("검증 자료 A / 정리"))
  );
  check(
    "confirmed reference metadata contains directories, not file names or bodies",
    await page.eval(() => document.querySelector("[data-reference-structure]").textContent.includes("월별")
      && !document.querySelector("[data-reference-structure]").textContent.includes("본문아님.bin"))
  );

  const partial = await page.eval(() => [...document.querySelectorAll('[data-local-snapshot] label')].some(label => label.textContent.includes('전체가 아닌, 확인한 일부 자료만')));

  if (partial) {
    check(
      "partial source preparation still requires explicit acknowledgement",
      await page.eval(() => document.querySelector('[data-local-consent]').disabled)
    );
    await page.eval(() => [...document.querySelectorAll('[data-local-snapshot] label')].find(label => label.textContent.includes('전체가 아닌, 확인한 일부 자료만')).querySelector('input').click());
  }

  await click("[data-local-consent]");
  await click("[data-live-send]");
  await until(() => document.querySelector("[data-review-questions]"));
  check("date and mixed documents are grouped at the end, with generated evidence-based date labels", await page.eval(() => {
    const questions = document.querySelector("[data-review-questions]");

    return questions.textContent.includes("작성일") && questions.textContent.includes("검토 기준일")
      && questions.textContent.includes("혼합.txt")
      &&
      questions.querySelectorAll("fieldset > legend").length === 3
      && !document.querySelector("[data-organization-operation]");
  }));
  check(
    "unanswered questions cannot obtain a new transmission consent",
    await page.eval(() => !document.querySelector("[data-local-consent]") && document.querySelector('[data-confirm-review]').disabled)
  );

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: current question stage hides earlier conditions and transmission`, await page.eval(() =>
      !document.querySelector('[data-local-snapshot]') && !document.querySelector('[data-organization-conditions]')
      && document.documentElement.scrollWidth <= innerWidth));
    await page.eval(() => document.querySelector('[data-review-questions]').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.screenshot({ path: `${output}/questions-${width}.png`, format: 'png', fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await click('[data-review-questions] input[name="organization-assignment"]:not(:checked)');
  await click('[aria-label="혼합.txt 목적지 폴더 선택"]');
  await until(() => document.querySelector('[data-destination-phase="ready"]'));
  await clickText('선택창 닫기');
  check('individual assignment survives picker cancellation without changing answers', await page.eval(() =>
    !!document.querySelector('[aria-label="혼합.txt 목적지 폴더 선택"]')
    && document.querySelector('[data-confirm-review]').disabled && liveTransferProbe.calls.length === 1));
  await click('[data-review-questions] input[name="organization-assignment"]:not(:checked)');

  if (process.argv.includes("--reply")) {
    check(
      "questions retain the same empty shared composer",
      await page.eval(() => document.getElementById("message-draft").value === ""
        && document.querySelector('[data-action="organization-send"]').textContent.includes("보내기"))
    );
    await fill("#message-draft", "검토 기준일로, 혼합.txt는 알아서");
    await click('[data-action="organization-send"]');
    check(
      "unsupported clause leaves every answer and first proposal intact",
      await page.eval(() => !document.querySelector('[data-local-snapshot]') && document.querySelector('[aria-label="날짜보고.md 날짜 기준"]').value === ""
        && document.querySelector('[data-confirm-review]').disabled
        && liveTransferProbe.calls.length === 1)
    );
    await fill("#message-draft", "검토 기준일로 하고, 혼합.txt는 혼합자료 폴더로");
    for (let repeat = 0; repeat < 5; repeat++) {
      await click('[data-fixture-view="files"]');
      await click('[data-fixture-view="chat"]');
    }
    check(
      "reply draft survives navigation without replacing the original instruction",
      await page.eval(() => document.getElementById("message-draft").value.includes("혼합자료 폴더로")
        && document.body.textContent.includes('자료 정리'))
    );
    await page.eval(() => {
      const node = document.getElementById("message-draft");

      node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "검토" }));
      node.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", isComposing: true, keyCode: 229 }));
    });
    check(
      "composing Enter cannot submit a reply or transmit",
      await page.eval(() => !!document.querySelector('[data-review-questions]') && document.querySelector('[aria-label="날짜보고.md 날짜 기준"]').value === ""
        && liveTransferProbe.calls.length === 1)
    );
    await page.eval(() => document.getElementById("message-draft").dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "검토" })));
    await click('[data-action="organization-send"]');
    check(
      "one chat reply fills both existing controls and clears its draft",
      await page.eval(() => !document.querySelector('[data-review-questions]')
        && document.querySelector('[data-local-snapshot]').textContent.includes("함께 반영할 답변 2개")
        && document.getElementById('message-draft').value === "")
    );
  } else {
    await page.eval(() => {
      const select = document.querySelector('[aria-label="날짜보고.md 날짜 기준"]');

      select.value = [...select.options].find(option => option.textContent.includes("검토 기준일")).value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.eval(() => [...document.querySelectorAll('[data-review-questions] button')].find(button => button.textContent.includes('개 자료의 목적지')).click());
    await until(() => document.querySelector('[data-destination-phase="ready"]'));
    check('folder picker displays files while choosing a review destination', await page.eval(() => !!document.querySelector('[aria-label="목적지 폴더의 파일"]')));
    await click('[aria-label="혼합자료 목적지 폴더 열기"]');
    await until(() => document.querySelector('[data-destination-phase="ready"]'));
    await click('[aria-label="혼합자료 폴더를 목적지로 선택"]');
  }

  if (!process.argv.includes('--reply')) await click('[data-confirm-review]');
  await until(() => !document.querySelector("[data-local-consent]").disabled);
  check(
    "answers invalidate old proposal without auto-generation",
    await page.eval(() => !document.querySelector("[data-live-result]") && !document.querySelector("[data-local-consent]").checked
      && liveTransferProbe.calls.length === 1)
  );
  await click("[data-local-consent]");
  await click("[data-live-send]");
  await until(() => document.querySelector("[data-organization-operation]"));
  check(
    "explicit new analysis carries grounded answers and confirmed reference tree",
    await page.eval(() => liveTransferProbe.calls.length === 2 && liveTransferProbe.calls[1].answers.length === 2
      && liveTransferProbe.calls[1].referenceTree.directories.length === 2)
  );
  check(
    "completed proposal hides prior questions and offers an explicit edit action",
    await page.eval(() => !document.querySelector("[data-review-questions]") && !!document.querySelector('[data-edit-review]') && !document.querySelector('[data-local-snapshot]'))
  );
  await click('[data-organization-kind="copy"]');
  await click("[data-organization-plan]");
  check(
    "projection yields two source/destination batches without file writes",
    await page.eval(() => document.querySelectorAll("[data-organization-batch]").length === 2)
  );
  check('reviewed plan replaces setup controls with a compact editable summary', await page.eval(() => !document.querySelector('[data-organization-kind="copy"]').checkVisibility() && document.activeElement.tagName === 'SUMMARY' && document.activeElement.textContent.includes('설정 변경')));

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await pause(300);
    check(
      `${width}: review has no horizontal overflow`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
    );

    if (width === 390) {
      await click('[data-file-change-comparison] button:first-child');
      check(
        "mobile comparison switches to current paths without changing the plan",
        await page.eval(() => document.querySelector('[data-file-change-comparison] [data-view]').dataset.view === "before"
          && document.querySelectorAll('[data-organization-batch]').length === 2)
      );
      await page.send(
        "Input.dispatchKeyEvent",
        { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }
      );
      await page.send(
        "Input.dispatchKeyEvent",
        { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }
      );
      assert.equal(
        await page.eval(() => document.activeElement.textContent),
        "도착 구조",
        await page.eval(() => document.activeElement.outerHTML)
      );
      await page.send(
        "Input.dispatchKeyEvent",
        {
          type: "keyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          text: "\r",
          unmodifiedText: "\r"
        }
      );
      await page.send(
        "Input.dispatchKeyEvent",
        { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }
      );
      await until(() => document.querySelector('[data-file-change-comparison] [data-view]').dataset.view === "after");
      check(
        "mobile arrival comparison is reachable by keyboard",
        await page.eval(() => document.activeElement.getAttribute("aria-pressed") === "true" && document.activeElement.textContent === "도착 구조")
      );
    }

    await page.eval(() => document.querySelector("[data-organization-operation]").scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `${output}/review-${width}.png`, format: "png", fullPage: true });
  }

  await page.setViewport({ width: 1440, height: 1000 });
  await click('[data-organization-batch="0"]');
  await until(() => document.querySelector("[data-managed-phase]"));
  await reviewManaged();
  check(
    "existing managed review focuses cancel and needs separate execution",
    await page.eval(() => document.activeElement.textContent === "검토 취소" && !!document.querySelector('[data-managed-phase="ready"]'))
  );
  await runManaged("복사 실행");
  check("AI projection executes real verified copy while retaining the original", await page.eval(async () => {
    const root = listingProbe.a;
    const source = await (await root.getFileHandle("날짜보고.md")).getFile();
    const target = await (await (await (await root.getDirectoryHandle("정리")).getDirectoryHandle("날짜자료")).getDirectoryHandle("2026-10-15")).getFileHandle("날짜보고.md");

    return await source.text() === await (await target.getFile()).text();
  }));
  await closeManaged();
  check(
    "completed batches cannot be executed twice",
    await page.eval(() => document.querySelector('[data-organization-batch="0"]').disabled)
  );
  await click('[data-organization-batch="1"]');
  await until(() => document.querySelector("[data-managed-phase]"));
  await page.eval(() => {
    const select = document.querySelector('[aria-label="목적지 지정"] select');

    select.value = "move";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await reviewManaged();
  await runManaged("보존 후 이동 실행");
  check("same plan reuses real preserved move and removes only its verified source", await page.eval(async () => {
    const source = await listingProbe.a.getDirectoryHandle("하위 자료");

    try {
      await source.getFileHandle("혼합.txt");

      return false;
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
    }

    const target = await (await (await listingProbe.a.getDirectoryHandle("정리")).getDirectoryHandle("혼합자료")).getFileHandle("혼합.txt");

    return (await (await target.getFile()).text()).includes("회사 성능 테스트");
  }));
  await clickText("휴지통·보존 기록 보기");
  await until(() => document.querySelector('[aria-label="휴지통과 보존 기록"]'));
  await clickText("이동·편집 등 보존본");
  await until(() => document.querySelector('[aria-label="휴지통과 보존 기록"]').textContent.includes("혼합.txt"));
  check(
    "actual copy and move archives are discoverable using existing recovery UI",
    await page.eval(() => document.querySelector('[aria-label="휴지통과 보존 기록"]').textContent.includes("이동 보존본"))
  );
  await page.eval(() => {
    const section = document.querySelector('[aria-label="휴지통과 보존 기록"]');
    const row = [...section.querySelectorAll("li")].find(row => row.textContent.includes("혼합.txt"));

    row.querySelector("summary").click();
    row.querySelector("button").setAttribute("data-recover-mixed", "true");
  });
  await click("[data-recover-mixed]");
  await until(() => document.querySelector('[data-destination-phase="ready"]'));

  if (await page.eval(() => !!document.querySelector('[aria-label="검증 자료 A 최상위로 이동"]')))
    await click('[aria-label="검증 자료 A 최상위로 이동"]');

  await until(() => document.querySelector('[aria-label="검증 자료 A 폴더를 목적지로 선택"]'));
  await click('[aria-label="검증 자료 A 폴더를 목적지로 선택"]');
  await until(() => document.querySelector('[data-managed-phase="ready"]'));
  await runManaged("새 항목으로 복구");
  check(
    "preserved AI move is restored as a verified new item",
    await page.eval(async () => (await (await (await listingProbe.a.getFileHandle("혼합.txt")).getFile()).text()).includes("회사 성능 테스트"))
  );
  await closeManaged();
  await click("[data-organization-plan]");
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      const handle = await listingProbe.a.getFileHandle("날짜보고.md");
      const text = await (await handle.getFile()).text();
      const stream = await handle.createWritable();

      await stream.write(text.replace("2.8", "2.9"));
      await stream.close();
    } finally {
      listingProbe.preparing = false;
    }

    listingProbe.writesBeforeChangedReview = listingProbe.productWrites;
  });
  await click('[data-organization-batch="0"]');
  await until(() => document.querySelector("[data-managed-phase]"));
  await clickText("계획 만들기");
  await until(() => document.querySelector('[data-managed-phase="error"]'));
  check(
    "same-size changed source blocks plan approval and all old batches without a write",
    await page.eval(() => listingProbe.productWrites === listingProbe.writesBeforeChangedReview
      && document.querySelector("[data-organization-plan]").disabled)
  );
  await closeManaged();
  await closePanel();
  await click('[data-fixture-view="files"]');
  await until(() => {
    const node = document.querySelector('[aria-label="날짜보고.md 미리보기"]');
    return node?.checkVisibility() && !node.disabled;
  });
  await page.eval(() => document.querySelector('[aria-label="날짜보고.md 미리보기"]').focus());
  await until(() => document.activeElement?.getAttribute('aria-label') === '날짜보고.md 미리보기');

  for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: " ", code: "Space", windowsVirtualKeyCode: 32 });

  await until(() => document.querySelector('[aria-label="날짜보고.md 선택"]')?.checked);
  await clickText("전체 선택 해제");
  check(
    "bulk clear retains selection tools and the last individual uncheck exits",
    await page.eval(() => document.querySelector('[aria-label="파일 선택"]').checkVisibility()
      && !document.querySelector('[aria-label="날짜보고.md 선택"]').checked)
  );
  await click('[aria-label="날짜보고.md 선택"]');
  await click('[aria-label="날짜보고.md 선택"]');
  await until(() => !document.querySelector('[aria-label="파일 선택"]').checkVisibility());
  check("individual final uncheck actually closes selection tools", true);
  check(
    "protected original sentinel remains unchanged",
    await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before))
  );
  check(
    "no external requests and no component exceptions",
    external === 0 && page.consoleErrors.length === 0,
    page.consoleErrors
  );
  writeFileSync(
    `${output}/browser-checks.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        condition: "real app controller/session/Worker/OPFS/managed engine/vault/recovery with synthetic owner/permissions/provider and Next navigation shim"
      },
      null,
      2
    )
  );
  console.log(`${checks.length} completion browser checks passed.`);
} catch (error) {
  writeFileSync(
    `${output}/browser-failure.json`,
    JSON.stringify(
      { checks, error: String(error), text: page ? await page.eval(() => document.body.innerText) : "" },
      null,
      2
    )
  );

  throw error;
} finally {
  await browser.close();
  await server.close();
}

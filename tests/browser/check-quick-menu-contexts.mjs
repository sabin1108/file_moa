import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3035";
const output = process.argv[3] ?? "docs/verification/quick-menu-contexts";

mkdirSync(output, { recursive: true });

const results = [];
const check = (name, passed) => {
  results.push({ name, passed: !!passed });
  assert.ok(passed, name);
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] });
const mouse = (page, type, x, y, buttons = 0) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons });
const key = (page, type, key, code, modifiers = 0) => page.send("Input.dispatchKeyEvent", { type, key, code, modifiers });
const shown = page => page.eval(() => !!document.querySelector("[data-quick-switch-menu]"));
const point = (page, selector) => page.eval(selector => {
  const r = document.querySelector(selector).getBoundingClientRect();

  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, selector);
const hold = async (page, selector) => {
  const p = await point(page, selector);

  await mouse(page, "mousePressed", p.x, p.y, 1);
  await pause(650);

  return p;
};
const release = (page, p) => mouse(page, "mouseReleased", p.x, p.y);

try {
  const page = await browser.newPage({ width: 1440, height: 1000 });

  await page.goto(base + "/demo", { settleMs: 300 });
  await page.goto(base + "/demo/settings?tab=controls", { settleMs: 400 });

  for (let n = 0; n < 150 && !await shown(page); n++) {
    await page.eval(() => document.querySelector('[aria-label="빠른 전환 열기"]')?.click());
    await pause(30);
  }

  assert.ok(await shown(page), 'Shared client menu listener must be ready before pointer checks');
  await key(page, 'keyDown', 'Escape', 'Escape');
  await key(page, 'keyUp', 'Escape', 'Escape');
  await page.eval(() => {
    const fixture = document.createElement("section");

    fixture.id = "quick-fixture";
    fixture.style.cssText = "position:fixed;left:300px;top:200px;width:500px;background:white;z-index:100;padding:20px";
    fixture.innerHTML = '<p id="quick-text">Preview text for a shared long hold</p><pre id="quick-code">const preview = true;</pre>';
    document.body.append(fixture);
  });

  let p = await hold(page, "#quick-text");

  check("ordinary preview text outside the shell DOM opens the shared menu", await shown(page));
  await release(page, p);
  await pause(80);
  await page.eval(() => {
    const dialog = document.createElement("dialog");

    dialog.id = "quick-modal";
    dialog.style.cssText = "width:min(600px,85vw);padding:20px;transform:translateY(10px);overflow:hidden";
    dialog.innerHTML = '<p id="modal-text">Modal preview text</p><pre id="modal-code">Preview code</pre><input id="modal-input" value="Editable"><button id="modal-button">Choose</button><div id="modal-folder" data-long-press-selection style="height:35px">Folder selection</div><div id="modal-drag" draggable="true" style="height:35px">Drag item</div>';
    document.body.append(dialog);
    dialog.showModal();
  });
  p = await hold(page, "#modal-text");
  check(
    "modal preview text opens menu inside the active dialog",
    await page.eval(() => !!document.querySelector("#quick-modal [data-quick-switch-menu]"))
  );
  check(
    "menu is in top layer and receives hit tests",
    await page.eval(() => {
      const node = document.querySelector("[data-quick-switch-menu]");
      const r = node.getBoundingClientRect();

      return node.matches(":popover-open") && node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    })
  );
  await key(page, "keyDown", "Escape", "Escape");
  await key(page, "keyUp", "Escape", "Escape");
  await release(page, p);
  await pause(80);
  check(
    "Escape closes only the quick menu",
    await page.eval(() => document.querySelector("#quick-modal").open && !document.querySelector("[data-quick-switch-menu]"))
  );

  for (const selector of ["#modal-input", "#modal-button", "#modal-folder", "#modal-drag"]) {
    p = await hold(page, selector);
    check(selector + " keeps its original interaction", !(await shown(page)));
    await release(page, p);
    await pause(40);
  }

  await page.eval(() => {
    const range = document.createRange();

    range.selectNodeContents(document.querySelector("#modal-text"));

    const selection = getSelection();

    selection.removeAllRanges();
    selection.addRange(range);
  });
  p = await hold(page, "#modal-code");
  check("existing text selection prevents menu", !(await shown(page)));
  await release(page, p);
  await page.eval(() => getSelection().removeAllRanges());
  p = await point(page, "#modal-code");
  await mouse(page, "mousePressed", p.x, p.y, 1);
  await mouse(page, "mouseMoved", p.x + 20, p.y, 1);
  await pause(620);
  check("dragging before hold completes cancels menu", !(await shown(page)));
  await release(page, { x: p.x + 20, y: p.y });
  await page.eval(() => getSelection().removeAllRanges());
  p = await point(page, "#modal-code");
  await mouse(page, "mousePressed", p.x, p.y, 1);
  await pause(150);
  await page.eval(() => document.querySelector("#quick-modal").dataset.quickSwitchBlock = "");
  await pause(500);
  check("critical state appearing during hold prevents menu", !(await shown(page)));
  await release(page, p);
  await page.eval(() => delete document.querySelector("#quick-modal").dataset.quickSwitchBlock);
  p = await hold(page, "#modal-code");
  await page.eval(() => document.querySelector("#quick-modal").close());
  await pause(100);
  check("dialog closing removes its top layer menu", !(await shown(page)));
  await release(page, p);
  await page.eval(() => document.querySelector("#quick-modal").showModal());

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await pause(40);
    p = await hold(page, "#modal-code");
    check(
      `${width}: modal menu fits viewport`,
      await page.eval(() => {
        const r = document.querySelector("[data-quick-switch-menu]")?.getBoundingClientRect();

        return r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      })
    );
    await page.screenshot({ path: `${output}/modal-${width}.png`, format: "png" });
    await release(page, p);
    await pause(50);
  }

  await page.eval(() => {
    document.querySelector("#quick-modal").close();
    document.querySelector("#quick-modal").remove();
    document.querySelector("#quick-fixture").remove();
    document.activeElement?.blur();
  });
  await key(page, "keyDown", "q", "KeyQ", 1);
  await pause(50);
  check("keyboard shortcut still opens menu", await shown(page));
  await key(page, "keyUp", "q", "KeyQ", 1);
  await pause(50);
  await page.goto(base + "/login", { settleMs: 250 });
  await page.eval(() => document.activeElement?.blur());
  await key(page, "keyDown", "q", "KeyQ", 1);
  check("public login remains outside workspace scope", !(await shown(page)));
  await key(page, "keyUp", "q", "KeyQ", 1);
  check("no browser exceptions", page.consoleErrors.length === 0);
} finally {
  await browser.close();
  writeFileSync(
    `${output}/checks.json`,
    JSON.stringify(
      {
        condition: "Isolated production sample app and synthetic native dialog; no model calls, user profile or source-file changes",
        results
      },
      null,
      2
    )
  );
}

console.log(JSON.stringify({ checks: results.length, passed: true }));

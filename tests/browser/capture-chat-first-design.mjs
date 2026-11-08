import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const url = process.argv[2];
if (!url?.startsWith("http://127.0.0.1:"))
  throw Error("An isolated local design fixture URL is required");
const output = "docs/verification/chat-first-design";
mkdirSync(output, { recursive: true });
const browser = await Browser.launch({
  extraArgs: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-software-rasterizer",
    "--no-sandbox"
  ]
});
const observations = [];
try {
  for (const width of [390, 768, 1440, 1920]) {
    const page = await browser.newPage({ width, height: width === 390 ? 844 : 1000 });
    let externalRequests = 0;
    await page.send("Network.enable");
    browser.on(page.sessionId, "Network.requestWillBeSent", event => {
      if (/^https?:/.test(event.request.url) && !event.request.url.startsWith(new URL(url).origin))
        externalRequests++;
    });
    await page.goto(url, { settleMs: 400 });
    async function click(text) {
      const point = await page.eval(async text => {
        const node = [...document.querySelectorAll("button,label")].find(
          node => node.checkVisibility() && node.textContent.trim().startsWith(text)
        );
        if (!node) throw Error("Missing design control " + text);
        node.scrollIntoView({ block: "center", behavior: "instant" });
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const rect = node.getBoundingClientRect();
        const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        if (!node.contains(document.elementFromPoint(point.x, point.y)))
          throw Error("Obscured design control " + text);
        return point;
      }, text);
      for (const type of ["mousePressed", "mouseReleased"])
        await page.send("Input.dispatchMouseEvent", {
          type,
          ...point,
          button: "left",
          clickCount: 1
        });
    }
    async function capture(state) {
      await page.eval(async () => {
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        window.scrollTo(0, 0);
      });
      const measured = await page.eval(() => ({
        menuOverlapsConversation: (() => {
          const root = document.querySelector("[data-chat-first-prototype]");
          const menu = root.querySelector(":scope > aside");
          return (
            menu.checkVisibility() &&
            menu.getBoundingClientRect().right >
              root.querySelector("main").getBoundingClientRect().left + 1
          );
        })(),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        headings: [...document.querySelectorAll("h1,h2")].map(node => node.textContent),
        smallControls: [...document.querySelectorAll("button")].filter(
          node => node.checkVisibility() && node.getBoundingClientRect().height < 44
        ).length,
        primaryButtons: [...document.querySelectorAll("button")]
          .filter(
            node =>
              node.checkVisibility() &&
              /방식을 선택|정리 모습 보기|복사 내용 검토|이동 내용 검토|이 자료로 제안 보기/.test(
                node.textContent
              )
          )
          .map(node => ({
            text: node.textContent.trim(),
            bottom: node.getBoundingClientRect().bottom,
            viewport: innerHeight
          }))
      }));
      assert.equal(measured.horizontalOverflow, false);
      assert.equal(measured.smallControls, 0);
      assert.equal(measured.menuOverlapsConversation, false);
      assert.ok(
        measured.primaryButtons.every(button => button.bottom <= button.viewport),
        "The current primary control is visible without scrolling"
      );
      observations.push({ width, state, ...measured });
      await page.screenshot({
        path: `${output}/${state}-${width}.png`,
        format: "png",
        fullPage: true
      });
    }
    await capture("plan");
    await click("복사 · 원본 유지");
    await capture("copy");
    await click("이동 · 보존 후 옮기기");
    await capture("move");
    await click("이동 내용 검토");
    await capture("review");
    await click("기준 바꾸기");
    await capture("questions");
    await click("처음부터 보기");
    await capture("materials");
    assert.deepEqual(page.consoleErrors, []);
    assert.equal(externalRequests, 0);
    await page.close();
  }
  writeFileSync(
    `${output}/visual-observations.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        condition:
          "Synthetic design-only fixture; visual states and geometry, no functional, provider, authentication or filesystem validation",
        observations
      },
      null,
      2
    )
  );
  console.log(
    `${observations.length} design states captured; no overflow, small buttons, external requests or component exceptions.`
  );
} finally {
  await browser.close();
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

// 검증 전용 브라우저의 GPU 초기화 대기를 피하며 사용자 Chrome에는 연결하지 않는다.

const launch = Browser.launch.bind(Browser);

Browser.launch = options => launch({
  ...options,
  extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox", ...(options?.extraArgs ?? [])]
});

const script = resolve(".agents/skills/design-taste-frontend/scripts/inspect.mjs");

process.argv = [process.execPath, script, ...process.argv.slice(2)];
await import(pathToFileURL(script).href);

import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(app, "package.json"));
const engine = dirname(require.resolve("tesseract.js/package.json"));
if (JSON.parse(readFileSync(resolve(engine, "package.json"))).version !== "7.0.0") throw Error("Unexpected OCR engine version");
const core = dirname(createRequire(resolve(engine, "package.json")).resolve("tesseract.js-core/package.json"));
const target = resolve(app, "public/ocr");
mkdirSync(resolve(target, "core"), { recursive: true });
copyFileSync(resolve(engine, "dist/worker.min.js"), resolve(target, "worker.min.js"));
copyFileSync(resolve(engine, "LICENSE.md"), resolve(target, "ENGINE-LICENSE.md"));
copyFileSync(resolve(core, "LICENSE"), resolve(target, "CORE-LICENSE"));
if (existsSync(resolve(engine, "dist/worker.min.js.LICENSE.txt"))) copyFileSync(resolve(engine, "dist/worker.min.js.LICENSE.txt"), resolve(target, "worker.min.js.LICENSE.txt"));
for (const name of readdirSync(core)) {
  if (/^tesseract-core.*\.(?:wasm|js)$/u.test(name)) copyFileSync(resolve(core, name), resolve(target, "core", name));
}
const manifest = JSON.parse(readFileSync(resolve(target, "languages.json"), "utf8"));
for (const asset of manifest.files) {
  const path = resolve(target, "lang", asset.name);
  if (!existsSync(path) || createHash("sha256").update(readFileSync(path)).digest("hex") !== asset.sha256) throw Error("OCR language asset missing or changed");
}
console.log("Local OCR assets prepared and language hashes verified.");

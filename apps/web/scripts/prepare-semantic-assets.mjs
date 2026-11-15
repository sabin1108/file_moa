import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(app, "package.json"));
const sdk = resolve(dirname(require.resolve("@huggingface/transformers")), "..");
const sdkRequire = createRequire(resolve(sdk, "package.json"));
const dist = dirname(sdkRequire.resolve("onnxruntime-web"));
const manifest = JSON.parse(readFileSync(resolve(app, "src/features/local-folders/search/semantic/runtime-manifest.json"), "utf8"));
if (JSON.parse(readFileSync(resolve(sdk, "package.json"))).version !== manifest.sdk) throw Error("Unexpected semantic SDK version");
const target = resolve(app, "public/semantic-runtime");
mkdirSync(target, { recursive: true });
for (const asset of manifest.files) {
  const source = resolve(dist, asset.file);
  const bytes = readFileSync(source);
  if (bytes.length !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw Error("Semantic runtime asset changed");
  copyFileSync(source, resolve(target, asset.file));
}
copyFileSync(resolve(sdk, "LICENSE"), resolve(target, "SDK-LICENSE"));
// Upstream 89f8206ba4/LICENSE; the published ORT npm tarball omits its license file.
copyFileSync(resolve(app, "scripts/semantic-ORT-LICENSE"), resolve(target, "ORT-LICENSE"));
console.log("Pinned browser semantic runtime prepared; no model downloaded.");

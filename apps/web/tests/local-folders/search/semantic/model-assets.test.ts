import { expect, it } from "vitest";
import { RUNTIME_ASSETS, runtimeAssetUrl, semanticAsset, verifySemanticAsset } from "../../../../src/features/local-folders/search/semantic/model-assets";

it("SEM-02 accepts only fixed public assets and verifies size and full SHA-256 before cache writes", async () => {
  expect(semanticAsset("https://example.invalid/model.onnx", "https://moa.invalid")).toBeUndefined();
  expect(semanticAsset("https://moa.invalid/api/chat", "https://moa.invalid")).toBeUndefined();
  const runtime = runtimeAssetUrl(RUNTIME_ASSETS[0].file, "https://moa.invalid");
  expect(runtime).toContain(`?sha=${RUNTIME_ASSETS[0].sha256}`);
  expect(semanticAsset(runtime, "https://moa.invalid")).toEqual(RUNTIME_ASSETS[0]);
  const bytes = new TextEncoder().encode("synthetic");
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  const checked = await verifySemanticAsset(new Response(bytes), { bytes: bytes.length, sha256: hash });
  expect(checked.headers.get("x-moa-sha256")).toBe(hash);
  await expect(verifySemanticAsset(new Response(bytes), { bytes: bytes.length + 1, sha256: hash })).rejects.toThrow("integrity");
  await expect(verifySemanticAsset(new Response(bytes), { bytes: bytes.length, sha256: "0".repeat(64) })).rejects.toThrow("integrity");
});

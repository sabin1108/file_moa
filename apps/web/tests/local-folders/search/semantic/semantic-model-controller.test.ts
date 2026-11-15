import { afterEach, expect, it, vi } from "vitest";
import { SemanticModelController } from "../../../../src/features/local-folders/search/semantic/semantic-model-controller";

afterEach(() => vi.unstubAllGlobals());

it("SEM-01 keeps basic-search fallback immediate while another tab holds the model lock", async () => {
  const request = vi.fn(async (_name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) => {
    expect(options).toEqual({ mode: "shared", ifAvailable: true });
    return callback(null);
  });
  vi.stubGlobal("navigator", { locks: { request } });
  const model = new SemanticModelController();
  await expect(model.query("합성 질문", new AbortController().signal)).rejects.toThrow("semantic-busy");
  expect(request).toHaveBeenCalledOnce();
});

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const pdfRead = vi.hoisted(() => vi.fn());

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  PDFWorker: class { destroy() { } },
  getDocument: (...args: unknown[]) => {
    pdfRead(...args);

    return {
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: "PDF 본문 검색어" }] }),
          cleanup: vi.fn(),
        }),
      }),
      destroy: vi.fn(),
    };
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
  pdfRead.mockClear();
});

async function worker() {
  vi.stubGlobal("Worker", class { terminate() { } });
  // The real Worker handler runs here; browser threading is covered by the OPFS browser check.

  const self = {
    postMessage: vi.fn(),
    onmessage: null as null | ((event: { data: unknown }) => Promise<void>),
  };

  vi.stubGlobal("self", self);
  await import("../../../src/features/local-folders/content/copy-hash.worker");

  return self;
}

describe("shared hash and text snapshot Worker", () => {
  it("CACHE-002 reuses validated text after hashing bytes and regenerates the current question excerpt", async () => {
    const self = await worker();
    const text = "AlphaEvidence " + "중립 문장 ".repeat(400) + " BetaEvidence";
    const file = new File([text], "note.md", { lastModified: 100 });
    const decode = vi.spyOn(TextDecoder.prototype, "decode");
    const read = vi.spyOn(file, "arrayBuffer");
    const cached = {
      hash: createHash("sha256").update(text).digest("hex"), text,
      metadata: { format: "text", size: file.size, lastModified: 100, ocrEnabled: false },
    };

    await self.onmessage!({ data: { file, instruction: "BetaEvidence", cached } });

    expect(read).toHaveBeenCalledOnce();
    expect(decode).not.toHaveBeenCalled();
    expect(self.postMessage.mock.calls[0][0]).toMatchObject({ cacheHit: true, fullText: text });
    expect(self.postMessage.mock.calls[0][0].excerpt).toContain("BetaEvidence");
  });

  it("CACHE-004 same size and mtime never hide changed bytes or invalid UTF8", async () => {
    const self = await worker();
    const file = new File([new Uint8Array([0xc3, 0x28])], "note.md", { lastModified: 100 });
    const cached = {
      hash: createHash("sha256").update("ok").digest("hex"), text: "ok",
      metadata: { format: "text", size: 2, lastModified: 100, ocrEnabled: false },
    };

    await self.onmessage!({ data: { file, instruction: "ok", cached } });

    expect(self.postMessage.mock.calls[0][0]).toMatchObject({ issue: "invalid-utf8" });
  });

  it("CACHE-002 skips PDF extraction only for matching metadata and keeps truncation details", async () => {
    const self = await worker();
    const file = new File(["pdf bytes"], "note.pdf", { lastModified: 100 });
    const cached = {
      hash: createHash("sha256").update("pdf bytes").digest("hex"), text: "CachedPDF evidence",
      metadata: { format: "pdf", size: file.size, lastModified: 100, ocrEnabled: false, pdf: { pages: 51, complete: false } },
    };

    await self.onmessage!({ data: { file, instruction: "CachedPDF", cached } });

    expect(pdfRead).not.toHaveBeenCalled();
    expect(self.postMessage.mock.calls[0][0]).toMatchObject({ cacheHit: true, pdf: { pages: 51, complete: false } });

    await self.onmessage!({ data: { file, instruction: "PDF", cached, ocr: true } });

    expect(pdfRead).toHaveBeenCalledOnce();
    expect(self.postMessage.mock.calls[1][0].cacheHit).toBe(false);
  });

  it("CACHE-002 cached OCR text retains its partial status and cannot bypass OCR being disabled", async () => {
    const self = await worker();
    const file = new File(["image bytes"], "scan.png", { lastModified: 100 });
    const cached = {
      hash: createHash("sha256").update("image bytes").digest("hex"), text: "CachedOCR evidence",
      metadata: { format: "image", size: file.size, lastModified: 100, ocrEnabled: true, ocr: { pages: 1, complete: false } },
    };

    await self.onmessage!({ data: { file, instruction: "CachedOCR", cached, ocr: true } });

    expect(self.postMessage.mock.calls[0][0]).toMatchObject({ cacheHit: true, ocr: { pages: 1, complete: false }, fullText: cached.text });

    await self.onmessage!({ data: { file, instruction: "CachedOCR", cached } });

    expect(self.postMessage.mock.calls[1][0]).toMatchObject({ issue: "ocr-disabled" });
  });

  it.each([
    { hash: "a".repeat(64), text: "old text" },
    { hash: "a".repeat(64), text: 42, metadata: { format: "text", size: 3, lastModified: 100, ocrEnabled: false } },
    { hash: "a".repeat(64), text: "old text", metadata: { format: "pdf", size: 3, lastModified: 100, ocrEnabled: false, pdf: { pages: -1, complete: true } } },
  ])("CACHE-002 ignores legacy or malformed cache entries", async cached => {
    const self = await worker();
    const file = new File(["abc"], "note.md", { lastModified: 100 });
    cached.hash = createHash("sha256").update("abc").digest("hex");

    await self.onmessage!({ data: { file, instruction: "abc", cached } });

    expect(self.postMessage.mock.calls[0][0]).toMatchObject({ fullText: "abc", cacheHit: false });
  });
  it("extracts PDF text in the Worker and returns only a bounded excerpt", async () => {
    const self = await worker();
    const file = new File(["not the real bytes"], "자료.pdf");

    await self.onmessage!({ data: { file, instruction: "PDF 본문" } });

    const response = self.postMessage.mock.calls[0][0];

    expect(response.excerpt).toContain("PDF 본문 검색어");
    expect(response.pdf).toEqual({ pages: 1, complete: true });
  });

  it("searches the full decoded body without returning it to the UI", async () => {
    const self = await worker();
    const text =
      "회의 자료\n" + "앞부분 ".repeat(1000) + "\n회의일: 2026-10-15";
    const file = new File([text], "회의.md");
    const read = vi.spyOn(file, "arrayBuffer");

    await self.onmessage!({
      data: {
        file,
        instruction: "회의",
        find: {
          terms: ["회의"],
          from: "2026-10-01",
          to: "2026-10-31",
          basis: "meeting",
        },
      },
    });

    const result = self.postMessage.mock.calls[0][0];

    expect(read).toHaveBeenCalledOnce();
    expect(result.finding).toMatchObject({
      kind: "matched",
      dates: ["2026-10-15"],
    });
    expect(result).not.toHaveProperty("text");
    expect(
      result.finding.evidence.every(
        (line: string) => line.length <= 200 && text.includes(line),
      ),
    ).toBe(true);
  });
  it("preserves the binary copy protocol and a known SHA256", async () => {
    const self = await worker();
    const file = new File(["abc"], "a.bin");
    const read = vi.spyOn(file, "arrayBuffer");

    await self.onmessage!({ data: file });
    expect(read).toHaveBeenCalledOnce();
    expect(self.postMessage).toHaveBeenCalledWith({
      size: 3,
      sha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });

  it("reads once and derives the full hash and bounded body excerpt/hash from those bytes", async () => {
    const self = await worker();
    const body =
      "무관한 앞부분 ".repeat(500) + "LCP 성능 실측 결과\r\n한글 원문";
    const file = new File([body], "중립이름.md");
    const read = vi.spyOn(file, "arrayBuffer");

    await self.onmessage!({ data: { file, instruction: "성능 실측 자료" } });

    const response = self.postMessage.mock.calls[0][0];

    expect(read).toHaveBeenCalledOnce();
    expect(response.excerpt).toContain("LCP 성능 실측 결과");
    expect(response.excerpt.length).toBeLessThanOrEqual(1200);
    expect(response.sha256).toBe(
      createHash("sha256").update(body).digest("hex"),
    );
    expect(response.excerptHash).toBe(
      createHash("sha256").update(response.excerpt).digest("hex"),
    );
  });

  it("reports invalid UTF8 in text mode while binary hashing still works", async () => {
    const self = await worker();
    const file = new File([new Uint8Array([0xc3, 0x28])], "bad.md");

    await self.onmessage!({ data: { file, instruction: "자료" } });
    expect(self.postMessage.mock.calls[0][0]).toMatchObject({
      issue: "invalid-utf8",
      size: 2,
    });
    await self.onmessage!({ data: file });
    expect(self.postMessage.mock.calls[1][0]).not.toHaveProperty("issue");
  });
});

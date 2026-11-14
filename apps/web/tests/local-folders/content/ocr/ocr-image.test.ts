import { expect, it } from "vitest";
import { inspectOcrImage, ocrViewport, OCR_LIMITS } from "../../../../src/features/local-folders/content/ocr/ocr-image";

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);

  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);

  const view = new DataView(bytes.buffer);

  view.setUint32(16, width);
  view.setUint32(20, height);

  return bytes;
}

it("checks image dimensions before decoding and caps rasterized PDF pixels", () => {
  expect(inspectOcrImage(png(1200, 800))).toEqual({ width: 1200, height: 800 });
  expect(() => inspectOcrImage(png(100000, 100000))).toThrow("ocr-image-too-large");
  expect(() => inspectOcrImage(png(0, 10))).toThrow("ocr-image-invalid");
  expect(() => inspectOcrImage(new Uint8Array([1, 2]))).toThrow("ocr-image-invalid");

  const size = ocrViewport(10000, 20000);

  expect(Math.ceil(size.width) * Math.ceil(size.height)).toBeLessThanOrEqual(OCR_LIMITS.pixels);
});

it("rejects truncated JPEG segments instead of walking outside the file", () => {
  expect(() => inspectOcrImage(new Uint8Array([255, 216, 255, 192, 0, 255]))).toThrow("ocr-image-invalid");

  const bytes = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 3, 32, 4, 176, 1, 1, 17, 0]);

  expect(inspectOcrImage(bytes)).toEqual({ width: 1200, height: 800 });
});

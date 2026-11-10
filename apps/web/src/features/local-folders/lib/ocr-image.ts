export const OCR_LIMITS = { pixels: 6_000_000, pages: 3, timeoutMs: 90_000 } as const;
export type OcrDetails = Readonly<{ pages: number; complete: boolean }>;

export function isOcrDetails(value: unknown): value is OcrDetails {
  return typeof value === "object" && value !== null && "pages" in value && typeof value.pages === "number" && Number.isSafeInteger(value.pages) && value.pages > 0 && value.pages <= OCR_LIMITS.pages && "complete" in value && typeof value.complete === "boolean";
}

function dimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw Error("ocr-image-invalid");
  if (width * height > OCR_LIMITS.pixels) throw Error("ocr-image-too-large");
  return { width, height };
}

/** 이미지 바이트를 디코딩하기 전에 실제 헤더의 픽셀 상한을 검사한다. */
export function inspectOcrImage(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return dimensions(view.getUint32(16), view.getUint32(20));
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218 || offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        if (length < 8) break;
        return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += length;
    }
  }
  throw Error("ocr-image-invalid");
}

export function ocrViewport(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw Error("ocr-image-invalid");
  const scale = Math.min(2, Math.sqrt((OCR_LIMITS.pixels - 10_000) / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
}

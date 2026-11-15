import { isOcrDetails, type OcrDetails } from "./ocr/ocr-image";

export type TextCacheMetadata = Readonly<{
  format: "text" | "pdf" | "image";
  size: number;
  lastModified: number;
  ocrEnabled: boolean;
  pdf?: Readonly<{ pages: number; complete: boolean }>;
  ocr?: OcrDetails;
}>;

export type CachedText = Readonly<{
  hash: string;
  text: string;
  metadata?: TextCacheMetadata;
}>;

export function textCacheFormat(name: string): TextCacheMetadata["format"] {
  return /\.pdf$/iu.test(name) ? "pdf" : /\.(png|jpe?g)$/iu.test(name) ? "image" : "text";
}

export function isTextCacheMetadata(value: unknown): value is TextCacheMetadata {
  if (typeof value !== "object" || value === null) return false;

  if (!("size" in value) || typeof value.size !== "number" || !Number.isSafeInteger(value.size) || value.size < 0
    || !("lastModified" in value) || typeof value.lastModified !== "number" || !Number.isFinite(value.lastModified)
    || !("ocrEnabled" in value) || typeof value.ocrEnabled !== "boolean" || !("format" in value)) return false;

  if ("ocr" in value && (!value.ocrEnabled || !isOcrDetails(value.ocr))) return false;

  if (value.format === "text") return !value.ocrEnabled && !("pdf" in value) && !("ocr" in value);

  if (value.format === "image") return value.ocrEnabled && "ocr" in value && !("pdf" in value);

  if (value.format !== "pdf" || !("pdf" in value) || typeof value.pdf !== "object" || value.pdf === null) return false;

  return "pages" in value.pdf && typeof value.pdf.pages === "number" && Number.isSafeInteger(value.pdf.pages)
    && value.pdf.pages > 0 && "complete" in value.pdf && typeof value.pdf.complete === "boolean";
}

/** A metadata match is only a prerequisite; the hash comes from freshly read source bytes. */
export function reusableCachedText(value: unknown, file: File, hash: string, ocrEnabled: boolean): value is CachedText & { metadata: TextCacheMetadata } {
  return typeof value === "object" && value !== null && "hash" in value && value.hash === hash
    && "text" in value && typeof value.text === "string" && value.text.length <= 2 * 1024 * 1024
    && "metadata" in value && isTextCacheMetadata(value.metadata)
    && value.metadata.format === textCacheFormat(file.name) && value.metadata.size === file.size
    && value.metadata.lastModified === file.lastModified && value.metadata.ocrEnabled === ocrEnabled;
}

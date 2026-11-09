import { organizationExcerpt } from "../../../shared/organization-candidates";
import { findTextEvidence, type FindQuery } from "../lib/document-find";
import { extractPdfText } from "./pdf-text";

type IndexContext = Readonly<{ owner: string; workspace: string; connection: string; path: readonly string[] }>;

/** Both operations use the same bytes; text never needs a second read on the UI thread. */
self.onmessage = async (
  event: MessageEvent<
    File | { file: File; instruction: string; find?: FindQuery; index?: IndexContext; cached?: { hash: string; text: string } }
  >,
) => {
  try {
    const request = event.data;
    const file = request instanceof File ? request : request.file;
    const bytes = await file.arrayBuffer();
    const size = bytes.byteLength;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (request instanceof File) {
      self.postMessage({ sha256, size: bytes.byteLength });
      return;
    }

    let text: string;
    let pdf: { pages: number; complete: boolean } | undefined;
    if (/\.pdf$/iu.test(file.name)) {
      try {
        const extracted = await extractPdfText(bytes);
        text = extracted.text;
        pdf = { pages: extracted.pages, complete: extracted.complete };
        if (!text.trim()) {
          self.postMessage({ sha256, size, issue: "pdf-no-text", pdf });
          return;
        }
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        self.postMessage({ sha256, size, issue: name === "PasswordException" ? "pdf-encrypted" : "pdf-invalid" });
        return;
      }
    } else {
      try {
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        text = request.cached?.hash === sha256 && request.cached.text === decoded ? request.cached.text : decoded;
      } catch {
        self.postMessage({ sha256, size: bytes.byteLength, issue: "invalid-utf8" });
        return;
      }
    }
    const excerpt = organizationExcerpt(text, request.instruction);
    const excerptDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(excerpt),
    );
    const excerptHash = Array.from(new Uint8Array(excerptDigest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    self.postMessage({
      sha256,
      size,
      excerpt,
      excerptHash,
      fullText: text,
      ...(pdf ? { pdf } : {}),
      ...(request.find
        ? { finding: findTextEvidence(text, request.find) }
        : {}),
    });
  } catch {
    self.postMessage({ error: "hash-read-failed" });
  }
};
export {};

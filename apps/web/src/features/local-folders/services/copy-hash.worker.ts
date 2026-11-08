import { organizationExcerpt } from "../../../shared/organization-candidates";
import { findTextEvidence, type FindQuery } from "../lib/document-find";

/** Both operations use the same bytes; text never needs a second read on the UI thread. */
self.onmessage = async (
  event: MessageEvent<
    File | { file: File; instruction: string; find?: FindQuery }
  >,
) => {
  try {
    const request = event.data;
    const file = request instanceof File ? request : request.file;
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (request instanceof File) {
      self.postMessage({ sha256, size: bytes.byteLength });
      return;
    }

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      self.postMessage({
        sha256,
        size: bytes.byteLength,
        issue: "invalid-utf8",
      });
      return;
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
      size: bytes.byteLength,
      excerpt,
      excerptHash,
      ...(request.find
        ? { finding: findTextEvidence(text, request.find) }
        : {}),
    });
  } catch {
    self.postMessage({ error: "hash-read-failed" });
  }
};
export {};

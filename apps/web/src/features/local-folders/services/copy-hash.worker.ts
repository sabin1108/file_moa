/** A single bounded File is read and hashed off the UI thread. No storage or network access. */
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const bytes = await event.data.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    self.postMessage({ sha256, size: bytes.byteLength });
  } catch {
    self.postMessage({ error: "hash-read-failed" });
  }
};
export {};

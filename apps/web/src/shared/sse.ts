/** Parse transport frames only; callers validate the provider or product event schema. */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxBytes: number,
): AsyncGenerator<string> {
  signal.throwIfAborted();
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  let bytes = 0;
  let buffer = "";
  let data: string[] = [];

  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      bytes += value?.byteLength ?? 0;
      if (bytes > maxBytes) throw new Error("sse-size");
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.search(/[\r\n]/u)) >= 0) {
        if (!done && buffer[newline] === "\r" && newline === buffer.length - 1) break;
        const line = buffer.slice(0, newline);
        const separator = buffer[newline] === "\r" && buffer[newline + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(newline + separator);
        if (!line) {
          if (data.length) yield data.join("\n");
          data = [];
        } else if (line === "data" || line.startsWith("data:")) {
          const field = line.slice(5);
          data.push(field.startsWith(" ") ? field.slice(1) : field);
        }
      }

      if (done) {
        if (buffer || data.length) throw new Error("sse-truncated");
        return;
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

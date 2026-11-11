import { describe, expect, it } from "vitest";
import { readSseData } from "../../src/shared/sse";

function stream(parts: readonly string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(new TextEncoder().encode(part));

      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>, maxBytes = 1024) {
  const values: string[] = [];

  for await (const data of readSseData(body, new AbortController().signal, maxBytes)) values.push(data);

  return values;
}

describe("GC-004 SSE event boundaries", () => {
  it("joins split CRLF and multiline data, skips comments and non-data events", async () => {
    expect(await collect(stream([": keepalive\r", "\nevent: text\r\ndata: 첫", "줄\r\ndata: 둘째\r\n\r", "\ndata: next\n\n"])))
      .toEqual(["첫줄\n둘째", "next"]);
  });

  it("decodes Korean text split inside a UTF-8 code point", async () => {
    const bytes = new TextEncoder().encode("data: 한글\n\n");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));

        controller.close();
      }
    });

    expect(await collect(body)).toEqual(["한글"]);
  });

  it("rejects truncated frames, invalid UTF-8 and cumulative byte overflow", async () => {
    await expect(collect(stream(["data: unfinished"]))).rejects.toThrow();
    await expect(collect(stream(["data: one\n\n", "data: two\n\n"]), 20)).rejects.toThrow();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff]));
        controller.close();
      }
    });

    await expect(collect(body)).rejects.toThrow();
  });

  it("cancels the reader on consumer exit", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: one\n\ndata: two\n\n"));
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const data of readSseData(body, new AbortController().signal, 100)) {
      expect(data).toBe("one");

      break;
    }

    expect(cancelled).toBe(true);
  });

  it("cancels the reader on abort without waiting for another frame", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      }
    });
    const controller = new AbortController();
    const reading = (async () => {
      for await (const data of readSseData(body, controller.signal, 100)) void data;
    })();

    controller.abort();
    await expect(reading).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
});

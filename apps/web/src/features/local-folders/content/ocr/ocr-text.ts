import { inspectOcrImage } from "./ocr-image";

/** OCR의 Worker·WASM·언어 파일은 같은 origin에서만 읽는다. */

export function createOcrReader() {
  let engine: Promise<import("tesseract.js").Worker> | null = null;
  const recognize = async (image: Blob) => {
    engine ??= (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      const base = new URL("/ocr/", self.location.origin).href;

      return createWorker(["kor", "eng"], OEM.LSTM_ONLY, {
        workerPath: base + "worker.min.js",
        corePath: base + "core",
        langPath: base + "lang",
        gzip: false,
        workerBlobURL: false,
        cacheMethod: "none",
        errorHandler: () => { },
      });
    })();

    const result = await (await engine).recognize(image);

    return result.data.text.replaceAll("\r\n", "\n").trim();
  };

  return {
    recognize,
    readImage: async (bytes: ArrayBuffer) => {
      inspectOcrImage(new Uint8Array(bytes));

      return recognize(new Blob([bytes]));
    },
    dispose: async () => {
      if (engine) await (await engine).terminate();
    },
  };
}

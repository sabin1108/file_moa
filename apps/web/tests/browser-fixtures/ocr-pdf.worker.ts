import { extractPdfText } from "../../src/features/local-folders/services/pdf-text";

self.onmessage = async (event: MessageEvent<number[]>) => {
  try { self.postMessage(await extractPdfText(new Uint8Array(event.data).buffer, async () => "합성 래스터 검증")); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : "" }); }
};

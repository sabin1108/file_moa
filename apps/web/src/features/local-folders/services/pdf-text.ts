export const PDF_TEXT_LIMITS = {
  pages: 50,
  characters: 200_000,
} as const;

export type PdfTextResult = Readonly<{
  text: string;
  pages: number;
  complete: boolean;
  ocrPages?: number;
}>;

import { OCR_LIMITS, ocrViewport } from "../lib/ocr-image";

class OcrCanvasFactory {
  getNoAlphaContext(canvas: OffscreenCanvas) { return canvas.getContext("2d", { alpha: false })!; }
  create(width: number, height: number) {
    if (width <= 0 || height <= 0 || width * height > OCR_LIMITS.pixels) throw Error("ocr-image-too-large");
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext("2d")! };
  }
  reset(target: { canvas: OffscreenCanvas }, width: number, height: number) {
    if (width <= 0 || height <= 0 || width * height > OCR_LIMITS.pixels) throw Error("ocr-image-too-large");
    target.canvas.width = width; target.canvas.height = height;
  }
  destroy(target: { canvas: OffscreenCanvas }) { target.canvas.width = 0; target.canvas.height = 0; }
}

/** Extracts text in the caller's Worker. No remote worker or asset is used. */
export async function extractPdfText(bytes: ArrayBuffer, recognize?: (image: Blob) => Promise<string>): Promise<PdfTextResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const port = new Worker(new URL("./pdfjs.worker.ts", import.meta.url), { type: "module" });
  // v6.5 declares port as null, while its constructor accepts a native Worker.
  const worker = new pdfjs.PDFWorker({ port: port as unknown as null });
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    worker,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableFontFace: true,
    useWasm: false,
    enableXfa: false,
    stopAtErrors: true,
    ...(recognize ? { CanvasFactory: OcrCanvasFactory } : {}),
  });
  try {
    const document = await loading.promise;
    const pageCount = document.numPages;
    const pages = Math.min(pageCount, PDF_TEXT_LIMITS.pages);
    const chunks: string[] = [];
    let characters = 0;
    let processedPages = 0;
    let truncated = false;
    let ocrPages = 0;
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try {
      const content = await page.getTextContent();
      let text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      if (!text && recognize) {
        if (ocrPages >= OCR_LIMITS.pages) { truncated = true; continue; }
        const dimensions = page.getViewport({ scale: 1 });
        const size = ocrViewport(dimensions.width, dimensions.height);
        const viewport = page.getViewport({ scale: size.scale });
        const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try {
          await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext("2d")! as unknown as CanvasRenderingContext2D, viewport }).promise;
          text = await recognize(await canvas.convertToBlob({ type: "image/png" }));
          ocrPages++;
        } finally { canvas.width = 0; canvas.height = 0; }
      }
      if (text) {
        const remaining = PDF_TEXT_LIMITS.characters - characters;
        if (text.length > remaining) truncated = true;
        chunks.push(`[${pageNumber}쪽]\n${text.slice(0, remaining)}`);
        characters += Math.min(text.length, remaining);
      }
      processedPages++;
      } finally { page.cleanup(); }
      if (characters >= PDF_TEXT_LIMITS.characters) break;
    }
    return { text: chunks.join("\n"), pages: pageCount, complete: processedPages === pageCount && !truncated, ...(ocrPages ? { ocrPages } : {}) };
  } finally {
    await loading.destroy();
    worker.destroy();
    port.terminate();
  }
}

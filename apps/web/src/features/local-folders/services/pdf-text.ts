export const PDF_TEXT_LIMITS = {
  pages: 50,
  characters: 200_000,
} as const;

export type PdfTextResult = Readonly<{
  text: string;
  pages: number;
  complete: boolean;
}>;

/** Extracts text in the caller's Worker. No remote worker or asset is used. */
export async function extractPdfText(bytes: ArrayBuffer): Promise<PdfTextResult> {
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
  });
  try {
    const document = await loading.promise;
    const pageCount = document.numPages;
    const pages = Math.min(pageCount, PDF_TEXT_LIMITS.pages);
    const chunks: string[] = [];
    let characters = 0;
    let processedPages = 0;
    let truncated = false;
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try {
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
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
    return { text: chunks.join("\n"), pages: pageCount, complete: processedPages === pageCount && !truncated };
  } finally {
    await loading.destroy();
    worker.destroy();
    port.terminate();
  }
}

/**
 * OCR local (Tesseract.js) — sem upload externo.
 * Lang data em /ocr (public/ocr). Se ausente, falha de forma controlada.
 */

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
  pages: number;
}

const MAX_OCR_PAGES = 8;

/**
 * Executa OCR em imagens (canvas/dataURL) já renderizadas no cliente.
 * Nunca envia pixels a servidores externos.
 */
export async function runLocalOcrOnImages(
  images: Array<HTMLCanvasElement | string>,
  options?: {
    lang?: string;
    onProgress?: (p: OcrProgress) => void;
  },
): Promise<OcrResult> {
  if (typeof window === "undefined") {
    throw new Error("OCR local só está disponível no navegador.");
  }
  const slice = images.slice(0, MAX_OCR_PAGES);
  if (slice.length === 0) {
    return { text: "", confidence: 0, pages: 0 };
  }

  const { createWorker } = await import("tesseract.js");
  const lang = options?.lang ?? "por";
  const worker = await createWorker(lang, 1, {
    langPath: "/ocr",
    logger: (m) => {
      if (typeof m.progress === "number") {
        options?.onProgress?.({
          status: String(m.status ?? "ocr"),
          progress: m.progress,
        });
      }
    },
  });

  try {
    const parts: string[] = [];
    let confSum = 0;
    for (let i = 0; i < slice.length; i++) {
      options?.onProgress?.({
        status: `Página ${i + 1}/${slice.length}`,
        progress: i / slice.length,
      });
      const { data } = await worker.recognize(slice[i]!);
      parts.push(data.text ?? "");
      confSum += data.confidence ?? 0;
    }
    return {
      text: parts.join("\n"),
      confidence: slice.length ? confSum / slice.length / 100 : 0,
      pages: slice.length,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Renderiza páginas de um PDF (pdfjs) em canvas para OCR.
 */
export async function renderPdfPagesForOcr(
  data: Uint8Array,
  options?: { password?: string; maxPages?: number },
): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  let doc;
  try {
    const loading = pdfjs.getDocument({
      data,
      password: options?.password?.slice(0, 128) || undefined,
      isEvalSupported: false,
      useSystemFonts: true,
      disableAutoFetch: true,
      disableStream: true,
    });
    doc = await loading.promise;
  } catch (e) {
    throw e;
  }

  const canvases: HTMLCanvasElement[] = [];
  const max = Math.min(doc.numPages, options?.maxPages ?? MAX_OCR_PAGES);
  try {
    for (let p = 1; p <= max; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(viewport.width, 2000);
      canvas.height = Math.min(viewport.height, 2800);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({
        canvasContext: ctx,
        canvas,
        viewport: page.getViewport({
          scale: canvas.width / page.getViewport({ scale: 1 }).width,
        }),
      }).promise;
      canvases.push(canvas);
    }
  } finally {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }
  return canvases;
}

export async function ocrPdfFile(
  file: File,
  options?: {
    password?: string;
    onProgress?: (p: OcrProgress) => void;
  },
): Promise<OcrResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  const canvases = await renderPdfPagesForOcr(data, {
    password: options?.password,
  });
  return runLocalOcrOnImages(canvases, {
    onProgress: options?.onProgress,
  });
}

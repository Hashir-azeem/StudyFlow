import { parseOutline } from "../core/outline/parseOutline";
import type { ParsedOutline } from "../core/outline/types";
import type { ISODate } from "../core/types";

/**
 * Privacy-first outline reading.
 *
 * Guarantees, by construction:
 *  - On device. Bytes come from the File the student picked; nothing is sent
 *    over the network. (In the desktop app the Tauri CSP also blocks outbound
 *    requests, as a second line of defence.)
 *  - No persistence. Nothing here touches IndexedDB, SQLite, localStorage,
 *    the file system, or logs. The PDF worker is created for this one file and
 *    terminated afterwards.
 *  - Scoped lifetime. The document bytes and extracted text exist only inside
 *    `readOutline`. Only the structured ParsedOutline is returned; the text
 *    never reaches React state or the app store. The byte buffer is zeroed on
 *    the way out.
 *
 * Limit: JavaScript can't overwrite strings in place, so extracted text is
 * released for garbage collection rather than wiped. It's unreachable as soon
 * as this function returns.
 */

export const MAX_OUTLINE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 80;
/** Below this many characters a PDF is almost certainly scanned images. */
const MIN_TEXT_CHARS = 40;

export type OutlineFormat = "pdf" | "docx" | "text";

export class OutlineReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlineReadError";
  }
}

export interface ReadProgress {
  page: number;
  pages: number;
}

export function detectFormat(file: File): OutlineFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (/\.(txt|md|markdown|text)$/.test(name) || file.type.startsWith("text/")) return "text";
  if (name.endsWith(".doc")) throw new OutlineReadError("Old Word files (.doc) can't be read. Open it in Word and save as .docx or PDF.");
  throw new OutlineReadError("Choose a PDF, Word (.docx), or text file.");
}

export async function readOutline(
  file: File,
  options: { today: ISODate; signal?: AbortSignal; onProgress?: (p: ReadProgress) => void },
): Promise<ParsedOutline> {
  const format = detectFormat(file);
  if (file.size > MAX_OUTLINE_BYTES) throw new OutlineReadError("That file is over 20 MB. Course outlines are usually much smaller; try exporting just the outline.");
  if (file.size === 0) throw new OutlineReadError("That file is empty.");

  let bytes: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
  try {
    let text: string | null =
      format === "pdf"
        ? await pdfText(bytes, options.signal, options.onProgress)
        : format === "docx"
          ? await docxText(bytes)
          : decodeText(bytes);
    try {
      if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
        throw new OutlineReadError(
          format === "pdf"
            ? "This PDF has no readable text; it's probably a scan. Try the original Word or PDF file from your course page."
            : "This file doesn't contain enough text to read.",
        );
      }
      return parseOutline(text, { today: options.today });
    } finally {
      text = null;
    }
  } finally {
    // Zero the copy we own. If pdf.js transferred it to its worker, it's
    // already detached (length 0) and was freed when that worker ended.
    if (bytes && bytes.byteLength > 0) bytes.fill(0);
    bytes = null;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Reading was cancelled.", "AbortError");
}

function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // Many replacement characters means it wasn't UTF-8; Windows-1252 is the usual culprit.
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  return bad > 5 ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

const isTextItem = (item: unknown): item is PdfTextItem =>
  typeof item === "object" && item !== null && "str" in item && "transform" in item;

/**
 * Rebuild visual lines from pdf.js text runs: group by baseline, order left to
 * right. Keeps table rows ("Midterm | Week 7 | 25%") together on one line,
 * which is what the parser expects.
 */
export function linesFromTextItems(items: unknown[]): string {
  const runs = items.filter(isTextItem).filter((i) => i.str.trim() !== "");
  runs.sort((a, b) => b.transform[5]! - a.transform[5]! || a.transform[4]! - b.transform[4]!);
  const lines: string[] = [];
  let current: PdfTextItem[] = [];
  let y = Number.NaN;
  const flush = () => {
    if (current.length === 0) return;
    current.sort((a, b) => a.transform[4]! - b.transform[4]!);
    let line = "";
    let prevEnd = Number.NaN;
    for (const run of current) {
      const x = run.transform[4]!;
      // Visible gap between runs becomes a space; touching runs are one word.
      if (line && (Number.isNaN(prevEnd) || x - prevEnd > 1.5)) line += " ";
      line += run.str;
      prevEnd = x + run.width;
    }
    lines.push(line.trim());
    current = [];
  };
  for (const run of runs) {
    const ry = run.transform[5]!;
    if (!Number.isNaN(y) && Math.abs(ry - y) > 2.5) flush();
    if (current.length === 0) y = ry;
    current.push(run);
  }
  flush();
  return lines.join("\n");
}

async function pdfText(bytes: Uint8Array, signal?: AbortSignal, onProgress?: (p: ReadProgress) => void): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  throwIfAborted(signal);

  // A dedicated worker for this one document, destroyed below: nothing lingers.
  const worker = new pdfjs.PDFWorker();
  const task = pdfjs.getDocument({
    data: bytes,
    worker,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new OutlineReadError(`That PDF has ${doc.numPages} pages. Outlines are usually under ${MAX_PDF_PAGES}; try exporting just the outline.`);
    }
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      throwIfAborted(signal);
      onProgress?.({ page: n, pages: doc.numPages });
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(linesFromTextItems(content.items));
      page.cleanup();
    }
    return pages.join("\n");
  } catch (err) {
    if (err instanceof OutlineReadError || (err instanceof DOMException && err.name === "AbortError")) throw err;
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException") throw new OutlineReadError("This PDF is password-protected. Remove the password and try again.");
    throw new OutlineReadError("This PDF couldn't be read. It may be damaged; try downloading it again.");
  } finally {
    await task.destroy();
    worker.destroy();
  }
}

interface MammothApi {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const mod = (await import("mammoth/mammoth.browser.js")) as unknown as { default?: MammothApi } & Partial<MammothApi>;
  const mammoth: MammothApi = mod.default ?? (mod as MammothApi);
  try {
    // mammoth wants an ArrayBuffer; hand it an exact-length view of our bytes.
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    try {
      return (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
    } finally {
      new Uint8Array(buffer).fill(0);
    }
  } catch (err) {
    if (err instanceof OutlineReadError) throw err;
    throw new OutlineReadError("This Word file couldn't be read. Try saving it again as .docx or PDF.");
  }
}

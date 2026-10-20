/**
 * Reading a scanned document by showing its pages to the model.
 *
 * A PDF whose pages carry no text extracts to nothing. Capability 1 reports
 * that honestly -- `readable: false`, "most likely a scan" -- which is correct
 * and useless: the content is right there, in the pixels. This renders those
 * pages and hands them over as images, so the same document becomes readable
 * without an OCR engine anywhere in the stack.
 *
 * Nothing here is new infrastructure. `pdf-parse` already ships the renderer
 * (@napi-rs/canvas, verified working on linux/x64 under node:22-slim with a
 * fresh install: 612x792 PNGs, ~646 vision tokens a page), the Anthropic Files
 * API upload already exists for code-execution attachments, and
 * llm-provider.ts already turns a file id into an `{type:"image"}` block. The
 * only thing missing was something to join them.
 *
 * What this will NOT do, deliberately:
 *   - Rescue a PDF that has *some* text. A page of scanned exhibits inside a
 *     typed contract still reads as text only. Mixed documents need per-page
 *     decisions and a way to say "pages 4-9 were images"; that is a larger
 *     change and guessing at it now would be worse than not doing it.
 *   - Render more than MAX_VISION_PAGES. A 200-page scan at ~646 tokens a page
 *     is ~129,000 tokens for one step, which is not a document being read, it
 *     is a context window being spent. Past the cap the caller is told how
 *     many pages were skipped so it can say so.
 */
import { createHash } from "crypto";

/** Rendered pages per document. 20 x ~646 tokens is ~13k -- the same order as
 *  the text prompts these steps already carry. */
export const MAX_VISION_PAGES = 20;

/** Scale 1 gives 612x792 and ~646 vision tokens a page. Scale 2 quadruples
 *  both. Starting at 1 because it is the cheaper half of an unmeasured
 *  trade-off: no scanned document has yet been read at either setting, so the
 *  number to raise is this one, once there is something to measure against. */
export const VISION_RENDER_SCALE = 1;

export interface VisionPages {
  /** Anthropic Files API ids, in page order, ready for attachmentImageFileIds. */
  fileIds: string[];
  /** Pages rendered and sent. */
  shown: number;
  /** Pages the document has. */
  total: number;
  /** Set when the cap bit, so the caller can say which pages nobody saw. */
  skipped?: number;
}

/**
 * Rendered pages are cached per source file for the life of the process: the
 * render costs CPU and the upload costs a round trip, and neither changes for
 * a file whose bytes cannot change. Not persisted -- a restart re-renders.
 * Persisting the ids would need somewhere to put them, and the one column that
 * would fit (`extract_meta`) belongs to the extractor rather than to this.
 */
const cache = new Map<string, VisionPages>();

/** Keyed on the bytes, not the row id, so two uploads of the same scan share
 *  one render and a re-upload of changed bytes never hits a stale entry. */
function keyFor(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function clearVisionCache(): void {
  cache.clear();
}

/**
 * Render a PDF's pages to PNG. Returns [] for anything that is not a PDF the
 * renderer can open -- a caller is left with the honest `readable: false`
 * rather than a failed node.
 */
async function renderPages(bytes: Buffer, limit: number): Promise<{ images: Buffer[]; total: number }> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const shot = await parser.getScreenshot({ scale: VISION_RENDER_SCALE });
    // Screenshot is { data: Uint8Array; dataUrl: string; pageNumber; width;
    // height; scale } -- `data` is the PNG bytes, so prefer it and keep
    // dataUrl only as the fallback. No cast: the reader's own type is right.
    const pages = shot?.pages ?? [];
    const images: Buffer[] = [];
    for (const page of pages.slice(0, limit)) {
      const raw = page.data?.length
        ? Buffer.from(page.data)
        : page.dataUrl
          ? Buffer.from(page.dataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64")
          : null;
      // A page that rendered to nothing is skipped rather than sent as an
      // empty image block, which the API would refuse and which would fail the
      // whole step over one bad page.
      if (raw && raw.length > 0) images.push(raw);
    }
    return { images, total: pages.length };
  } finally {
    await parser.destroy();
  }
}

/**
 * The pages of a scanned document, uploaded and ready to attach.
 *
 * Best-effort throughout: a render failure, an upload failure or a missing
 * Anthropic client all return null, and the caller falls back to telling the
 * step the document could not be read. That is the existing behaviour, so a
 * failure here costs nothing that was previously working.
 */
export async function visionPagesFor(
  bytes: Buffer | null | undefined,
  filename: string,
): Promise<VisionPages | null> {
  if (!bytes || bytes.length === 0) return null;

  const key = keyFor(bytes);
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const { images, total } = await renderPages(bytes, MAX_VISION_PAGES);
    if (!images.length) return null;

    const { getAnthropicRawClient } = await import("./llm-provider");
    const { toFile } = await import("@anthropic-ai/sdk");
    const client = await getAnthropicRawClient();
    if (!client) return null;

    const fileIds: string[] = [];
    for (const [i, image] of images.entries()) {
      const uploaded = await client.beta.files.upload({
        file: await toFile(image, `${filename}-p${i + 1}.png`, { type: "image/png" }),
      });
      const id = (uploaded as { id?: string }).id;
      // One page failing to upload must not silently renumber the rest, so
      // stop here and send the pages that did: the caller reports `shown`.
      if (!id) break;
      fileIds.push(id);
    }
    if (!fileIds.length) return null;

    const result: VisionPages = {
      fileIds,
      shown: fileIds.length,
      total,
      ...(total > fileIds.length ? { skipped: total - fileIds.length } : {}),
    };
    cache.set(key, result);
    console.log(
      `[document-vision] file="${filename}" rendered=${result.shown}/${result.total} scale=${VISION_RENDER_SCALE} ` +
      `~${result.shown * 646} vision tokens`,
    );
    return result;
  } catch (err) {
    console.error(`[document-vision] ${filename}: ${(err as Error).message} (non-fatal; the step is told the document could not be read)`);
    return null;
  }
}

/** What the step is told about pages it was shown rather than given as text. */
export function visionNote(v: VisionPages): string {
  return `This document has no text layer: ${v.shown} of its ${v.total} page${v.total === 1 ? "" : "s"} ` +
    `${v.shown === 1 ? "is" : "are"} attached as images for you to read.` +
    (v.skipped
      ? ` The remaining ${v.skipped} page${v.skipped === 1 ? " was" : "s were"} not shown: do not conclude anything about what they contain.`
      : "");
}

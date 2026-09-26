/**
 * Attaching a file to a message: the rules, without the React.
 *
 * Three ways in — the paperclip, a paste, and a drop from a file manager —
 * which all arrive as a FileList and all have to be told the same things: how
 * many files a message may carry, how big one may be, and what happens when
 * the answer is "no".
 */

/** What one message may carry. Matches MAX_PER_MESSAGE on the server. */
export const MAX_FILES = 5;

/** The platform's upload limit (see /api/files/config). */
export const MAX_BYTES = 25 * 1024 * 1024;

export interface Attachment {
  id: string;
  filename: string;
  kind: string | null;
  /** True while it is still uploading; a message can't be sent until it lands. */
  uploading?: boolean;
  /** Why it failed, if it did. */
  error?: string;
}

/** Bytes, in the units a person uses. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Which of these files can be taken, and what to say about the rest. Refusing
 * the whole drop because one file is too big would be the easy thing and the
 * wrong one: take what fits, say what didn't.
 */
export function sortIncoming(
  incoming: File[],
  alreadyAttached: number,
): { accepted: File[]; refusals: string[] } {
  const room = Math.max(0, MAX_FILES - alreadyAttached);
  const accepted: File[] = [];
  const refusals: string[] = [];

  for (const file of incoming) {
    if (file.size > MAX_BYTES) {
      refusals.push(`${file.name} is ${sizeLabel(file.size)}; the limit is ${sizeLabel(MAX_BYTES)}.`);
      continue;
    }
    if (file.size === 0) {
      refusals.push(`${file.name} is empty.`);
      continue;
    }
    if (accepted.length >= room) {
      refusals.push(`${file.name} wasn't attached: a message can carry ${MAX_FILES} files.`);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, refusals };
}

/** Files out of a drop or a paste; a folder drop yields nothing rather than an error. */
export function filesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const items = Array.from(data.items ?? []);
  if (items.length) {
    return items
      .filter((i) => i.kind === "file")
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
  }
  return Array.from(data.files ?? []);
}

/** The chip's label: the name, and what the reader made of it. */
export function chipLabel(a: Attachment): string {
  if (a.error) return `${a.filename} — ${a.error}`;
  if (a.uploading) return `${a.filename} — reading…`;
  return a.kind ? `${a.filename} · ${a.kind}` : a.filename;
}

/** A message with attachments still uploading isn't ready to send. */
export function readyToSend(text: string, attachments: Attachment[]): boolean {
  if (attachments.some((a) => a.uploading)) return false;
  const usable = attachments.filter((a) => !a.error);
  return text.trim().length > 0 || usable.length > 0;
}

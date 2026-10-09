/**
 * One spelling for a name a person will read.
 *
 * A name reaches us from a form, an API body, an LLM's team proposal and a
 * journey template, and any of those can carry stray whitespace. A live agent
 * is stored as "Hilti Campaign Audience Agent " -- found on 2026-10-09 -- and
 * that trailing space read as a double space everywhere a sentence put a word
 * after the name ("the Hilti Campaign Audience Agent  run from 12 min ago?").
 *
 * This is a normalisation, not a validation: it never rejects, and a name that
 * is nothing but whitespace becomes "" rather than an error, because deciding
 * whether a name is required belongs to whoever owns that form -- not here.
 *
 * Use it at BOTH ends. At the write boundary so new rows are clean, and at the
 * read, because the rows already saved are not going to be edited by hand.
 */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

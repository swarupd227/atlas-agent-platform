/**
 * Splits a line of model-written text into plain and **bold** runs.
 *
 * The result is made of strings, never markup: whoever renders it puts each run in the page as TEXT (React escapes it), so text
 * that happens to contain "<" stays text. (The outcome report used to turn **x** into <strong>x</strong> and write the whole line
 * into the page as HTML.) An unmatched "**" stays as it is.
 */
export interface InlineRun { text: string; bold: boolean }

export function splitBold(line: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const bold = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = bold.exec(line); m; m = bold.exec(line)) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), bold: false });
  return runs;
}

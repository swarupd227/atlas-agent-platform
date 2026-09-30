/**
 * How much room a step card needs on the team canvas.
 *
 * These lived next to the canvas that draws the cards, while the builder that
 * WRITES their positions carried its own numbers — and the two disagreed. The
 * builder packed every parallel worker into a fixed 600px band, so the spacing
 * shrank as the team grew: six workers got 100px each for a card that renders
 * 244px wide. On the live E&S Property Binding Orchestrator that put three
 * cards on top of each other, and at a 1024-wide viewport the buried one had
 * no clickable pixels at all — a step nobody could open, in a team nobody could
 * see was broken.
 *
 * So the width of the card and the spacing a layout must leave for it are one
 * fact, declared once. The invariant is simply COL_WIDTH >= NODE_WIDTH, and a
 * test holds it rather than a comment.
 */

/** The rendered width of a step card. */
export const NODE_WIDTH = 244;

/** Horizontal distance between steps. Never less than NODE_WIDTH. */
export const COL_WIDTH = 300;

/** Vertical distance between steps stacked in the same column. */
export const ROW_HEIGHT = 124;

/** Where the first column starts, leaving room for the trigger edge on the left. */
export const LAYOUT_ORIGIN_X = 150;

/** Where a single row of parallel steps sits. */
export const LAYOUT_ROW_Y = 220;

/**
 * Where the builder puts a worker step.
 *
 * Sequential work reads down a column, parallel work across a row — and across
 * a row it is spaced by COL_WIDTH rather than by dividing a fixed band, so a
 * team of twenty lays out as readably as a team of three. A wide row is easy to
 * read; overlapping cards are not, and the canvas fits the view to whatever it
 * is given.
 */
export function workerNodePosition(index: number, isSequential: boolean): { x: number; y: number } {
  return isSequential
    ? { x: 400, y: LAYOUT_ORIGIN_X + index * ROW_HEIGHT }
    : { x: LAYOUT_ORIGIN_X + index * COL_WIDTH, y: LAYOUT_ROW_Y };
}

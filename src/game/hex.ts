/*
 * The hive: 19 hexagonal cells in a honeycomb of radius 2 (rows of 3, 4, 5, 4, 3), pointy side up, in axial
 * coordinates (q, r). Cells are numbered row by row, top to bottom and left to right. The server numbers them the
 * same way (HiveBoard), and every mask in the game is a bit mask over these numbers.
 *
 * No DOM here: shared by the UI, the engines, the verifier and scripts/rtp-check.ts.
 */

export const CELL_COUNT = 19;
const RADIUS = 2;

export interface Cell {
  index: number;
  q: number;
  r: number;
}

export const CELLS: readonly Cell[] = (() => {
  const out: Cell[] = [];
  for (let r = -RADIUS; r <= RADIUS; r++) {
    for (let q = Math.max(-RADIUS, -RADIUS - r); q <= Math.min(RADIUS, RADIUS - r); q++) out.push({ index: out.length, q, r });
  }
  return out;
})();

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
] as const;

/** NEIGHBORS[i]: the cells touching cell i (3 to 6 of them), as a bit mask. */
export const NEIGHBORS: readonly number[] = CELLS.map(({ q, r }) =>
  DIRECTIONS.reduce((mask, [dq, dr]) => {
    const n = CELLS.findIndex((c) => c.q === q + dq && c.r === r + dr);
    return n < 0 ? mask : mask | (1 << n);
  }, 0),
);

export const ALL_CELLS = (1 << CELL_COUNT) - 1;

export function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

export const has = (mask: number, cell: number) => ((mask >>> cell) & 1) === 1;

export const maskOf = (cells: readonly number[]) => cells.reduce((m, c) => m | (1 << c), 0);

/** The cells in a mask, ascending. */
export function cellsOf(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) if (has(mask, i)) out.push(i);
  return out;
}

/** How many bees touch `cell`. */
export const clueAt = (cell: number, beeMask: number) => popcount(NEIGHBORS[cell] & beeMask);

/** Centre of a cell, for hexes of circumradius 1. */
export function cellCenter(c: Cell): { x: number; y: number } {
  return { x: Math.sqrt(3) * (c.q + c.r / 2), y: 1.5 * c.r };
}

/** Steps between two cells. */
export function hexDistance(a: number, b: number): number {
  const p = CELLS[a];
  const o = CELLS[b];
  return (Math.abs(p.q - o.q) + Math.abs(p.r - o.r) + Math.abs(p.q + p.r - o.q - o.r)) / 2;
}

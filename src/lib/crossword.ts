// Place words on a grid as an interlocking crossword puzzle.
//
// Algorithm:
//   1. Sort words by length desc, filter to length 3-8.
//   2. Place the longest word horizontally near the middle.
//   3. For each remaining word, find every position where it shares at least
//      one letter with an already-placed word at an intersection (running
//      perpendicular), without running flush against any other word on its
//      sides and without extending past either end into a filled cell.
//   4. Score by intersection count; place at the best-scoring slot. If no
//      slot is found after the candidate sweep, skip the word.
//   5. Fill remaining empty cells with BLACK.
//   6. Number cells scanning top-to-bottom, left-to-right: a cell gets a
//      number if it's the start of a >=2-letter across run OR a >=2-letter
//      down run.

export type Direction = 'across' | 'down';

export interface Cell {
  letter: string | null;
  black: boolean;
  number: number | null;
}

export interface Entry {
  number: number;
  clue: string;
  answer: string;
  direction: Direction;
  row: number;
  col: number;
}

export interface Crossword {
  cols: number;
  rows: number;
  cells: Cell[][];
  entries: Entry[];
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Placed {
  word: string;
  row: number;
  col: number;
  direction: Direction;
}

function emptyGrid(rows: number, cols: number): (string | null)[][] {
  return Array.from({ length: rows }, () =>
    new Array<string | null>(cols).fill(null),
  );
}

/** Returns the cell at (r,c) or null if out of bounds. */
function cellAt(grid: (string | null)[][], r: number, c: number, rows: number, cols: number) {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
  return grid[r][c];
}

/**
 * Try to place `word` starting at (row, col) in `direction`. Returns the
 * intersection count if valid (>=0), or -1 if the placement is illegal.
 *
 * Rules:
 *   - Stays in bounds.
 *   - Each cell either matches the existing letter (intersection) or is empty.
 *   - When a cell is empty, both perpendicular neighbors must also be empty
 *     (no flush touching another word on the side).
 *   - When a cell is an intersection, perpendicular neighbors are allowed
 *     to be filled (that's the crossing word).
 *   - The two cells immediately before and after the word along its
 *     direction must be empty (or out of bounds) — otherwise the word
 *     would extend an existing run.
 *   - At least one intersection required UNLESS this is the very first word
 *     (caller enforces that by accepting score==0 for the first placement).
 */
function evaluatePlacement(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  direction: Direction,
  rows: number,
  cols: number,
): number {
  const dr = direction === 'down' ? 1 : 0;
  const dc = direction === 'across' ? 1 : 0;
  // bounds (both start and end must be inside the grid)
  if (row < 0 || row >= rows || col < 0 || col >= cols) return -1;
  const endR = row + dr * (word.length - 1);
  const endC = col + dc * (word.length - 1);
  if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) return -1;

  // cell just before the word must be empty (or OOB)
  const beforeR = row - dr;
  const beforeC = col - dc;
  if (cellAt(grid, beforeR, beforeC, rows, cols)) return -1;
  // cell just after the word must be empty (or OOB)
  const afterR = endR + dr;
  const afterC = endC + dc;
  if (cellAt(grid, afterR, afterC, rows, cols)) return -1;

  let intersections = 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const existing = grid[r][c];
    if (existing != null) {
      if (existing !== word[i]) return -1;
      intersections++;
      // intersection cell — perpendicular neighbours can be filled (they
      // belong to the crossing word).
    } else {
      // perpendicular neighbours must be empty so we don't run flush
      const pr1 = r + dc; // perpendicular = swap dr/dc
      const pc1 = c + dr;
      const pr2 = r - dc;
      const pc2 = c - dr;
      if (cellAt(grid, pr1, pc1, rows, cols)) return -1;
      if (cellAt(grid, pr2, pc2, rows, cols)) return -1;
    }
  }
  return intersections;
}

function commit(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  direction: Direction,
) {
  const dr = direction === 'down' ? 1 : 0;
  const dc = direction === 'across' ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    grid[row + dr * i][col + dc * i] = word[i];
  }
}

function makeClue(theme: string, answer: string): string {
  const themeLabel = theme.trim().replace(/\b\w/g, (m) => m.toUpperCase());
  return `${themeLabel} — starts with ${answer[0]}, ${answer.length} letters`;
}

export function placeCrossword(
  words: string[],
  cols: number,
  rows: number,
  seed: number,
  theme: string = 'Theme',
): Crossword {
  const rng = mulberry32(seed || 1);

  // Clean + filter words.
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const raw of words) {
    const w = (raw || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (w.length < 3 || w.length > 8) continue;
    if (w.length > Math.min(cols, rows)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    candidates.push(w);
  }
  // Sort by length desc, with a tiny seeded jitter for tie-breaks.
  candidates.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return rng() - 0.5;
  });

  const grid = emptyGrid(rows, cols);
  const placed: Placed[] = [];

  if (candidates.length === 0) {
    return finalize(grid, placed, rows, cols, theme);
  }

  // 1) Place the longest word horizontally near the middle.
  const first = candidates.shift()!;
  const startRow = Math.floor(rows / 2);
  const startCol = Math.max(0, Math.floor((cols - first.length) / 2));
  commit(grid, first, startRow, startCol, 'across');
  placed.push({ word: first, row: startRow, col: startCol, direction: 'across' });

  // 2) Greedily place the rest.
  for (const word of candidates) {
    let bestScore = 0;
    const bestPositions: Placed[] = [];

    // For each already-placed word, try every potential intersection point.
    for (const p of placed) {
      const perp: Direction = p.direction === 'across' ? 'down' : 'across';
      const pdr = p.direction === 'down' ? 1 : 0;
      const pdc = p.direction === 'across' ? 1 : 0;
      for (let i = 0; i < p.word.length; i++) {
        const letter = p.word[i];
        const gridR = p.row + pdr * i;
        const gridC = p.col + pdc * i;
        // find every j in `word` that matches this letter
        for (let j = 0; j < word.length; j++) {
          if (word[j] !== letter) continue;
          // place `word` perpendicular so that word[j] sits at (gridR, gridC)
          const dr = perp === 'down' ? 1 : 0;
          const dc = perp === 'across' ? 1 : 0;
          const startR = gridR - dr * j;
          const startC = gridC - dc * j;
          const score = evaluatePlacement(grid, word, startR, startC, perp, rows, cols);
          if (score <= 0) continue;
          if (score > bestScore) {
            bestScore = score;
            bestPositions.length = 0;
            bestPositions.push({ word, row: startR, col: startC, direction: perp });
          } else if (score === bestScore) {
            bestPositions.push({ word, row: startR, col: startC, direction: perp });
          }
        }
      }
    }

    if (bestPositions.length === 0) continue;
    // Pick a deterministic random among the best-scoring positions.
    const pick = bestPositions[Math.floor(rng() * bestPositions.length)];
    commit(grid, pick.word, pick.row, pick.col, pick.direction);
    placed.push(pick);
  }

  return finalize(grid, placed, rows, cols, theme);
}

function finalize(
  grid: (string | null)[][],
  placed: Placed[],
  rows: number,
  cols: number,
  theme: string,
): Crossword {
  // Build cell matrix with black-fill for empty cells.
  const cells: Cell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      letter: grid[r][c],
      black: grid[r][c] == null,
      number: null as number | null,
    })),
  );

  // Number cells: scan top-to-bottom, left-to-right; assign a number if the
  // cell starts an across run (left neighbour is black/OOB AND right
  // neighbour is white — a 2+ letter run starting here) OR a down run.
  let nextNum = 1;
  const acrossStarts = new Map<string, number>(); // "r,c" -> number
  const downStarts = new Map<string, number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].black) continue;
      const leftBlack = c === 0 || cells[r][c - 1].black;
      const rightWhite = c + 1 < cols && !cells[r][c + 1].black;
      const startsAcross = leftBlack && rightWhite;
      const topBlack = r === 0 || cells[r - 1][c].black;
      const bottomWhite = r + 1 < rows && !cells[r + 1][c].black;
      const startsDown = topBlack && bottomWhite;
      if (startsAcross || startsDown) {
        cells[r][c].number = nextNum;
        if (startsAcross) acrossStarts.set(`${r},${c}`, nextNum);
        if (startsDown) downStarts.set(`${r},${c}`, nextNum);
        nextNum++;
      }
    }
  }

  // Build entries from `placed`, matching each placement to the numbered
  // start cell. (Every placed word starts at a numbered cell because its
  // preceding cell along its direction is empty/OOB.)
  const entries: Entry[] = [];
  for (const p of placed) {
    const key = `${p.row},${p.col}`;
    const num = p.direction === 'across' ? acrossStarts.get(key) : downStarts.get(key);
    if (num == null) continue; // shouldn't happen; defensive
    entries.push({
      number: num,
      clue: makeClue(theme, p.word),
      answer: p.word,
      direction: p.direction,
      row: p.row,
      col: p.col,
    });
  }
  entries.sort((a, b) => {
    if (a.number !== b.number) return a.number - b.number;
    return a.direction === 'across' ? -1 : 1;
  });

  return { cols, rows, cells, entries };
}

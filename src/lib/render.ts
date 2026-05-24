import type { Crossword, Entry } from './crossword';

export interface GridOpts {
  cell: number;
  x?: number;
  y?: number;
  ink?: string;
  line?: string;
  bg?: string;
  fontFamily?: string;
}

const DEFAULT_INK = '#0b1220';
const DEFAULT_LINE = '#0b1220';
const DEFAULT_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function gridPixelSize(crossword: Crossword, cell: number) {
  return {
    width: crossword.cols * cell,
    height: crossword.rows * cell,
  };
}

export function renderCrossword(
  ctx: CanvasRenderingContext2D,
  crossword: Crossword,
  opts: GridOpts & { answerKey?: boolean },
) {
  const cell = opts.cell;
  const ox = opts.x ?? 0;
  const oy = opts.y ?? 0;
  const ink = opts.ink ?? DEFAULT_INK;
  const line = opts.line ?? DEFAULT_LINE;
  const font = opts.fontFamily ?? DEFAULT_FONT;
  const { width, height } = gridPixelSize(crossword, cell);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox, oy, width, height);

  for (let r = 0; r < crossword.rows; r++) {
    for (let c = 0; c < crossword.cols; c++) {
      const cellData = crossword.cells[r][c];
      const x = ox + c * cell;
      const y = oy + r * cell;
      if (cellData.black) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  ctx.save();
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1, cell * 0.04);
  for (let r = 0; r < crossword.rows; r++) {
    for (let c = 0; c < crossword.cols; c++) {
      const x = ox + c * cell;
      const y = oy + r * cell;
      ctx.strokeRect(x, y, cell, cell);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1.5, cell * 0.08);
  ctx.strokeRect(ox, oy, width, height);
  ctx.restore();

  const numFs = Math.max(8, Math.round(cell * 0.3));
  const letterFs = Math.max(12, Math.round(cell * 0.55));
  for (let r = 0; r < crossword.rows; r++) {
    for (let c = 0; c < crossword.cols; c++) {
      const cellData = crossword.cells[r][c];
      if (cellData.black) continue;
      const x = ox + c * cell;
      const y = oy + r * cell;

      if (cellData.number != null) {
        ctx.fillStyle = ink;
        ctx.font = `bold ${numFs}px ${font}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(cellData.number), x + cell * 0.08, y + cell * 0.06);
      }

      if (opts.answerKey && cellData.letter) {
        ctx.fillStyle = ink;
        ctx.font = `bold ${letterFs}px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cellData.letter, x + cell / 2, y + cell * 0.6);
      }
    }
  }
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawClueColumn(
  ctx: CanvasRenderingContext2D,
  heading: string,
  entries: Entry[],
  x: number,
  y: number,
  width: number,
  fontSize: number,
  ink: string,
  font: string,
) {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.font = `bold ${Math.round(fontSize * 1.15)}px ${font}`;
  ctx.fillText(heading, x, y);
  let cursorY = y + Math.round(fontSize * 1.6);

  ctx.font = `${fontSize}px ${font}`;
  const lineHeight = Math.round(fontSize * 1.3);
  for (const e of entries) {
    const text = `${e.number}. ${e.clue}`;
    const lines = wrapLines(ctx, text, width);
    for (const ln of lines) {
      ctx.fillText(ln, x, cursorY);
      cursorY += lineHeight;
    }
    cursorY += Math.round(lineHeight * 0.2);
  }
  ctx.restore();
}

/** Render a self-contained crossword page (title + grid + clue lists) to a
 *  fresh white canvas suitable for PDF/PNG export. */
export function renderCrosswordPage(
  crossword: Crossword,
  cell: number,
  title: string,
  opts: { answerKey?: boolean; theme?: string } = {},
): HTMLCanvasElement {
  const { width: gw, height: gh } = gridPixelSize(crossword, cell);
  const titleH = Math.max(48, cell * 2.4);
  const padX = Math.round(cell * 0.6);
  const clueFs = Math.max(14, Math.round(cell * 0.4));

  const tmp = document.createElement('canvas').getContext('2d')!;
  tmp.font = `${clueFs}px ${DEFAULT_FONT}`;

  const acrossEntries = crossword.entries.filter((e) => e.direction === 'across');
  const downEntries = crossword.entries.filter((e) => e.direction === 'down');

  const pageWidth = Math.max(gw + padX * 2, cell * 14);
  const colGap = Math.round(cell * 0.4);
  const colWidth = Math.floor((pageWidth - padX * 2 - colGap) / 2);

  const countLines = (entries: Entry[]) => {
    let total = 0;
    for (const e of entries) {
      const text = `${e.number}. ${e.clue}`;
      total += wrapLines(tmp, text, colWidth).length;
    }
    return total;
  };

  const acrossLines = countLines(acrossEntries);
  const downLines = countLines(downEntries);
  const maxLines = Math.max(acrossLines, downLines);
  const lineH = Math.round(clueFs * 1.3);
  const headingH = Math.round(clueFs * 1.6);
  const perEntryGap = Math.round(lineH * 0.2);
  const maxEntries = Math.max(acrossEntries.length, downEntries.length);
  const clueBlockH =
    headingH +
    maxLines * lineH +
    maxEntries * perEntryGap +
    Math.round(cell * 0.8);

  const canvas = document.createElement('canvas');
  canvas.width = pageWidth;
  canvas.height = titleH + gh + clueBlockH + Math.round(cell * 0.6);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ts = Math.max(22, Math.min(40, cell * 1.4));
  ctx.fillStyle = DEFAULT_INK;
  ctx.font = `bold ${ts}px ${DEFAULT_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, canvas.width / 2, titleH * 0.55);

  const gx = Math.round((canvas.width - gw) / 2);
  const gy = titleH;
  renderCrossword(ctx, crossword, {
    cell,
    x: gx,
    y: gy,
    answerKey: opts.answerKey,
  });

  const clueY = titleH + gh + Math.round(cell * 0.6);
  const acrossX = padX;
  const downX = padX + colWidth + colGap;
  drawClueColumn(
    ctx,
    'Across',
    acrossEntries,
    acrossX,
    clueY,
    colWidth,
    clueFs,
    DEFAULT_INK,
    DEFAULT_FONT,
  );
  drawClueColumn(
    ctx,
    'Down',
    downEntries,
    downX,
    clueY,
    colWidth,
    clueFs,
    DEFAULT_INK,
    DEFAULT_FONT,
  );

  return canvas;
}

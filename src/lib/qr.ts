/**
 * Tiny QR encoder for the team code screen (docs/ONBOARDING.md, "Team code and QR").
 *
 * Byte mode, error correction level M, versions 1 to 4 only (up to 62 bytes).
 * Pure: no DOM, no Date, no Math.random. Renders through `qrSvgPath`.
 * Follows ISO/IEC 18004: finder and alignment patterns, timing, format info
 * (BCH 15,5), Reed-Solomon over GF(256) with 0x11D, mask chosen by penalty score.
 */

export interface QrMatrix {
  size: number;
  /** modules[row][col], true is dark. */
  modules: boolean[][];
  version: number;
  mask: number;
}

/** Per version: total codewords, EC codewords per block, number of blocks (level M). */
const VERSIONS: { total: number; ecPerBlock: number; blocks: number; align: number[] }[] = [
  { total: 26, ecPerBlock: 10, blocks: 1, align: [] },
  { total: 44, ecPerBlock: 16, blocks: 1, align: [6, 18] },
  { total: 70, ecPerBlock: 26, blocks: 1, align: [6, 22] },
  { total: 100, ecPerBlock: 18, blocks: 2, align: [6, 26] },
];

export const QR_MAX_BYTES = 62;

function dataCapacity(v: number): number {
  const spec = VERSIONS[v - 1];
  return spec.total - spec.ecPerBlock * spec.blocks;
}

/** Bytes that fit in a version at level M in byte mode (mode + count take 2 bytes). */
export function qrByteCapacity(version: number): number {
  return dataCapacity(version) - 2;
}

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

// ---------- GF(256) Reed-Solomon ----------

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

// ---------- Bit stream ----------

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function buildCodewords(bytes: number[], version: number): number[] {
  const capacity = dataCapacity(version);
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const b of bytes) appendBits(bits, b, 8);
  const capBits = capacity * 8;
  appendBits(bits, 0, Math.min(4, capBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) appendBits(bits, pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }

  const spec = VERSIONS[version - 1];
  const perBlock = capacity / spec.blocks;
  const divisor = rsDivisor(spec.ecPerBlock);
  const blocks: number[][] = [];
  const ecs: number[][] = [];
  for (let b = 0; b < spec.blocks; b++) {
    const chunk = data.slice(b * perBlock, (b + 1) * perBlock);
    blocks.push(chunk);
    ecs.push(rsRemainder(chunk, divisor));
  }
  const out: number[] = [];
  for (let i = 0; i < perBlock; i++) for (const blk of blocks) out.push(blk[i]);
  for (let i = 0; i < spec.ecPerBlock; i++) for (const ec of ecs) out.push(ec[i]);
  return out;
}

// ---------- Matrix ----------

class Grid {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];
  constructor(size: number) {
    this.size = size;
    this.modules = Array.from({ length: size }, () => new Array(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  }
  setFn(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }
}

function drawFinder(g: Grid, cx: number, cy: number) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < g.size && y >= 0 && y < g.size) g.setFn(x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(g: Grid, cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) g.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
}

function bit(n: number, i: number): boolean {
  return ((n >>> i) & 1) !== 0;
}

/** Level M format bits are 00; BCH(15,5) remainder, then the 0x5412 mask. */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(g: Grid, mask: number) {
  const bits = formatBits(mask);
  const s = g.size;
  for (let i = 0; i <= 5; i++) g.setFn(8, i, bit(bits, i));
  g.setFn(8, 7, bit(bits, 6));
  g.setFn(8, 8, bit(bits, 7));
  g.setFn(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) g.setFn(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) g.setFn(s - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) g.setFn(8, s - 15 + i, bit(bits, i));
  g.setFn(8, s - 8, true);
}

function drawFunctionPatterns(g: Grid, version: number) {
  const s = g.size;
  for (let i = 0; i < s; i++) {
    g.setFn(6, i, i % 2 === 0);
    g.setFn(i, 6, i % 2 === 0);
  }
  drawFinder(g, 3, 3);
  drawFinder(g, s - 4, 3);
  drawFinder(g, 3, s - 4);
  const align = VERSIONS[version - 1].align;
  for (const ax of align) {
    for (const ay of align) {
      const overlapsFinder = (ax === 6 && ay === 6) || (ax === 6 && ay === align[align.length - 1]) || (ay === 6 && ax === align[align.length - 1]);
      if (!overlapsFinder) drawAlignment(g, ax, ay);
    }
  }
  drawFormat(g, 0);
}

function drawCodewords(g: Grid, data: number[]) {
  const s = g.size;
  let i = 0;
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < s; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? s - 1 - vert : vert;
        if (!g.isFunction[y][x] && i < data.length * 8) {
          g.modules[y][x] = bit(data[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(g: Grid, mask: number) {
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.isFunction[y][x] && maskBit(mask, x, y)) g.modules[y][x] = !g.modules[y][x];
}

function finderPenalty(runs: number[]): number {
  const n = runs[6];
  const core = n > 0 && runs[2] === n && runs[3] === 3 * n && runs[4] === n && runs[5] === n;
  return (core && runs[1] >= 4 * n && runs[0] >= n ? 1 : 0) + (core && runs[5] >= 4 * n && runs[0] >= n ? 1 : 0);
}

function penalty(g: Grid): number {
  const s = g.size;
  let result = 0;
  const line = (get: (i: number) => boolean) => {
    let runColor = false;
    let runLen = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    const push = (len: number) => {
      history.pop();
      history.unshift(len);
    };
    for (let i = 0; i < s; i++) {
      const c = get(i);
      if (c === runColor) {
        runLen++;
        if (runLen === 5) result += 3;
        else if (runLen > 5) result += 1;
      } else {
        push(runLen);
        if (!runColor) result += finderPenalty(history) * 40;
        runColor = c;
        runLen = 1;
      }
    }
    push(runLen);
    if (runColor) push(0);
    result += finderPenalty(history) * 40;
  };
  for (let y = 0; y < s; y++) line((x) => g.modules[y][x]);
  for (let x = 0; x < s; x++) line((y) => g.modules[y][x]);
  for (let y = 0; y < s - 1; y++) {
    for (let x = 0; x < s - 1; x++) {
      const c = g.modules[y][x];
      if (c === g.modules[y][x + 1] && c === g.modules[y + 1][x] && c === g.modules[y + 1][x + 1]) result += 3;
    }
  }
  let dark = 0;
  for (const row of g.modules) for (const m of row) if (m) dark++;
  const total = s * s;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * 10;
  return result;
}

/** Encodes text in byte mode at level M. Returns null when it needs more than version 4. */
export function encodeQr(text: string): QrMatrix | null {
  const bytes = utf8(text);
  let version = 0;
  for (let v = 1; v <= 4; v++) {
    if (bytes.length <= qrByteCapacity(v)) {
      version = v;
      break;
    }
  }
  if (version === 0) return null;
  const size = 17 + 4 * version;
  const codewords = buildCodewords(bytes, version);

  let best: { mask: number; score: number; modules: boolean[][] } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const g = new Grid(size);
    drawFunctionPatterns(g, version);
    drawCodewords(g, codewords);
    drawFormat(g, mask);
    applyMask(g, mask);
    const score = penalty(g);
    if (!best || score < best.score) best = { mask, score, modules: g.modules.map((r) => r.slice()) };
  }
  if (!best) return null;
  return { size, modules: best.modules, version, mask: best.mask };
}

/** One SVG path for all dark modules, in module units, with a quiet zone of `margin` modules. */
export function qrSvgPath(matrix: QrMatrix, margin = 4): { path: string; viewBox: string } {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) parts.push(`M${x + margin} ${y + margin}h1v1h-1z`);
    }
  }
  const side = matrix.size + margin * 2;
  return { path: parts.join(""), viewBox: `0 0 ${side} ${side}` };
}

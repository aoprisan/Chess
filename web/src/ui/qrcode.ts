// Self-contained QR Code generator (byte mode, error-correction level M).
// A focused, dependency-free implementation of the ISO/IEC 18004 algorithm so
// the offline PWA can render a "scan to play" code without pulling in a
// library. Supports versions 1-10, which covers URLs up to ~180 bytes — far
// more than the game's share link needs.
//
// Usage: `qrMatrix('https://example.com/')` returns a square boolean[][] where
// `true` means a dark module. Callers add their own quiet zone / styling.

// --- Block structure for error-correction level M, versions 1-10 -----------
// Each version lists: EC codewords per block, and the block groups as
// [blockCount, dataCodewordsPerBlock]. Alignment-pattern centre coordinates
// come along for module placement.
interface VersionSpec {
  ec: number;
  groups: [number, number][];
  align: number[];
}

const VERSIONS: VersionSpec[] = [
  { ec: 10, groups: [[1, 16]], align: [] }, //           v1
  { ec: 16, groups: [[1, 28]], align: [6, 18] }, //      v2
  { ec: 26, groups: [[1, 44]], align: [6, 22] }, //      v3
  { ec: 18, groups: [[2, 32]], align: [6, 26] }, //      v4
  { ec: 24, groups: [[2, 43]], align: [6, 30] }, //      v5
  { ec: 16, groups: [[4, 27]], align: [6, 34] }, //      v6
  { ec: 18, groups: [[4, 31]], align: [6, 22, 38] }, //  v7
  { ec: 22, groups: [[2, 38], [2, 39]], align: [6, 24, 42] }, // v8
  { ec: 22, groups: [[3, 36], [2, 37]], align: [6, 26, 46] }, // v9
  { ec: 26, groups: [[4, 43], [1, 44]], align: [6, 28, 50] }, // v10
];

const PAD0 = 0xec;
const PAD1 = 0x11;

// --- GF(256) tables (primitive polynomial x^8 + x^4 + x^3 + x^2 + 1) --------
const EXP = new Array<number>(256);
const LOG = new Array<number>(256);
for (let i = 0; i < 8; i++) EXP[i] = 1 << i;
for (let i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
for (let i = 0; i < 255; i++) LOG[EXP[i]] = i;

function gexp(n: number): number {
  while (n < 0) n += 255;
  while (n >= 255) n -= 255;
  return EXP[n];
}

// Reed-Solomon generator polynomial of the given degree (all coeffs nonzero).
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let d = 0; d < degree; d++) {
    const next: number[] = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];
      next[i + 1] ^= gexp(LOG[poly[i]] + d);
    }
    poly = next;
  }
  return poly;
}

// EC codewords for a block via polynomial long division in GF(256).
function ecCodewords(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const res = data.concat(new Array<number>(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const lead = res[i];
    if (lead !== 0) {
      const lLead = LOG[lead];
      for (let j = 0; j < gen.length; j++) res[i + j] ^= gexp(LOG[gen[j]] + lLead);
    }
  }
  return res.slice(data.length);
}

// --- BCH codes for format / version information ----------------------------
function bchDigit(data: number): number {
  let digit = 0;
  while (data !== 0) {
    digit++;
    data >>>= 1;
  }
  return digit;
}

function bchTypeInfo(data: number): number {
  const G15 = 0x537;
  let d = data << 10;
  while (bchDigit(d) - bchDigit(G15) >= 0) d ^= G15 << (bchDigit(d) - bchDigit(G15));
  return ((data << 10) | d) ^ 0x5412;
}

function bchTypeNumber(data: number): number {
  const G18 = 0x1f25;
  let d = data << 12;
  while (bchDigit(d) - bchDigit(G18) >= 0) d ^= G18 << (bchDigit(d) - bchDigit(G18));
  return (data << 12) | d;
}

// --- Data encoding ---------------------------------------------------------
function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Pick the smallest supported version that fits and build interleaved codewords. */
function encode(text: string): { version: number; codewords: number[]; spec: VersionSpec } {
  const bytes = utf8Bytes(text);

  let vIdx = -1;
  for (let i = 0; i < VERSIONS.length; i++) {
    const dataCw = VERSIONS[i].groups.reduce((s, [c, d]) => s + c * d, 0);
    const ccBits = i + 1 <= 9 ? 8 : 16;
    const capacityBits = dataCw * 8 - 4 - ccBits;
    if (bytes.length * 8 <= capacityBits) {
      vIdx = i;
      break;
    }
  }
  if (vIdx < 0) throw new Error('QR: data too long for supported versions');

  const spec = VERSIONS[vIdx];
  const dataCw = spec.groups.reduce((s, [c, d]) => s + c * d, 0);
  const ccBits = vIdx + 1 <= 9 ? 8 : 16;

  // Assemble the bit stream: mode (byte=0100), length, payload.
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let b = len - 1; b >= 0; b--) bits.push((val >> b) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ccBits);
  for (const b of bytes) put(b, 8);

  const dataBits = dataCw * 8;
  put(0, Math.min(4, dataBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0); // byte-align

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }
  for (let pad = true; dataBytes.length < dataCw; pad = !pad) dataBytes.push(pad ? PAD0 : PAD1);

  // Split into blocks, compute EC, then interleave data-then-EC per spec.
  const blocks: { data: number[]; ec: number[] }[] = [];
  let pos = 0;
  for (const [count, dCount] of spec.groups) {
    for (let c = 0; c < count; c++) {
      const d = dataBytes.slice(pos, pos + dCount);
      pos += dCount;
      blocks.push({ data: d, ec: ecCodewords(d, spec.ec) });
    }
  }

  const codewords: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++)
    for (const b of blocks) if (i < b.data.length) codewords.push(b.data[i]);
  for (let i = 0; i < spec.ec; i++) for (const b of blocks) codewords.push(b.ec[i]);

  return { version: vIdx + 1, codewords, spec };
}

// --- Module placement ------------------------------------------------------
type Grid = (boolean | null)[][];

function maskFn(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return (((r * c) % 3) + ((r + c) % 2)) % 2 === 0;
  }
}

function placeFinder(g: Grid, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= g.length || cc < 0 || cc >= g.length) continue;
      const dark =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      g[rr][cc] = dark;
    }
  }
}

function buildMatrix(version: number, spec: VersionSpec, codewords: number[], mask: number): Grid {
  const size = version * 4 + 17;
  const g: Grid = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));

  // Finder patterns + separators (the light border is written by placeFinder).
  placeFinder(g, 0, 0);
  placeFinder(g, size - 7, 0);
  placeFinder(g, 0, size - 7);

  // Alignment patterns (skip any centre that lands on a finder).
  for (const ar of spec.align) {
    for (const ac of spec.align) {
      if (g[ar][ac] !== null) continue;
      for (let r = -2; r <= 2; r++)
        for (let c = -2; c <= 2; c++)
          g[ar + r][ac + c] = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    if (g[6][i] === null) g[6][i] = i % 2 === 0;
    if (g[i][6] === null) g[i][6] = i % 2 === 0;
  }

  // Reserve format-info cells (written for real after data placement).
  const reserveFormat = () => {
    for (let i = 0; i < 15; i++) {
      if (i < 6) g[i][8] = g[i][8] ?? false;
      else if (i < 8) g[i + 1][8] = g[i + 1][8] ?? false;
      else g[size - 15 + i][8] = g[size - 15 + i][8] ?? false;
      if (i < 8) g[8][size - 1 - i] = g[8][size - 1 - i] ?? false;
      else if (i < 9) g[8][15 - i] = g[8][15 - i] ?? false;
      else g[8][14 - i] = g[8][14 - i] ?? false;
    }
  };
  reserveFormat();

  // Fixed dark module.
  g[size - 8][8] = true;

  // Version information (versions 7+).
  if (version >= 7) {
    const bits = bchTypeNumber(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 8 - 3;
      g[a][b] = dark;
      g[b][a] = dark;
    }
  }

  // Data + EC bitstream, snaking up/down in two-column strips, masked.
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  const nextBit = (): boolean => {
    if (bitIndex >= totalBits) return false;
    const byte = codewords[bitIndex >> 3];
    const bit = (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit === 1;
  };

  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    const c0 = col === 6 ? col - 1 : col; // skip the vertical timing column
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const cc = c0 - dc;
        if (g[row][cc] !== null) continue;
        let dark = nextBit();
        if (maskFn(mask, row, cc)) dark = !dark;
        g[row][cc] = dark;
      }
    }
    upward = !upward;
  }

  // Write the real format information for this mask (EC level M = 0b00).
  const fmt = bchTypeInfo((0 << 3) | mask);
  for (let i = 0; i < 15; i++) {
    const dark = ((fmt >> i) & 1) === 1;
    if (i < 6) g[i][8] = dark;
    else if (i < 8) g[i + 1][8] = dark;
    else g[size - 15 + i][8] = dark;
    if (i < 8) g[8][size - 1 - i] = dark;
    else if (i < 9) g[8][15 - i] = dark;
    else g[8][14 - i] = dark;
  }

  return g;
}

// --- Mask penalty scoring (ISO/IEC 18004 §8.8.2) ---------------------------
function penalty(g: Grid): number {
  const n = g.length;
  const dark = (r: number, c: number) => g[r][c] === true;
  let score = 0;

  // Rule 1: runs of 5+ same-colour modules in a row/column.
  for (let r = 0; r < n; r++) {
    for (let dir = 0; dir < 2; dir++) {
      let run = 1;
      for (let c = 1; c < n; c++) {
        const prev = dir === 0 ? dark(r, c - 1) : dark(c - 1, r);
        const cur = dir === 0 ? dark(r, c) : dark(c, r);
        if (cur === prev) {
          run++;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) {
      const d = dark(r, c);
      if (d === dark(r + 1, c) && d === dark(r, c + 1) && d === dark(r + 1, c + 1)) score += 3;
    }

  // Rule 3: 1:1:3:1:1 finder-like patterns.
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < n; r++)
    for (let c = 0; c <= n - 11; c++) {
      let m1 = true;
      let m2 = true;
      for (let k = 0; k < 11; k++) {
        if (dark(r, c + k) !== pat1[k]) m1 = false;
        if (dark(r, c + k) !== pat2[k]) m2 = false;
      }
      if (m1 || m2) score += 40;
    }
  for (let c = 0; c < n; c++)
    for (let r = 0; r <= n - 11; r++) {
      let m1 = true;
      let m2 = true;
      for (let k = 0; k < 11; k++) {
        if (dark(r + k, c) !== pat1[k]) m1 = false;
        if (dark(r + k, c) !== pat2[k]) m2 = false;
      }
      if (m1 || m2) score += 40;
    }

  // Rule 4: overall dark/light balance.
  let darkCount = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) darkCount++;
  const ratio = Math.abs((darkCount * 100) / (n * n) - 50);
  score += Math.floor(ratio / 5) * 10;

  return score;
}

/**
 * Encode `text` into a QR Code (EC level M) and return the module matrix.
 * `true` = dark module. The best data mask is chosen by penalty scoring.
 */
export function qrMatrix(text: string): boolean[][] {
  const { version, codewords, spec } = encode(text);
  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = buildMatrix(version, spec, codewords, mask);
    const score = penalty(g);
    if (score < bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best!.map((row) => row.map((cell) => cell === true));
}

// Exposed for unit tests (known Reed-Solomon vectors). Not part of the public API.
export const _internals = { ecCodewords, encode };

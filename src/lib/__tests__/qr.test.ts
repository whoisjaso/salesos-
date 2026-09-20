import { describe, expect, it } from "vitest";
import { encodeQr, formatBits, qrByteCapacity, qrSvgPath } from "../qr";

function finderAt(m: boolean[][], cx: number, cy: number): boolean {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (m[cy + dy][cx + dx] !== (dist !== 2)) return false;
    }
  }
  return true;
}

describe("qr", () => {
  it("format information matches the published level M strings", () => {
    // ISO 18004 table C.1: M, mask 0 is 101010000010010; M, mask 1 is 101000100100101.
    expect(formatBits(0)).toBe(0b101010000010010);
    expect(formatBits(1)).toBe(0b101000100100101);
    expect(formatBits(5)).toBe(0b100000011001110);
    expect(formatBits(7)).toBe(0b100101010100000);
  });

  it("picks the smallest version that fits, up to 4", () => {
    expect(qrByteCapacity(1)).toBe(14);
    expect(qrByteCapacity(4)).toBe(62);
    expect(encodeQr("ABC123")?.version).toBe(1);
    expect(encodeQr("https://sales.example/join?code=ABC123")?.version).toBe(3);
    expect(encodeQr("x".repeat(62))?.version).toBe(4);
    expect(encodeQr("x".repeat(63))).toBeNull();
  });

  it("draws the three finders, the timing rows, and the dark module", () => {
    const q = encodeQr("https://sales.example/join?code=ABC123");
    expect(q).not.toBeNull();
    if (!q) return;
    expect(q.size).toBe(29);
    expect(finderAt(q.modules, 3, 3)).toBe(true);
    expect(finderAt(q.modules, q.size - 4, 3)).toBe(true);
    expect(finderAt(q.modules, 3, q.size - 4)).toBe(true);
    for (let i = 8; i < q.size - 8; i++) {
      expect(q.modules[6][i]).toBe(i % 2 === 0);
      expect(q.modules[i][6]).toBe(i % 2 === 0);
    }
    expect(q.modules[q.size - 8][8]).toBe(true);
    // Alignment pattern for version 3 is centred on (22, 22).
    expect(q.modules[22][22]).toBe(true);
    expect(q.modules[21][22]).toBe(false);
    expect(q.modules[20][22]).toBe(true);
  });

  it("is deterministic and renders a path", () => {
    const a = encodeQr("ABC123");
    const b = encodeQr("ABC123");
    expect(a).toEqual(b);
    if (!a) return;
    const svg = qrSvgPath(a);
    expect(svg.viewBox).toBe("0 0 29 29");
    expect(svg.path.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});

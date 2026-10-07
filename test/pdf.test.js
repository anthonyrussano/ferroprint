import { describe, expect, it } from 'vitest';
import { makePDF, deflate, pagePlace, A3 } from '../src/pdf.js';

const decode = async blob => new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));

describe('PDF', () => {
  it('writes a file whose cross-reference table points at each object', async () => {
    const data = await deflate(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]));
    const pdf = makePDF([
      { title: 'A-101 System overview', image: { w: 2, h: 2, data }, background: [0.1, 0.3, 0.5] },
      { title: 'A-102 Plan æøå', image: { w: 2, h: 2, data } }
    ], { title: 'Acme', date: new Date('2026-01-02T03:04:05Z') });
    const text = await decode(pdf), bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('/CreationDate (D:20260102030405Z)');
    const start = Number(text.match(/startxref\n(\d+)/)[1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const rows = text.slice(start).split('\n').slice(3).filter(r => / n $/.test(r));
    expect(rows.length).toBe(4 + 2 * 4);
    rows.forEach((row, i) => {
      const at = Number(row.slice(0, 10)), head = new TextDecoder('latin1').decode(bytes.slice(at, at + 12));
      expect(head.startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
  });

  it('fits a wide image on a landscape A3 page', () => {
    const p = pagePlace(3000, 2000);
    expect(p.pw).toBe(A3.long);
    expect(p.ph).toBe(A3.short);
    expect(p.w / p.h).toBeCloseTo(1.5);
    expect(p.x).toBeGreaterThanOrEqual(18);
  });

  it('fits a tall image on a portrait page', () => {
    expect(pagePlace(1000, 3000).pw).toBe(A3.short);
  });
});

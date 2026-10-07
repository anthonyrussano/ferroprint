// A small PDF writer: one image on each page, with an outline that names the pages.
// The images are RGB pixels in a zlib stream (FlateDecode), so the drawing stays sharp.

// A3 in points. A page turns to landscape when its image is wider than it is high.
export const A3 = { long: 1190.55, short: 841.89 };
const MARGIN = 18;

const enc = new TextEncoder();
const num = v => (Math.round(v * 100) / 100).toString();
// A PDF text string in UTF-16BE, so names with any letters show in the outline.
function text(s) {
  let hex = 'FEFF';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c > 0xffff) {
      const v = c - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else hex += c.toString(16).padStart(4, '0');
  }
  return `<${hex.toUpperCase()}>`;
}
const pdfDate = d => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;

// Compresses bytes into a zlib stream, which is the format that FlateDecode reads.
export async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The RGB bytes of a canvas, without the alpha channel.
export function rgbOf(canvas) {
  const { width: w, height: h } = canvas, px = canvas.getContext('2d').getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { out[j] = px[i]; out[j + 1] = px[i + 1]; out[j + 2] = px[i + 2]; }
  return out;
}

// The page size for an image, and the place of the image on the page, in points.
export function pagePlace(w, h) {
  const land = w >= h, pw = land ? A3.long : A3.short, ph = land ? A3.short : A3.long;
  const s = Math.min((pw - 2 * MARGIN) / w, (ph - 2 * MARGIN) / h);
  return { pw, ph, x: (pw - w * s) / 2, y: (ph - h * s) / 2, w: w * s, h: h * s };
}

// pages: [{ title, image: { w, h, data }, background: [r, g, b] }] with `data` already deflated.
// Returns the PDF file as a Blob.
export function makePDF(pages, info = {}) {
  const parts = [], offsets = [];
  let size = 0;
  const add = chunk => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); size += b.length; };
  const obj = (id, body, stream) => {
    offsets[id] = size;
    add(`${id} 0 obj\n${body}\n`);
    if (stream) { add('stream\n'); add(stream); add('\nendstream\n'); }
    add('endobj\n');
  };
  // Objects: 1 catalog, 2 pages, 3 outlines, 4 info, then 4 for each page: page, content, image, outline item.
  const base = i => 5 + i * 4;
  // The second line has bytes above 127, so file tools treat the file as binary.
  add('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R /Outlines 3 0 R /PageMode /UseOutlines >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${base(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  obj(3, pages.length ? `<< /Type /Outlines /First ${base(0) + 3} 0 R /Last ${base(pages.length - 1) + 3} 0 R /Count ${pages.length} >>` : '<< /Type /Outlines /Count 0 >>');
  const now = info.date || new Date();
  obj(4, `<< /Title ${text(info.title || 'Ferroprint')} /Producer ${text('Ferroprint')} /CreationDate (${pdfDate(now)}) >>`);
  pages.forEach((pg, i) => {
    const id = base(i), im = pg.image, at = pagePlace(im.w, im.h), [r, g, b] = pg.background || [1, 1, 1];
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(at.pw)} ${num(at.ph)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    const content = enc.encode(`${num(r)} ${num(g)} ${num(b)} rg 0 0 ${num(at.pw)} ${num(at.ph)} re f\nq ${num(at.w)} 0 0 ${num(at.h)} ${num(at.x)} ${num(at.y)} cm /Im0 Do Q\n`);
    obj(id + 1, `<< /Length ${content.length} >>`, content);
    obj(id + 2, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.data.length} >>`, im.data);
    const links = [i > 0 ? `/Prev ${base(i - 1) + 3} 0 R` : '', i < pages.length - 1 ? `/Next ${base(i + 1) + 3} 0 R` : ''].filter(Boolean).join(' ');
    obj(id + 3, `<< /Title ${text(pg.title || `Page ${i + 1}`)} /Parent 3 0 R ${links} /Dest [${id} 0 R /Fit] >>`);
  });
  const count = base(pages.length), xref = size;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  add(table);
  add(`trailer\n<< /Size ${count} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

// SVG and PNG export, and images on the clipboard. Each export draws its sheet off screen, so the
// view and the selection stay as they are, and any sheet can be drawn.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as F from '../engine.js';
import { renderNode, renderEdge } from '../draw.jsx';
import { loadCloud } from '../cloud.js';
import { logoSVG } from '../logo.jsx';
import { fontCSS } from '../fonts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// The largest side of a PNG, in pixels. Larger canvases fail in some browsers.
const MAX_PX = 8000;

// The shapes and connectors to draw. With `only`, the selected items and the shapes that their connectors join.
function pick(sheet, only) {
  if (!only) return { nodes: sheet.nodes, edges: sheet.edges };
  const ids = new Set(only);
  sheet.edges.forEach(e => { if (ids.has(e.id)) { ids.add(e.from); ids.add(e.to); } });
  const nodes = sheet.nodes.filter(n => ids.has(n.id));
  return { nodes, edges: sheet.edges.filter(e => ids.has(e.id) || (ids.has(e.from) && ids.has(e.to) && only.has(e.from) && only.has(e.to))) };
}

// Draws shapes and connectors into a detached element, and returns the SVG markup.
function drawMarkup(nodes, edges, ctx) {
  const map = Object.fromEntries(nodes.map(n => [n.id, n]));
  const host = document.createElement('div'), root = createRoot(host);
  const kids = [...nodes.filter(n => n.type === 'zone').map(n => renderNode(n, ctx)), ...edges.map(e => renderEdge(e, map, ctx, false)), ...nodes.filter(n => n.type !== 'zone').map(n => renderNode(n, ctx))];
  flushSync(() => root.render(createElement('svg', { xmlns: SVG_NS }, createElement('g', null, ...kids))));
  const g = host.querySelector('svg > g'), out = g ? new XMLSerializer().serializeToString(g) : '';
  root.unmount();
  return out;
}

export function svgToCanvas(r, scale) {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(scale, MAX_PX / Math.max(r.W, r.H)), c = document.createElement('canvas');
      c.width = Math.round(r.W * sc); c.height = Math.round(r.H * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      ok(c);
    };
    img.onerror = () => bad(new Error('The browser could not draw the SVG'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.str);
  });
}
const pngOf = c => new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('The PNG encoder returned no data'))), 'image/png'));

export const Exporter = Base => class extends Base {
  titleBlockSVG(x, y, w, hh, t, L, s, meta) {
    const c1 = 190, c2 = 286, r = hh / 3, d = this.state.doc, idx = d.sheets.findIndex(q => q.id === s.id);
    const ln = (a, b, cc, dd) => `<line x1="${a}" y1="${b}" x2="${cc}" y2="${dd}" stroke="${t.ink}" stroke-width="1"/>`;
    const cell = (cx, cy, label, val, n, mono) => `<text x="${cx + 6}" y="${cy + 9}" font-family="IBM Plex Mono, monospace" font-size="7" letter-spacing="0.8" fill="${t.muted}">${label}</text><text x="${cx + 6}" y="${cy + 22}" font-family="${F.esc(mono ? F.MONO : L.family)}" font-weight="${mono ? 400 : L.weight}" font-size="${mono ? 10 : 13}" letter-spacing="0.6" fill="${t.ink}">${F.esc(F.trunc(String(val || '—').toUpperCase(), n))}</text>`;
    let o = `<g><rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${t.paper}" stroke="${t.ink}" stroke-width="1.5"/>`;
    o += ln(x, y + r, x + w, y + r) + ln(x, y + 2 * r, x + w, y + 2 * r) + ln(x + c1, y, x + c1, y + hh) + ln(x + c2, y, x + c2, y + 2 * r) + ln(x + 95, y + 2 * r, x + 95, y + hh);
    o += cell(x, y, 'PROJECT', meta.project, 24) + cell(x + c1, y, 'DWG NO', s.number, 12, true) + cell(x + c2, y, 'REV', meta.rev, 12, true);
    o += cell(x, y + r, 'TITLE', s.name, 24) + cell(x + c1, y + r, 'SCALE', F.scaleLabel(s.unit, this.g()), 14, true) + cell(x + c2, y + r, 'SHEET', `${idx + 1} OF ${d.sheets.length}`, 12, true);
    o += cell(x, y + 2 * r, 'DRAWN BY', meta.drawnBy, 11) + cell(x + 95, y + 2 * r, 'DATE', meta.date, 12, true);
    o += logoSVG(x + c1 + (w - c1) / 2, y + 2 * r + r / 2, 12, t.ink, t.accent) + '</g>';
    return o;
  }
  // An SVG of a sheet. A full sheet has a border and a title block. With `only`, the SVG holds the selected items on plain paper.
  async buildSVG(s, only) {
    const { nodes, edges } = pick(s, only);
    await Promise.all(this.cloudsInUse(nodes).map(p => loadCloud(p).catch(() => null)));
    const ctx = this.drawCtx(s), t = ctx.t, L = ctx.L, g = this.g(), meta = this.state.doc.meta, sheet = !only;
    const b = F.bounds(nodes) || { x: 0, y: 0, w: 640, h: 400 };
    const pad = sheet ? 90 : 24, tbW = 380, tbH = 84;
    const W = Math.ceil(sheet ? Math.max(b.w + pad * 2, tbW + 160) : b.w + pad * 2), H = Math.ceil(b.h + pad * 2 + (sheet ? tbH : 0));
    const x0 = Math.floor(b.x + b.w / 2 - W / 2), y0 = Math.floor(b.y - pad);
    const content = drawMarkup(nodes, edges, ctx);
    const fonts = await fontCSS(L.id, this.fontCache);
    const frame = sheet
      ? `<rect x="${x0 + 10}" y="${y0 + 10}" width="${W - 20}" height="${H - 20}" fill="none" stroke="${t.ink}" stroke-width="2"/><rect x="${x0 + 16}" y="${y0 + 16}" width="${W - 32}" height="${H - 32}" fill="none" stroke="${t.ink}" stroke-width="1"/>`
        + this.titleBlockSVG(x0 + W - 16 - tbW, y0 + H - 16 - tbH, tbW, tbH, t, L, s, meta)
      : '';
    const str = `<svg xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="${x0} ${y0} ${W} ${H}"><defs><style><![CDATA[${fonts}]]></style>`
      + `<pattern id="ex-minor" width="${g}" height="${g}" patternUnits="userSpaceOnUse"><path d="M${g} 0 L0 0 0 ${g}" fill="none" stroke="${t.minor}" stroke-width="2"/></pattern>`
      + `<pattern id="ex-major" width="${g * 5}" height="${g * 5}" patternUnits="userSpaceOnUse"><path d="M${g * 5} 0 L0 0 0 ${g * 5}" fill="none" stroke="${t.major}" stroke-width="2"/></pattern>`
      + `<pattern id="fp-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="4" y1="0" x2="4" y2="8" stroke="${t.hatch}" stroke-width="1.5"/></pattern></defs>`
      + `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="${t.paper}"/><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="url(#ex-minor)"/><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="url(#ex-major)"/>`
      + frame + content + `</svg>`;
    return { str, W, H, name: `${s.number}-${F.slug(s.name)}` };
  }
  async exportImg(kind) {
    if (this._busy) return;
    this._busy = true;
    this.setState({ toast: { msg: `Exporting ${kind.toUpperCase()}…` } });
    clearTimeout(this._toastT);
    try {
      const r = await this.buildSVG(this.sheet());
      if (kind === 'svg') F.download(new Blob([r.str], { type: 'image/svg+xml' }), r.name + '.svg');
      else F.download(await pngOf(await svgToCanvas(r, 2)), r.name + '.png');
      this.flash(`Downloaded ${r.name}.${kind}`);
    } catch (err) {
      console.warn(err);
      this.flash('Export failed. Try SVG, or try again.', 4000);
    }
    this._busy = false;
  }
  // Copies the selection, or the whole sheet, to the clipboard as a PNG.
  copyImage() {
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem !== 'function') {
      this.flash('This browser cannot copy images. Use the PNG export.', 4000);
      return;
    }
    const s = this.sheet(), only = this.state.sel.length ? new Set(this.state.sel) : null;
    // Some browsers need the clipboard item at once, in the same event as the key press, so it takes a promise.
    const blob = this.buildSVG(s, only).then(r => svgToCanvas(r, 2)).then(pngOf);
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(
      () => this.flash(only ? 'Copied the selection as a PNG' : 'Copied the sheet as a PNG'),
      err => { console.warn(err); this.flash('Could not copy the image. Use the PNG export.', 4000); }
    );
  }
};

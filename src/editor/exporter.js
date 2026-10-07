// PNG and SVG export of the active sheet, with a title block.
import * as F from '../engine.js';
import { loadCloud } from '../cloud.js';
import { logoSVG } from '../logo.jsx';
import { fontCSS } from '../fonts.js';

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
  async buildSVG() {
    // Clear the selection first, so selected connectors are not exported in the accent color.
    await new Promise(r => this.setState({ sel: [], hover: null, temp: null, guides: [], marquee: null }, () => requestAnimationFrame(() => setTimeout(r, 30))));
    const s = this.sheet(), t = F.THEMES[this.state.mode], L = this.letter(), g = this.g(), meta = this.state.doc.meta;
    const b = F.bounds(s.nodes) || { x: 0, y: 0, w: 640, h: 400 };
    const pad = 90, tbW = 380, tbH = 84;
    const W = Math.ceil(Math.max(b.w + pad * 2, tbW + 160)), H = Math.ceil(b.h + pad * 2 + tbH);
    const x0 = Math.floor(b.x + b.w / 2 - W / 2), y0 = Math.floor(b.y - pad);
    const content = this.contentEl ? new XMLSerializer().serializeToString(this.contentEl) : '';
    const fonts = await fontCSS(L.id, this.fontCache);
    const tb = this.titleBlockSVG(x0 + W - 16 - tbW, y0 + H - 16 - tbH, tbW, tbH, t, L, s, meta);
    const str = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0} ${y0} ${W} ${H}"><defs><style><![CDATA[${fonts}]]></style>`
      + `<pattern id="ex-minor" width="${g}" height="${g}" patternUnits="userSpaceOnUse"><path d="M${g} 0 L0 0 0 ${g}" fill="none" stroke="${t.minor}" stroke-width="2"/></pattern>`
      + `<pattern id="ex-major" width="${g * 5}" height="${g * 5}" patternUnits="userSpaceOnUse"><path d="M${g * 5} 0 L0 0 0 ${g * 5}" fill="none" stroke="${t.major}" stroke-width="2"/></pattern>`
      + `<pattern id="fp-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="4" y1="0" x2="4" y2="8" stroke="${t.hatch}" stroke-width="1.5"/></pattern></defs>`
      + `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="${t.paper}"/><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="url(#ex-minor)"/><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="url(#ex-major)"/>`
      + `<rect x="${x0 + 10}" y="${y0 + 10}" width="${W - 20}" height="${H - 20}" fill="none" stroke="${t.ink}" stroke-width="2"/><rect x="${x0 + 16}" y="${y0 + 16}" width="${W - 32}" height="${H - 32}" fill="none" stroke="${t.ink}" stroke-width="1"/>`
      + content + tb + `</svg>`;
    return { str, W, H, name: `${s.number}-${F.slug(s.name)}` };
  }
  async exportImg(kind) {
    if (this._busy) return;
    this._busy = true;
    const sel = this.state.sel;
    await Promise.all(this.cloudsInUse(this.sheet().nodes).map(p => loadCloud(p).catch(() => null)));
    this.setState({ toast: { msg: `Exporting ${kind.toUpperCase()}…` } });
    clearTimeout(this._toastT);
    try {
      const r = await this.buildSVG();
      if (kind === 'svg') F.download(new Blob([r.str], { type: 'image/svg+xml' }), r.name + '.svg');
      else {
        const img = new Image();
        await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.str); });
        const sc = Math.min(2, 8000 / Math.max(r.W, r.H)), c = document.createElement('canvas');
        c.width = Math.round(r.W * sc); c.height = Math.round(r.H * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('The PNG encoder returned no data'))), 'image/png'));
        F.download(blob, r.name + '.png');
      }
      this.flash(`Downloaded ${r.name}.${kind}`);
    } catch (err) {
      console.warn(err);
      this.flash('Export failed. Try SVG, or try again.', 4000);
    }
    const live = new Set([...this.sheet().nodes.map(n => n.id), ...this.sheet().edges.map(x => x.id)]);
    this.setState({ sel: sel.filter(id => live.has(id)) });
    this._busy = false;
  }
};

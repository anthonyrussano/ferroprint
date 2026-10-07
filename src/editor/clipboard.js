// The system clipboard and drops onto the sheet: shapes between tabs and projects, images and text.
import * as F from '../engine.js';
import { without } from './util.js';

// Copied shapes go to the clipboard as JSON text with this type, so a paste in any tab can find them.
const CLIP_TYPE = 'ferroprint/shapes';
// The longest side of a pasted image, in pixels. A larger image is scaled down before it is stored.
const MAX_IMAGE_PX = 1600;
// The longest side of a new image shape on the sheet.
const MAX_IMAGE_SIZE = 480;
const MAX_TEXT = 4000;
// A browser that does not send clipboard events for the page gets the in-memory clipboard after this delay.
const KEY_FALLBACK_MS = 60;

const typing = e => {
  const el = e.target, tag = ((el && el.tagName) || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(el && el.isContentEditable);
};
// Text that the user selected on the page, for example in the help panel, copies as text.
const textSelected = () => {
  const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
  return !!(sel && !sel.isCollapsed && String(sel).trim());
};
const dataURL = blob => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(blob); });

// Reads an image file. A large image is scaled down and stored as WebP, or as PNG when the browser cannot write WebP.
export async function readImage(blob) {
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch { return null; }
  const sc = Math.min(1, MAX_IMAGE_PX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
  let out = blob;
  if (sc < 1 || blob.size > 400e3 || !/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    out = await new Promise(ok => c.toBlob(ok, 'image/webp', 0.86));
    if (!out || out.type !== 'image/webp') out = await new Promise(ok => c.toBlob(ok, 'image/png'));
  }
  if (bmp.close) bmp.close();
  return out ? { url: await dataURL(out), w, h } : null;
}

function parseClip(text) {
  if (!text || text[0] !== '{' || !text.includes(CLIP_TYPE)) return null;
  try {
    const raw = JSON.parse(text);
    if (!raw || raw.type !== CLIP_TYPE || !Array.isArray(raw.nodes)) return null;
    // The shapes go through the same checks as a file.
    const sh = F.cleanSheet({ nodes: raw.nodes, edges: Array.isArray(raw.edges) ? raw.edges : [] }, new Set(), 'A-101');
    const files = F.cleanFiles(raw.files, new Set(sh.nodes.filter(n => n.file).map(n => n.file)));
    return { nodes: sh.nodes.map(n => (n.file && !files[n.file] ? without(n, 'file') : n)), edges: sh.edges, files };
  } catch {
    return null;
  }
}

export const Clipboard = Base => class extends Base {
  // The selected shapes, the connectors between them, and the images they use.
  copy() {
    const s = this.sheet(), ids = new Set(this.state.sel), nodes = s.nodes.filter(n => ids.has(n.id));
    if (!nodes.length) return false;
    const nid = new Set(nodes.map(n => n.id)), all = this.state.doc.files || {}, files = {};
    nodes.forEach(n => { if (n.file && all[n.file]) files[n.file] = all[n.file]; });
    this.clip = JSON.parse(JSON.stringify({ nodes, edges: s.edges.filter(e => nid.has(e.from) && nid.has(e.to)), files }));
    this.pasteN = 0;
    return true;
  }
  paste(clip = this.clip) {
    if (!clip) return;
    if (clip !== this.clip) { this.clip = clip; this.pasteN = 0; }
    this.pasteN++;
    // A pasted group becomes a new group. Pasted shapes are not locked, so they can move into place.
    const off = this.g() * this.pasteN, map = {}, groups = {}, files = this.mergeFiles(clip.files);
    const nodes = clip.nodes.map(n => {
      const id = F.uid(), c = without({ ...n, id, x: n.x + off, y: n.y + off }, 'locked');
      map[n.id] = id;
      if (n.group) c.group = groups[n.group] || (groups[n.group] = F.uid());
      if (n.file) c.file = files.ids[n.file];
      return c;
    });
    const edges = clip.edges.map(e => ({ ...e, id: F.uid(), from: map[e.from], to: map[e.to], ...(e.pts ? { pts: F.shiftPts(e.pts, off, off) } : {}) }));
    this.pushHistory();
    this.setState(st => {
      const d = st.doc;
      return { doc: { ...d, ...(files.add ? { files: { ...(d.files || {}), ...files.add } } : {}), sheets: d.sheets.map(s => (s.id === d.active ? { ...s, nodes: [...s.nodes, ...nodes], edges: [...s.edges, ...edges] } : s)) } };
    });
    this.setState({ sel: [...nodes.map(n => n.id), ...edges.map(e => e.id)] });
  }
  duplicate() { if (this.copy()) this.paste(); }
  // Images from another project join this project's files. A file id that is in use for a different image gets a new id.
  mergeFiles(incoming) {
    const have = this.state.doc.files || {}, ids = {}, add = {};
    Object.entries(incoming || {}).forEach(([id, data]) => {
      if (have[id] === data) { ids[id] = id; return; }
      const nid = have[id] ? F.uid() : id;
      ids[id] = nid; add[nid] = data;
    });
    return { ids, add: Object.keys(add).length ? add : null };
  }

  // ---------- clipboard events
  // Copy and paste use the events of the page, so shapes, images and text can come from other tabs and apps.
  onCopy(e) {
    if (typing(e) || textSelected() || !this.copy()) return;
    this._clipEvent = true;
    e.preventDefault();
    this._clipText = JSON.stringify({ type: CLIP_TYPE, ...this.clip });
    e.clipboardData.setData('text/plain', this._clipText);
  }
  onCut(e) {
    if (typing(e) || textSelected()) return;
    this.onCopy(e);
    if (e.defaultPrevented) this.del();
  }
  onPaste(e) {
    if (typing(e) || !e.clipboardData) return;
    this._clipEvent = true;
    const dt = e.clipboardData, images = [...dt.files].filter(f => f.type.startsWith('image/'));
    e.preventDefault();
    if (images.length) { images.forEach((f, i) => this.addImage(f, null, i)); return; }
    const text = dt.getData('text/plain'), clip = parseClip(text);
    // A second paste of the same copy moves one more grid square down and to the right.
    if (clip) { this.paste(text === this._clipText && this.clip ? this.clip : clip); return; }
    if (text.trim()) { this.pasteText(text); return; }
    if (this.clip) this.paste();
  }
  // Ctrl C, X and V. If the browser sends no clipboard event, the shapes use the in-memory clipboard.
  clipKey(k) {
    this._clipEvent = false;
    if (textSelected()) return;
    if (k === 'c') this.copy();
    setTimeout(() => {
      if (this._clipEvent) return;
      if (k === 'x' && this.copy()) this.del();
      else if (k === 'v') this.paste();
    }, KEY_FALLBACK_MS);
  }
  // Mermaid text becomes a diagram. Other text becomes a text label.
  pasteText(text, at) {
    if (!this.importMermaid(text, true)) this.addText(text, at);
  }

  // ---------- drops
  onDragOver(e) {
    const types = [...(e.dataTransfer ? e.dataTransfer.types : [])];
    if (types.includes('Files') || types.includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  }
  onDrop(e) {
    const dt = e.dataTransfer;
    if (!dt) return;
    e.preventDefault();
    const p = this.toWorld(e.clientX, e.clientY), files = [...dt.files];
    if (files.length) {
      let i = 0;
      files.forEach(f => {
        if (f.type.startsWith('image/')) this.addImage(f, p, i++);
        else if (/\.(json|mmd|mermaid|md|txt)$/i.test(f.name) || f.type === 'application/json') this.readFile(f);
        else this.flash(`Ferroprint cannot open ${f.name}. Drop an image, a Ferroprint JSON file or a Mermaid file.`, 4000);
      });
      return;
    }
    const text = dt.getData('text/plain');
    if (text.trim()) this.pasteText(text, p);
  }

  // ---------- new shapes from the clipboard
  // The point for a pasted item: the pointer when it is on the sheet, or else the middle of the view.
  pastePoint() {
    const e = this._lastMove, r = this.canvasEl && this.canvasEl.getBoundingClientRect();
    if (e && r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return this.toWorld(e.clientX, e.clientY);
    return r ? this.toWorld(r.left + r.width / 2, r.top + r.height / 2) : { x: 0, y: 0 };
  }
  async addImage(file, at, i = 0) {
    const img = await readImage(file);
    if (!img) { this.flash('Could not read that image.', 4000); return; }
    const p = at || this.pastePoint(), sc = Math.min(1, MAX_IMAGE_SIZE / Math.max(img.w, img.h));
    const w = Math.max(20, Math.round(img.w * sc)), h = Math.max(20, Math.round(img.h * sc)), off = i * this.g();
    const n = { ...F.newNode('image', { x: this.sn(p.x - w / 2 + off), y: this.sn(p.y - h / 2 + off), w, h }), label: '', file: F.uid() };
    this.pushHistory();
    this.setState(st => {
      const d = st.doc;
      return { doc: { ...d, files: { ...(d.files || {}), [n.file]: img.url }, sheets: d.sheets.map(s => (s.id === d.active ? { ...s, nodes: [...s.nodes, n] } : s)) }, sel: [n.id], tool: 'select' };
    });
  }
  // Puts a new image into the selected image shape. The shape keeps its width and takes the height of the image.
  async setImage(id, file) {
    const img = await readImage(file);
    if (!img) { this.flash('Could not read that image.', 4000); return; }
    const fid = F.uid();
    this.pushHistory();
    this.setState(st => {
      const d = st.doc;
      return {
        doc: {
          ...d, files: { ...(d.files || {}), [fid]: img.url },
          sheets: d.sheets.map(s => (s.id === d.active ? { ...s, nodes: s.nodes.map(n => (n.id === id ? { ...n, file: fid, h: Math.max(20, Math.round((n.w * img.h) / img.w)) } : n)) } : s))
        }
      };
    });
  }
  addText(text, at) {
    const lines = text.replace(/\r\n?/g, '\n').trim().split('\n').slice(0, 60), label = lines.join('\n').slice(0, MAX_TEXT);
    const g = this.g(), longest = Math.max(...lines.map(l => l.length));
    const w = F.clamp(Math.ceil((longest * 9 + 30) / g) * g, 160, 560);
    const rows = lines.reduce((t, l) => t + Math.max(1, Math.ceil((l.length * 9) / (w - 20))), 0);
    const h = Math.ceil((rows * 22 + 18) / g) * g, p = at || this.pastePoint();
    const n = { ...F.newNode('text', { x: this.sn(p.x - w / 2), y: this.sn(p.y - h / 2), w, h }), label };
    this.pushHistory();
    this.setNodes(ns => [...ns, n]);
    this.setState({ sel: [n.id], tool: 'select' });
  }
};

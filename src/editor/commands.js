// Label editing, commands on the selection, and the keyboard.
import * as F from '../engine.js';
import { MOD } from '../chrome.jsx';
import { FRAME_INSET, RECENT_MAX, PIN_MAX, PALETTE_TOOLS, isLibraryTool, without } from './util.js';

// The items that each style applies to. A UML relation sets its own line and ends.
const STYLE = {
  dashed: { node: n => !F.NOLINE[n.type], edge: e => !e.rel },
  fill: { node: n => !F.NOFILL[n.type], edge: () => false },
  size: { node: n => !F.LABELLESS[n.type], edge: () => false },
  arrow: { node: n => n.type === 'line', edge: e => !e.rel },
  route: { node: () => false, edge: () => true }
};

export const Commands = Base => class extends Base {
  // ---------- label editing
  startEdit(kind, id, field = 'label') {
    const s = this.sheet(), it = (kind === 'node' ? s.nodes : s.edges).find(q => q.id === id);
    if (it) this.setState({ editing: { kind, id, field, value: it[field] || '' }, sel: [id] });
  }
  commitEdit() {
    const ed = this.state.editing;
    if (!ed || this._done === ed) return;
    this._done = ed;
    this.setState({ editing: null });
    const s = this.sheet();
    if (ed.kind === 'node') {
      const n = s.nodes.find(q => q.id === ed.id);
      if (!n) return;
      // An empty text label has no purpose, so it is removed.
      const field = ed.field || 'label';
      if (n.type === 'text' && !ed.value.trim()) { this.setNodes(a => a.filter(q => q.id !== n.id)); this.setState({ sel: [] }); return; }
      if ((n[field] || '') !== ed.value) { this.pushHistory(); this.setNodes(a => a.map(q => (q.id === n.id ? { ...q, [field]: ed.value } : q))); }
    } else {
      const x = s.edges.find(q => q.id === ed.id);
      if (x && x.label !== ed.value) { this.pushHistory(); this.setEdges(a => a.map(q => (q.id === x.id ? { ...q, label: ed.value } : q))); }
    }
  }
  cancelEdit() {
    const ed = this.state.editing;
    if (!ed) return;
    this._done = ed;
    this.setState({ editing: null });
    const n = ed.kind === 'node' && this.sheet().nodes.find(q => q.id === ed.id);
    if (n && n.type === 'text' && !n.label) this.setNodes(a => a.filter(q => q.id !== n.id));
  }

  // ---------- commands
  del() {
    const locked = new Set(this.sheet().nodes.filter(n => n.locked).map(n => n.id));
    const ids = new Set(this.state.sel.filter(id => !locked.has(id)));
    if (!ids.size) {
      if (this.state.sel.length) this.flash('A locked shape cannot be deleted. Unlock it first.', 3000);
      return;
    }
    this.pushHistory();
    this.updSheet(s => ({ nodes: s.nodes.filter(n => !ids.has(n.id)), edges: s.edges.filter(e => !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to)) }));
    this.setState({ sel: [] });
  }
  wrapZone() {
    const s = this.sheet(), ids = new Set(this.state.sel), ns = s.nodes.filter(n => ids.has(n.id));
    if (!ns.length) return;
    const b = F.bounds(ns), g = this.g();
    const z = F.newNode('zone', { x: this.sn(b.x - 2 * g), y: this.sn(b.y - 3 * g), w: 0, h: 0 });
    z.w = this.sn(b.x + b.w + 2 * g) - z.x; z.h = this.sn(b.y + b.h + 2 * g) - z.y;
    this.pushHistory();
    this.setNodes(a => [z, ...a]);
    this.setState({ sel: [z.id] });
  }
  align(kind) {
    const s = this.sheet(), ids = new Set(this.state.sel), ns = s.nodes.filter(n => ids.has(n.id) && !n.locked);
    if (ns.length < 2) return;
    const b = F.plainBounds(ns);
    const fn = {
      left: () => ({ x: b.x }), center: n => ({ x: Math.round(b.x + b.w / 2 - n.w / 2) }), right: n => ({ x: b.x + b.w - n.w }),
      top: () => ({ y: b.y }), middle: n => ({ y: Math.round(b.y + b.h / 2 - n.h / 2) }), bottom: n => ({ y: b.y + b.h - n.h })
    }[kind];
    this.pushHistory();
    this.setNodes(a => a.map(n => (ids.has(n.id) && !n.locked ? { ...n, ...fn(n) } : n)));
  }
  distribute(axis) {
    const s = this.sheet(), ids = new Set(this.state.sel), ns = s.nodes.filter(n => ids.has(n.id) && !n.locked);
    if (ns.length < 3) return;
    const P = axis === 'x' ? 'x' : 'y', S = axis === 'x' ? 'w' : 'h';
    const sorted = ns.slice().sort((a, b) => a[P] - b[P]);
    const span = sorted[sorted.length - 1][P] + sorted[sorted.length - 1][S] - sorted[0][P];
    const gap = (span - sorted.reduce((t, n) => t + n[S], 0)) / (sorted.length - 1);
    const pos = {};
    let cur = sorted[0][P];
    sorted.forEach(n => { pos[n.id] = Math.round(cur); cur += n[S] + gap; });
    this.pushHistory();
    this.setNodes(a => a.map(n => (pos[n.id] != null ? { ...n, [P]: pos[n.id] } : n)));
  }
  // Moves the selected shapes to the top or the bottom of the drawing order. They keep their order among themselves.
  arrange(front) {
    const ids = new Set(this.state.sel);
    if (!this.sheet().nodes.some(n => ids.has(n.id))) return;
    this.pushHistory();
    this.setNodes(a => { const picked = a.filter(q => ids.has(q.id)), rest = a.filter(q => !ids.has(q.id)); return front ? [...rest, ...picked] : [...picked, ...rest]; });
  }
  // Sets one style on every selected item that has the style, in one undo step.
  styleSel(field, value) {
    const ids = new Set(this.state.sel), ok = STYLE[field];
    const put = x => (field === 'arrow' && value === 'none' && x.type ? without(x, 'arrow') : { ...x, [field]: value });
    this.pushHistory();
    this.updSheet(s => ({
      nodes: s.nodes.map(n => (ids.has(n.id) && ok.node(n) ? put(n) : n)),
      edges: s.edges.map(e => (ids.has(e.id) && ok.edge(e) ? put(e) : e))
    }));
  }
  reverseLine() {
    const id = this.state.sel[0];
    this.pushHistory();
    this.setNodes(a => a.map(n => (n.id === id && n.type === 'line' ? { ...n, pts: [...n.pts].reverse() } : n)));
  }
  setTool(id) { this.setState({ tool: id, temp: null, hover: null }); }
  // The default box of a shape, centered on a point and snapped to the grid.
  placeRect(shape, p) { const sz = F.toolShape(shape); return { x: this.sn(p.x - sz.w / 2), y: this.sn(p.y - sz.h / 2), w: sz.w, h: sz.h }; }
  // The palette keeps the last library symbols at hand. Symbols that the palette always shows stay out of the list.
  withRecent(id) {
    const r = this.state.recent;
    return !isLibraryTool(id) || PALETTE_TOOLS.has(id) ? r : [id, ...r.filter(x => x !== id)].slice(0, RECENT_MAX);
  }
  togglePin(id) {
    const pins = this.state.pins;
    if (pins.includes(id)) this.setState({ pins: pins.filter(x => x !== id) });
    else if (pins.length >= PIN_MAX) this.flash(`The toolbar holds ${PIN_MAX} pinned shapes. Unpin one first.`, 4000);
    else this.setState({ pins: [...pins, id] });
  }
  pickSymbol(id) {
    this.setState(st => ({ tool: id, temp: null, hover: null, recent: this.withRecent(id), panel: st.win.w < 640 ? null : st.panel }));
  }
  // A drag from a library tile. A short move without a drop stays a click, which picks the tool.
  startPlace(id, e) { this.drag = { type: 'place', shape: id, sx: e.clientX, sy: e.clientY, started: false }; }
  turnSelection(fn) {
    const ids = new Set(this.state.sel), s = this.sheet();
    const turns = n => ids.has(n.id) && F.TURN[n.type] && !n.locked;
    if (!s.nodes.some(turns)) return;
    this.pushHistory();
    this.setNodes(a => a.map(n => (turns(n) ? fn(n) : n)));
  }
  groupSel() {
    const ids = new Set(this.state.sel), ns = this.sheet().nodes.filter(n => ids.has(n.id));
    if (ns.length < 2) { this.flash('Select two or more shapes to group them.', 3000); return; }
    const gid = F.uid();
    this.pushHistory();
    this.setNodes(a => a.map(n => (ids.has(n.id) ? { ...n, group: gid } : n)));
  }
  ungroupSel() {
    const ids = new Set(this.state.sel), groups = new Set(this.sheet().nodes.filter(n => ids.has(n.id) && n.group).map(n => n.group));
    if (!groups.size) return;
    this.pushHistory();
    this.setNodes(a => a.map(n => (n.group && groups.has(n.group) ? without(n, 'group') : n)));
  }
  // Locks the selection, or unlocks it when every selected shape is locked.
  lockSel() {
    const ids = new Set(this.state.sel), ns = this.sheet().nodes.filter(n => ids.has(n.id));
    if (!ns.length) return;
    const lock = ns.some(n => !n.locked);
    this.pushHistory();
    this.setNodes(a => a.map(n => (ids.has(n.id) ? (lock ? { ...n, locked: true } : without(n, 'locked')) : n)));
    this.flash(lock ? 'Locked. A locked shape does not move. Click it to select it again.' : 'Unlocked', 3000);
  }
  setEdgeSides(id, patch) {
    this.pushHistory();
    this.setEdges(a => a.map(x => {
      if (x.id !== id) return x;
      let y = { ...x, ...patch };
      // A new side starts at its middle.
      if ('fromSide' in patch) y = without(y, 'fromAt');
      if ('toSide' in patch) y = without(y, 'toAt');
      ['fromSide', 'toSide'].forEach(key => { if (y[key] === 'auto') y = without(y, key); });
      return y;
    }));
  }
  // Removes the bends of every selected connector, so each one routes itself again.
  straightenSel() {
    const ids = new Set(this.state.sel);
    if (!this.sheet().edges.some(x => ids.has(x.id) && x.pts)) return;
    this.pushHistory();
    this.setEdges(a => a.map(x => (ids.has(x.id) && x.pts ? without(x, 'pts') : x)));
  }
  clearBends(id) { this.pushHistory(); this.setEdges(a => a.map(x => (x.id === id ? without(x, 'pts') : x))); }
  rotateSel() { this.turnSelection(F.rotateNode); }
  flipSel() { this.turnSelection(n => ({ ...n, flip: !n.flip })); }
  togglePanel(name) { this.setState(st => ({ panel: st.panel === name ? null : name })); }
  // Clean mode shows only the tool palette and the drawing. The sheet grows to the window edge, so every
  // view moves by the frame inset, and the drawing stays in the same place on the screen.
  toggleClean() {
    const clean = !this.state.clean, dx = clean ? FRAME_INSET : -FRAME_INSET;
    this.setState(st => ({
      clean,
      panel: st.panel === 'library' || st.panel === 'incoming' ? st.panel : null,
      doc: { ...st.doc, sheets: st.doc.sheets.map(sh => (sh.view ? { ...sh, view: { ...sh.view, x: sh.view.x + dx, y: sh.view.y + dx } } : sh)) }
    }));
    if (clean) this.flash(`Clean mode is on. To show everything again, press ${MOD}\\ or use SHOW ALL.`, 4000);
    else { clearTimeout(this._toastT); this.setState({ toast: null }); }
  }
  openFile() { if (this.fileRef.current) this.fileRef.current.click(); }

  onKey(e) {
    const tag = ((e.target && e.target.tagName) || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
    const mod = e.metaKey || e.ctrlKey, k = (e.key || '').toLowerCase();
    if (mod && !e.altKey && k === 's') { e.preventDefault(); if (typing) e.target.blur(); this.saveNow(); return; }
    if (mod && !e.altKey && k === 'o') { e.preventDefault(); this.openFile(); return; }
    if (typing) return;
    if (e.key === ' ') { e.preventDefault(); if (!this.state.space) this.setState({ space: true }); return; }
    if (mod) {
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) this.doRedo(); else this.doUndo(); }
      else if (k === 'y') { e.preventDefault(); this.doRedo(); }
      else if (k === 'c' || k === 'x' || k === 'v') this.clipKey(k);
      else if (k === 'd') { e.preventDefault(); this.duplicate(); }
      else if (k === 'a') { e.preventDefault(); const s = this.sheet(); this.setState({ sel: [...s.nodes.filter(n => !n.locked).map(n => n.id), ...s.edges.map(x => x.id)] }); }
      else if (e.code === 'KeyG') { e.preventDefault(); if (e.altKey) this.wrapZone(); else if (e.shiftKey) this.ungroupSel(); else this.groupSel(); }
      else if (e.code === 'KeyL' && e.shiftKey) { e.preventDefault(); this.lockSel(); }
      else if (e.code === 'Backslash' || k === '\\') { e.preventDefault(); this.toggleClean(); }
      return;
    }
    if (k === 'delete' || k === 'backspace') { if (this.state.sel.length) { e.preventDefault(); this.del(); } return; }
    if (k === 'escape') {
      this.drag = null;
      this.setState({ sel: [], tool: 'select', panel: null, incoming: null, share: null, temp: null, draft: null, marquee: null, guides: [], ghost: null, panning: false, delArm: false });
      return;
    }
    if (e.key === '?') { this.togglePanel('help'); return; }
    if (e.key === '/') { e.preventDefault(); this.setState({ panel: 'library' }); return; }
    if (e.shiftKey && !e.altKey && k === 'c') { this.copyImage(); return; }
    if (e.shiftKey && !e.altKey && k === 'r') { this.rotateSel(); return; }
    if (e.shiftKey && !e.altKey && k === 'h') { this.flipSel(); return; }
    if (k === 'enter') {
      if (this.state.sel.length !== 1) return;
      const id = this.state.sel[0], s = this.sheet();
      if (s.edges.some(x => x.id === id)) this.startEdit('edge', id);
      else { const n = s.nodes.find(q => q.id === id); if (n && !F.LABELLESS[n.type]) this.startEdit('node', id); }
      e.preventDefault();
      return;
    }
    const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
    if (dir) {
      if (!this.state.sel.length) return;
      e.preventDefault();
      const step = e.shiftKey ? this.g() : 1, dx = dir[0] * step, dy = dir[1] * step;
      const moves = new Set(this.sheet().nodes.filter(n => !n.locked && this.state.sel.includes(n.id)).map(n => n.id));
      if (!moves.size) return;
      this.pushHistory('nudge');
      this.updSheet(sh => ({
        nodes: sh.nodes.map(n => (moves.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
        edges: sh.edges.map(x => (x.pts && moves.has(x.from) && moves.has(x.to) ? { ...x, pts: F.shiftPts(x.pts, dx, dy) } : x))
      }));
      return;
    }
    if (e.shiftKey && e.code === 'Digit1') { this.fit(); return; }
    if (e.shiftKey && e.code === 'Digit0') { this.zoomCenter(1 / this.view().k); return; }
    if (k === '=' || k === '+') { this.zoomCenter(1.2); return; }
    if (k === '-' || k === '_') { this.zoomCenter(1 / 1.2); return; }
    if (!e.shiftKey && !e.altKey && F.KEYS[k]) this.setTool(F.KEYS[k]);
  }
  onKeyUp(e) { if (e.key === ' ' && this.state.space) this.setState({ space: false }); }
};

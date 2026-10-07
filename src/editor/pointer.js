// Pointer input: pan, zoom, select, move, resize, connect, draw and double-click.
import { flushSync } from 'react-dom';
import * as F from '../engine.js';
import { without } from './util.js';

export const Pointer = Base => class extends Base {
  // ---------- view
  fit() { const v = this.fitView(); if (v) this.setView(v); }
  zoomAt(f, sx, sy) { const v = this.view(), k = F.clamp(v.k * f, 0.15, 4), r = k / v.k; this.setView({ k, x: sx - (sx - v.x) * r, y: sy - (sy - v.y) * r }); }
  zoomCenter(f) { const { w, h } = this.measure(); this.zoomAt(f, w / 2, h / 2); }

  setCanvas(el) {
    if (el === this.canvasEl) return;
    if (this.canvasEl) this.canvasEl.removeEventListener('wheel', this.onWheel);
    if (this.ro) { this.ro.disconnect(); this.ro = null; }
    this.canvasEl = el;
    if (el) {
      el.addEventListener('wheel', this.onWheel, { passive: false });
      this.ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); this.setState({ size: { w: r.width, h: r.height } }); });
      this.ro.observe(el);
    }
  }
  setContent(el) { this.contentEl = el; }
  onWheel(e) {
    e.preventDefault();
    const r = this.canvasEl.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1, dx = e.deltaX * m, dy = e.deltaY * m;
    if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-F.clamp(dy, -25, 25) * 0.01), sx, sy);
    else { const v = this.view(); this.setView({ ...v, x: v.x - (e.shiftKey && !dx ? dy : dx), y: v.y - (e.shiftKey && !dx ? 0 : dy) }); }
  }
  onResize() { this.setState({ win: { w: window.innerWidth, h: window.innerHeight } }); }
  onBlurWin() { if (this.state.space) this.setState({ space: false }); }

  // The shape under point p. `connect` leaves out lines and freehand strokes, which a connector cannot join.
  hoverAt(p, exclude, tight, connect) {
    const s = this.sheet(), k = this.view().k, pad = (tight ? 4 : 22) / k, ns = s.nodes;
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (n.type === 'zone' || n.id === exclude || (connect && (n.type === 'line' || n.type === 'path'))) continue;
      const b = F.hitBox(n);
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) return n.id;
    }
    // A zone is only a target near its border, so shapes inside it stay reachable.
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (n.type !== 'zone' || n.id === exclude) continue;
      const bp = 10 / k;
      const out = p.x >= n.x - pad && p.x <= n.x + n.w + pad && p.y >= n.y - pad && p.y <= n.y + n.h + pad;
      const inn = p.x > n.x + bp && p.x < n.x + n.w - bp && p.y > n.y + 28 && p.y < n.y + n.h - bp;
      if (out && !inn) return n.id;
    }
    return null;
  }

  // ---------- pointer
  onDown(e) {
    if (e.button === 2) return;
    if (e.pointerType === 'touch') {
      // Stop the emulated mouse events, so a tap cannot focus a panel that opens under the finger.
      e.preventDefault();
      if (e.isPrimary) { this.pointers.clear(); this._tap = { x: e.clientX, y: e.clientY, t: Date.now() }; }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) { this.startPinch(); return; }
      if (this.pointers.size > 2) return;
    }
    const ae = document.activeElement;
    if (ae && ae !== document.body && !this.canvasEl.contains(ae)) ae.blur();
    if (this.state.editing) this.commitEdit();
    if (this.state.delArm) this.setState({ delArm: false });
    const p = this.toWorld(e.clientX, e.clientY);
    const tg = e.target && e.target.closest ? e.target.closest('[data-k]') : null;
    const kind = tg ? tg.getAttribute('data-k') : null, id = tg ? tg.getAttribute('data-id') : null;
    const { tool, space } = this.state;
    try { this.canvasEl.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    if (e.button === 1 || tool === 'hand' || space) { e.preventDefault(); this.drag = { type: 'pan', cx: e.clientX, cy: e.clientY, v0: this.view() }; this.setState({ panning: true }); return; }
    if (F.toolShape(tool)) { this.drag = { type: 'create', shape: tool, start: p, zone: F.toolShape(tool).type === 'zone' }; return; }
    if (tool === 'pen') { this.drag = { type: 'pen', pts: [p] }; this.setState({ sel: [] }); return; }
    if (tool === 'line' || tool === 'arrow') { this.drag = { type: 'line', arrow: tool === 'arrow', start: { x: this.sn(p.x), y: this.sn(p.y) } }; this.setState({ sel: [] }); return; }
    if (kind === 'end') {
      // An end handle of the selected connector moves that end to a different shape or side.
      const ed = this.sheet().edges.find(x => x.id === id), end = Number(tg.getAttribute('data-i'));
      if (ed) this.drag = { type: 'reconnect', id, end, fixed: end ? ed.from : ed.to, fixedSide: end ? ed.fromSide : ed.toSide, start: p, moved: false };
      return;
    }
    if (kind === 'port' || tool === 'connector') {
      // A drag from a port fixes the side where the connector leaves the shape.
      const from = kind === 'port' || kind === 'node' ? id : this.hoverAt(p, null, true, true);
      const fromSide = kind === 'port' ? tg.getAttribute('data-side') : null;
      if (from) { this.drag = { type: 'connect', from, fromSide }; this.setState({ temp: { from, fromSide, p, target: null }, sel: [] }); }
      return;
    }
    if (kind === 'wp' || kind === 'wpadd') {
      // A bend handle moves a bend. A handle between bends adds one when the drag starts.
      this.drag = { type: kind, id, i: Number(tg.getAttribute('data-i')), start: p, moved: false };
      return;
    }
    if (kind === 'handle') {
      const n = this.sheet().nodes.find(q => q.id === id);
      if (!n) return;
      this.pushHistory(); this.drag = { type: 'resize', handle: tg.getAttribute('data-h'), orig: { ...n } };
      return;
    }
    if (kind === 'node') {
      const n = this.sheet().nodes.find(q => q.id === id), deep = e.metaKey || e.ctrlKey;
      // A locked shape lets the pointer through: a drag draws a selection box, and a click selects the shape.
      if (n && n.locked && !deep) {
        this.drag = { type: 'marquee', start: p, base: e.shiftKey ? this.state.sel : [], click: id, moved: false };
        if (!e.shiftKey) this.setState({ sel: [] });
        return;
      }
      // A click selects the whole group. With Ctrl or ⌘, it selects one shape inside the group.
      const pick = deep ? [id] : this.expand([id]);
      let sel = this.state.sel;
      if (e.shiftKey) {
        const had = pick.every(x => sel.includes(x));
        sel = had ? sel.filter(x => !pick.includes(x)) : [...new Set([...sel, ...pick])];
        this.setState({ sel });
        if (had) return;
      } else if (deep || !sel.includes(id)) { sel = pick; this.setState({ sel }); }
      this.startMove(p, sel);
      return;
    }
    if (kind === 'edge') {
      const sel = e.shiftKey ? (this.state.sel.includes(id) ? this.state.sel.filter(x => x !== id) : [...this.state.sel, id]) : [id];
      this.setState({ sel });
      return;
    }
    this.drag = { type: 'marquee', start: p, base: e.shiftKey ? this.state.sel : [], moved: false };
    if (!e.shiftKey) this.setState({ sel: [] });
  }
  // Two fingers on a touch screen pan and zoom the sheet. This cancels any drag the first finger began.
  startPinch() {
    const d = this.drag;
    if (d) this.setState({ temp: null, draft: null, marquee: null, guides: [] });
    const [a, b] = [...this.pointers.values()], r = this.canvasEl.getBoundingClientRect();
    this.drag = { type: 'pinch', d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), m0: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, v0: this.view() };
  }
  startMove(p, sel) {
    const s = this.sheet(), ids = new Set(sel), orig = {};
    s.nodes.forEach(n => { if (ids.has(n.id) && !n.locked) orig[n.id] = { x: n.x, y: n.y }; });
    // Moving a zone also moves the shapes inside it. Locked shapes stay.
    s.nodes.filter(z => z.type === 'zone' && orig[z.id]).forEach(z => s.nodes.forEach(n => { if (n.id !== z.id && !orig[n.id] && !n.locked && F.within(n, z)) orig[n.id] = { x: n.x, y: n.y }; }));
    const moving = s.nodes.filter(n => orig[n.id]);
    if (!moving.length) return;
    // The bends of a connector move with it when both of its shapes move.
    const ePts = {};
    s.edges.forEach(x => { if (x.pts && orig[x.from] && orig[x.to]) ePts[x.id] = x.pts; });
    this.drag = { type: 'move', start: p, orig, ePts, ob: F.plainBounds(moving), others: s.nodes.filter(n => !orig[n.id]).map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h })), moved: false };
  }
  // The selection with every shape of each selected group.
  expand(ids) {
    const s = this.sheet(), set = new Set(ids), groups = new Set();
    s.nodes.forEach(n => { if (set.has(n.id) && n.group) groups.add(n.group); });
    if (groups.size) s.nodes.forEach(n => { if (n.group && groups.has(n.group)) set.add(n.id); });
    return [...set];
  }
  // The side whose port is under the pointer, while a connector is drawn onto a shape.
  portAt(id, p) {
    const n = this.sheet().nodes.find(q => q.id === id), k = this.view().k;
    if (!n) return null;
    const hit = ['top', 'right', 'bottom', 'left'].find(sd => {
      const q = F.sidePt(n, sd), o = F.NORM[sd];
      return Math.hypot(p.x - q.x, p.y - q.y) <= 12 / k || Math.hypot(p.x - (q.x + o.x * 14 / k), p.y - (q.y + o.y * 14 / k)) <= 10 / k;
    });
    return hit || null;
  }
  onMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._lastMove = e;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.processMove(this._lastMove); });
  }
  processMove(e) {
    if (!e || !this.canvasEl) return;
    const p = this.toWorld(e.clientX, e.clientY), d = this.drag, k = this.view().k;
    const st = { cursor: { x: Math.round(p.x), y: Math.round(p.y) } };
    if (!d) {
      const over = this.canvasEl.contains(e.target);
      const hv = over && (this.state.tool === 'select' || this.state.tool === 'connector') ? this.hoverAt(p) : null;
      if (hv !== this.state.hover) st.hover = hv;
      this.setState(st);
      return;
    }
    if (d.type === 'place') {
      if (!d.started && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.started = true;
      if (d.started) st.ghost = this.canvasEl.contains(e.target) ? { shape: d.shape, p } : null;
      this.setState(st);
      return;
    }
    if (d.type === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()], r = this.canvasEl.getBoundingClientRect(), v0 = d.v0;
      const m = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      const kk = F.clamp(v0.k * Math.hypot(a.x - b.x, a.y - b.y) / d.d0, 0.15, 4), ratio = kk / v0.k;
      this.setView({ k: kk, x: m.x - (d.m0.x - v0.x) * ratio, y: m.y - (d.m0.y - v0.y) * ratio });
      return;
    }
    if (d.type === 'pan') {
      this.setView({ ...d.v0, x: d.v0.x + e.clientX - d.cx, y: d.v0.y + e.clientY - d.cy });
    } else if (d.type === 'create') {
      if (!d.id && Math.hypot(p.x - d.start.x, p.y - d.start.y) * k < 6) { this.setState(st); return; }
      const g = this.g();
      const x0 = this.sn(Math.min(d.start.x, p.x)), y0 = this.sn(Math.min(d.start.y, p.y));
      const x1 = this.sn(Math.max(d.start.x, p.x)), y1 = this.sn(Math.max(d.start.y, p.y));
      const r = { x: x0, y: y0, w: Math.max(g, x1 - x0), h: Math.max(g, y1 - y0) };
      if (!d.id) {
        this.pushHistory();
        const n = F.newNode(d.shape, r);
        d.id = n.id;
        this.setNodes(ns => (d.zone ? [n, ...ns] : [...ns, n]));
        st.sel = [n.id];
      } else {
        const id = d.id;
        this.setNodes(ns => ns.map(n => (n.id === id ? { ...n, ...r } : n)));
      }
    } else if (d.type === 'move') {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) * k < 3) { this.setState(st); return; }
        d.moved = true; this.pushHistory();
      }
      // Smart guides: snap the moving bounds to the edges and centers of other shapes.
      const ob = d.ob, th = 6 / k, guides = [];
      let nx = ob.x + dx, ny = ob.y + dy, bx = null, by = null;
      if (!e.altKey) d.others.forEach(o => {
        [o.x, o.x + o.w / 2, o.x + o.w].forEach(ox => [nx, nx + ob.w / 2, nx + ob.w].forEach(mx => { const df = ox - mx; if (Math.abs(df) <= th && (!bx || Math.abs(df) < Math.abs(bx.df))) bx = { df, v: ox, o }; }));
        [o.y, o.y + o.h / 2, o.y + o.h].forEach(oy => [ny, ny + ob.h / 2, ny + ob.h].forEach(my => { const df = oy - my; if (Math.abs(df) <= th && (!by || Math.abs(df) < Math.abs(by.df))) by = { df, v: oy, o }; }));
      });
      nx = bx ? nx + bx.df : this.sn(nx);
      ny = by ? ny + by.df : this.sn(ny);
      if (bx) guides.push({ x1: bx.v, x2: bx.v, y1: Math.min(bx.o.y, ny) - 16, y2: Math.max(bx.o.y + bx.o.h, ny + ob.h) + 16 });
      if (by) guides.push({ y1: by.v, y2: by.v, x1: Math.min(by.o.x, nx) - 16, x2: Math.max(by.o.x + by.o.w, nx + ob.w) + 16 });
      dx = nx - ob.x; dy = ny - ob.y;
      const orig = d.orig, ePts = d.ePts, bends = Object.keys(ePts).length > 0;
      this.updSheet(sh => ({
        nodes: sh.nodes.map(n => (orig[n.id] ? { ...n, x: orig[n.id].x + dx, y: orig[n.id].y + dy } : n)),
        edges: bends ? sh.edges.map(x => (ePts[x.id] ? { ...x, pts: F.shiftPts(ePts[x.id], dx, dy) } : x)) : sh.edges
      }));
      st.guides = guides;
    } else if (d.type === 'resize') {
      const o = d.orig, hd = d.handle, id = o.id;
      if (hd === 'p0' || hd === 'p1') {
        const a = F.linePts(o);
        let q = { x: this.sn(p.x), y: this.sn(p.y) };
        if (e.shiftKey) q = F.constrain(hd === 'p0' ? a[1] : a[0], q);
        const nn = F.pathFrom(hd === 'p0' ? [q, a[1]] : [a[0], q]);
        this.setNodes(ns => ns.map(n => (n.id === id ? { ...n, ...nn } : n)));
      } else {
        let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
        const mn = o.type === 'path' ? 4 : 20;
        if (hd.includes('w')) x0 = Math.min(this.sn(p.x), x1 - mn);
        if (hd.includes('e')) x1 = Math.max(this.sn(p.x), x0 + mn);
        if (hd.includes('n')) y0 = Math.min(this.sn(p.y), y1 - mn);
        if (hd.includes('s')) y1 = Math.max(this.sn(p.y), y0 + mn);
        this.setNodes(ns => ns.map(n => (n.id === id ? { ...n, x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : n)));
      }
    } else if (d.type === 'connect') {
      // The target area reaches past the box, so the pointer can reach the ports around it.
      const target = this.hoverAt(p, d.from, false, true);
      st.temp = { from: d.from, fromSide: d.fromSide, p, target, toSide: target ? this.portAt(target, p) : null };
    } else if (d.type === 'reconnect') {
      if (!d.moved) {
        if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * k < 3) { this.setState(st); return; }
        d.moved = true;
      }
      // The preview runs from the end that stays. The connector hides until the drop.
      const target = this.hoverAt(p, d.fixed, false, true);
      st.temp = { from: d.fixed, fromSide: d.fixedSide, p, target, toSide: target ? this.portAt(target, p) : null, hide: d.id };
    } else if (d.type === 'wp' || d.type === 'wpadd') {
      if (!d.moved) {
        if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * k < 3) { this.setState(st); return; }
        d.moved = true;
        this.pushHistory();
        if (d.type === 'wpadd') {
          const id = d.id, i = d.i;
          this.setEdges(es => es.map(x => (x.id === id ? { ...x, pts: [...(x.pts || []).slice(0, i), { x: p.x, y: p.y }, ...(x.pts || []).slice(i)] } : x)));
          d.type = 'wp';
        }
      }
      // Alt places the bend off the grid.
      const q = e.altKey ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: this.sn(p.x), y: this.sn(p.y) }, id = d.id, i = d.i;
      this.setEdges(es => es.map(x => (x.id === id && x.pts ? { ...x, pts: x.pts.map((w, j) => (j === i ? q : w)) } : x)));
    } else if (d.type === 'marquee') {
      const r = F.rectFrom(d.start, p), s = this.sheet();
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * k > 3) d.moved = true;
      const ids = this.expand(s.nodes.filter(n => !n.locked && (n.type === 'zone' ? F.within(n, r) : F.inter(r, F.hitBox(n)))).map(n => n.id));
      const set = new Set([...d.base, ...ids]);
      s.edges.forEach(ed => { if (ids.includes(ed.from) && ids.includes(ed.to)) set.add(ed.id); });
      st.sel = [...set]; st.marquee = r;
    } else if (d.type === 'pen') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) * k >= 2.5) { d.pts.push(p); st.draft = { kind: 'pen', pts: d.pts.slice() }; }
    } else if (d.type === 'line') {
      let q = { x: this.sn(p.x), y: this.sn(p.y) };
      if (e.shiftKey) q = F.constrain(d.start, q);
      d.end = q; st.draft = { kind: d.arrow ? 'arrow' : 'line', pts: [d.start, q] };
    }
    this.setState(st);
  }
  onUp(e) {
    const touch = this.pointers.delete(e.pointerId) && e.isPrimary;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; this.processMove(this._lastMove); }
    const d = this.drag;
    if (d && d.type === 'pinch') { if (this.pointers.size < 2) this.drag = null; return; }
    this.drag = null;
    if (touch) this.detectDoubleTap(e);
    if (!d) return;
    const p = this.toWorld(e.clientX, e.clientY), st = {};
    if (d.type === 'place') {
      st.ghost = null;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (d.started && e.type !== 'pointercancel' && over && this.canvasEl.contains(over)) {
        const n = F.newNode(d.shape, this.placeRect(d.shape, p));
        this.pushHistory();
        this.setNodes(ns => (n.type === 'zone' ? [n, ...ns] : [...ns, n]));
        Object.assign(st, { sel: [n.id], tool: 'select', recent: this.withRecent(d.shape) });
      }
    } else if (d.type === 'pan') st.panning = false;
    else if (d.type === 'create') {
      if (!d.id) {
        // A click without a drag places the shape at its default size, centered on the pointer.
        this.pushHistory();
        const n = F.newNode(d.shape, this.placeRect(d.shape, d.start));
        d.id = n.id;
        this.setNodes(ns => (d.zone ? [n, ...ns] : [...ns, n]));
      }
      st.sel = [d.id]; st.tool = 'select';
      if (d.shape === 'text' || d.shape === 'note') st.editing = { kind: 'node', id: d.id, value: F.SHAPES[d.shape].label };
    } else if (d.type === 'connect') {
      const target = e.type === 'pointercancel' ? null : this.hoverAt(p, d.from, false, true);
      if (target) {
        this.pushHistory();
        const ed = { id: F.uid(), from: d.from, to: target, label: '', route: this.defRoute(), arrow: 'end', dashed: false };
        const toSide = this.portAt(target, p);
        if (d.fromSide) ed.fromSide = d.fromSide;
        if (toSide) ed.toSide = toSide;
        this.setEdges(es => [...es, ed]);
        st.sel = [ed.id];
      }
      st.temp = null; st.tool = 'select';
    } else if (d.type === 'reconnect') {
      const target = d.moved && e.type !== 'pointercancel' ? this.hoverAt(p, d.fixed, false, true) : null;
      if (target) {
        // A drop on a port fixes the side. A drop elsewhere on the shape lets the router choose the side.
        const side = this.portAt(target, p), [key, sideKey] = d.end ? ['to', 'toSide'] : ['from', 'fromSide'];
        this.pushHistory();
        this.setEdges(es => es.map(x => (x.id === d.id ? (side ? { ...x, [key]: target, [sideKey]: side } : without({ ...x, [key]: target }, sideKey)) : x)));
      }
      st.temp = null;
    } else if (d.type === 'move') st.guides = [];
    else if (d.type === 'marquee') {
      st.marquee = null;
      if (!d.moved && d.click) st.sel = this.expand([d.click]);
    }
    else if (d.type === 'pen') {
      if (d.pts.length > 1) {
        this.pushHistory();
        const n = { id: F.uid(), type: 'path', ...F.pathFrom(d.pts), weight: 's', dashed: false, label: '', sub: '', fill: 'none', size: 'm', flip: false };
        this.setNodes(ns => [...ns, n]);
      }
      st.draft = null;
    } else if (d.type === 'line') {
      if (d.end && Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) > 2) {
        this.pushHistory();
        const n = { id: F.uid(), type: 'line', ...F.pathFrom([d.start, d.end]), weight: d.arrow ? 's' : 'm', dashed: false, label: '', sub: '', fill: 'none', size: 'm', flip: false };
        if (d.arrow) n.arrow = 'end';
        this.setNodes(ns => [...ns, n]);
        st.sel = [n.id];
      }
      st.draft = null;
    }
    this.setState(st);
  }
  // Touch screens get double-tap from the tap timing, because emulated mouse events are off.
  detectDoubleTap(e) {
    const t = this._tap, now = Date.now();
    this._tap = null;
    if (!t || now - t.t > 300 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) { this._lastTap = null; return; }
    const last = this._lastTap;
    if (last && now - last.t < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) {
      this._lastTap = null; this._touchDblAt = now;
      // Render the label editor inside the gesture, so mobile browsers open the keyboard.
      flushSync(() => this.handleDouble(document.elementFromPoint(e.clientX, e.clientY), e.clientX, e.clientY));
    } else this._lastTap = { x: e.clientX, y: e.clientY, t: now };
  }
  onDbl(e) {
    if (Date.now() - (this._touchDblAt || 0) < 700) return;
    // The canvas captures the pointer on press, so the event target is the canvas. Use the element under the pointer.
    this.handleDouble(document.elementFromPoint(e.clientX, e.clientY), e.clientX, e.clientY);
  }
  handleDouble(target, clientX, clientY) {
    if (this.state.tool !== 'select') return;
    const tg = target && target.closest ? target.closest('[data-k]') : null;
    const kind = tg ? tg.getAttribute('data-k') : null, id = tg ? tg.getAttribute('data-id') : null;
    if ((kind === 'node' || kind === 'handle') && id) {
      const n = this.sheet().nodes.find(q => q.id === id);
      if (n && n.type === 'class') {
        // A double-click edits the compartment under the pointer: the name, the attributes or the operations.
        const p = this.toWorld(clientX, clientY), lay = F.classLayout(n, this.letter(), this.state.doc.settings.caps), y1 = n.y + lay.head;
        this.startEdit('node', id, p.y < y1 ? 'label' : p.y < y1 + lay.attrsH || lay.hideOps ? 'attrs' : 'ops');
        return;
      }
      if (n && !F.LABELLESS[n.type]) this.startEdit('node', id);
      return;
    }
    if (kind === 'wp' && id) {
      const i = Number(tg.getAttribute('data-i'));
      this.pushHistory();
      this.setEdges(es => es.map(x => {
        if (x.id !== id || !x.pts) return x;
        const pts = x.pts.filter((_, j) => j !== i);
        return pts.length ? { ...x, pts } : without(x, 'pts');
      }));
      return;
    }
    if (kind === 'edge' || kind === 'wpadd') { this.startEdit('edge', id); return; }
    if (!kind) {
      if (!target || !this.canvasEl.contains(target)) return;
      const p = this.toWorld(clientX, clientY);
      this.pushHistory();
      const n = F.newNode('text', { x: this.sn(p.x - 80), y: this.sn(p.y - 20), w: 160, h: 40 });
      n.label = '';
      this.setNodes(a => [...a, n]);
      this.setState({ sel: [n.id], editing: { kind: 'node', id: n.id, value: '' } });
    }
  }
};

// Layout for imported diagrams. dagre places the shapes in ranks, as Mermaid does. This file turns
// the result into blueprint connectors: each connector leaves and enters a shape at fixed sides, and
// runs orthogonally through the channels that dagre keeps free for it. Turns happen only in the gaps
// between ranks, and parallel runs in one gap get their own tracks.
//
// Input:  nodes  [{ id, w, h, group }]   `group` is the id of the innermost group, or null.
//         groups [{ id, parent, pkg, tab }]  `tab` is the size { w, h } of the tab with the name of the group.
//         edges  [{ id, from, to, label: { w, h } | null, kind, place }]  `from` and `to` are shape or group ids.
//                `kind` tells connectors apart: connectors of one kind can share a port, like a bus.
//                `place` is 'left' or 'right' for a note beside a shape: `from` is the note, `to` the shape.
//         A node can have `slide`: 'all' when a connector can meet any side away from its middle, or 'tb'
//         for the top and bottom sides only, and `margin`: the space that a port keeps from a corner.
//         dir    'TB', 'BT', 'LR' or 'RL'
// Output: { pos: Map id → { x, y }, zones: Map id → { x, y, w, h }, routes: Map edge id → route }
//         A zone is the box around the shapes of a group, with room at the top for the tab with its name.
//         A route is { fromSide, toSide, pts?, lt? }: fixed sides, bends for the connector, and the
//         place of the label as a share of the path length. A route is null for a connector to a group.

// The straight run out of a port. It matches STUB in engine.js.
const STUB = 16;
// The space between a shape and the run of a connector that leaves at a side.
const SIDE_CLEAR = 24;
// The space between two parallel runs in one gap.
const TRACK = 12;
// The space between a run and the edge of a gap. It is more than STUB, so a run never turns back.
const GAP_MARGIN = STUB + 6;
// The widest space between two tracks. Runs in a tall gap stay together in its middle.
const TRACK_MAX = 24;
// The space around the shapes in a zone. The top has room for the tab with the name.
const ZONE_PAD = 24, ZONE_PAD_TOP = 44;
// The space that a run keeps from a shape or a label that it passes.
const PASS = 8;
// The space that a run keeps from the tab with the name of a zone.
const TAB_CLEAR = 4;
// The space between a shape and a note beside it.
const NOTE_GAP = 40;
const GRID = 10;
const round = v => Math.round(v / GRID) * GRID;

let dagreModule = null;
// dagre loads the first time a diagram is imported, so the app does not carry it until then.
async function loadDagre() {
  if (!dagreModule) dagreModule = (await import('@dagrejs/dagre')).default;
  return dagreModule;
}

// The layout works in a frame where ranks go down. `to` turns a point into that frame, and `from` turns it back.
const FRAMES = {
  TB: { to: p => ({ x: p.x, y: p.y }), from: p => ({ x: p.x, y: p.y }) },
  BT: { to: p => ({ x: p.x, y: -p.y }), from: p => ({ x: p.x, y: -p.y }) },
  LR: { to: p => ({ x: p.y, y: p.x }), from: p => ({ x: p.y, y: p.x }) },
  RL: { to: p => ({ x: p.y, y: -p.x }), from: p => ({ x: -p.y, y: p.x }) }
};
const SIDE_VEC = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const sideOf = v => Object.keys(SIDE_VEC).find(k => Math.abs(SIDE_VEC[k].x - v.x) < 0.5 && Math.abs(SIDE_VEC[k].y - v.y) < 0.5);

export async function layoutDiagram({ nodes, edges, groups = [], dir = 'TB' }, { nodesep = 50, ranksep = 60, edgesep = 20 } = {}) {
  const dagre = await loadDagre();
  const frame = FRAMES[dir] || FRAMES.TB, side = dir === 'LR' || dir === 'RL';
  const byId = new Map(nodes.map(n => [n.id, n])), groupById = new Map(groups.map(g => [g.id, g]));
  // A connector into a group is laid out as a connector to the first shape in the group, and a connector out of
  // a group as one from its last shape. So a group sits between the shapes before it and after it.
  const firstIn = new Map(), lastIn = new Map();
  nodes.forEach(n => {
    for (let gr = groupById.get(n.group); gr; gr = groupById.get(gr.parent)) { if (!firstIn.has(gr.id)) firstIn.set(gr.id, n.id); lastIn.set(gr.id, n.id); }
  });
  const stand = (id, out) => (byId.has(id) ? id : (out ? lastIn : firstIn).get(id) || null);
  // A note beside a shape goes in one box with the shape, across the ranks. dagre cannot lay out a connector inside
  // one rank, so the layout splits the box again after dagre. A note with other connectors is a plain shape.
  const beside = new Map(), noted = new Set(), links = new Map();
  edges.forEach(e => [e.from, e.to].forEach(id => links.set(id, (links.get(id) || 0) + 1)));
  if (!side) edges.forEach(e => {
    const note = byId.get(e.from), host = byId.get(e.to);
    if (!['left', 'right'].includes(e.place) || !note || !host || links.get(note.id) !== 1 || note.group !== host.group || noted.has(host.id)) return;
    const at = beside.get(host.id) || {};
    if (at[e.place]) return;
    at[e.place] = { note, e };
    beside.set(host.id, at);
    noted.add(note.id);
  });

  const layout = rs => {
    const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
    g.setGraph({ rankdir: dir, nodesep, ranksep: rs, edgesep, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    groups.forEach(gr => g.setNode(gr.id, {}));
    groups.forEach(gr => { if (groupById.has(gr.parent)) g.setParent(gr.id, gr.parent); });
    const wide = n => { const at = beside.get(n.id) || {}, all = [at.left, at.right].filter(Boolean).map(x => x.note); return { w: n.w + all.reduce((t, x) => t + x.w + NOTE_GAP, 0), h: Math.max(n.h, ...all.map(x => x.h)) }; };
    nodes.forEach(n => {
      if (noted.has(n.id)) return;
      const { w, h } = wide(n);
      g.setNode(n.id, { width: w, height: h });
      if (groupById.has(n.group)) g.setParent(n.id, n.group);
    });
    const laid = [];
    // dagre puts the targets of one shape right to left in the order of their connectors. Mermaid shows them
    // left to right, so the connectors go in last first.
    [...edges].reverse().forEach(e => {
      if (noted.has(e.from) && beside.has(e.to)) { laid.push({ e, v: e.from, w: e.to, attached: true }); return; }
      const v = stand(e.from, true), w = stand(e.to, false);
      if (!v || !w || v === w) return;
      const minlen = e.minlen || 1;
      g.setEdge(v, w, e.label ? { width: e.label.w, height: e.label.h, labelpos: 'c', minlen } : { minlen }, e.id);
      laid.push({ e, v, w });
    });
    dagre.layout(g);
    // The shape and its notes take their places in the box that dagre laid out.
    beside.forEach((at, id) => {
      const d = g.node(id), n = byId.get(id);
      let x = d.x - wide(n).w / 2;
      [at.left, n, at.right].forEach(part => {
        if (!part) return;
        const m = part.note || part;
        if (m === n) d.x = x + n.w / 2;
        else { g.setNode(m.id, { width: m.w, height: m.h, x: x + m.w / 2, y: d.y }); if (groupById.has(m.group)) g.setParent(m.id, m.group); }
        x += m.w + NOTE_GAP;
      });
      d.width = n.w;
      d.height = n.h;
    });
    alignChains(g, laid);
    return route(g, laid);
  };
  // Straight lines: dagre can leave a shape on a simple chain a little off the line of its neighbor, for example
  // next to a connector that closes a cycle. Such a shape moves onto the line when its rank has room.
  function alignChains(gr, laid) {
    const at = id => frame.to({ x: gr.node(id).x, y: gr.node(id).y }), size = n => (side ? { w: n.h, h: n.w } : { w: n.w, h: n.h });
    const forward = laid.filter(({ e, v, w }) => byId.has(e.from) && byId.has(e.to) && at(v).y < at(w).y - 1);
    const outs = new Map(), ins = new Map(), add = (m, k, x) => m.set(k, [...(m.get(k) || []), x]);
    forward.forEach(f => { add(outs, f.v, f); add(ins, f.w, f); });
    const straight = f => Math.abs(at(f.v).x - at(f.w).x) < 0.5;
    // The channel points of the connectors that go down the ranks, so a shape does not move onto one. A connector
    // that closes a cycle gets its own channel beside its shapes later, so its points do not count.
    const points = laid.filter(({ v, w }) => at(v).y < at(w).y - 1)
      .flatMap(({ e, v, w }) => { const d = gr.edge({ v, w, name: e.id }); return d && d.points ? d.points.slice(1, -1).map(p => ({ ...frame.to(p), id: e.id })) : []; });
    const room = (id, x) => {
      const c = at(id), { w, h } = size(byId.get(id));
      const others = nodes.filter(n => n.id !== id && Math.abs(at(n.id).y - c.y) < (h + size(n).h) / 2);
      if (others.some(n => Math.abs(at(n.id).x - x) < (w + size(n).w) / 2 + nodesep / 2)) return false;
      return !points.some(p => Math.abs(p.y - c.y) < h / 2 && Math.abs(p.x - x) < w / 2 + edgesep / 2);
    };
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      forward.forEach(f => {
        if (straight(f) || (outs.get(f.v) || []).length !== 1 || (ins.get(f.w) || []).length !== 1) return;
        const keeps = id => [...(outs.get(id) || []), ...(ins.get(id) || [])].filter(x => x !== f && straight(x)).length;
        const mover = !keeps(f.v) && !beside.has(f.v) ? f.v : !keeps(f.w) && !beside.has(f.w) ? f.w : null;
        if (!mover) return;
        const target = at(mover === f.v ? f.w : f.v).x;
        if (!room(mover, target)) return;
        const c = frame.from({ x: target, y: at(mover).y });
        gr.node(mover).x = c.x;
        gr.node(mover).y = c.y;
        moved = true;
        // The channel points of the connector, and its label, move onto the line too, when their ranks have room.
        const d = gr.edge({ v: f.v, w: f.w, name: f.e.id });
        if (!d || !d.points) return;
        const inner = d.points.slice(1, -1).map(p => frame.to(p)), lp = d.x != null ? frame.to({ x: d.x, y: d.y }) : null;
        const half = p => (lp && f.e.label && Math.abs(p.y - lp.y) < 1 ? (side ? f.e.label.h : f.e.label.w) / 2 : 0);
        const free = p => !nodes.some(n => { const q = at(n.id), z = size(n); return Math.abs(q.y - p.y) < z.h / 2 && Math.abs(q.x - target) < z.w / 2 + half(p) + nodesep / 2; })
          && !points.some(q => q.id !== f.e.id && Math.abs(q.y - p.y) < 1 && Math.abs(q.x - target) < half(p) + edgesep);
        if (!inner.every(free)) return;
        d.points = [d.points[0], ...inner.map(p => frame.from({ x: target, y: p.y })), d.points[d.points.length - 1]];
        if (lp) { const q = frame.from({ x: target, y: lp.y }); d.x = q.x; d.y = q.y; }
      });
      if (!moved) break;
    }
  }
  // The zone of each group, in the frame of the sheet: the box around its shapes and inner zones.
  function zoneBoxes(gr, laid) {
    const depth = g => { let d = 0; for (let x = groupById.get(g.parent); x; x = groupById.get(x.parent)) d++; return d; };
    const within = (g, id) => { for (let x = groupById.get(g); x; x = groupById.get(x.parent)) if (x.id === id) return true; return false; };
    const shape = n => { const d = gr.node(n.id); return { x: round(d.x) - n.w / 2, y: round(d.y) - n.h / 2, w: n.w, h: n.h }; };
    const zones = new Map();
    [...groups].sort((a, b) => depth(b) - depth(a)).forEach(grp => {
      const kids = [...nodes.filter(n => n.group === grp.id).map(shape), ...groups.filter(x => x.parent === grp.id).map(x => zones.get(x.id)).filter(Boolean)];
      if (!kids.length) return;
      let x0 = Math.floor((Math.min(...kids.map(k => k.x)) - ZONE_PAD) / GRID) * GRID, x1 = Math.ceil((Math.max(...kids.map(k => k.x + k.w)) + ZONE_PAD) / GRID) * GRID;
      const y0 = Math.floor((Math.min(...kids.map(k => k.y)) - ZONE_PAD_TOP) / GRID) * GRID, y1 = Math.ceil((Math.max(...kids.map(k => k.y + k.h)) + ZONE_PAD) / GRID) * GRID;
      // A zone is as wide as the tab with its name, as far as the shapes, zones and channels beside it leave room.
      const need = grp.tab && grp.tab.w ? grp.tab.w + 2 * GRID : 0;
      if (x1 - x0 < need) {
        const others = [
          ...nodes.filter(n => !within(n.group, grp.id)).map(shape),
          ...[...zones].filter(([id]) => !within(id, grp.id)).map(([, z]) => z),
          ...laid.filter(({ v, w }) => !within(byId.get(v).group, grp.id) && !within(byId.get(w).group, grp.id))
            .flatMap(({ e, v, w }) => ((gr.edge({ v, w, name: e.id }) || {}).points || []).map(p => ({ x: p.x, y: p.y, w: 0, h: 0 })))
        ].filter(o => o.y < y1 && o.y + o.h > y0);
        const roomL = Math.max(0, Math.floor((x0 - Math.max(-Infinity, ...others.filter(o => o.x + o.w <= x0).map(o => o.x + o.w + GRID))) / GRID) * GRID);
        const roomR = Math.max(0, Math.floor((Math.min(Infinity, ...others.filter(o => o.x >= x1).map(o => o.x - GRID)) - x1) / GRID) * GRID);
        const extra = Math.ceil((need - (x1 - x0)) / GRID) * GRID, half = Math.ceil(extra / 2 / GRID) * GRID;
        const l = Math.min(roomL, Math.max(half, extra - roomR)), r = Math.min(roomR, extra - l);
        x0 -= l;
        x1 += r;
      }
      zones.set(grp.id, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    });
    return zones;
  }
  // When a gap is too small for its tracks, the layout runs again with more space between the ranks.
  const first = layout(ranksep);
  return first.short > 0 ? layout(ranksep + first.short).out : first.out;

  function route(gr, laid) {
    // The shapes in the frame where ranks go down. Centers snap to a 10 px grid, so straight runs stay straight.
    const box = new Map();
    nodes.forEach(n => {
      const d = gr.node(n.id), c = frame.to({ x: round(d.x), y: round(d.y) }), w = side ? n.h : n.w, h = side ? n.w : n.h;
      box.set(n.id, { id: n.id, cx: c.x, cy: c.y, top: c.y - h / 2, bottom: c.y + h / 2, left: c.x - w / 2, right: c.x + w / 2 });
    });
    // Zones: inner groups first, so an outer zone holds the zones inside it.
    const zones = zoneBoxes(gr, laid);
    // Bands: the rows that shapes and labels fill, and the lines of the zones. A run across the frame never
    // enters a band, so it cannot hit a shape or a label, or run on top of the border of a zone.
    const raw = [...box.values()].map(b => [b.top, b.bottom]), labels = [];
    laid.forEach(({ e, v, w }) => {
      const d = gr.edge({ v, w, name: e.id });
      if (!e.label || !d || d.x == null) return;
      const p = frame.to({ x: d.x, y: d.y }), hw = (side ? e.label.h : e.label.w) / 2, hh = (side ? e.label.w : e.label.h) / 2;
      raw.push([p.y - hh, p.y + hh]);
      labels.push({ id: `label:${e.id}`, left: p.x - hw, right: p.x + hw, top: p.y - hh, bottom: p.y + hh });
    });
    // The tab with the name of a zone sits at its top left corner. A run passes beside a tab, not through it.
    const tabs = [], tabRows = [];
    zones.forEach((z, id) => {
      const a = frame.to({ x: z.x, y: z.y }), b = frame.to({ x: z.x + z.w, y: z.y + z.h });
      [Math.min(a.y, b.y), Math.max(a.y, b.y)].forEach(y => raw.push([y - 1, y + 1]));
      const grp = groupById.get(id), size = grp.tab && grp.tab.w ? grp.tab : grp.pkg ? { w: 80, h: 24 } : null;
      if (!size) return;
      const p = frame.to({ x: z.x, y: z.y }), q = frame.to({ x: z.x + Math.min(z.w, size.w), y: z.y + size.h });
      const tb = { id: `tab:${id}`, zone: id, left: Math.min(p.x, q.x), right: Math.max(p.x, q.x), top: Math.min(p.y, q.y), bottom: Math.max(p.y, q.y) };
      tabs.push(tb);
      // Across the ranks, the row of the tab is a band too, so a run does not turn inside it.
      if (!side) tabRows.push([tb.top - 1, tb.bottom + 1]);
    });
    const merge = list => {
      const out = [];
      [...list].sort((a, b) => a[0] - b[0]).forEach(([a, b]) => { const last = out[out.length - 1]; if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b); else out.push([a, b]); });
      return out;
    };
    const solid = merge(raw), bands = merge([...raw, ...tabRows]);
    const gaps = bands.slice(1).map((b, i) => ({ lo: bands[i][1], hi: b[0], jogs: [] }));
    const boxes = [...box.values()], midX = (Math.min(...boxes.map(b => b.left)) + Math.max(...boxes.map(b => b.right))) / 2;
    // A channel point matters only where shapes, labels or zone lines fill the row. Elsewhere, a run can go
    // anywhere, so such points go. dagre does not know the tabs, so a point in the row of a tab goes too.
    const inBand = y => solid.some(([a, b]) => y > a + 0.5 && y < b - 0.5);
    const gapBetween = (y0, y1) => {
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      let best = null, size = 0;
      gaps.forEach(gp => { const s = Math.min(hi, gp.hi) - Math.max(lo, gp.lo); if (s > size) { size = s; best = gp; } });
      return best;
    };

    // A zone in the frame where ranks go down.
    const zoneBox = id => {
      const z = zones.get(id);
      if (!z) return null;
      const a = frame.to({ x: z.x, y: z.y }), b = frame.to({ x: z.x + z.w, y: z.y + z.h });
      const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x), top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
      return { id, zone: true, left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
    };
    // True when a path keeps clear of every shape and label, except the shapes in `skip`.
    const things = [...boxes, ...labels, ...tabs];
    const clear = (path, skip) => path.slice(1).every((q, i) => {
      const p = path[i], x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
      return things.every(o => skip.includes(o.id) || x1 <= o.left - PASS || x0 >= o.right + PASS || y1 <= o.top - PASS || y0 >= o.bottom + PASS);
    });

    // 1. The chain of each connector: its ports, and the points where dagre keeps a channel free for it.
    const chains = laid.map(({ e, v, w, attached }) => {
      const S = box.get(v), T = box.get(w), d = gr.edge({ v, w, name: e.id });
      // A note beside its shape: a straight run between the sides that face each other.
      if (attached) return { e, sides: S.cx < T.cx ? ['right', 'left'] : ['left', 'right'] };
      if (!byId.has(e.from) || !byId.has(e.to)) {
        // A connector to a zone: fixed sides from the boxes, so it can get its own point on a busy side.
        // The editor routes it.
        const A = box.get(e.from) || zoneBox(e.from), B = box.get(e.to) || zoneBox(e.to);
        if (!A || !B) return { e, auto: true };
        const sides = A.bottom <= B.top ? ['bottom', 'top'] : B.bottom <= A.top ? ['top', 'bottom'] : A.right <= B.left ? ['right', 'left'] : ['left', 'right'];
        const at = (b, sd) => (sd === 'bottom' ? { x: b.cx, y: b.bottom } : sd === 'top' ? { x: b.cx, y: b.top } : sd === 'right' ? { x: b.right, y: b.cy } : { x: b.left, y: b.cy });
        // Down the ranks, the connector takes the channel of its stand-in shapes between the two boxes.
        if (sides[0] === 'bottom' && d && d.points) {
          const inner = d.points.slice(1, -1).map(p => frame.to(p)).filter(p => inBand(p.y) && p.y > A.bottom && p.y < B.top).map(p => ({ x: round(p.x), y: p.y }));
          const label = e.label && d.x != null ? frame.to({ x: d.x, y: d.y }) : null;
          return { e, S: A, T: B, label, zone: true, routed: true, back: false, sides, pts: [at(A, 'bottom'), ...inner, at(B, 'top')] };
        }
        return { e, S: A, T: B, zone: true, sides, pts: [at(A, sides[0]), at(B, sides[1])] };
      }
      if (!d) return { e, auto: true };
      const inner = (d.points || []).slice(1, -1).map(p => frame.to(p)).filter(p => inBand(p.y)).map(p => ({ x: round(p.x), y: p.y }));
      const label = e.label && d.x != null ? frame.to({ x: d.x, y: d.y }) : null;
      // Shapes in one rank: a straight run between the sides that face each other.
      if (Math.abs(S.cy - T.cy) < 1) return { e, sides: S.cx < T.cx ? ['right', 'left'] : ['left', 'right'] };
      // Down the ranks: out at the bottom, in at the top.
      if (S.cy < T.cy) return { e, S, T, label, back: false, sides: ['bottom', 'top'], pts: [{ x: S.cx, y: S.bottom }, ...inner, { x: T.cx, y: T.top }] };
      // Up the ranks: a connector that closes a cycle. It runs at a side of its shapes, so its arrow does not meet
      // the ports of the connectors that go down. A straight channel beside the two shapes reads best. The next
      // choice is a channel outside every shape in its span, and the last one is the channel that dagre keeps.
      const xs = inner.length ? inner.map(p => p.x) : [(S.cx + T.cx) / 2];
      const pref = xs.reduce((t, x) => t + x, 0) / xs.length >= (inner.length ? (S.cx + T.cx) / 2 : midX) ? 'right' : 'left';
      const other = pref === 'right' ? 'left' : 'right';
      const lo = Math.min(S.top, T.top), hi = Math.max(S.bottom, T.bottom), span = things.filter(o => o.bottom > lo && o.top < hi && o.id !== `label:${e.id}`);
      const port = (b, k) => (k === 'right' ? b.right : b.left);
      const tight = k => (k === 'right' ? Math.max(S.right, T.right) + SIDE_CLEAR : Math.min(S.left, T.left) - SIDE_CLEAR);
      const outer = k => (k === 'right' ? Math.max(...span.map(o => o.right)) + SIDE_CLEAR : Math.min(...span.map(o => o.left)) - SIDE_CLEAR);
      const straight = (k, x) => [{ x: port(S, k), y: S.cy }, { x, y: S.cy }, { x, y: T.cy }, { x: port(T, k), y: T.cy }];
      // The connector does not keep clear of its own label: the label moves onto the channel.
      const own = [S.id, T.id, `label:${e.id}`];
      for (const [k, x] of [[pref, tight(pref)], [other, tight(other)], [pref, outer(pref)], [other, outer(other)]]) {
        const path = straight(k, round(x));
        if (clear(path, own)) return { e, S, T, label: label && { x: path[1].x, y: (S.cy + T.cy) / 2 }, back: true, sides: [k, k], pts: path };
      }
      const k = pref, step = k === 'right' ? SIDE_CLEAR : -SIDE_CLEAR;
      return { e, S, T, label, back: true, sides: [k, k], pts: [{ x: port(S, k), y: S.cy }, { x: port(S, k) + step, y: S.cy }, ...inner, { x: port(T, k) + step, y: T.cy }, { x: port(T, k), y: T.cy }] };
    });

    // The places where the runs of other connectors cross the row at height y: a channel point in the row, or both
    // ends of a step over the row, since the turn of the step can happen anywhere between them.
    const runsAt = (y, ...skip) => chains.flatMap(o => {
      if (skip.includes(o) || !o.pts || (o.zone && !o.routed)) return [];
      const xs = [];
      for (let i = 0; i + 1 < o.pts.length; i++) {
        const a = o.pts[i], b = o.pts[i + 1];
        if (Math.abs(y - a.y) < 1) xs.push(a.x);
        else if (Math.abs(y - b.y) < 1) xs.push(b.x);
        else if (y > Math.min(a.y, b.y) && y < Math.max(a.y, b.y)) xs.push(a.x, b.x);
      }
      return xs;
    });
    // The label of a chain when it sits on the point at index i.
    const labelAt = (c, i) => (c.label && Math.abs(c.label.y - c.pts[i].y) < 1 ? labels.find(l => l.id === `label:${c.e.id}`) : null);
    const bandOf = y => bands.find(([a, b]) => y > a - 0.5 && y < b + 0.5) || [y - 1, y + 1];
    // True when the point at index i of chain c, and its label, can move to x: the row keeps room for them. A run
    // that turns toward a point beside it does not first point at a shape in the row of that point.
    const fits = (c, i, x) => {
      const q = c.pts[i], lab = labelAt(c, i), hw = lab ? (lab.right - lab.left) / 2 : 0, [y0, y1] = bandOf(q.y);
      if (!things.every(o => o === lab || x + hw + PASS <= o.left || x - hw - PASS >= o.right || y1 <= o.top || y0 >= o.bottom)) return false;
      const aims = [c.pts[i - 1], c.pts[i + 1]].some(r => {
        if (!r || Math.abs(r.x - x) < 0.5) return false;
        const [r0, r1] = bandOf(r.y);
        return boxes.some(o => o.id !== c.S.id && o.id !== c.T.id && o.bottom > r0 && o.top < r1 && x > o.left - PASS && x < o.right + PASS);
      });
      return !aims && runsAt(q.y, c).every(r => Math.abs(r - x) >= hw + TRACK);
    };
    const moveTo = (c, i, x) => {
      const lab = labelAt(c, i);
      if (lab) { const hw = (lab.right - lab.left) / 2; lab.left = x - hw; lab.right = x + hw; c.label = { ...c.label, x }; }
      c.pts[i] = { ...c.pts[i], x };
    };

    // A channel point in the row of a tab moves beside the tab.
    chains.forEach(c => {
      if (!c.pts || c.back) return;
      for (let i = 1; i < c.pts.length - 1; i++) {
        const q = c.pts[i];
        tabs.forEach(tb => {
          if (q.y < tb.top - 1 || q.y > tb.bottom + 1 || q.x <= tb.left - TAB_CLEAR || q.x >= tb.right + TAB_CLEAR) return;
          const x = q.x < tb.left ? Math.floor((tb.left - TAB_CLEAR) / GRID) * GRID : Math.ceil((tb.right + TAB_CLEAR) / GRID) * GRID;
          if (fits(c, i, x)) moveTo(c, i, x);
        });
      }
    });

    // 2. Ports: connectors of one kind share a port, like a bus. Where connectors of different kinds meet one
    // side, each kind gets its own point along the side, so a marker such as a diamond belongs to one connector.
    const SLOT = 20, ends = new Map();
    chains.forEach(c => {
      if (!c.pts) return;
      [[0, c.S, c.T], [1, c.T, c.S]].forEach(([end, b, other]) => {
        const key = `${b.id}:${c.sides[end]}`;
        if (!ends.has(key)) ends.set(key, []);
        ends.get(key).push({ c, end, b, other, side: c.sides[end] });
      });
    });
    ends.forEach(list => {
      const { b, side: sd } = list[0], across = sd === 'top' || sd === 'bottom', n = byId.get(b.id) || { slide: 'all', margin: 20 };
      const outSide = sideOf(frame.from(SIDE_VEC[sd])), slide = n.slide === 'all' || (n.slide === 'tb' && (outSide === 'top' || outSide === 'bottom'));
      if (!slide) return;
      // An arrow that ends at a port and a line that leaves it never share the point.
      const kindOf = x => `${x.end}:${x.c.e.kind || ''}`;
      const kinds = [...new Set(list.map(kindOf))];
      // Each kind wants its port where its run goes on: the next point of its chain. So the run leaves the port
      // straight. A run at a side of its shape has no such point, so it keeps the order of the shapes it joins.
      const next = x => { const p = x.c.pts; return x.end ? p[p.length - 2] : p[1]; };
      const margin = n.margin == null ? 20 : n.margin;
      let lo = (across ? b.left : b.top) + margin, hi = (across ? b.right : b.bottom) - margin;
      if (hi < lo) return;
      // A port keeps clear of the tab of a zone: a tab on the side itself, or a tab that its runs pass.
      if (across) {
        let l0 = lo, h0 = hi;
        tabs.forEach(tb => {
          const own = tb.zone === b.id && Math.abs(sd === 'top' ? tb.top - b.top : tb.bottom - b.bottom) < 1;
          const passed = list.some(x => (sd === 'top' ? tb.bottom <= b.top + 1 && next(x).y < tb.top : tb.top >= b.bottom - 1 && next(x).y > tb.bottom));
          const l = tb.left - TAB_CLEAR, r = tb.right + TAB_CLEAR;
          if ((!own && !passed) || r <= l0 || l >= h0) return;
          if (l <= l0) l0 = r;
          else if (r >= h0) h0 = l;
        });
        if (l0 <= h0) { lo = l0; hi = h0; }
      }
      const mid = (lo + hi) / 2, center = across ? b.cx : b.cy, free = v => v >= lo - 0.5 && v <= hi + 0.5;
      const pos = new Map();
      if (kinds.length === 1 && list.length > 1) {
        // Connectors of one kind share the middle of the side, like a bus.
        if (free(center)) return;
        pos.set(kinds[0], Math.max(lo, Math.min(hi, center)));
      } else {
        // A bus leaves on the channel of one of its connectors, the one nearest the middle, so that run is straight.
        // A zone connector without channel points runs straight across the span that its two boxes share.
        const span = x => {
          const o = x.other, a = Math.max(across ? b.left : b.top, across ? o.left : o.top), z = Math.min(across ? b.right : b.bottom, across ? o.right : o.bottom);
          return z - a > 2 * margin ? (a + z) / 2 : across ? o.cx : o.cy;
        };
        const want = k => {
          const xs = list.filter(x => kindOf(x) === k).map(x => (x.c.zone && !x.c.routed ? span(x) : across ? next(x).x : null));
          if (xs.some(v => v == null)) return null;
          return xs.sort((u, v) => Math.abs(u - center) - Math.abs(v - center))[0];
        };
        const order = k => { const xs = list.filter(x => kindOf(x) === k).map(x => (across ? x.other.cx : x.other.cy)); return xs.reduce((t, v) => t + v, 0) / xs.length; };
        kinds.forEach(k => pos.set(k, want(k)));
        if (kinds.length === 1 && (pos.get(kinds[0]) == null || !free(pos.get(kinds[0])))) {
          // A single kind keeps the middle when its channel is not on the side, since the run turns anyway.
          if (free(center)) return;
          pos.set(kinds[0], Math.max(lo, Math.min(hi, center)));
        } else if ([...pos.values()].some(v => v == null)) {
          kinds.sort((a, z) => order(a) - order(z));
          const step = Math.min(SLOT, (hi - lo) / Math.max(1, kinds.length - 1));
          kinds.forEach((k, i) => pos.set(k, mid + step * (i - (kinds.length - 1) / 2)));
        } else {
          // Ports keep a slot of space between them, and stay on the side.
          kinds.sort((a, z) => pos.get(a) - pos.get(z));
          const xs = kinds.map(k => Math.max(lo, Math.min(hi, pos.get(k))));
          for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + SLOT);
          for (let i = xs.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - SLOT);
          if (xs.length > 1 && (xs[0] < lo || xs[xs.length - 1] > hi)) {
            const step = (hi - lo) / (xs.length - 1);
            xs.forEach((_, i) => { xs[i] = lo + step * i; });
          }
          kinds.forEach((k, i) => pos.set(k, Math.round(xs[i])));
        }
      }
      list.forEach(x => {
        const at = Math.round(pos.get(kindOf(x))), p = x.c.pts, i = x.end ? p.length - 1 : 0;
        // A port in the middle needs no share.
        if (Math.abs(at - center) < 0.5) return;
        x.c.slots = x.c.slots || [null, null];
        x.c.slots[x.end] = kinds.indexOf(kindOf(x));
        if (across) p[i] = { ...p[i], x: at };
        else if (x.c.zone && !x.c.routed) p[i] = { ...p[i], y: at };
        else {
          // A port at a side moves along the side, with the run that leaves it.
          const j = x.end ? i - 1 : 1;
          p[i] = { ...p[i], y: at };
          p[j] = { ...p[j], y: at };
        }
      });
    });
    const portKey = (c, end) => `${(end ? c.T : c.S).id}:${c.sides[end]}:${c.slots && c.slots[end] != null ? c.slots[end] : ''}`;
    const forward = c => c.pts && !c.back && !(c.zone && !c.routed);

    // Runs that share a port keep the order of the shapes at their other ends, so they do not cross. dagre can leave
    // two of them crossed. Then their channel points and labels trade places in the rows that they share.
    const inner = (c, y) => c.pts.findIndex((q, i) => i > 0 && i < c.pts.length - 1 && Math.abs(q.y - y) < 1);
    const shared = new Map();
    chains.forEach(c => {
      if (!forward(c) || c.pts.length < 3) return;
      [0, 1].forEach(end => { const k = `${end}:${portKey(c, end)}`; if (!shared.has(k)) shared.set(k, []); shared.get(k).push(c); });
    });
    shared.forEach((list, k) => {
      const end = +k[0];
      for (let a = 0; a < list.length; a++) for (let z = a + 1; z < list.length; z++) {
        // The rows that the two runs share next to the port, and the points where they part after those rows.
        const A = list[a], B = list[z], from = c => (end ? [...c.pts].reverse() : c.pts);
        const pa = from(A), pb = from(B), rows = [];
        let m = 1;
        while (m < pa.length - 1 && m < pb.length - 1 && Math.abs(pa[m].y - pb[m].y) < 1) { rows.push(pa[m].y); m++; }
        if (!rows.length || Math.abs(pa[m].x - pb[m].x) < 0.5) continue;
        const sides = rows.map(y => Math.sign(A.pts[inner(A, y)].x - B.pts[inner(B, y)].x));
        // They cross when they part in the other order than the one they keep in the shared rows.
        if (!sides.every(v => v !== 0 && v === sides[0]) || sides[0] === Math.sign(pa[m].x - pb[m].x)) continue;
        rows.forEach(y => {
          const items = [A, B].map(c => { const i = inner(c, y), lab = labelAt(c, i); return { c, i, x: c.pts[i].x, hw: lab ? (lab.right - lab.left) / 2 : 0, lab }; });
          items.sort((u, v) => u.x - v.x);
          const L = items[0].x - items[0].hw, R = items[1].x + items[1].hw;
          // Nothing else may sit between the two in the row.
          if (things.some(o => !items.some(t => t.lab === o) && o.top < y && o.bottom > y && o.right > L && o.left < R)) return;
          if (runsAt(y, A, B).some(r => r > L - 0.5 && r < R + 0.5)) return;
          // The one on the right goes to the left end of their span, and the other one to the right end.
          moveTo(items[1].c, items[1].i, L + items[1].hw);
          moveTo(items[0].c, items[0].i, R - items[0].hw);
        });
      }
    });

    // A run that turns in a gap too small for a turn takes the point after the gap along, when its row has room.
    // The label on that point moves too.
    const room = (y0, y1) => { const gp = gapBetween(y0, y1); return gp ? Math.min(Math.max(y0, y1), gp.hi) - Math.max(Math.min(y0, y1), gp.lo) : 0; };
    const roomy = (y0, y1) => room(y0, y1) >= 2 * GAP_MARGIN;
    chains.forEach(c => {
      if (!forward(c) || c.pts.length < 3) return;
      const p = c.pts, last = p.length - 1;
      [[0, 1, 2], [last, last - 1, last - 2]].forEach(([i, j, k]) => {
        if (Math.abs(p[i].x - p[j].x) < 0.5 || roomy(p[i].y, p[j].y) || room(p[j].y, p[k].y) <= room(p[i].y, p[j].y)) return;
        if (fits(c, j, p[i].x)) moveTo(c, j, p[i].x);
      });
    });
    // A label moves onto the line of the point before or after it, so that its run turns once at most. A label
    // between two points on one line moves onto that line. One move can make room for another, so this runs twice.
    for (let pass = 0; pass < 2; pass++) {
      chains.forEach(c => {
        if (!forward(c)) return;
        const p = c.pts;
        for (let i = 1; i < p.length - 1; i++) {
          if (!labelAt(c, i)) continue;
          const a = p[i - 1], b = p[i + 1], on = v => Math.abs(v - p[i].x) < 0.5;
          if (Math.abs(a.x - b.x) < 0.5 ? on(a.x) : on(a.x) || on(b.x)) continue;
          const options = Math.abs(a.x - b.x) < 0.5 ? [a.x] : [roomy(a.y, p[i].y) ? b.x : null, roomy(p[i].y, b.y) ? a.x : null];
          const x = options.find(v => v != null && fits(c, i, v));
          if (x != null) moveTo(c, i, x);
        }
      });
    }

    // A port that is alone on its side can move to x when the side reaches x, and the run from the port to the point
    // at height y keeps clear of tabs.
    const movable = (bx, sd, x, y) => {
      const n = byId.get(bx.id) || { slide: 'all', margin: 20 }, outSide = sideOf(frame.from(SIDE_VEC[sd])), margin = n.margin == null ? 20 : n.margin;
      if ((ends.get(`${bx.id}:${sd}`) || []).length !== 1 || !(n.slide === 'all' || (n.slide === 'tb' && (outSide === 'top' || outSide === 'bottom')))) return false;
      if (x < bx.left + margin || x > bx.right - margin) return false;
      const y0 = Math.min(y, sd === 'top' ? bx.top : bx.bottom), y1 = Math.max(y, sd === 'top' ? bx.top : bx.bottom);
      return !tabs.some(tb => x > tb.left - TAB_CLEAR && x < tb.right + TAB_CLEAR && tb.bottom >= y0 - 1 && tb.top <= y1 + 1);
    };
    const slotted = (c, end) => { c.slots = c.slots || [null, null]; if (c.slots[end] == null) c.slots[end] = 0; };
    // A port that is alone on its side moves onto the line of the point next to it, so its run leaves straight.
    chains.forEach(c => {
      if (!forward(c) || c.pts.length < 3) return;
      const p = c.pts, last = p.length - 1;
      [[0, 1, c.S], [last, last - 1, c.T]].forEach(([i, j, bx]) => {
        const end = i ? 1 : 0;
        if (Math.abs(p[i].x - p[j].x) < 0.5 || !movable(bx, c.sides[end], p[j].x, p[j].y)) return;
        p[i] = { ...p[i], x: p[j].x };
        slotted(c, end);
      });
    });

    // A connector down the ranks runs straight when the port at one end is alone on its side and can move onto the
    // line of the other port, and the straight run keeps clear of shapes, labels and the channels of other connectors.
    chains.forEach(c => {
      if (!forward(c) || c.label) return;
      const p = c.pts, last = p.length - 1;
      if (p.every(q => Math.abs(q.x - p[0].x) < 0.5)) return;
      for (const end of [1, 0]) {
        const bx = end ? c.T : c.S, x = p[end ? 0 : last].x;
        if (!movable(bx, c.sides[end], x, p[end ? 0 : last].y)) continue;
        if (tabs.some(tb => x > tb.left - TAB_CLEAR && x < tb.right + TAB_CLEAR && tb.bottom >= p[0].y - 1 && tb.top <= p[last].y + 1)) continue;
        if (!clear([{ x, y: p[0].y }, { x, y: p[last].y }], [c.S.id, c.T.id])) continue;
        if (chains.some(o => o !== c && o.pts && o.pts.some(q => q.y > p[0].y && q.y < p[last].y && Math.abs(q.x - x) < TRACK))) continue;
        c.pts = p.map(q => ({ ...q, x }));
        slotted(c, end);
        break;
      }
    });

    // 3. Jogs: a change of channel between two chain points happens in the gap between them.
    const firsts = new Map(), lasts = new Map(), count = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    chains.forEach(c => {
      if (!c.pts || (c.zone && !c.routed)) return;
      c.jogs = new Map();
      const p = c.pts, n = p.length;
      for (let i = 0; i + 1 < n; i++) {
        const a = p[i], b = p[i + 1];
        if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) continue;
        const gp = gapBetween(a.y, b.y);
        if (!gp) continue;
        const jog = { c, i, a, b, first: i === (c.back ? 1 : 0), last: i + 1 === (c.back ? n - 2 : n - 1) };
        c.jogs.set(i, jog);
        gp.jogs.push(jog);
        if (jog.first) count(firsts, portKey(c, 0));
        if (jog.last) count(lasts, portKey(c, 1));
      }
    });
    // Runs out of one port share a track, like a bus. So do runs into one port.
    gaps.forEach(gp => gp.jogs.forEach(j => {
      const ok = portKey(j.c, 0), ik = portKey(j.c, 1);
      const out = j.first ? firsts.get(ok) : 0, inn = j.last ? lasts.get(ik) : 0;
      j.key = out > 1 && out >= inn ? `out:${ok}` : inn > 1 ? `in:${ik}` : `own:${j.c.e.id}:${j.i}`;
    }));

    // 4. Tracks: order the runs in each gap to cut crossings, and stack the runs that overlap.
    let short = 0;
    gaps.forEach(gp => {
      if (!gp.jogs.length) return;
      const byKey = new Map();
      gp.jogs.forEach(j => { if (!byKey.has(j.key)) byKey.set(j.key, []); byKey.get(j.key).push(j); });
      const runs = [...byKey.values()].map(js => {
        const xs = js.flatMap(j => [j.a.x, j.b.x]);
        // `ups` are the runs that come into the gap from above, and `downs` the runs that leave it below.
        return { js, lo: Math.min(...xs), hi: Math.max(...xs), ups: js.map(j => (j.a.y < j.b.y ? j.a.x : j.b.x)), downs: js.map(j => (j.a.y < j.b.y ? j.b.x : j.a.x)) };
      });
      const inside = (x, r) => x > r.lo + 0.5 && x < r.hi - 0.5;
      // The crossings when run A is above run B.
      const cost = (A, B) => B.ups.filter(x => inside(x, A)).length + A.downs.filter(x => inside(x, B)).length;
      const order = orderRuns(runs, cost), level = new Map();
      order.forEach((r, k) => {
        let lv = 0;
        order.slice(0, k).forEach(q => { if (q.lo < r.hi + TRACK && r.lo < q.hi + TRACK) lv = Math.max(lv, level.get(q) + 1); });
        level.set(r, lv);
      });
      const tracks = Math.max(...level.values()) + 1, room = gp.hi - gp.lo, need = 2 * GAP_MARGIN + TRACK * (tracks - 1);
      if (room < need) short = Math.max(short, Math.ceil((need - room) / GRID) * GRID);
      const margin = Math.max(6, Math.min(GAP_MARGIN, (room - TRACK * (tracks - 1)) / 2));
      const step = tracks > 1 ? Math.min(TRACK_MAX, (room - 2 * margin) / (tracks - 1)) : 0, top = (gp.lo + gp.hi) / 2 - (step * (tracks - 1)) / 2;
      order.forEach(r => { const y = top + step * level.get(r); r.js.forEach(j => { j.y = Math.round(y); }); });
    });

    // 5. Paths: each chain with its jogs, back in the frame of the sheet.
    const out = { pos: new Map(), zones, routes: new Map() };
    nodes.forEach(n => { const d = gr.node(n.id); out.pos.set(n.id, { x: round(d.x) - n.w / 2, y: round(d.y) - n.h / 2 }); });
    chains.forEach(c => {
      if (c.auto) { out.routes.set(c.e.id, null); return; }
      const sides = c.sides.map(s => sideOf(frame.from(SIDE_VEC[s])));
      if (!c.pts) { out.routes.set(c.e.id, { fromSide: sides[0], toSide: sides[1] }); return; }
      // The share of a port along the side of its shape or zone on the sheet.
      const share = (b, end, q) => {
        const n = byId.get(b.id), p = n ? out.pos.get(b.id) : zones.get(b.id), w = n ? n.w : p.w, h = n ? n.h : p.h, sd = sides[end];
        return Math.round((sd === 'top' || sd === 'bottom' ? (q.x - p.x) / w : (q.y - p.y) / h) * 10000) / 10000;
      };
      if (c.zone && !c.routed) {
        const r = { fromSide: sides[0], toSide: sides[1] };
        if (c.slots && c.slots[0] != null) r.fromAt = share(c.S, 0, frame.from(c.pts[0]));
        if (c.slots && c.slots[1] != null) r.toAt = share(c.T, 1, frame.from(c.pts[1]));
        out.routes.set(c.e.id, r);
        return;
      }
      const path = [c.pts[0]];
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = c.pts[i], b = c.pts[i + 1], j = c.jogs.get(i);
        if (j) path.push({ x: a.x, y: j.y }, { x: b.x, y: j.y });
        else if (Math.abs(a.x - b.x) >= 0.5 && Math.abs(a.y - b.y) >= 0.5) path.push({ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 });
        path.push(b);
      }
      const poly = straighten(path).map(p => frame.from(p)), corners = poly.slice(1, -1);
      const r = { fromSide: sides[0], toSide: sides[1] };
      // A port away from the middle of its side becomes a share along the side of the shape on the sheet.
      [[0, c.S, 'fromAt'], [1, c.T, 'toAt']].forEach(([end, b, key]) => {
        if (c.slots && c.slots[end] != null) r[key] = share(b, end, poly[end ? poly.length - 1 : 0]);
      });
      if (corners.length) r.pts = corners.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
      if (c.label) r.lt = Math.round(shareAt(poly, frame.from(c.label)) * 1000) / 1000;
      out.routes.set(c.e.id, r);
    });
    return { out, short };
  }
}

// Removes repeated points and the points in the middle of a straight run.
function straighten(pts) {
  const out = [];
  pts.forEach(p => {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) return;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const turn = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x), ahead = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      if (Math.abs(turn) > 0.5 || ahead < 0) break;
      out.splice(out.length - 2, 1);
    }
  });
  return out;
}

// The share of the length of a polyline at the point nearest to q.
function shareAt(pts, q) {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y)), total = lens.reduce((t, l) => t + l, 0);
  let walked = 0, best = Infinity, at = total / 2;
  pts.slice(1).forEach((b, i) => {
    const a = pts[i], len = lens[i] || 1e-9;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (len * len)));
    const d = Math.hypot(a.x + (b.x - a.x) * t - q.x, a.y + (b.y - a.y) * t - q.y);
    if (d < best) { best = d; at = walked + len * t; }
    walked += lens[i];
  });
  return total ? at / total : 0.5;
}

// The order of the runs in a gap, from the top down, with the fewest crossings.
function orderRuns(runs, cost) {
  const total = order => order.reduce((t, a, i) => t + order.slice(i + 1).reduce((u, b) => u + cost(a, b), 0), 0);
  if (runs.length <= 6) {
    let best = runs, least = Infinity;
    const permute = (left, done) => {
      if (!left.length) { const c = total(done); if (c < least) { least = c; best = done; } return; }
      left.forEach((r, i) => permute([...left.slice(0, i), ...left.slice(i + 1)], [...done, r]));
    };
    permute(runs, []);
    return best;
  }
  // Many runs: each run goes in where it adds the fewest crossings.
  const order = [];
  runs.forEach(r => {
    let at = 0, least = Infinity;
    for (let k = 0; k <= order.length; k++) {
      const c = order.slice(0, k).reduce((t, q) => t + cost(q, r), 0) + order.slice(k).reduce((t, q) => t + cost(r, q), 0);
      if (c < least) { least = c; at = k; }
    }
    order.splice(at, 0, r);
  });
  return order;
}

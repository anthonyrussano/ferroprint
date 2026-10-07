// Layout for imported diagrams. dagre places the shapes in ranks, as Mermaid does. This file turns
// the result into blueprint connectors: each connector leaves and enters a shape at fixed sides, and
// runs orthogonally through the channels that dagre keeps free for it. Turns happen only in the gaps
// between ranks, and parallel runs in one gap get their own tracks.
//
// Input:  nodes  [{ id, w, h, group }]   `group` is the id of the innermost group, or null.
//         groups [{ id, parent }]
//         edges  [{ id, from, to, label: { w, h } | null, kind }]  `from` and `to` are shape or group ids.
//                `kind` tells connectors apart: connectors of one kind can share a port, like a bus.
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

  const layout = rs => {
    const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
    g.setGraph({ rankdir: dir, nodesep, ranksep: rs, edgesep, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    groups.forEach(gr => g.setNode(gr.id, {}));
    groups.forEach(gr => { if (groupById.has(gr.parent)) g.setParent(gr.id, gr.parent); });
    nodes.forEach(n => { g.setNode(n.id, { width: n.w, height: n.h }); if (groupById.has(n.group)) g.setParent(n.id, n.group); });
    const laid = [];
    // dagre puts the targets of one shape right to left in the order of their connectors. Mermaid shows them
    // left to right, so the connectors go in last first.
    [...edges].reverse().forEach(e => {
      const v = stand(e.from, true), w = stand(e.to, false);
      if (!v || !w || v === w) return;
      const minlen = e.minlen || 1;
      g.setEdge(v, w, e.label ? { width: e.label.w, height: e.label.h, labelpos: 'c', minlen } : { minlen }, e.id);
      laid.push({ e, v, w });
    });
    dagre.layout(g);
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
    // The channel points of all connectors, so a shape does not move onto one.
    const points = laid.flatMap(({ e, v, w }) => { const d = gr.edge({ v, w, name: e.id }); return d && d.points ? d.points.slice(1, -1).map(p => ({ ...frame.to(p), id: e.id })) : []; });
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
        const mover = !keeps(f.v) ? f.v : !keeps(f.w) ? f.w : null;
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
  function zoneBoxes(gr) {
    const depth = g => { let d = 0; for (let x = groupById.get(g.parent); x; x = groupById.get(x.parent)) d++; return d; };
    const zones = new Map();
    [...groups].sort((a, b) => depth(b) - depth(a)).forEach(grp => {
      const kids = [
        ...nodes.filter(n => n.group === grp.id).map(n => { const d = gr.node(n.id); return { x: round(d.x) - n.w / 2, y: round(d.y) - n.h / 2, w: n.w, h: n.h }; }),
        ...groups.filter(x => x.parent === grp.id).map(x => zones.get(x.id)).filter(Boolean)
      ];
      if (!kids.length) return;
      const x0 = Math.floor((Math.min(...kids.map(k => k.x)) - ZONE_PAD) / GRID) * GRID, y0 = Math.floor((Math.min(...kids.map(k => k.y)) - ZONE_PAD_TOP) / GRID) * GRID;
      const x1 = Math.ceil((Math.max(...kids.map(k => k.x + k.w)) + ZONE_PAD) / GRID) * GRID, y1 = Math.ceil((Math.max(...kids.map(k => k.y + k.h)) + ZONE_PAD) / GRID) * GRID;
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
    const zones = zoneBoxes(gr);
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
    zones.forEach((z, id) => {
      const a = frame.to({ x: z.x, y: z.y }), b = frame.to({ x: z.x + z.w, y: z.y + z.h });
      [Math.min(a.y, b.y), Math.max(a.y, b.y)].forEach(y => raw.push([y - 1, y + 1]));
      // A package has a tab on top of its body, so the top of the body is a line too.
      if (groupById.get(id).pkg) { const t = frame.to({ x: z.x, y: z.y + 24 }), u = frame.to({ x: z.x + z.w, y: z.y + 24 }); if (Math.abs(t.y - u.y) < 1) raw.push([t.y - 1, t.y + 1]); }
    });
    raw.sort((a, b) => a[0] - b[0]);
    const bands = [];
    raw.forEach(([a, b]) => { const last = bands[bands.length - 1]; if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b); else bands.push([a, b]); });
    const gaps = bands.slice(1).map((b, i) => ({ lo: bands[i][1], hi: b[0], jogs: [] }));
    const boxes = [...box.values()], midX = (Math.min(...boxes.map(b => b.left)) + Math.max(...boxes.map(b => b.right))) / 2;
    // A channel point matters only inside a band. In a gap, a run can go anywhere, so such points go.
    const inBand = y => bands.some(([a, b]) => y > a + 0.5 && y < b - 0.5);
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
    const things = [...boxes, ...labels];
    const clear = (path, skip) => path.slice(1).every((q, i) => {
      const p = path[i], x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
      return things.every(o => skip.includes(o.id) || x1 <= o.left - PASS || x0 >= o.right + PASS || y1 <= o.top - PASS || y0 >= o.bottom + PASS);
    });

    // 1. The chain of each connector: its ports, and the points where dagre keeps a channel free for it.
    const chains = laid.map(({ e, v, w }) => {
      const S = box.get(v), T = box.get(w), d = gr.edge({ v, w, name: e.id });
      if (!byId.has(e.from) || !byId.has(e.to)) {
        // A connector to a zone: fixed sides from the boxes, so it can get its own point on a busy side.
        // The editor routes it.
        const A = box.get(e.from) || zoneBox(e.from), B = box.get(e.to) || zoneBox(e.to);
        if (!A || !B) return { e, auto: true };
        const sides = A.bottom <= B.top ? ['bottom', 'top'] : B.bottom <= A.top ? ['top', 'bottom'] : A.right <= B.left ? ['right', 'left'] : ['left', 'right'];
        const at = (b, sd) => (sd === 'bottom' ? { x: b.cx, y: b.bottom } : sd === 'top' ? { x: b.cx, y: b.top } : sd === 'right' ? { x: b.right, y: b.cy } : { x: b.left, y: b.cy });
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
      // Connectors of one kind share the middle of the side, like a bus.
      if (kinds.length === 1 && list.length > 1) return;
      const margin = n.margin == null ? 20 : n.margin, lo = (across ? b.left : b.top) + margin, hi = (across ? b.right : b.bottom) - margin, mid = (lo + hi) / 2;
      if (hi < lo) return;
      // Each kind wants its port where its run goes on: the next point of its chain. So the run leaves the port
      // straight. A run at a side of its shape has no such point, so it keeps the order of the shapes it joins.
      const next = x => { const p = x.c.pts; return x.end ? p[p.length - 2] : p[1]; };
      // A bus leaves on the channel of one of its connectors, the one nearest the middle, so that run is straight.
      const want = k => {
        const xs = list.filter(x => kindOf(x) === k).map(x => (across ? next(x).x : x.c.zone ? x.other.cy : null));
        if (xs.some(v => v == null)) return null;
        const center = across ? b.cx : b.cy;
        return xs.sort((u, v) => Math.abs(u - center) - Math.abs(v - center))[0];
      };
      const order = k => { const xs = list.filter(x => kindOf(x) === k).map(x => (across ? x.other.cx : x.other.cy)); return xs.reduce((t, v) => t + v, 0) / xs.length; };
      const pos = new Map(kinds.map(k => [k, want(k)]));
      // A single kind keeps the middle when its channel is not on the side, since the run turns anyway.
      if (kinds.length === 1 && (pos.get(kinds[0]) == null || pos.get(kinds[0]) < lo || pos.get(kinds[0]) > hi)) return;
      if ([...pos.values()].some(v => v == null)) {
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
      list.forEach(x => {
        const at = Math.round(pos.get(kindOf(x))), p = x.c.pts, i = x.end ? p.length - 1 : 0;
        // A port in the middle needs no share.
        if (Math.abs(at - (across ? b.cx : b.cy)) < 0.5) return;
        x.c.slots = x.c.slots || [null, null];
        x.c.slots[x.end] = kinds.indexOf(kindOf(x));
        if (across) p[i] = { ...p[i], x: at };
        else if (x.c.zone) p[i] = { ...p[i], y: at };
        else {
          // A port at a side moves along the side, with the run that leaves it.
          const j = x.end ? i - 1 : 1;
          p[i] = { ...p[i], y: at };
          p[j] = { ...p[j], y: at };
        }
      });
    });

    // 3. Jogs: a change of channel between two chain points happens in the gap between them.
    const firsts = new Map(), lasts = new Map(), count = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    const portKey = (c, end) => `${(end ? c.T : c.S).id}:${c.sides[end]}:${c.slots && c.slots[end] != null ? c.slots[end] : ''}`;
    chains.forEach(c => {
      if (!c.pts || c.zone) return;
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
      if (c.zone) {
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

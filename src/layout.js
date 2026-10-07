// A layered layout for imported diagrams. The shapes go in rows along the direction of their
// connectors, and each row is ordered to cut the number of crossings (the Sugiyama method).
//
// nodes: [{ id, w, h, groups }] where `groups` lists the ids of the groups around the shape, outer first.
// edges: [{ from, to }]. dir: 'TB', 'BT', 'LR' or 'RL'.
// Returns a Map from id to the top-left corner { x, y } of each shape.

const SWEEPS = 12;
const PLACE_PASSES = 6;
const DUMMY = 16;

export function layout(nodes, edges, { dir = 'TB', gapX = 60, gapY = 90, groupGap = 28, groupPad = 60 } = {}) {
  const side = dir === 'LR' || dir === 'RL';
  // The layout works top to bottom. For left to right, the sizes swap here and the axes swap at the end.
  const V = nodes.map((n, i) => ({ id: n.id, w: side ? n.h : n.w, h: side ? n.w : n.h, groups: n.groups || [], i, dummy: false }));
  const at = new Map(V.map(v => [v.id, v]));
  const E = edges.filter(e => at.has(e.from) && at.has(e.to) && e.from !== e.to).map(e => ({ from: at.get(e.from), to: at.get(e.to) }));

  // 1. Cycles: a connector that closes a cycle points the other way while the layers are found.
  const out = new Map(V.map(v => [v, []]));
  E.forEach(e => out.get(e.from).push(e));
  const state = new Map();
  const visit = v => {
    state.set(v, 1);
    out.get(v).forEach(e => {
      const s = state.get(e.to);
      if (s === 1) e.back = true;
      else if (!s) visit(e.to);
    });
    state.set(v, 2);
  };
  V.forEach(v => { if (!state.get(v)) visit(v); });
  const dag = E.map(e => (e.back ? { from: e.to, to: e.from } : e));

  // 2. Layers: each shape goes one row below the lowest shape that points to it.
  const ins = new Map(V.map(v => [v, []])), outs = new Map(V.map(v => [v, []]));
  dag.forEach(e => { ins.get(e.to).push(e.from); outs.get(e.from).push(e.to); });
  const layer = new Map(), deg = new Map(V.map(v => [v, ins.get(v).length])), queue = V.filter(v => !deg.get(v));
  queue.forEach(v => layer.set(v, 0));
  for (let k = 0; k < queue.length; k++) {
    const v = queue[k];
    outs.get(v).forEach(w => {
      layer.set(w, Math.max(layer.get(w) || 0, layer.get(v) + 1));
      deg.set(w, deg.get(w) - 1);
      if (!deg.get(w)) queue.push(w);
    });
  }
  // A shape with no shape above it moves down to sit one row above the first shape it points to.
  [...V].reverse().forEach(v => {
    if (ins.get(v).length || !outs.get(v).length) return;
    layer.set(v, Math.min(...outs.get(v).map(w => layer.get(w))) - 1);
  });

  // 3. Small stand-in points carry a long connector through the rows that it crosses.
  const all = [...V], links = [];
  dag.forEach(e => {
    let prev = e.from;
    for (let l = layer.get(e.from) + 1; l < layer.get(e.to); l++) {
      // A stand-in point belongs to the groups that hold both ends, so it stays inside their zone.
      const groups = [];
      while (groups.length < e.from.groups.length && e.from.groups[groups.length] === e.to.groups[groups.length]) groups.push(e.from.groups[groups.length]);
      const d = { id: null, w: DUMMY, h: DUMMY, groups, i: e.from.i + 0.5, dummy: true };
      layer.set(d, l);
      all.push(d);
      links.push([prev, d]);
      prev = d;
    }
    links.push([prev, e.to]);
  });
  const up = new Map(all.map(v => [v, []])), down = new Map(all.map(v => [v, []]));
  links.forEach(([a, b]) => { down.get(a).push(b); up.get(b).push(a); });
  const rows = [];
  all.forEach(v => { const l = layer.get(v); (rows[l] = rows[l] || []).push(v); });
  for (let l = 0; l < rows.length; l++) rows[l] = (rows[l] || []).sort((a, b) => a.i - b.i);

  // 4. Order: each shape moves toward the mean place of its neighbors in the row before. Shapes of one group stay together.
  const depth = Math.max(0, ...V.map(v => v.groups.length));
  const pos = new Map();
  const index = () => rows.forEach(r => r.forEach((v, k) => pos.set(v, k)));
  index();
  const sortRow = (row, near) => {
    const bc = new Map(row.map(v => {
      const ns = near.get(v);
      return [v, ns.length ? ns.reduce((t, w) => t + pos.get(w), 0) / ns.length : pos.get(v)];
    }));
    // The key of a group is the mean of its members in this row, so a group moves as one block.
    const groupKey = new Map();
    row.forEach(v => v.groups.forEach(g => { const k = groupKey.get(g) || [0, 0]; groupKey.set(g, [k[0] + bc.get(v), k[1] + 1]); }));
    const key = v => Array.from({ length: depth + 1 }, (_, d) => (d < v.groups.length ? groupKey.get(v.groups[d])[0] / groupKey.get(v.groups[d])[1] : bc.get(v)));
    const keys = new Map(row.map(v => [v, key(v)]));
    row.sort((a, b) => { const ka = keys.get(a), kb = keys.get(b); for (let d = 0; d < ka.length; d++) if (ka[d] !== kb[d]) return ka[d] - kb[d]; return pos.get(a) - pos.get(b); });
    row.forEach((v, k) => pos.set(v, k));
  };
  const crossings = () => {
    let c = 0;
    for (let l = 0; l + 1 < rows.length; l++) {
      const pairs = rows[l].flatMap(v => down.get(v).map(w => [pos.get(v), pos.get(w)]));
      for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) if ((pairs[i][0] - pairs[j][0]) * (pairs[i][1] - pairs[j][1]) < 0) c++;
    }
    return c;
  };
  let best = rows.map(r => r.slice()), bestC = crossings();
  for (let s = 0; s < SWEEPS && bestC > 0; s++) {
    if (s % 2 === 0) for (let l = 1; l < rows.length; l++) sortRow(rows[l], up);
    else for (let l = rows.length - 2; l >= 0; l--) sortRow(rows[l], down);
    const c = crossings();
    if (c < bestC) { bestC = c; best = rows.map(r => r.slice()); }
  }
  best.forEach((r, l) => { rows[l] = r; });
  index();

  // 5. Places. Rows stack down. In a row, each shape moves toward the middle of its neighbors without overlap.
  const sep = (a, b) => {
    let shared = 0;
    while (shared < a.groups.length && shared < b.groups.length && a.groups[shared] === b.groups[shared]) shared++;
    const extra = a.dummy || b.dummy ? 0 : groupGap * (Math.max(a.groups.length, b.groups.length) - shared);
    return (a.w + b.w) / 2 + (a.dummy || b.dummy ? gapX / 3 : gapX) + extra;
  };
  const cx = new Map();
  rows.forEach(r => { let x = 0; r.forEach((v, k) => { if (k) x += sep(r[k - 1], v); cx.set(v, x); }); const mid = x / 2; r.forEach(v => cx.set(v, cx.get(v) - mid)); });
  const settle = (r, want) => {
    const xs = r.map(v => want.get(v));
    for (let k = 1; k < r.length; k++) xs[k] = Math.max(xs[k], xs[k - 1] + sep(r[k - 1], r[k]));
    for (let k = r.length - 2; k >= 0; k--) xs[k] = Math.min(xs[k], xs[k + 1] - sep(r[k], r[k + 1]));
    // The second pass can push a shape past its left neighbor, so the first pass runs again.
    for (let k = 1; k < r.length; k++) xs[k] = Math.max(xs[k], xs[k - 1] + sep(r[k - 1], r[k]));
    const shift = r.reduce((t, v, k) => t + want.get(v) - xs[k], 0) / (r.length || 1);
    r.forEach((v, k) => cx.set(v, xs[k] + shift));
  };
  for (let p = 0; p < PLACE_PASSES; p++) {
    const order = p % 2 === 0 ? rows.map((r, l) => l).slice(1) : rows.map((r, l) => l).reverse().slice(1);
    order.forEach(l => {
      const near = p % 2 === 0 ? up : down, want = new Map();
      rows[l].forEach(v => { const ns = near.get(v); want.set(v, ns.length ? ns.reduce((t, w) => t + cx.get(w), 0) / ns.length : cx.get(v)); });
      settle(rows[l], want);
    });
  }
  // 6. Groups: a shape outside a group moves out of the band that the group covers in its rows,
  // so the zone of the group does not cover the shape. Inner groups go first.
  const gids = [...new Set(all.flatMap(v => v.groups))];
  const level = g => Math.max(...all.filter(v => v.groups.includes(g)).map(v => v.groups.length - v.groups.indexOf(g)));
  gids.sort((a, b) => level(a) - level(b)).forEach(g => {
    const members = all.filter(v => v.groups.includes(g) && !v.dummy);
    if (!members.length) return;
    const pad = groupPad * level(g), ls = members.map(v => layer.get(v));
    const b0 = Math.min(...members.map(v => cx.get(v) - v.w / 2)) - pad, b1 = Math.max(...members.map(v => cx.get(v) + v.w / 2)) + pad, mid = (b0 + b1) / 2;
    for (let l = Math.min(...ls); l <= Math.max(...ls); l++) {
      const r = rows[l], inside = r.map(v => v.groups.includes(g));
      const first = inside.indexOf(true), last = inside.lastIndexOf(true);
      const left = r.filter((v, k) => !inside[k] && (first >= 0 ? k < first : cx.get(v) < mid));
      const right = r.filter((v, k) => !inside[k] && (first >= 0 ? k > last : cx.get(v) >= mid));
      if (left.length) { const v = left[left.length - 1], d = cx.get(v) + v.w / 2 - b0; if (d > 0) left.forEach(q => cx.set(q, cx.get(q) - d)); }
      if (right.length) { const v = right[0], d = b1 - (cx.get(v) - v.w / 2); if (d > 0) right.forEach(q => cx.set(q, cx.get(q) + d)); }
    }
  });

  const top = [];
  let y = 0;
  rows.forEach((r, l) => { top[l] = y; y += Math.max(0, ...r.map(v => v.h)) + gapY; });

  // 7. Back to the asked direction, with the top-left corner of the drawing at (0, 0).
  const res = new Map();
  V.forEach(v => {
    const l = layer.get(v), rowH = Math.max(...rows[l].map(q => q.h));
    let px = cx.get(v) - v.w / 2, py = top[l] + (rowH - v.h) / 2, w = v.w, h = v.h;
    if (dir === 'BT') py = -py - h;
    if (side) { [px, py] = [py, px]; [w, h] = [h, w]; if (dir === 'RL') px = -px - w; }
    res.set(v.id, { x: px, y: py, w, h });
  });
  const minX = Math.min(...[...res.values()].map(r => r.x)), minY = Math.min(...[...res.values()].map(r => r.y));
  const out2 = new Map();
  res.forEach((r, id) => out2.set(id, { x: r.x - minX, y: r.y - minY }));
  return out2;
}

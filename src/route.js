// Orthogonal routes around shapes, for elbow connectors without manual bends.
// The router puts grid lines on the edges of the shapes near the connector, with a margin, and
// finds the shortest path on that grid with the fewest turns (A*).

// The space between a route and a shape. It is also the length of the stub out of each shape.
export const MARGIN = 16;
// The cost of one turn, in px of length. A higher cost gives fewer turns and longer routes.
const TURN = 28;
// A larger grid is not routed. The connector then keeps its simple route.
const MAX_NODES = 60000;
// Right, down, left, up.
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const SIDE_DIR = { right: 0, bottom: 1, left: 2, top: 3 };

export function sidePoint(b, s) {
  if (s === 'left') return { x: b.x, y: b.y + b.h / 2 };
  if (s === 'right') return { x: b.x + b.w, y: b.y + b.h / 2 };
  if (s === 'top') return { x: b.x + b.w / 2, y: b.y };
  return { x: b.x + b.w / 2, y: b.y + b.h };
}
const grow = (b, m) => ({ x0: b.x - m, y0: b.y - m, x1: b.x + b.w + m, y1: b.y + b.h + m });

// True when a polyline runs through a box, or along its border. Axis-aligned segments only.
const TOUCH = 2;
export function crosses(pts, boxes) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (const o of boxes) {
      if (x1 > o.x - TOUCH && x0 < o.x + o.w + TOUCH && y1 > o.y - TOUCH && y0 < o.y + o.h + TOUCH) return true;
    }
  }
  return false;
}

// A small binary heap of [priority, value].
class Heap {
  constructor() { this.p = []; this.v = []; }
  get size() { return this.p.length; }
  push(pr, val) {
    const p = this.p, v = this.v;
    let i = p.length;
    p.push(pr); v.push(val);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] <= pr) break;
      p[i] = p[up]; v[i] = v[up]; i = up;
    }
    p[i] = pr; v[i] = val;
  }
  pop() {
    const p = this.p, v = this.v, top = v[0], lp = p.pop(), lv = v.pop();
    if (p.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= p.length) break;
        if (c + 1 < p.length && p[c + 1] < p[c]) c++;
        if (p[c] >= lp) break;
        p[i] = p[c]; v[i] = v[c]; i = c;
      }
      p[i] = lp; v[i] = lv;
    }
    return top;
  }
}

// Grid lines keep their exact values, so the tests against the box edges below agree with the lines.
const EPS = 1e-6;
const uniq = list => list.slice().sort((a, b) => a - b).filter((v, i, all) => !i || v - all[i - 1] > EPS);
const firstAtLeast = (list, v) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] < v - EPS) lo = m + 1; else hi = m; } return lo; };
const indexOf = (list, v) => { const i = firstAtLeast(list, v); return i < list.length && Math.abs(list[i] - v) <= EPS ? i : -1; };

// Finds a route from box a to box b. `sidesA` and `sidesB` are the sides that each end can use. `portA` and
// `portB` give the point where a connector meets a side, when it is not the middle of the side.
// Returns { pts, sides } with the points from the edge of a to the edge of b, or null.
export function route(a, b, sidesA, sidesB, obstacles, portA = s => sidePoint(a, s), portB = s => sidePoint(b, s)) {
  const M = MARGIN, blocks = [...obstacles.map(o => grow(o, M)), grow(a, M), grow(b, M)];
  // The first turn of a route is on the grown box, straight out from the port.
  const out = (bx, s, p) => (s === 'left' ? { x: bx.x - M, y: p.y } : s === 'right' ? { x: bx.x + bx.w + M, y: p.y } : s === 'top' ? { x: p.x, y: bx.y - M } : { x: p.x, y: bx.y + bx.h + M });
  const starts = sidesA.map(s => { const p = portA(s); return { s, p, q: out(a, s, p) }; });
  const ends = sidesB.map(s => { const p = portB(s); return { s, p, q: out(b, s, p) }; });
  const xs = uniq([...blocks.flatMap(r => [r.x0, r.x1]), ...starts.map(t => t.q.x), ...ends.map(t => t.q.x), (a.x + a.w + b.x) / 2, (b.x + b.w + a.x) / 2]);
  const ys = uniq([...blocks.flatMap(r => [r.y0, r.y1]), ...starts.map(t => t.q.y), ...ends.map(t => t.q.y), (a.y + a.h + b.y) / 2, (b.y + b.h + a.y) / 2]);
  const nx = xs.length, ny = ys.length, n = nx * ny;
  if (n > MAX_NODES) return null;
  // A grid segment is blocked when it runs through the inside of a grown box.
  const blockH = new Uint8Array(n), blockV = new Uint8Array(n);
  blocks.forEach(r => {
    const i0 = firstAtLeast(xs, r.x0), i1 = firstAtLeast(xs, r.x1), j0 = firstAtLeast(ys, r.y0), j1 = firstAtLeast(ys, r.y1);
    for (let j = j0; j <= j1 && j < ny; j++) {
      const inY = ys[j] > r.y0 + EPS && ys[j] < r.y1 - EPS;
      for (let i = i0; i <= i1 && i < nx; i++) {
        // Segment from node (i, j) to the right: inside when the row is inside and the span is inside.
        if (inY && i < i1 && xs[i] >= r.x0 - EPS && xs[i + 1] <= r.x1 + EPS) blockH[j * nx + i] = 1;
        const inX = xs[i] > r.x0 + EPS && xs[i] < r.x1 - EPS;
        if (inX && j < j1 && ys[j] >= r.y0 - EPS && ys[j + 1] <= r.y1 + EPS) blockV[j * nx + i] = 1;
      }
    }
  });
  const target = new Map();
  ends.forEach(t => {
    const i = indexOf(xs, t.q.x), j = indexOf(ys, t.q.y);
    if (i >= 0 && j >= 0) target.set(j * nx + i, [...(target.get(j * nx + i) || []), t]);
  });
  if (!target.size) return null;
  const h = (i, j) => Math.min(...ends.map(t => Math.abs(xs[i] - t.q.x) + Math.abs(ys[j] - t.q.y)));
  // A state is a node and the direction of travel into it. One extra state per end side marks the arrival.
  const states = n * 4, g = new Float64Array(states + ends.length).fill(Infinity), from = new Int32Array(states + ends.length).fill(-1);
  const heap = new Heap();
  starts.forEach(t => {
    const i = indexOf(xs, t.q.x), j = indexOf(ys, t.q.y);
    if (i < 0 || j < 0) return;
    const st = (j * nx + i) * 4 + SIDE_DIR[t.s];
    if (g[st] > 0) { g[st] = 0; from[st] = -2 - starts.indexOf(t); heap.push(h(i, j), st); }
  });
  let done = -1;
  while (heap.size) {
    const st = heap.pop();
    if (st >= states) { done = st; break; }
    const node = st >> 2, dir = st & 3, i = node % nx, j = (node - i) / nx, cost = g[st];
    const arrive = target.get(node);
    if (arrive) {
      arrive.forEach(t => {
        // The last run goes into the shape, so a different direction costs one turn.
        const k = states + ends.indexOf(t), c = cost + (dir === (SIDE_DIR[t.s] + 2) % 4 ? 0 : TURN);
        if (c < g[k]) { g[k] = c; from[k] = st; heap.push(c, k); }
      });
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (dir + 2) % 4) continue;
      const ni = i + DX[nd], nj = j + DY[nd];
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      if (nd === 0 && blockH[node]) continue;
      if (nd === 2 && blockH[node - 1]) continue;
      if (nd === 1 && blockV[node]) continue;
      if (nd === 3 && blockV[node - nx]) continue;
      const next = nj * nx + ni, ns = next * 4 + nd;
      const c = cost + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (nd === dir ? 0 : TURN);
      if (c < g[ns]) { g[ns] = c; from[ns] = st; heap.push(c + h(ni, nj), ns); }
    }
  }
  if (done < 0) return null;
  const end = ends[done - states], pts = [end.p];
  let st = from[done], start = null;
  while (st >= 0) {
    const node = st >> 2, i = node % nx, j = (node - i) / nx;
    pts.push({ x: xs[i], y: ys[j] });
    const prev = from[st];
    if (prev < -1) start = starts[-2 - prev];
    st = prev;
  }
  if (!start) return null;
  pts.push(start.p);
  pts.reverse();
  return { pts, sides: [start.s, end.s] };
}

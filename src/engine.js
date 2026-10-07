// Ferroprint engine: constants, geometry, document model, export helpers.
import { SYMBOLS } from './library.jsx';
import { isCloudKey, cloudIcon, cloudLabel, cloudProvider, PROVIDER_NAME, FRAME } from './cloud.js';
import { route as findRoute, crosses, MARGIN } from './route.js';

export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const LETTER = {
  technical: { id: 'technical', family: "'Barlow Condensed', 'Arial Narrow', sans-serif", weight: 500, ls: 0.05, lh: 1.15 },
  hand: { id: 'hand', family: "'Architects Daughter', 'Comic Sans MS', cursive", weight: 400, ls: 0.03, lh: 1.3 }
};
export const SIZES = { s: 13, m: 16, l: 22 };
export const WEIGHTS = { s: 1.5, m: 3, l: 6 };
const BASE_SHAPES = {
  box: { name: 'Box', w: 160, h: 80, label: 'Component' },
  service: { name: 'Service', w: 160, h: 80, label: 'Service' },
  database: { name: 'Database', w: 120, h: 110, label: 'Database' },
  queue: { name: 'Queue', w: 200, h: 70, label: 'Queue' },
  actor: { name: 'Actor', w: 60, h: 90, label: 'User' },
  zone: { name: 'Zone', w: 420, h: 280, label: 'Zone' },
  decision: { name: 'Decision', w: 160, h: 100, label: 'Decision?' },
  terminal: { name: 'Terminal', w: 140, h: 56, label: 'Start' },
  window: { name: 'Window', w: 360, h: 260, label: 'Window' },
  button: { name: 'Button', w: 120, h: 40, label: 'Button' },
  input: { name: 'Input', w: 240, h: 40, label: 'Input' },
  image: { name: 'Image', w: 160, h: 120, label: 'Image' },
  room: { name: 'Room', w: 240, h: 200, label: 'Room' },
  note: { name: 'Note', w: 200, h: 120, label: 'Note' },
  text: { name: 'Text', w: 160, h: 40, label: 'Label' }
};
// Every shape a tool can place: the palette shapes and the library symbols.
export const SHAPES = { ...BASE_SHAPES, ...Object.fromEntries(Object.values(SYMBOLS).map(s => [s.id, { name: s.name, w: s.w, h: s.h, label: s.label }])) };
const symbolSet = test => Object.fromEntries(Object.values(SYMBOLS).filter(test).map(s => [s.id, 1]));
export const TYPE_NAME = { path: 'Freehand', line: 'Line', cloud: 'Cloud icon', class: 'Class', ...Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.name])) };
export const TOOL_NAMES = { select: 'Select', hand: 'Pan', connector: 'Connector', pen: 'Pen', line: 'Line / wall', arrow: 'Arrow', ...Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.name])) };
export const KEYS = { v: 'select', h: 'hand', c: 'connector', p: 'pen', l: 'line', a: 'arrow', b: 'box', r: 'service', d: 'database', q: 'queue', u: 'actor', g: 'zone', k: 'decision', e: 'terminal', w: 'window', o: 'button', i: 'input', m: 'image', n: 'note', t: 'text' };
export const KEY_OF = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [v, k.toUpperCase()]));
export const HINTS = {
  select: 'Click to select · drag to move · shift-click to add',
  hand: 'Drag to pan the sheet',
  connector: 'Drag from one shape to another',
  pen: 'Draw freehand strokes',
  line: 'Drag to draw · shift snaps to 45°',
  arrow: 'Drag to draw an arrow · shift snaps to 45°',
  zone: 'Drag to frame a region'
};
export const LABELLESS = { path: 1, line: 1, ...symbolSet(s => !s.lab) };
export const NOFILL = { text: 1, actor: 1, path: 1, line: 1, cloud: 1, ...symbolSet(s => !s.fill) };
// Shapes without a line style: a cloud icon keeps the lines of its source drawing.
export const NOLINE = { cloud: 1 };
// Shapes that rotate in 90° steps and mirror, such as doors and furniture.
export const TURN = symbolSet(s => s.turn);
// Shapes with the label under the drawing, so the label is part of the hit area.
const BELOW = { actor: 1, cloud: 1, ...symbolSet(s => s.below) };

// A tool places a palette shape, a library symbol, a cloud icon ("cloud:<key>") or a frame ("frame:<id>").
export const CLOUD_SIZE = 48;
export function toolShape(tool) {
  if (SHAPES[tool]) return { type: tool, ...SHAPES[tool] };
  if (typeof tool === 'string' && tool.startsWith('uml:') && UML[tool.slice(4)]) {
    const u = UML[tool.slice(4)];
    if (u.pkg) return { type: 'zone', name: u.name, w: 480, h: 320, label: u.label, dashed: false, pkg: true };
    return { type: 'class', name: u.name, w: 200, h: 120, label: u.label, kind: tool.slice(4), attrs: u.attrs, ops: u.ops };
  }
  if (typeof tool === 'string' && tool.startsWith('frame:') && FRAME[tool.slice(6)]) {
    const f = FRAME[tool.slice(6)];
    return { type: 'zone', name: `${PROVIDER_NAME[f.p]} ${f.name}`, w: f.w, h: f.h, label: f.name, icon: f.icon, dashed: !f.solid };
  }
  if (typeof tool === 'string' && tool.startsWith('cloud:') && isCloudKey(tool.slice(6))) {
    const key = tool.slice(6), ic = cloudIcon(key);
    return { type: 'cloud', icon: key, name: ic ? ic.n : 'Cloud icon', w: CLOUD_SIZE, h: CLOUD_SIZE, label: cloudLabel(ic) };
  }
  return null;
}
export const toolName = tool => (TOOL_NAMES[tool] || (toolShape(tool) || {}).name || tool);
export function nodeTitle(n) {
  if (n.type === 'class') return (UML[n.kind] || UML.class).name;
  if (n.type === 'zone' && n.pkg) return 'Package';
  if (n.type !== 'cloud') return TYPE_NAME[n.type] || n.type;
  const ic = cloudIcon(n.icon);
  return ic ? cloudLabel(ic) : 'Cloud icon';
}
export const nodeMeta = n => (n.locked ? 'LOCKED' : n.type === 'cloud' ? PROVIDER_NAME[cloudProvider(n.icon)] : null);
// The cloud set a shape needs: a cloud icon, or a zone with a frame icon.
export const nodeCloud = n => (n.icon && isCloudKey(n.icon) ? cloudProvider(n.icon) : null);
export const THEMES = {
  blue: { paper: '#1e4d8c', ink: '#eef4ff', muted: 'rgba(238,244,255,0.74)', panel: '#1a4580', hover: 'rgba(238,244,255,0.10)', line: 'rgba(238,244,255,0.32)', minor: 'rgba(238,244,255,0.075)', major: 'rgba(238,244,255,0.17)', tint: 'rgba(238,244,255,0.10)', hatch: 'rgba(238,244,255,0.42)', accent: '#f4bf4f', accentInk: '#1a2a48', vig: 'rgba(3,12,36,0.40)', tex: [1, 1, 1] },
  white: { paper: '#f4f2eb', ink: '#24398a', muted: 'rgba(36,57,138,0.78)', panel: '#ece9df', hover: 'rgba(36,57,138,0.08)', line: 'rgba(36,57,138,0.30)', minor: 'rgba(36,57,138,0.07)', major: 'rgba(36,57,138,0.15)', tint: 'rgba(36,57,138,0.07)', hatch: 'rgba(36,57,138,0.38)', accent: '#d1432f', accentInk: '#ffffff', vig: 'rgba(80,64,20,0.14)', tex: [0.14, 0.22, 0.54] }
};
export const HANDLES = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
export const HCUR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
export const NORM = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

export const UNITS = ['px', 'ft', 'm'];
export const GRIDS = [10, 20, 25];
export const ROUTES = ['elbow', 'straight', 'curve'];
export const DEFAULT_SETTINGS = { lettering: 'hand', caps: true, grid: 20, route: 'elbow' };

// ---------- small helpers
export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const f1 = v => Math.round(v * 10) / 10;
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const slug = s => (String(s || 'sheet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sheet');
export const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export const today = () => new Date().toISOString().slice(0, 10);

// ---------- geometry
// The point on side s of box b, at share `at` along the side. 0.5 is the middle.
export function sidePt(b, s, at = 0.5) {
  if (s === 'left') return { x: b.x, y: b.y + b.h * at };
  if (s === 'right') return { x: b.x + b.w, y: b.y + b.h * at };
  if (s === 'top') return { x: b.x + b.w * at, y: b.y };
  return { x: b.x + b.w * at, y: b.y + b.h };
}
// Shapes with straight sides, where a connector can meet a side away from its middle. A stadium has round ends.
const SLIDE = { box: 1, class: 1, note: 1, subproc: 1, text: 1, window: 1, button: 1, input: 1, image: 1, room: 1, zone: 1, service: 1, terminal: 'tb' };
// The share along side s where a connector meets shape n. A share keeps clear of round corners.
export function portShare(n, s, at) {
  const ok = SLIDE[n.type], across = s === 'top' || s === 'bottom';
  if (typeof at !== 'number' || !ok || (ok === 'tb' && !across)) return 0.5;
  const len = across ? n.w : n.h, r = n.type === 'terminal' ? n.h / 2 : n.type === 'service' ? Math.min(12, n.h / 2) : 0;
  const m = Math.min(0.5, (r + 8) / Math.max(1, len));
  return clamp(at, m, 1 - m);
}
// The point where a connector meets side s of shape n. Some symbols have a slanted or curved side, so the
// point moves onto their outline.
export function portPoint(n, s, at) {
  const share = portShare(n, s, at), p = sidePt(n, s, share), w = n.w, h = n.h;
  if (n.type === 'fdoc' && s === 'bottom') return { x: p.x, y: n.y + h * 0.83 };
  if (n.type === 'manual' && s === 'top') return { x: p.x, y: n.y + h * 0.15 };
  if (n.type === 'data' || n.type === 'manualop') {
    const k = Math.min(w * (n.type === 'data' ? 0.2 : 0.15), h * 0.5) / 2;
    if (s === 'left') return { x: n.x + k, y: p.y };
    if (s === 'right') return { x: n.x + w - k, y: p.y };
  }
  if (n.type === 'store' && s === 'right') return { x: n.x + w - Math.min(w * 0.12, h * 0.25), y: p.y };
  return p;
}
export function autoSides(a, b) {
  const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (gx >= gy) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}
export function clipBox(c, to, b) {
  const dx = to.x - c.x, dy = to.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? (b.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (b.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return { x: c.x + dx * s, y: c.y + dy * s };
}
export const unit = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
export function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
}
export const inter = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const within = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
export const rectFrom = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

// Some shapes put the label below the drawing, so their hit area is larger than their box.
export function hitBox(n) {
  if (!BELOW[n.type]) return { x: n.x, y: n.y, w: n.w, h: n.h };
  const pad = n.w < 120 ? 20 : 0;
  return { x: n.x - pad, y: n.y, w: n.w + 2 * pad, h: n.h + 30 };
}
// Turns a shape 90° clockwise about its center. The box stays axis-aligned, so its width and height swap.
export function rotateNode(n) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  return { ...n, rot: ((n.rot || 0) + 90) % 360, x: Math.round(cx - n.h / 2), y: Math.round(cy - n.w / 2), w: n.h, h: n.w };
}
export function plainBounds(ns) {
  if (!ns.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ns.forEach(n => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h); });
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function bounds(ns) {
  const b = plainBounds(ns.map(hitBox));
  return b && { ...b, w: Math.max(1, b.w), h: Math.max(1, b.h) };
}
export const linePts = n => (n.pts || []).map(([a, b]) => ({ x: n.x + a * n.w, y: n.y + b * n.h }));
export function pathFrom(pts) {
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  return { x, y, w, h, pts: pts.map(q => [w ? +((q.x - x) / w).toFixed(4) : 0, h ? +((q.y - y) / h).toFixed(4) : 0]) };
}
export function constrain(a, b) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x), s = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: Math.round(a.x + Math.cos(s) * l), y: Math.round(a.y + Math.sin(s) * l) };
}
// ---------- connectors
// A connector leaves and enters a shape on a side. "auto" lets the router choose the side.
export const SIDES = ['auto', 'top', 'right', 'bottom', 'left'];
const STUB = 16;
const fixedSide = s => (s && s !== 'auto' ? s : null);
const centerOf = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
// The side of box b that faces point q.
const sideToward = (b, q) => autoSides(b, { x: q.x, y: q.y, w: 0, h: 0 })[0];
const along = (p, n, d) => ({ x: p.x + n.x * d, y: p.y + n.y * d });
const same = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

// Removes repeated points and points in the middle of a straight run.
function simplify(pts) {
  const out = [];
  pts.forEach(p => {
    if (out.length && same(out[out.length - 1], p)) return;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > 0.01) break;
      // A point where the path turns back is a corner, not a point in the middle of a run.
      if ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) break;
      out.splice(out.length - 2, 1);
    }
  });
  return out;
}
const lengthOf = pts => pts.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
// The point at a share of the length of a polyline.
function pointAt(pts, f) {
  let left = lengthOf(pts) * f;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= l && l > 0) return { x: a.x + ((b.x - a.x) * left) / l, y: a.y + ((b.y - a.y) * left) / l };
    left -= l;
  }
  return pts[pts.length - 1];
}
// Joins two points with one horizontal and one vertical run. The first run follows the axis.
function join(a, b, axis) {
  if (Math.abs(a.x - b.x) < 0.01) return { pts: [b], axis: 'v' };
  if (Math.abs(a.y - b.y) < 0.01) return { pts: [b], axis: 'h' };
  return { pts: [axis === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y }, b], axis: axis === 'h' ? 'v' : 'h' };
}
// The direction from a to b: 0 right, 1 down, 2 left, 3 up, or -1 for the same point.
const dirOf = (a, b) => (Math.abs(a.x - b.x) > 0.01 ? (b.x > a.x ? 0 : 2) : Math.abs(a.y - b.y) > 0.01 ? (b.y > a.y ? 1 : 3) : -1);
const turnCost = (d0, d1) => (d0 < 0 || d1 < 0 || d0 === d1 ? 0 : (d0 + 2) % 4 === d1 ? 100 : 1);
function turnsBack(pts) {
  let d = -1;
  for (let i = 1; i < pts.length; i++) {
    const n = dirOf(pts[i - 1], pts[i]);
    if (n < 0) continue;
    if (d >= 0 && (d + 2) % 4 === n) return true;
    d = n;
  }
  return false;
}
// The L for each run between the points qs, with the fewest turns and no run that turns back.
// d0 is the direction into the first point, and dEnd the direction out of the last point.
function fewestTurns(qs, d0, dEnd) {
  let best = new Map([[d0, { cost: 0, legs: [] }]]);
  for (let i = 0; i < qs.length - 1; i++) {
    const a = qs[i], b = qs[i + 1], next = new Map();
    const opts = Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01 ? [[b]] : [[{ x: b.x, y: a.y }, b], [{ x: a.x, y: b.y }, b]];
    best.forEach((st, din) => opts.forEach(o => {
      let cost = st.cost, d = din, cur = a;
      o.forEach(q => { const n = dirOf(cur, q); if (n >= 0) { cost += turnCost(d, n); d = n; } cur = q; });
      const had = next.get(d);
      if (!had || cost < had.cost) next.set(d, { cost, legs: [...st.legs, o] });
    }));
    best = next;
  }
  let out = null;
  best.forEach((st, d) => { const c = st.cost + turnCost(d, dEnd); if (!out || c < out.cost) out = { cost: c, legs: st.legs }; });
  return out.legs;
}
// The turns between two stubs when the connector has no bends.
function elbowTurns(a1, n1, b2, n2) {
  const h1 = !!n1.x, h2 = !!n2.x, mx = (a1.x + b2.x) / 2, my = (a1.y + b2.y) / 2;
  if (h1 && h2) return n1.x * (b2.x - a1.x) >= 0 ? [{ x: mx, y: a1.y }, { x: mx, y: b2.y }] : [{ x: a1.x, y: my }, { x: b2.x, y: my }];
  if (!h1 && !h2) return n1.y * (b2.y - a1.y) >= 0 ? [{ x: a1.x, y: my }, { x: b2.x, y: my }] : [{ x: mx, y: a1.y }, { x: mx, y: b2.y }];
  if (h1) return [n1.x * (b2.x - a1.x) >= 0 ? { x: b2.x, y: a1.y } : { x: a1.x, y: b2.y }];
  return [n1.y * (b2.y - a1.y) >= 0 ? { x: a1.x, y: b2.y } : { x: b2.x, y: a1.y }];
}
const polyD = pts => 'M' + pts.map(q => `${f1(q.x)} ${f1(q.y)}`).join(' L');

// The automatic route: sides that face each other, and one turn in the middle.
function autoGeom(e, a, b, route) {
  if (route === 'straight') {
    const ac = centerOf(a), bc = centerOf(b);
    const p1 = clipBox(ac, bc, a), p2 = clipBox(bc, ac, b), mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return { d: `M${p1.x} ${p1.y} L${p2.x} ${p2.y}`, p1, p2, mid, endDir: unit(p1, p2), startDir: unit(p2, p1), handles: [{ ...mid, i: 0 }], poly: [p1, p2] };
  }
  const [s1, s2] = autoSides(a, b), p1 = portPoint(a, s1), p2 = portPoint(b, s2);
  if (route === 'curve') {
    const n1 = NORM[s1], n2 = NORM[s2], kk = Math.max(30, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.45);
    const c1 = along(p1, n1, kk), c2 = along(p2, n2, kk), mid = bez(p1, c1, c2, p2, 0.5);
    return { d: `M${p1.x} ${p1.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`, p1, p2, mid, endDir: unit(c2, p2), startDir: unit(c1, p1), handles: [{ ...mid, i: 0 }], poly: Array.from({ length: 17 }, (_, k) => bez(p1, c1, c2, p2, k / 16)) };
  }
  let pts;
  if (s1 === 'left' || s1 === 'right') { const mx = Math.round((p1.x + p2.x) / 2); pts = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2]; }
  else { const my = Math.round((p1.y + p2.y) / 2); pts = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2]; }
  const mid = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
  return { d: 'M' + pts.map(q => `${q.x} ${q.y}`).join(' L'), p1, p2, mid, endDir: { x: -NORM[s2].x, y: -NORM[s2].y }, startDir: { x: -NORM[s1].x, y: -NORM[s1].y }, handles: [{ ...mid, i: 0 }], pts, poly: pts };
}

// Connector geometry. `handles` are the points where a drag adds a bend: index i inserts before bend i.
// With `obstacles`, an elbow connector without bends goes around the shapes in its way. Its geometry then
// has `seed`: the turns of the route, which become the bends when a drag adds a bend.
export function edgeGeom(e, map, obstacles) {
  const a = map[e.from], b = map[e.to];
  if (!a || !b) return null;
  let geo = baseGeom(e, a, b);
  if ((e.route || 'elbow') === 'elbow' && !(e.pts && e.pts.length) && obstacles && obstacles.length && geo.pts) geo = avoid(geo, a, b, e, obstacles) || geo;
  // `lp` is the place of the label. `lt` on the connector moves it along the path, as a share of the length.
  return { ...geo, lp: typeof e.lt === 'number' && geo.poly ? pointAt(geo.poly, e.lt) : geo.mid };
}
// The boxes that elbow connectors go around: every shape except zones, lines and freehand strokes.
export const obstaclesOf = nodes => nodes.filter(n => n.type !== 'zone' && n.type !== 'path' && n.type !== 'line').map(n => ({ id: n.id, ...hitBox(n) }));
const ALL_SIDES = ['top', 'right', 'bottom', 'left'];
// Routes repeat while one shape moves: the other connectors keep their ends and the shapes near them.
// A small cache keeps those routes, so the router runs only for connectors near the shape that moves.
const ROUTE_CACHE = new Map(), ROUTE_CACHE_MAX = 500;
const boxKey = b => `${b.x},${b.y},${b.w},${b.h}`;
function cachedRoute(a, b, sa, sb, use, e) {
  const fa = sa.length === 1 ? e.fromAt : undefined, ta = sb.length === 1 ? e.toAt : undefined;
  const key = [boxKey(a), boxKey(b), a.type, b.type, sa.join(), sb.join(), fa, ta, ...use.map(boxKey)].join('|');
  if (ROUTE_CACHE.has(key)) { const hit = ROUTE_CACHE.get(key); ROUTE_CACHE.delete(key); ROUTE_CACHE.set(key, hit); return hit; }
  const r = findRoute(a, b, sa, sb, use, s => portPoint(a, s, fa), s => portPoint(b, s, ta));
  ROUTE_CACHE.set(key, r);
  if (ROUTE_CACHE.size > ROUTE_CACHE_MAX) ROUTE_CACHE.delete(ROUTE_CACHE.keys().next().value);
  return r;
}
const grown = (b, m) => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });
function avoid(geo, a, b, e, obstacles) {
  const fs = fixedSide(e.fromSide), ts = fixedSide(e.toSide);
  // A shape that touches an end, or holds it, such as a window around its buttons, is not in the way.
  const ga = grown(a, MARGIN), gb = grown(b, MARGIN);
  const others = obstacles.filter(o => o.id !== a.id && o.id !== b.id && !inter(o, ga) && !inter(o, gb));
  if (inter(ga, gb) || !crosses(geo.pts, others)) return null;
  // Route among the shapes near the two ends first. If the route meets a shape further out, add it and route again.
  const near = grown(rectFrom({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x + a.w, b.x + b.w), y: Math.max(a.y + a.h, b.y + b.h) }), 160);
  let use = others.filter(o => inter(o, near));
  for (let k = 0; k < 4; k++) {
    const r = cachedRoute(a, b, fs ? [fs] : ALL_SIDES, ts ? [ts] : ALL_SIDES, use, e);
    if (!r) return null;
    const all = simplify(r.pts), hit = others.filter(o => !use.includes(o) && crosses(all, [o]));
    // A route must never cross a shape that it was given. If it does, the simple route stays.
    if (crosses(all, use)) return null;
    if (!hit.length) {
      const handles = [];
      all.slice(1).forEach((q, i) => { if (Math.hypot(q.x - all[i].x, q.y - all[i].y) > 24) handles.push({ x: (q.x + all[i].x) / 2, y: (q.y + all[i].y) / 2, i }); });
      const p1 = all[0], p2 = all[all.length - 1];
      return { d: polyD(all), p1, p2, mid: pointAt(all, 0.5), endDir: unit(all[all.length - 2], p2), startDir: unit(all[1], p1), handles, pts: all, poly: all, seed: all.slice(1, -1), sides: r.sides };
    }
    use = [...use, ...hit];
  }
  return null;
}
function baseGeom(e, a, b) {
  const route = e.route || 'elbow', wp = e.pts || [], fs = fixedSide(e.fromSide), ts = fixedSide(e.toSide);
  if (!fs && !ts && !wp.length) return autoGeom(e, a, b, route);
  const ac = centerOf(a), bc = centerOf(b);
  if (route === 'straight') {
    const p1 = fs ? portPoint(a, fs, e.fromAt) : clipBox(ac, wp[0] || (ts ? portPoint(b, ts, e.toAt) : bc), a);
    const p2 = ts ? portPoint(b, ts, e.toAt) : clipBox(bc, wp[wp.length - 1] || p1, b);
    const all = [p1, ...wp, p2], pieces = all.slice(1).map((q, i) => [all[i], q]);
    return finish(pieces, p1, p2, polyD(all), unit(all[all.length - 2], p2), unit(all[1], p1));
  }
  const s1 = fs || sideToward(a, wp[0] || (ts ? portPoint(b, ts, e.toAt) : bc));
  const s2 = ts || sideToward(b, wp[wp.length - 1] || portPoint(a, s1));
  const p1 = portPoint(a, s1, fs ? e.fromAt : undefined), p2 = portPoint(b, s2, ts ? e.toAt : undefined), n1 = NORM[s1], n2 = NORM[s2];
  if (route === 'curve') {
    const all = [p1, ...wp, p2], pieces = [];
    let d = `M${f1(p1.x)} ${f1(p1.y)}`, lastC = p1, firstC = null;
    for (let i = 0; i < all.length - 1; i++) {
      const P0 = all[i], P1 = all[i + 1], len = Math.hypot(P1.x - P0.x, P1.y - P0.y);
      const c1 = i === 0 ? along(P0, n1, Math.max(30, len * 0.45)) : { x: P0.x + (P1.x - all[i - 1].x) / 6, y: P0.y + (P1.y - all[i - 1].y) / 6 };
      const c2 = i === all.length - 2 ? along(P1, n2, Math.max(30, len * 0.45)) : { x: P1.x - (all[i + 2].x - P0.x) / 6, y: P1.y - (all[i + 2].y - P0.y) / 6 };
      d += ` C${f1(c1.x)} ${f1(c1.y)} ${f1(c2.x)} ${f1(c2.y)} ${f1(P1.x)} ${f1(P1.y)}`;
      pieces.push(Array.from({ length: 9 }, (_, k) => bez(P0, c1, c2, P1, k / 8)));
      if (!firstC) firstC = c1;
      lastC = c2;
    }
    return finish(pieces, p1, p2, d, unit(lastC, p2), unit(firstC, p1));
  }
  // Elbow: horizontal and vertical runs through every bend. Ports that face each other closer than two stubs
  // share the space between them, so the path has no small kink.
  let stub = STUB;
  if (!wp.length && n1.x === -n2.x && n1.y === -n2.y) {
    const gap = n1.x ? n1.x * (p2.x - p1.x) : n1.y * (p2.y - p1.y);
    if (gap > 0) stub = Math.min(STUB, gap / 2);
  }
  const a1 = along(p1, n1, stub), b2 = along(p2, n2, stub);
  let pieces;
  if (!wp.length) pieces = [[p1, a1, ...elbowTurns(a1, n1, b2, n2), b2, p2]];
  else {
    // Each run between two bends is an L. The first rule alternates the order of the two parts.
    let axis = n1.x ? 'h' : 'v', cur = a1, legs = [];
    [...wp, b2].forEach(w => { const r = join(cur, w, axis); legs.push(r.pts); axis = r.axis; cur = w; });
    // A run that turns back on itself hides its bend, so then the path with the fewest turns is used.
    if (turnsBack([p1, a1, ...legs.flat(), p2])) legs = fewestTurns([a1, ...wp, b2], dirOf(p1, a1), dirOf(b2, p2));
    pieces = legs.map((leg, i) => [i ? wp[i - 1] : a1, ...leg]);
    pieces[0].unshift(p1);
    pieces[pieces.length - 1].push(p2);
  }
  const all = simplify(pieces.flat());
  return { ...finish(pieces, p1, p2, polyD(all), unit(all[all.length - 2] || p1, p2), unit(all[1] || p2, p1)), pts: all };
}
function finish(pieces, p1, p2, d, endDir, startDir) {
  const all = simplify(pieces.flat());
  return { d, p1, p2, mid: pointAt(all, 0.5), endDir, startDir, handles: pieces.map((pc, i) => ({ ...pointAt(simplify(pc), 0.5), i })), poly: all };
}
// Moves the bends of a connector, for example when both of its shapes move.
export const shiftPts = (pts, dx, dy) => (pts && pts.length ? pts.map(q => ({ x: q.x + dx, y: q.y + dy })) : pts);

// ---------- class diagrams
// A class box: the name, then the attributes, then the operations. The members are one per line.
export const UML = {
  class: { name: 'Class', label: 'Order', attrs: '- id: UUID\n- total: Money', ops: '+ place(): void\n+ cancel(): void' },
  abstract: { name: 'Abstract class', label: 'Shape', attrs: '# name: String', ops: '+ area(): Double' },
  interface: { name: 'Interface', label: 'Repository', attrs: '', ops: '+ find(id: UUID): T\n+ save(item: T): void' },
  enum: { name: 'Enum', label: 'Status', attrs: 'PENDING\nPAID\nSHIPPED', ops: '' },
  package: { name: 'Package', label: 'domain', pkg: true }
};
export const STEREOTYPE = { abstract: '«abstract»', interface: '«interface»', enum: '«enumeration»' };
// UML relations. Each one sets the line style and the end markers of a connector.
export const RELS = ['none', 'assoc', 'inherit', 'realize', 'depend', 'aggregate', 'compose'];
export const REL = {
  assoc: { name: 'Association', end: 'open' },
  inherit: { name: 'Inheritance', end: 'triangle' },
  realize: { name: 'Realization', end: 'triangle', dashed: true },
  depend: { name: 'Dependency', end: 'open', dashed: true },
  aggregate: { name: 'Aggregation', start: 'diamond' },
  compose: { name: 'Composition', start: 'filled-diamond' }
};
const lines = t => (t ? String(t).split('\n') : []);
// The size and the compartments of a class box. A box grows to fit its text, and it can be wider.
export function classLayout(n, L, caps) {
  const k = SIZES[n.size || 'm'] / 16, nameFs = 16 * k, memFs = 12 * k, stFs = 11 * k, lh = 16 * k, pad = 8 * k;
  const st = STEREOTYPE[n.kind], name = caps ? String(n.label || '').toUpperCase() : String(n.label || '');
  const a = lines(n.attrs), o = lines(n.ops), hideOps = n.kind === 'enum' && !o.length;
  const head = pad + (st ? stFs * 1.3 : 0) + nameFs * 1.25 + pad * 0.75;
  const attrsH = Math.max(a.length * lh, 6 * k) + pad * 1.5;
  const opsH = hideOps ? 0 : Math.max(o.length * lh, 6 * k) + pad * 1.5;
  const memFont = `400 ${memFs}px ${MONO}`, nameFont = `${n.kind === 'abstract' ? 'italic ' : ''}${L.weight} ${nameFs}px ${L.family}`;
  const widest = Math.max(
    measure(name, nameFont) + name.length * L.ls * nameFs,
    st ? measure(st, `400 ${stFs}px ${MONO}`) : 0,
    ...a.map(t => measure(t, memFont)), ...o.map(t => measure(t, memFont))
  );
  return { k, nameFs, memFs, stFs, lh, pad, st, name, a, o, hideOps, head, attrsH, opsH, nameFont, memFont, minW: Math.ceil(widest + pad * 3), h: Math.ceil(head + attrsH + opsH) };
}

// ---------- units: one grid square is 1 ft or 0.5 m on a scaled sheet
export function fmtLen(px, u, g) {
  if (u === 'px') return String(Math.round(px));
  const sq = px / g;
  if (u === 'm') return (Math.round(sq * 0.5 * 100) / 100) + ' m';
  const tin = Math.round(sq * 12), ft = Math.floor(tin / 12), inch = tin % 12;
  return `${ft}'-${inch}"`;
}
export function areaLabel(n, u, g) {
  if (u === 'ft') return Math.round((n.w / g) * (n.h / g)) + ' SQ FT';
  if (u === 'm') return (Math.round((n.w / g) * 0.5 * (n.h / g) * 0.5 * 10) / 10) + ' M²';
  return '';
}
export const scaleLabel = (u, g) => (u === 'ft' ? '1 SQ = 1 FT' : u === 'm' ? '1 SQ = 0.5 M' : `1 SQ = ${g} PX`);

// ---------- text
let _ctx;
export function measure(t, font) {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
  _ctx.font = font;
  return _ctx.measureText(t).width;
}
export function wrap(text, maxW, font, ls) {
  const out = [];
  String(text).split('\n').forEach(para => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); return; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const t = line + ' ' + words[i];
      if (measure(t, font) + t.length * ls > maxW) { out.push(line); line = words[i]; } else line = t;
    }
    out.push(line);
  });
  return out;
}

// ---------- document model
export function newNode(tool, r) {
  const sh = toolShape(tool), type = sh.type;
  const n = { id: uid(), type, x: r.x, y: r.y, w: r.w, h: r.h, label: sh.label, sub: '', dashed: type === 'zone', fill: 'none', size: type === 'zone' ? 's' : 'm', flip: false };
  if (TURN[type]) n.rot = 0;
  if (sh.icon) n.icon = sh.icon;
  if (sh.dashed != null) n.dashed = sh.dashed;
  if (sh.pkg) n.pkg = true;
  if (type === 'class') Object.assign(n, { kind: sh.kind, attrs: sh.attrs, ops: sh.ops });
  return n;
}
export function newSheet(number) {
  return { id: uid(), number, name: 'Untitled sheet', unit: 'px', view: null, nodes: [], edges: [] };
}
export function blankDoc() {
  const s = newSheet('A-101');
  return { meta: { project: '', drawnBy: '', date: today(), rev: 'A' }, settings: { ...DEFAULT_SETTINGS }, sheets: [s], active: s.id };
}

function N(id, type, x, y, w, h, label, sub, extra) {
  return { id, type, x, y, w, h, label: label || '', sub: sub || '', dashed: type === 'zone', fill: 'none', size: type === 'zone' ? 's' : 'm', flip: false, ...extra };
}
function E(id, from, to, label, extra) { return { id, from, to, label: label || '', route: 'elbow', arrow: 'end', dashed: false, ...extra }; }
export function exampleDoc() {
  const s1 = {
    id: 's1', number: 'A-101', name: 'System overview', unit: 'px', view: null,
    nodes: [
      N('vpc', 'zone', 400, 60, 980, 620, 'VPC', 'us-east-1 · production'),
      N('users', 'actor', 100, 255, 60, 90, 'Customers'),
      N('lb', 'box', 460, 260, 160, 80, 'Load balancer', 'ALB · 443'),
      N('gw', 'service', 700, 260, 160, 80, 'API gateway', 'Envoy'),
      N('auth', 'service', 940, 120, 160, 80, 'Auth', 'OIDC · Go'),
      N('orders', 'service', 940, 260, 160, 80, 'Orders', 'gRPC · Go'),
      N('pay', 'service', 940, 400, 160, 80, 'Payments', 'REST · Node'),
      N('udb', 'database', 1200, 105, 120, 110, 'Users DB', 'Postgres 16'),
      N('odb', 'database', 1200, 245, 120, 110, 'Orders DB', 'Postgres 16'),
      N('bus', 'queue', 920, 540, 200, 70, 'Event bus', 'Kafka'),
      N('ful', 'box', 1200, 540, 140, 70, 'Fulfillment', 'worker × 3'),
      N('stripe', 'box', 1460, 400, 140, 80, 'Stripe', 'external', { dashed: true }),
      N('note1', 'note', 1460, 100, 220, 120, 'All internal traffic uses mTLS. Certificates rotate every 30 days.')
    ],
    edges: [E('e1', 'users', 'lb', 'HTTPS'), E('e2', 'lb', 'gw'), E('e3', 'gw', 'auth'), E('e4', 'gw', 'orders'), E('e5', 'gw', 'pay'), E('e6', 'auth', 'udb'), E('e7', 'orders', 'odb'), E('e8', 'pay', 'bus', 'events', { dashed: true }), E('e9', 'bus', 'ful'), E('e10', 'pay', 'stripe', 'charges')]
  };
  const s2 = {
    id: 's2', number: 'A-102', name: 'Checkout flow', unit: 'px', view: null,
    nodes: [
      N('w1', 'window', 80, 80, 520, 440, 'Checkout'),
      N('t1', 'text', 120, 130, 200, 40, 'Payment details'),
      N('i1', 'input', 120, 190, 440, 44, 'Name on card'),
      N('i2', 'input', 120, 250, 440, 44, 'Card number'),
      N('i3', 'input', 120, 310, 210, 44, 'MM / YY'),
      N('i4', 'input', 350, 310, 210, 44, 'CVC'),
      N('b1', 'button', 240, 440, 140, 44, 'Back', '', { dashed: true }),
      N('b2', 'button', 400, 440, 160, 44, 'Place order', '', { fill: 'tint' }),
      N('dc', 'decision', 680, 412, 160, 100, 'Payment ok?'),
      N('err', 'box', 680, 600, 160, 60, 'Show card error'),
      N('w2', 'window', 920, 80, 360, 280, 'Order confirmed'),
      N('im', 'image', 960, 140, 280, 110, 'Illustration'),
      N('t2', 'text', 960, 262, 280, 36, 'Thanks — order #1042'),
      N('b3', 'button', 1030, 306, 140, 36, 'View order'),
      N('n2', 'note', 920, 420, 260, 110, 'Validate the card number inline. Keep Place order disabled until the form is valid.')
    ],
    edges: [E('f1', 'b2', 'dc'), E('f2', 'dc', 'w2', 'yes'), E('f3', 'dc', 'err', 'no'), E('f4', 'err', 'w1', '', { dashed: true })]
  };
  const s3 = {
    id: 's3', number: 'A-103', name: 'Ground floor plan', unit: 'ft', view: null,
    nodes: [
      N('r1', 'room', 80, 80, 320, 240, 'Living'),
      N('r2', 'room', 400, 80, 200, 240, 'Kitchen'),
      N('r3', 'room', 80, 320, 240, 200, 'Bedroom'),
      N('r4', 'room', 320, 320, 120, 200, 'Bath'),
      N('r5', 'room', 440, 320, 160, 200, 'Entry'),
      N('f1', 'sofa', 130, 96, 140, 60, '', '', { rot: 0 }),
      N('f2', 'armchair', 316, 170, 60, 60, '', '', { rot: 90 }),
      N('f3', 'plant', 96, 276, 30, 30, '', '', { rot: 0 }),
      N('f4', 'counter', 406, 84, 120, 40, '', '', { rot: 0 }),
      N('f5', 'fridge', 532, 84, 60, 50, 'Ref', '', { rot: 0 }),
      N('f6', 'dining', 425, 226, 150, 90, '', '', { rot: 0 }),
      N('f7', 'bed', 86, 340, 70, 130, '', '', { rot: 0 }),
      N('f8', 'closet', 226, 476, 80, 40, '', '', { rot: 180 }),
      N('f9', 'bathtub', 330, 326, 100, 50, '', '', { rot: 90 }),
      N('f10', 'toilet', 344, 466, 30, 50, '', '', { rot: 180 }),
      N('f11', 'sink', 390, 484, 40, 30, '', '', { rot: 180 }),
      N('f12', 'plant', 560, 344, 30, 30, '', '', { rot: 0 }),
      N('w1', 'wallwin', 180, 74, 80, 12, '', '', { rot: 0 }),
      N('w2', 'wallwin', 74, 160, 12, 80, '', '', { rot: 90 }),
      N('w3', 'wallwin', 74, 380, 12, 80, '', '', { rot: 90 }),
      N('w4', 'wallwin', 594, 380, 12, 80, '', '', { rot: 90 }),
      N('d1', 'door', 240, 260, 60, 60, ''),
      N('d2', 'door', 340, 260, 60, 60, '', '', { flip: true }),
      N('d3', 'door', 480, 460, 60, 60, ''),
      N('d4', 'door', 460, 320, 60, 60, '', '', { rot: 180 })
    ],
    edges: []
  };
  return { meta: { project: 'Acme Commerce', drawnBy: '', date: today(), rev: 'A' }, settings: { ...DEFAULT_SETTINGS }, sheets: [s1, s2, s3], active: 's1' };
}

// ---------- validation: every document that comes from storage or a file goes through here
const ID = /^[a-z0-9]{1,16}$/;
// Images are data URLs of raster formats only. An SVG image could carry a script.
const IMAGE_DATA = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const MAX_IMAGE_CHARS = 12e6;
const num = v => typeof v === 'number' && Number.isFinite(v);
const str = (v, d = '') => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

function cleanNode(n, ids) {
  if (!n || typeof n !== 'object') return null;
  const type = n.type;
  if (!SHAPES[type] && type !== 'path' && type !== 'line' && type !== 'cloud' && type !== 'class') return null;
  if (type === 'cloud' && !isCloudKey(n.icon)) return null;
  if (![n.x, n.y, n.w, n.h].every(num)) return null;
  let id = str(n.id);
  if (!id || ids.has(id)) id = uid();
  ids.add(id);
  const out = {
    id, type, x: n.x, y: n.y, w: Math.max(0, n.w), h: Math.max(0, n.h),
    label: str(n.label), sub: str(n.sub), dashed: !!n.dashed,
    fill: oneOf(n.fill, ['none', 'tint', 'hatch'], 'none'),
    size: oneOf(n.size, ['s', 'm', 'l'], type === 'zone' ? 's' : 'm'),
    flip: !!n.flip
  };
  if (TURN[type]) out.rot = oneOf(n.rot, [0, 90, 180, 270], 0);
  if ((type === 'cloud' || type === 'zone') && isCloudKey(n.icon)) out.icon = n.icon;
  if (type === 'zone' && n.pkg === true) out.pkg = true;
  if (type === 'image' && typeof n.file === 'string' && ID.test(n.file)) out.file = n.file;
  if (type === 'class') Object.assign(out, { kind: oneOf(n.kind, Object.keys(UML).filter(k => !UML[k].pkg), 'class'), attrs: str(n.attrs).slice(0, 5000), ops: str(n.ops).slice(0, 5000) });
  if (typeof n.group === 'string' && ID.test(n.group)) out.group = n.group;
  if (n.locked === true) out.locked = true;
  if (type === 'path' || type === 'line') {
    const pts = Array.isArray(n.pts) ? n.pts.filter(p => Array.isArray(p) && num(p[0]) && num(p[1])).map(p => [p[0], p[1]]) : [];
    if (pts.length < 2) return null;
    out.pts = type === 'line' ? pts.slice(0, 2) : pts;
    out.weight = oneOf(n.weight, ['s', 'm', 'l'], type === 'line' ? 'm' : 's');
    // A line can have an arrowhead at its end or at both ends, so it can point without two shapes.
    if (type === 'line' && (n.arrow === 'end' || n.arrow === 'both')) out.arrow = n.arrow;
  }
  return out;
}
function cleanEdge(e, nodeIds, ids) {
  if (!e || typeof e !== 'object') return null;
  const from = str(e.from), to = str(e.to);
  if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) return null;
  let id = str(e.id);
  if (!id || ids.has(id)) id = uid();
  ids.add(id);
  const out = { id, from, to, label: str(e.label), route: oneOf(e.route, ROUTES, 'elbow'), arrow: oneOf(e.arrow, ['none', 'end', 'both'], 'end'), dashed: !!e.dashed };
  // Sides and bends are optional, so a plain connector stays small in the JSON.
  if (SIDES.includes(e.fromSide) && e.fromSide !== 'auto') out.fromSide = e.fromSide;
  if (SIDES.includes(e.toSide) && e.toSide !== 'auto') out.toSide = e.toSide;
  const pts = Array.isArray(e.pts) ? e.pts.filter(q => q && num(q.x) && num(q.y)).slice(0, 40).map(q => ({ x: q.x, y: q.y })) : [];
  if (pts.length) out.pts = pts;
  if (RELS.includes(e.rel) && e.rel !== 'none') out.rel = e.rel;
  if (num(e.lt) && e.lt > 0 && e.lt < 1) out.lt = e.lt;
  // A connector can meet a fixed side away from its middle, as a share along the side.
  if (out.fromSide && num(e.fromAt) && e.fromAt > 0 && e.fromAt < 1) out.fromAt = e.fromAt;
  if (out.toSide && num(e.toAt) && e.toAt > 0 && e.toAt < 1) out.toAt = e.toAt;
  const m1 = str(e.m1).slice(0, 24), m2 = str(e.m2).slice(0, 24);
  if (m1) out.m1 = m1;
  if (m2) out.m2 = m2;
  return out;
}
export function cleanSheet(s, sheetIds, fallbackNumber) {
  if (!s || typeof s !== 'object') return null;
  // Node and edge ids share one namespace, because the selection holds both.
  const ids = new Set();
  const nodes = (Array.isArray(s.nodes) ? s.nodes : []).map(n => cleanNode(n, ids)).filter(Boolean);
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = (Array.isArray(s.edges) ? s.edges : []).map(e => cleanEdge(e, nodeIds, ids)).filter(Boolean);
  let id = str(s.id);
  if (!id || sheetIds.has(id)) id = uid();
  sheetIds.add(id);
  const v = s.view;
  return {
    id, number: str(s.number, fallbackNumber) || fallbackNumber, name: str(s.name, 'Untitled sheet'),
    unit: oneOf(s.unit, UNITS, 'px'),
    view: v && num(v.x) && num(v.y) && num(v.k) && v.k > 0 ? { x: v.x, y: v.y, k: v.k } : null,
    nodes, edges
  };
}
export function cleanSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    lettering: oneOf(s.lettering, ['hand', 'technical'], DEFAULT_SETTINGS.lettering),
    caps: typeof s.caps === 'boolean' ? s.caps : DEFAULT_SETTINGS.caps,
    grid: oneOf(Number(s.grid), GRIDS, DEFAULT_SETTINGS.grid),
    route: oneOf(s.route, ROUTES, DEFAULT_SETTINGS.route)
  };
}
// The image files of a project: id → data URL. Only the files that a shape uses stay.
export function cleanFiles(raw, used) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw).forEach(([id, v]) => {
    if (used.has(id) && ID.test(id) && typeof v === 'string' && v.length <= MAX_IMAGE_CHARS && IMAGE_DATA.test(v)) out[id] = v;
  });
  return out;
}
const usedFiles = sheets => new Set(sheets.flatMap(s => s.nodes.filter(n => n.file).map(n => n.file)));
// Returns a valid document, or null when the input is not a Ferroprint project.
export function cleanDoc(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sheets)) return null;
  const sheetIds = new Set();
  let sheets = raw.sheets.map((s, i) => cleanSheet(s, sheetIds, 'A-' + (101 + i))).filter(Boolean);
  if (!sheets.length) return null;
  const files = cleanFiles(raw.files, usedFiles(sheets));
  // An image shape without its file shows the placeholder.
  sheets = sheets.map(s => (s.nodes.some(n => n.file && !files[n.file]) ? { ...s, nodes: s.nodes.map(n => (n.file && !files[n.file] ? dropKey(n, 'file') : n)) } : s));
  const m = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const doc = {
    meta: { project: str(m.project), drawnBy: str(m.drawnBy), date: str(m.date), rev: str(m.rev) },
    settings: cleanSettings(raw.settings),
    sheets,
    active: sheets.some(s => s.id === raw.active) ? raw.active : sheets[0].id
  };
  if (Object.keys(files).length) doc.files = files;
  return doc;
}
const dropKey = (o, key) => { const { [key]: _, ...rest } = o; return rest; };
// Leaves out the image files that no shape uses any more, for example after a delete.
export function pruneFiles(doc) {
  if (!doc.files) return doc;
  const used = usedFiles(doc.sheets), ids = Object.keys(doc.files);
  if (ids.every(id => used.has(id))) return doc;
  const files = Object.fromEntries(ids.filter(id => used.has(id)).map(id => [id, doc.files[id]]));
  return Object.keys(files).length ? { ...doc, files } : dropKey(doc, 'files');
}

// ---------- export
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

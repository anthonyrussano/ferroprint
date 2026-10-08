import { describe, expect, it } from 'vitest';
import * as F from '../src/engine.js';

const box = (id, x, y, w = 100, h = 60, extra) => ({ id, type: 'box', x, y, w, h, label: id, sub: '', dashed: false, fill: 'none', size: 'm', flip: false, ...extra });
const sheet = (nodes, edges = [], extra) => ({ id: 's1', number: 'A-101', name: 'Test', unit: 'px', view: null, nodes, edges, ...extra });
// True when point q is on the polyline of an SVG path that uses only M and L.
const onPath = (d, q) => {
  const pts = d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number).reduce((a, v, i, all) => (i % 2 ? a : [...a, { x: v, y: all[i + 1] }]), []);
  return pts.slice(1).some((b, i) => {
    const a = pts[i];
    return Math.min(a.x, b.x) <= q.x && q.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= q.y && q.y <= Math.max(a.y, b.y) && (a.x === b.x || a.y === b.y);
  });
};
const doc = (sheets, extra) => ({ meta: { project: 'P', drawnBy: '', date: '2026-01-01', rev: 'A' }, settings: { ...F.DEFAULT_SETTINGS }, sheets, active: sheets[0].id, ...extra });

describe('cleanDoc', () => {
  it('returns null for input that is not a project', () => {
    expect(F.cleanDoc(null)).toBeNull();
    expect(F.cleanDoc({})).toBeNull();
    expect(F.cleanDoc({ sheets: [] })).toBeNull();
    expect(F.cleanDoc({ sheets: [null, 4] })).toBeNull();
  });

  it('keeps a valid project as it is', () => {
    const d = doc([sheet([box('a', 0, 0), box('b', 200, 0)], [{ id: 'e', from: 'a', to: 'b', label: 'x', route: 'elbow', arrow: 'end', dashed: false }])]);
    expect(F.cleanDoc(d)).toEqual(d);
  });

  it('removes connectors to missing shapes and loops', () => {
    const d = F.cleanDoc(doc([sheet([box('a', 0, 0)], [{ id: 'e1', from: 'a', to: 'zz' }, { id: 'e2', from: 'a', to: 'a' }])]));
    expect(d.sheets[0].edges).toEqual([]);
  });

  it('gives a new id to a repeated id', () => {
    const d = F.cleanDoc(doc([sheet([box('a', 0, 0), box('a', 200, 0)])]));
    const ids = d.sheets[0].nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('a');
  });

  it('replaces unknown values with defaults', () => {
    const d = F.cleanDoc(doc([sheet([box('a', 0, 0, 100, 60, { fill: 'red', size: 'xl', rot: 45 })], [], { unit: 'yd' })], { settings: { grid: 13, lettering: 'fancy', caps: 'yes' } }));
    const n = d.sheets[0].nodes[0];
    expect(n.fill).toBe('none');
    expect(n.size).toBe('m');
    expect(n.rot).toBeUndefined();
    expect(d.sheets[0].unit).toBe('px');
    expect(d.settings).toEqual(F.DEFAULT_SETTINGS);
  });

  it('removes shapes of unknown types and shapes without a position', () => {
    const d = F.cleanDoc(doc([sheet([box('a', 0, 0), { ...box('b', 0, 0), type: 'teapot' }, { ...box('c', 0, 0), x: 'left' }, { ...box('d', 0, 0), type: 'cloud', icon: '../evil' }])]));
    expect(d.sheets[0].nodes.map(n => n.id)).toEqual(['a']);
  });

  it('keeps the bends, sides, UML relation and multiplicities of a connector', () => {
    const e = { id: 'e', from: 'a', to: 'b', label: '', route: 'elbow', arrow: 'end', dashed: false, fromSide: 'top', toSide: 'auto', pts: [{ x: 1, y: 2 }, { x: 'no' }], rel: 'inherit', m1: '1', m2: '0..*' };
    const out = F.cleanDoc(doc([sheet([box('a', 0, 0), box('b', 200, 0)], [e])])).sheets[0].edges[0];
    expect(out).toEqual({ id: 'e', from: 'a', to: 'b', label: '', route: 'elbow', arrow: 'end', dashed: false, fromSide: 'top', pts: [{ x: 1, y: 2 }], rel: 'inherit', m1: '1', m2: '0..*' });
  });

  it('chooses the first sheet when the active sheet is missing', () => {
    const d = F.cleanDoc({ ...doc([sheet([])]), active: 'nope' });
    expect(d.active).toBe('s1');
  });
});

describe('edgeGeom', () => {
  const a = box('a', 0, 0), b = box('b', 300, 0), c = box('c', 0, 300);
  const map = { a, b, c };

  it('returns null when a shape is missing', () => {
    expect(F.edgeGeom({ from: 'a', to: 'x' }, map)).toBeNull();
  });

  it('joins shapes side by side from the right side to the left side', () => {
    const g = F.edgeGeom({ from: 'a', to: 'b', route: 'elbow' }, map);
    expect(g.p1).toEqual({ x: 100, y: 30 });
    expect(g.p2).toEqual({ x: 300, y: 30 });
    expect(g.endDir).toEqual({ x: 1, y: -0 });
  });

  it('joins stacked shapes from the bottom side to the top side', () => {
    const g = F.edgeGeom({ from: 'a', to: 'c', route: 'elbow' }, map);
    expect(g.p1).toEqual({ x: 50, y: 60 });
    expect(g.p2).toEqual({ x: 50, y: 300 });
  });

  it('uses a fixed side', () => {
    const g = F.edgeGeom({ from: 'a', to: 'b', route: 'elbow', fromSide: 'top' }, map);
    expect(g.p1).toEqual({ x: 50, y: 0 });
  });

  it('clips a straight connector to the box edges', () => {
    const g = F.edgeGeom({ from: 'a', to: 'b', route: 'straight' }, map);
    expect(g.p1.x).toBeCloseTo(100);
    expect(g.p2.x).toBeCloseTo(300);
  });

  it('passes an elbow connector through its bends', () => {
    const g = F.edgeGeom({ from: 'a', to: 'b', route: 'elbow', pts: [{ x: 200, y: 200 }] }, map);
    expect(onPath(g.d, { x: 200, y: 200 })).toBe(true);
    expect(g.handles).toHaveLength(2);
  });

  it('draws a curve as a cubic path', () => {
    expect(F.edgeGeom({ from: 'a', to: 'b', route: 'curve' }, map).d).toMatch(/^M.* C/);
  });
});

describe('units', () => {
  it('formats lengths in px, ft and m', () => {
    expect(F.fmtLen(123.4, 'px', 20)).toBe('123');
    expect(F.fmtLen(30, 'ft', 20)).toBe(`1'-6"`);
    expect(F.fmtLen(40, 'm', 20)).toBe('1 m');
  });

  it('labels the area of a room', () => {
    expect(F.areaLabel({ w: 200, h: 100 }, 'ft', 20)).toBe('50 SQ FT');
    expect(F.areaLabel({ w: 200, h: 100 }, 'm', 20)).toBe('12.5 M²');
    expect(F.areaLabel({ w: 200, h: 100 }, 'px', 20)).toBe('');
  });

  it('labels the scale', () => {
    expect(F.scaleLabel('ft', 20)).toBe('1 SQ = 1 FT');
    expect(F.scaleLabel('px', 25)).toBe('1 SQ = 25 PX');
  });
});

describe('geometry', () => {
  it('turns a shape 90° about its center', () => {
    const n = F.rotateNode({ x: 0, y: 0, w: 100, h: 40, rot: 270 });
    expect(n).toMatchObject({ x: 30, y: -30, w: 40, h: 100, rot: 0 });
  });

  it('stores the points of a path relative to its box', () => {
    expect(F.pathFrom([{ x: 10, y: 10 }, { x: 30, y: 50 }])).toEqual({ x: 10, y: 10, w: 20, h: 40, pts: [[0, 0], [1, 1]] });
  });

  it('snaps a line to 45°', () => {
    expect(F.constrain({ x: 0, y: 0 }, { x: 100, y: 10 })).toEqual({ x: 100, y: 0 });
    const q = F.constrain({ x: 0, y: 0 }, { x: 100, y: 90 });
    expect(q.x).toBe(q.y);
  });

  it('finds the bounds of shapes', () => {
    expect(F.plainBounds([box('a', 0, 0), box('b', 300, 100)])).toEqual({ x: 0, y: 0, w: 400, h: 160 });
    expect(F.plainBounds([])).toBeNull();
  });
});

describe('newNode', () => {
  it('makes a shape from a palette tool', () => {
    const n = F.newNode('database', { x: 10, y: 20, w: 120, h: 110 });
    expect(n).toMatchObject({ type: 'database', x: 10, y: 20, label: 'Database', fill: 'none' });
  });

  it('makes a class box from a UML tool', () => {
    const n = F.newNode('uml:interface', { x: 0, y: 0, w: 200, h: 120 });
    expect(n).toMatchObject({ type: 'class', kind: 'interface', label: 'Repository' });
  });

  it('gives turning shapes a rotation', () => {
    expect(F.newNode('door', { x: 0, y: 0, w: 60, h: 60 }).rot).toBe(0);
  });
});

describe('image files', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const img = (id, file) => ({ ...box(id, 0, 0), type: 'image', file });

  it('keeps the files that image shapes use', () => {
    const d = F.cleanDoc(doc([sheet([img('a', 'f1')])], { files: { f1: PNG, f2: PNG } }));
    expect(d.files).toEqual({ f1: PNG });
    expect(d.sheets[0].nodes[0].file).toBe('f1');
  });

  it('removes a file that is not a raster image', () => {
    const d = F.cleanDoc(doc([sheet([img('a', 'f1')])], { files: { f1: 'data:image/svg+xml;base64,PHN2Zz4=' } }));
    expect(d.files).toBeUndefined();
    expect(d.sheets[0].nodes[0].file).toBeUndefined();
  });

  it('removes the file link of a shape whose file is missing', () => {
    const d = F.cleanDoc(doc([sheet([img('a', 'nope')])]));
    expect(d.sheets[0].nodes[0].file).toBeUndefined();
  });

  it('leaves out unused files before a save', () => {
    const d = doc([sheet([img('a', 'f1')])], { files: { f1: PNG, f2: PNG } });
    expect(F.pruneFiles(d).files).toEqual({ f1: PNG });
    const clean = doc([sheet([img('a', 'f1')])], { files: { f1: PNG } });
    expect(F.pruneFiles(clean)).toBe(clean);
    expect(F.pruneFiles(doc([sheet([])], { files: { f1: PNG } })).files).toBeUndefined();
  });
});

describe('routes around shapes', () => {
  const a = box('a', 0, 0), b = box('b', 400, 0), wall = box('w', 180, -40, 60, 140);
  const map = { a, b, w: wall };
  const segs = d => d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number).reduce((acc, v, i, all) => (i % 2 ? acc : [...acc, { x: v, y: all[i + 1] }]), []);
  const hits = (d, o) => {
    const p = segs(d);
    return p.slice(1).some((q, i) => {
      const s = p[i], x0 = Math.min(s.x, q.x), x1 = Math.max(s.x, q.x), y0 = Math.min(s.y, q.y), y1 = Math.max(s.y, q.y);
      return x1 > o.x && x0 < o.x + o.w && y1 > o.y && y0 < o.y + o.h;
    });
  };

  it('keeps the simple route when nothing is in the way', () => {
    const e = { from: 'a', to: 'b', route: 'elbow' };
    expect(F.edgeGeom(e, { a, b }, F.obstaclesOf([a, b])).d).toBe(F.edgeGeom(e, { a, b }).d);
  });

  it('goes around a shape between the two ends', () => {
    const e = { from: 'a', to: 'b', route: 'elbow' };
    expect(hits(F.edgeGeom(e, map).d, wall)).toBe(true);
    const g = F.edgeGeom(e, map, F.obstaclesOf([a, b, wall]));
    expect(hits(g.d, wall)).toBe(false);
    expect(g.seed.length).toBeGreaterThan(0);
    expect(g.p1.x === 100 || g.p1.y === 0 || g.p1.y === 60).toBe(true);
  });

  it('keeps a fixed side', () => {
    const g = F.edgeGeom({ from: 'a', to: 'b', route: 'elbow', fromSide: 'right', toSide: 'left' }, map, F.obstaclesOf([a, b, wall]));
    expect(g.p1).toEqual({ x: 100, y: 30 });
    expect(g.p2).toEqual({ x: 400, y: 30 });
    expect(hits(g.d, wall)).toBe(false);
  });

  it('does not route a connector with bends or a straight connector', () => {
    const obs = F.obstaclesOf([a, b, wall]);
    expect(hits(F.edgeGeom({ from: 'a', to: 'b', route: 'straight' }, map, obs).d.replace(/[^\d. ML-]/g, ''), wall)).toBe(true);
    expect(F.edgeGeom({ from: 'a', to: 'b', route: 'elbow', pts: [{ x: 210, y: 30 }] }, map, obs).seed).toBeUndefined();
  });

  it('ignores a shape that holds an end', () => {
    const frame = { ...box('f', -50, -50, 300, 200), type: 'window' };
    const inner = box('i', 0, 0), out = box('o', 500, 0);
    const g = F.edgeGeom({ from: 'i', to: 'o', route: 'elbow' }, { i: inner, o: out, f: frame }, F.obstaclesOf([frame, inner, out]));
    expect(g.seed).toBeUndefined();
  });

  it('routes a grid of 400 shapes in reasonable time', () => {
    const nodes = [];
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) nodes.push(box(`n${i}-${j}`, i * 200, j * 140));
    const m = Object.fromEntries(nodes.map(n => [n.id, n])), obs = F.obstaclesOf(nodes);
    const t0 = performance.now();
    const g = F.edgeGeom({ from: 'n0-0', to: 'n19-19', route: 'elbow' }, m, obs);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(obs.some(o => o.id !== 'n0-0' && o.id !== 'n19-19' && hits(g.d, o))).toBe(false);
  });
});

describe('bends', () => {
  const a = box('a', 0, 0), b = box('b', 400, 0), map = { a, b };
  const pts = d => d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number).reduce((acc, v, i, all) => (i % 2 ? acc : [...acc, { x: v, y: all[i + 1] }]), []);

  it('shows a bend above a straight connector as an arch', () => {
    const g = F.edgeGeom({ from: 'a', to: 'b', route: 'elbow', pts: [{ x: 250, y: -40 }] }, map);
    const p = pts(g.d);
    expect(p.some(q => q.x === 250 && q.y === -40)).toBe(true);
    // No run turns back on itself.
    const dirs = p.slice(1).map((q, i) => Math.sign(q.x - p[i].x) + 2 * Math.sign(q.y - p[i].y));
    expect(dirs.some((d, i) => i && d === -dirs[i - 1])).toBe(false);
  });

  it('keeps the old path when it does not turn back', () => {
    const g = F.edgeGeom({ from: 'a', to: 'b', route: 'elbow', pts: [{ x: 250, y: 200 }] }, { a, b: box('b', 400, 300) });
    expect(g.d).toBe('M100 30 L250 30 L250 330 L400 330');
  });
});

describe('project logo', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  it('keeps a logo with its file, and drops a logo without one', () => {
    const doc = { ...F.blankDoc(), files: { logo1: png } };
    doc.meta = { ...doc.meta, logo: 'logo1' };
    const clean = F.cleanDoc(JSON.parse(JSON.stringify(doc)));
    expect(clean.meta.logo).toBe('logo1');
    expect(clean.files.logo1).toBe(png);
    expect(F.cleanDoc({ ...doc, files: {} }).meta.logo).toBeUndefined();
    expect(F.cleanDoc({ ...doc, meta: { ...doc.meta, logo: '../x' } }).meta.logo).toBeUndefined();
  });

  it('keeps the logo file when it prunes files, and drops it when the logo goes', () => {
    const doc = { ...F.blankDoc(), files: { logo1: png } };
    expect(F.pruneFiles({ ...doc, meta: { ...doc.meta, logo: 'logo1' } }).files.logo1).toBe(png);
    expect(F.pruneFiles(doc).files).toBeUndefined();
  });
});

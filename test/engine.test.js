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

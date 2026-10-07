// Defects from the review of the second round of changes. Each test failed before its fix.
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { parseMermaid, mermaidSheet, isMermaid } from '../src/mermaid.js';
import { layout } from '../src/layout.js';
import { boot, openStore, projectMeta } from '../src/storage.js';
import * as F from '../src/engine.js';

const L = F.LETTER.technical;
const quick = fn => { const t = performance.now(); fn(); return performance.now() - t; };

class MemoryStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

describe('Mermaid input that used to hang or crash', () => {
  it('reads a class line with long runs of spaces quickly', () => {
    expect(quick(() => parseMermaid('classDiagram\nclass A' + ' '.repeat(800) + '!'))).toBeLessThan(200);
    expect(quick(() => parseMermaid('classDiagram\nA' + ' '.repeat(800) + '"1"' + ' '.repeat(800) + '-- !'))).toBeLessThan(200);
  });

  it('reads a flowchart link with a long open label quickly', () => {
    expect(quick(() => parseMermaid('flowchart TD\nA -- ' + 'x '.repeat(5000)))).toBeLessThan(200);
  });

  it('ignores an entity code that is not a character', () => {
    expect(() => mermaidSheet('graph TD\nA[#1114112;]', { L })).not.toThrow();
  });
});

describe('Mermaid parsing', () => {
  it('connects a link to a subgraph to its zone, without an extra box', () => {
    const sh = mermaidSheet(`flowchart TB
      c1-->a2
      subgraph one
      a1-->a2
      end
      subgraph two
      b1-->b2
      end
      subgraph three
      c1-->c2
      end
      one --> two
      three --> two
      two --> c2`, { L });
    const labels = sh.nodes.map(n => `${n.type}:${n.label}`).sort();
    expect(labels).toEqual(['box:a1', 'box:a2', 'box:b1', 'box:b2', 'box:c1', 'box:c2', 'zone:one', 'zone:three', 'zone:two']);
    const zone = name => sh.nodes.find(n => n.type === 'zone' && n.label === name).id;
    expect(sh.edges.some(e => e.from === zone('one') && e.to === zone('two'))).toBe(true);
  });

  it('does not read plain text as Mermaid', () => {
    expect(isMermaid('graph paper notes')).toBe(false);
    expect(isMermaid('flowchart is a word')).toBe(false);
    expect(isMermaid('graph TD')).toBe(true);
    expect(isMermaid('graph TD; A-->B')).toBe(true);
    expect(isMermaid('flowchart')).toBe(true);
  });

  it('keeps a semicolon inside a link label', () => {
    const g = parseMermaid('flowchart TD\nA -->|one; two| B');
    expect(g.edges.map(e => e.label)).toEqual(['one; two']);
  });

  it('reads a node named End inside a subgraph', () => {
    const g = parseMermaid('flowchart TD\nsubgraph s\nStart --> End\nend');
    expect(g.nodes.get('End').groups).toEqual(['s']);
  });
});

describe('layout of a long chain', () => {
  it('does not overflow the stack', () => {
    const ids = Array.from({ length: 3000 }, (_, i) => 'n' + i);
    expect(() => layout(ids.map(id => ({ id, w: 100, h: 40 })), ids.slice(1).map((id, i) => ({ from: ids[i], to: id })))).not.toThrow();
  });
});

describe('storage recovery', () => {
  it('moves the Ferroprint 1 project into the localStorage store only once', async () => {
    const env = { indexedDB: null, localStorage: new MemoryStorage() };
    env.localStorage.setItem('ferroprint.doc.v1', JSON.stringify(F.exampleDoc()));
    await boot(env);
    await boot(env);
    const b = await boot(env);
    expect((await b.store.list()).length).toBe(1);
  });

  it('moves projects saved in localStorage into IndexedDB', async () => {
    const ls = new MemoryStorage();
    const local = await openStore({ indexedDB: null, localStorage: ls }), doc = F.exampleDoc();
    await local.put({ ...projectMeta('p1', doc), updated: 5 }, JSON.stringify(doc));
    const b = await boot({ indexedDB: new IDBFactory(), localStorage: ls });
    expect(b.store.kind).toBe('idb');
    expect((await b.store.list()).map(p => p.id)).toEqual(['p1']);
    expect(ls.getItem('ferroprint.projects.v2')).toBeNull();
  });
});

describe('routes with fractional coordinates', () => {
  it('does not pass through an obstacle off the half-pixel grid', () => {
    for (const ox of [400, 400.3, 399.8]) {
      const nodes = [{ id: 'a', type: 'box', x: 0, y: 0, w: 100, h: 60 }, { id: 'b', type: 'box', x: 600, y: 0, w: 100, h: 60 }, { id: 'o', type: 'box', x: ox, y: -20.3, w: 60.4, h: 100 }];
      const map = Object.fromEntries(nodes.map(n => [n.id, n]));
      const g = F.edgeGeom({ id: 'e', from: 'a', to: 'b' }, map, F.obstaclesOf(nodes));
      const pts = g.pts;
      const o = nodes[2];
      const hit = pts.slice(1).some((q, i) => {
        const p = pts[i];
        return Math.max(p.x, q.x) > o.x && Math.min(p.x, q.x) < o.x + o.w && Math.max(p.y, q.y) > o.y && Math.min(p.y, q.y) < o.y + o.h;
      });
      expect(hit, `obstacle at ${ox}`).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { parseMermaid, mermaidSheet, isMermaid } from '../src/mermaid.js';
import { layout } from '../src/layout.js';
import { LETTER, cleanSheet, inter } from '../src/engine.js';

const L = LETTER.technical;
const edgesOf = g => g.edges.map(e => `${e.from}>${e.to}${e.label ? ':' + e.label : ''}${e.dashed ? ' dashed' : ''} ${e.arrow}`);

describe('isMermaid', () => {
  it('finds flowcharts and class diagrams', () => {
    expect(isMermaid('flowchart LR\n  A --> B')).toBe(true);
    expect(isMermaid('%% a comment\ngraph TD; A-->B')).toBe(true);
    expect(isMermaid('---\ntitle: Shop\n---\nclassDiagram\n  class A')).toBe(true);
    expect(isMermaid('Hello world')).toBe(false);
    expect(isMermaid('sequenceDiagram\n A->>B: hi')).toBe(false);
  });
});

describe('flowcharts', () => {
  it('reads shapes, labels and links', () => {
    const g = parseMermaid(`flowchart TD
      A[Start here] --> B{Is it ok?}
      B -->|yes| C([Done])
      B -- no --> D[(Orders DB)]
      D -.-> E[[Retry job]]
      E ==> A
      F((Hub)) --- G{{Prepare}}
      H[/Upload/] <--> I[/Manual\\]
      J ~~~ K`);
    expect(g.dir).toBe('TB');
    const shape = id => g.nodes.get(id).shape, label = id => g.nodes.get(id).label;
    expect([shape('A'), shape('B'), shape('C'), shape('D'), shape('E'), shape('F'), shape('G'), shape('H'), shape('I')])
      .toEqual(['box', 'decision', 'terminal', 'database', 'subproc', 'terminal', 'prep', 'data', 'manualop']);
    expect(label('B')).toBe('Is it ok?');
    expect(edgesOf(g)).toEqual(['A>B end', 'B>C:yes end', 'B>D:no end', 'D>E dashed end', 'E>A end', 'F>G none', 'H>I both']);
  });

  it('reads chains, ampersands, semicolons and quoted labels', () => {
    const g = parseMermaid('graph LR; A["Quoted <br> label"] --> B & C --> D;');
    expect(g.dir).toBe('LR');
    expect(g.nodes.get('A').label).toBe('Quoted \n label');
    expect(edgesOf(g)).toEqual(['A>B end', 'A>C end', 'B>D end', 'C>D end']);
  });

  it('turns a link with only a start arrow around', () => {
    expect(edgesOf(parseMermaid('flowchart TD\n A <-- B'))).toEqual(['B>A end']);
  });

  it('puts the shapes of a subgraph in a group', () => {
    const g = parseMermaid(`flowchart TB
      subgraph cloud [Cloud]
        subgraph vpc [VPC]
          api --> db
        end
        cdn
      end
      user --> cdn --> api`);
    expect(g.groups.map(x => `${x.id}:${x.label}:${x.parent}`)).toEqual(['cloud:Cloud:null', 'vpc:VPC:cloud']);
    expect(g.nodes.get('api').groups).toEqual(['cloud', 'vpc']);
    expect(g.nodes.get('cdn').groups).toEqual(['cloud']);
    expect(g.nodes.get('user').groups).toBe(null);
  });

  it('skips styles and counts lines it cannot read', () => {
    const g = parseMermaid('flowchart TD\n A --> B\n classDef red fill:#f00\n style A fill:#f00\n click A callback\n A --> ');
    expect(g.edges.length).toBe(1);
    expect(g.skipped).toBe(1);
  });
});

describe('class diagrams', () => {
  const g = parseMermaid(`classDiagram
    direction LR
    class Animal {
      <<abstract>>
      +String name
      +eat(food) void
    }
    class List~T~
    <<interface>> Repository
    Animal <|-- Duck
    Duck ..|> Repository
    Car "1" *-- "4" Wheel : has
    Wheel --o Car
    Order --> Customer
    Order ..> Money
    A -- B
    Duck : +swim()
    Duck : +int age`);

  it('reads classes, members and kinds', () => {
    expect(g.dir).toBe('LR');
    const a = g.nodes.get('Animal');
    expect(a).toMatchObject({ kind: 'abstract', attrs: ['+String name'], ops: ['+eat(food) void'] });
    expect(g.nodes.get('List').label).toBe('List<T>');
    expect(g.nodes.get('Repository').kind).toBe('interface');
    expect(g.nodes.get('Duck')).toMatchObject({ attrs: ['+int age'], ops: ['+swim()'] });
  });

  it('points each relation the way Ferroprint draws it', () => {
    const rel = g.edges.map(e => `${e.from}>${e.to} ${e.rel || 'none'}${e.m1 ? ` ${e.m1}..${e.m2}` : ''}${e.label ? ' ' + e.label : ''}`);
    expect(rel).toEqual([
      'Duck>Animal inherit', 'Duck>Repository realize', 'Car>Wheel compose 1..4 has', 'Car>Wheel aggregate',
      'Order>Customer assoc', 'Order>Money depend', 'A>B none'
    ]);
  });
});

describe('layout', () => {
  const box = id => ({ id, w: 160, h: 80 });

  it('puts each shape below the shapes that point to it', () => {
    const p = layout(['a', 'b', 'c', 'd'].map(box), [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }]);
    expect(p.get('a').y).toBeLessThan(p.get('b').y);
    expect(p.get('b').y).toBe(p.get('c').y);
    expect(p.get('d').y).toBeGreaterThan(p.get('b').y);
  });

  it('lays out left to right', () => {
    const p = layout(['a', 'b'].map(box), [{ from: 'a', to: 'b' }], { dir: 'LR' });
    expect(p.get('a').x).toBeLessThan(p.get('b').x);
    expect(p.get('a').y).toBe(p.get('b').y);
  });

  it('survives a cycle and a self link', () => {
    const p = layout(['a', 'b', 'c'].map(box), [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }, { from: 'a', to: 'a' }]);
    expect(p.size).toBe(3);
  });

  it('does not overlap shapes', () => {
    const ids = Array.from({ length: 30 }, (_, i) => 'n' + i);
    const edges = ids.slice(1).map((id, i) => ({ from: ids[Math.floor(i / 3)], to: id }));
    const p = layout(ids.map(box), edges);
    const boxes = ids.map(id => ({ ...p.get(id), w: 160, h: 80 }));
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => expect(inter(a, b)).toBe(false)));
  });
});

describe('mermaidSheet', () => {
  it('makes a valid sheet with zones around subgraphs', () => {
    const sh = mermaidSheet(`---
title: Shop
---
flowchart LR
  subgraph back [Back end]
    api[API] --> db[(DB)]
  end
  web[Web] --> api`, { L });
    expect(sh.name).toBe('Shop');
    const clean = cleanSheet(sh, new Set(), 'A-101');
    expect(clean.nodes.length).toBe(4);
    expect(clean.edges.length).toBe(2);
    const zone = clean.nodes.find(n => n.type === 'zone'), inside = clean.nodes.filter(n => n.label === 'API' || n.label === 'DB');
    expect(zone.label).toBe('Back end');
    inside.forEach(n => expect(n.x >= zone.x && n.y >= zone.y && n.x + n.w <= zone.x + zone.w && n.y + n.h <= zone.y + zone.h).toBe(true));
    const web = clean.nodes.find(n => n.label === 'Web');
    expect(inter(web, zone)).toBe(false);
  });

  it('makes class boxes and puts a parent above its child', () => {
    const sh = mermaidSheet('classDiagram\n  Animal <|-- Duck\n  class Duck {\n    +swim()\n  }', { L });
    const by = Object.fromEntries(sh.nodes.map(n => [n.label, n]));
    expect(by.Animal.type).toBe('class');
    expect(by.Animal.y).toBeLessThan(by.Duck.y);
    expect(sh.edges[0]).toMatchObject({ from: by.Duck.id, to: by.Animal.id, rel: 'inherit' });
  });

  it('returns null for text that is not Mermaid', () => {
    expect(mermaidSheet('just words', { L })).toBeNull();
  });
});

describe('groups in the layout', () => {
  it('keeps shapes outside a group out of its zone', () => {
    const sh = mermaidSheet(`flowchart LR
      user((Customer)) --> web[Web shop]
      subgraph aws [AWS]
        subgraph vpc [VPC]
          api(Checkout API) --> db[(Orders DB)]
          api --> q[[Payment queue]]
          worker[Payment worker] --> q
        end
        cdn[CloudFront] --> api
      end
      web --> cdn
      worker -->|charge| psp{{Stripe}}
      psp -. webhook .-> api`, { L });
    const zones = sh.nodes.filter(n => n.type === 'zone'), by = Object.fromEntries(sh.nodes.map(n => [n.label, n]));
    ['Customer', 'Web shop', 'Stripe'].forEach(name => zones.forEach(z => expect(inter(by[name], z), `${name} in ${z.label}`).toBe(false)));
    expect(inter(by.CloudFront, by.VPC)).toBe(false);
    ['Checkout API', 'Orders DB', 'Payment queue', 'Payment worker'].forEach(name => {
      const n = by[name], z = by.VPC;
      expect(n.x >= z.x && n.y >= z.y && n.x + n.w <= z.x + z.w && n.y + n.h <= z.y + z.h, name).toBe(true);
    });
  });
});

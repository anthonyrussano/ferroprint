import { describe, expect, it } from 'vitest';
import { parseMermaid, mermaidSheet, isMermaid } from '../src/mermaid.js';
import { layoutDiagram } from '../src/layout.js';
import { LETTER, cleanSheet, inter, edgeGeom } from '../src/engine.js';

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
      .toEqual(['box', 'decision', 'terminal', 'database', 'subproc', 'onpage', 'prep', 'data', 'manualop']);
    expect(label('B')).toBe('Is it ok?');
    expect(edgesOf(g)).toEqual(['A>B end', 'B>C:yes end', 'B>D:no end', 'D>E dashed end', 'E>A end', 'F>G none', 'H>I both']);
  });

  it('reads chains, ampersands, semicolons and quoted labels', () => {
    const g = parseMermaid('graph LR; A["Quoted <br> label"] --> B & C --> D;');
    expect(g.dir).toBe('LR');
    expect(g.nodes.get('A').label).toBe('Quoted\nlabel');
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
  const edge = (from, to, i) => ({ id: `e${i}`, from, to, label: null });
  const run = (ids, links, dir) => layoutDiagram({ nodes: ids.map(box), edges: links.map(([a, b], i) => edge(a, b, i)), dir });

  it('puts each shape below the shapes that point to it', async () => {
    const { pos } = await run(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]);
    expect(pos.get('a').y).toBeLessThan(pos.get('b').y);
    expect(pos.get('b').y).toBe(pos.get('c').y);
    expect(pos.get('d').y).toBeGreaterThan(pos.get('b').y);
  });

  it('lays out left to right', async () => {
    const { pos } = await run(['a', 'b'], [['a', 'b']], 'LR');
    expect(pos.get('a').x).toBeLessThan(pos.get('b').x);
    expect(pos.get('a').y).toBe(pos.get('b').y);
  });

  it('puts the targets of a shape left to right in the order of their connectors', async () => {
    const { pos } = await run(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['a', 'd']]);
    expect(pos.get('b').x).toBeLessThan(pos.get('c').x);
    expect(pos.get('c').x).toBeLessThan(pos.get('d').x);
  });

  it('survives a cycle and a self link', async () => {
    const { pos } = await run(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'a']]);
    expect(pos.size).toBe(3);
  });

  it('gives a connector down the ranks fixed sides, and one that closes a cycle side ports', async () => {
    const { routes } = await run(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]);
    expect(routes.get('e0')).toMatchObject({ fromSide: 'bottom', toSide: 'top' });
    const back = routes.get('e2');
    expect(back.fromSide).toBe(back.toSide);
    expect(['left', 'right']).toContain(back.fromSide);
  });

  it('turns the sides with the direction', async () => {
    const lr = await run(['a', 'b'], [['a', 'b']], 'LR'), bt = await run(['a', 'b'], [['a', 'b']], 'BT'), rl = await run(['a', 'b'], [['a', 'b']], 'RL');
    expect(lr.routes.get('e0')).toMatchObject({ fromSide: 'right', toSide: 'left' });
    expect(bt.routes.get('e0')).toMatchObject({ fromSide: 'top', toSide: 'bottom' });
    expect(rl.routes.get('e0')).toMatchObject({ fromSide: 'left', toSide: 'right' });
  });

  it('does not overlap shapes, and its connectors keep clear of them', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => 'n' + i);
    const links = ids.slice(1).map((id, i) => [ids[Math.floor(i / 3)], id]);
    links.push(['n25', 'n1'], ['n29', 'n0'], ['n4', 'n20'], ['n2', 'n27']);
    const { pos, routes } = await run(ids, links);
    const boxes = ids.map(id => ({ id, ...pos.get(id), w: 160, h: 80 }));
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => expect(inter(a, b)).toBe(false)));
    const map = Object.fromEntries(boxes.map(b => [b.id, b]));
    links.forEach(([a, b], i) => {
      const r = routes.get(`e${i}`), geo = edgeGeom({ id: `e${i}`, from: a, to: b, route: 'elbow', ...r }, map);
      boxes.filter(o => o.id !== a && o.id !== b).forEach(o => {
        const p = geo.poly;
        p.slice(1).forEach((q, k) => {
          const s = p[k], hit = Math.max(s.x, q.x) > o.x && Math.min(s.x, q.x) < o.x + o.w && Math.max(s.y, q.y) > o.y && Math.min(s.y, q.y) < o.y + o.h;
          expect(hit, `${a}->${b} crosses ${o.id}`).toBe(false);
        });
      });
    });
  });
});

describe('mermaidSheet', () => {
  it('makes a valid sheet with zones around subgraphs', async () => {
    const sh = await mermaidSheet(`---
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

  it('makes class boxes and puts a parent above its child', async () => {
    const sh = await mermaidSheet('classDiagram\n  Animal <|-- Duck\n  class Duck {\n    +swim()\n  }', { L });
    const by = Object.fromEntries(sh.nodes.map(n => [n.label, n]));
    expect(by.Animal.type).toBe('class');
    expect(by.Animal.y).toBeLessThan(by.Duck.y);
    expect(sh.edges[0]).toMatchObject({ from: by.Duck.id, to: by.Animal.id, rel: 'inherit' });
  });

  it('returns null for text that is not Mermaid', async () => {
    expect(await mermaidSheet('just words', { L })).toBeNull();
  });
});

describe('groups in the layout', () => {
  it('keeps shapes outside a group out of its zone', async () => {
    const sh = await mermaidSheet(`flowchart LR
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

describe('more Mermaid syntax', () => {
  it('reads Mermaid 11 shapes and keeps unknown ones as boxes', () => {
    const g = parseMermaid('flowchart TD\n  A@{ shape: cyl, label: "Orders" } --> B@{ shape: doc, label: \'Report\' }\n  B --> C@{ shape: odd-new-shape }\n  D@{ shape: diam, label: "Ok?" }');
    expect([...g.nodes.values()].map(n => `${n.shape}:${n.label}`)).toEqual(['database:Orders', 'fdoc:Report', 'box:C', 'decision:Ok?']);
  });

  it('drops the names and the settings of links', () => {
    const g = parseMermaid('flowchart LR\n  A e1@--> B\n  e1@{ animate: true }');
    expect([...g.nodes.keys()]).toEqual(['A', 'B']);
    expect(g.edges.length).toBe(1);
    expect(g.skipped).toBe(0);
  });

  it('removes icons and markdown marks from labels', () => {
    const g = parseMermaid('flowchart TD\n  A[fa:fa-car Car]\n  B["`**Bold** and _it_ text`"]\n  C["`user_id_field`"]\n  D["2 * 3 * 4"]');
    expect([...g.nodes.values()].map(n => n.label)).toEqual(['Car', 'Bold and it text', 'user_id_field', '2 * 3 * 4']);
  });

  it('reads the length of a link', () => {
    const g = parseMermaid('graph TD\nA --> B\nB ---> C\nC -..-> D\nD -- text ---> E\nE === F');
    expect(g.edges.map(e => e.minlen)).toEqual([1, 2, 2, 2, 1]);
  });

  it('draws a circle for ((text))', () => {
    expect(parseMermaid('flowchart TD\n  A((Hub))').nodes.get('A').shape).toBe('onpage');
  });

  it('reads nested generics and notes in class diagrams', () => {
    const g = parseMermaid('classDiagram\n  class Store~K, V~\n  Store : +all() List~List~int~~\n  note for Store "Keeps\\nthings"\n  note "Free note"');
    expect(g.nodes.get('Store').label).toBe('Store<K, V>');
    expect(g.nodes.get('Store').ops).toEqual(['+all() List<List<int>>']);
    const notes = [...g.nodes.values()].filter(n => n.kind === 'note').map(n => n.label);
    expect(notes).toEqual(['Keeps\nthings', 'Free note']);
    expect(g.edges).toEqual([expect.objectContaining({ to: 'Store', dashed: true, arrow: 'none', note: true })]);
  });

  it('gives connectors of different kinds their own ports on a busy side', async () => {
    const sh = await mermaidSheet('classDiagram\n  Order *-- Line\n  Order --> Status', { L });
    const [a, b] = sh.edges;
    expect(a.fromSide).toBe(b.fromSide);
    expect(a.fromAt).not.toBe(b.fromAt);
  });
});

import { describe, expect, it } from 'vitest';
import { parseMermaid, mermaidSheet, isMermaid } from '../src/mermaid.js';
import { layoutDiagram } from '../src/layout.js';
import { LETTER, cleanSheet, inter, edgeGeom, classLayout } from '../src/engine.js';

const L = LETTER.technical;
const edgesOf = g => g.edges.map(e => `${e.from}>${e.to}${e.label ? ':' + e.label : ''}${e.dashed ? ' dashed' : ''} ${e.arrow}`);

describe('isMermaid', () => {
  it('finds flowcharts and class diagrams', () => {
    expect(isMermaid('flowchart LR\n  A --> B')).toBe(true);
    expect(isMermaid('%% a comment\ngraph TD; A-->B')).toBe(true);
    expect(isMermaid('---\ntitle: Shop\n---\nclassDiagram\n  class A')).toBe(true);
    expect(isMermaid('Hello world')).toBe(false);
    expect(isMermaid('sequenceDiagram\n A->>B: hi')).toBe(true);
    expect(isMermaid('stateDiagram-v2\n [*] --> A')).toBe(true);
    expect(isMermaid('erDiagram\n A ||--o{ B : has')).toBe(true);
    expect(isMermaid('gantt\n title Plan')).toBe(false);
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

  it('keeps connectors clear of the tab with the name of a zone', async () => {
    const sh = await mermaidSheet(`flowchart TB
  a[Start] --> b[A rather long label for a shape]
  subgraph z [A subgraph with a long name]
    b
  end`, { L });
    const map = Object.fromEntries(sh.nodes.map(n => [n.id, n])), zone = sh.nodes.find(n => n.type === 'zone');
    // The test setup measures 7 px for each letter, so the tab is at least this wide.
    const tab = { x: zone.x, y: zone.y, w: 27 * 7 + 24, h: 26 };
    expect(zone.w).toBeGreaterThan(tab.w);
    const geo = edgeGeom(sh.edges[0], map), p = geo.poly;
    p.slice(1).forEach((q, k) => {
      const s = p[k], hit = Math.max(s.x, q.x) > tab.x && Math.min(s.x, q.x) < tab.x + tab.w && Math.max(s.y, q.y) > tab.y && Math.min(s.y, q.y) < tab.y + tab.h;
      expect(hit).toBe(false);
    });
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

describe('state diagrams', () => {
  const src = `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : submit
    Processing --> Done : success
    Done --> [*]
    state Processing {
        [*] --> Validating
        Validating --> [*]
    }
    state check <<choice>>
    Idle --> check
    note right of Done : All good
    Idle : Waiting for input`;

  it('reads states, starts and ends, choices, notes and composite states', () => {
    const g = parseMermaid(src);
    expect(g.kind).toBe('state');
    expect(g.nodes.get('Idle')).toMatchObject({ shape: 'state', sub: 'Waiting for input' });
    expect(g.nodes.get('check').shape).toBe('choice');
    expect([...g.nodes.values()].filter(n => n.shape === 'start').length).toBe(2);
    expect(g.groups.map(x => x.id)).toEqual(['Processing']);
    expect(g.nodes.has('Processing')).toBe(false);
    expect(g.nodes.get('Validating').groups).toEqual(['Processing']);
    expect(g.edges.some(e => e.to === 'Processing' && e.label === 'submit')).toBe(true);
  });

  it('makes a sheet with a zone for the composite state', async () => {
    const sh = await mermaidSheet(src, { L });
    expect(sh.name).toBe('State diagram');
    const zone = sh.nodes.find(n => n.type === 'zone');
    expect(zone.label).toBe('Processing');
    expect(sh.nodes.filter(n => n.type === 'onpage').length).toBe(4);
    expect(sh.edges.some(e => e.to === zone.id)).toBe(true);
  });
});

describe('entity relationship diagrams', () => {
  const src = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER }|..|{ DELIVERY-ADDRESS : "uses"
    CUSTOMER only one to zero or more INVOICE : gets
    CUSTOMER {
        string custNumber PK "the number"
        string name
        int region FK, UK
    }`;

  it('reads entities, attributes and cardinalities', () => {
    const g = parseMermaid(src);
    expect(g.nodes.get('CUSTOMER').attrs).toEqual(['custNumber: string PK', 'name: string', 'region: int FK, UK']);
    expect(g.edges.map(e => `${e.from}>${e.to} ${e.m1}:${e.m2}${e.dashed ? ' dashed' : ''} ${e.label}`)).toEqual([
      'CUSTOMER>ORDER 1:0..* places', 'CUSTOMER>DELIVERY-ADDRESS 1..*:1..* dashed uses', 'CUSTOMER>INVOICE 1:0..* gets'
    ]);
  });

  it('draws entities as boxes without an operations compartment', async () => {
    const sh = await mermaidSheet(src, { L });
    const c = sh.nodes.find(n => n.label === 'CUSTOMER');
    expect(c).toMatchObject({ type: 'class', kind: 'entity' });
    const lay = classLayout(c, L, true);
    expect(lay.hideOps).toBe(true);
  });
});

describe('sequence diagrams', () => {
  const src = `sequenceDiagram
    autonumber
    actor U as User
    participant A as API
    U->>+A: Ask
    A-->>-U: Answer
    loop Every minute
      U->>U: Think
    end
    Note over U,A: Done
    A-xU: Gone`;

  it('reads participants, messages, activations, blocks and notes', () => {
    const g = parseMermaid(src);
    expect([...g.parts.values()].map(p => `${p.id}:${p.label}:${p.actor}`)).toEqual(['U:User:true', 'A:API:false']);
    expect(g.events.filter(e => e.type === 'message').map(e => `${e.from}${e.arrow}${e.act}${e.to}`)).toEqual(['U->>+A', 'A-->>-U', 'U->>U', 'A-xU']);
    expect(g.events.map(e => e.type)).toEqual(['message', 'message', 'open', 'message', 'close', 'note', 'message']);
  });

  it('draws lifelines, messages, an activation bar, a block and a note', async () => {
    const sh = await mermaidSheet(src, { L });
    expect(sh.name).toBe('Sequence diagram');
    const by = type => sh.nodes.filter(n => n.type === type);
    expect(by('actor').length).toBe(1);
    expect(by('zone').map(z => z.label)).toEqual(['loop']);
    expect(by('note').length).toBe(1);
    expect(by('box').some(b => b.w === 12)).toBe(true);
    expect(by('text').map(t => t.label)).toEqual(['1. Ask', '2. Answer', '3. Think', '4. Gone']);
    const lifelines = by('line').filter(l => l.dashed && l.w === 0);
    expect(lifelines.length).toBe(2);
    // Each participant moves with its lifeline.
    expect(new Set(lifelines.map(l => l.group)).size).toBe(2);
  });
});

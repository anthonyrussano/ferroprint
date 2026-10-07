// Mermaid import. A flowchart or a class diagram becomes a sheet: shapes, connectors, and zones for
// subgraphs and namespaces. The layered layout in layout.js places the shapes.
import { layout } from './layout.js';
import { classLayout, measure, SHAPES, clamp } from './engine.js';

const HEADER = /^(flowchart|graph|classDiagram)(?:-v2)?\b\s*([A-Za-z]{2})?/;
const SKIP = /^(classDef|class\s+[\w,]+\s+\w+\s*$|style|linkStyle|click|accTitle|accDescr|callback|link|cssClass|note)\b/;

// Removes the YAML front matter and the comments. Returns the title from the front matter, if any.
// In Markdown, the first ```mermaid block is the diagram.
function prepare(text) {
  let src = String(text).replace(/\r\n?/g, '\n'), title = '';
  const fence = src.match(/```mermaid[^\n]*\n([\s\S]*?)```/);
  if (fence) src = fence[1];
  const fm = src.match(/^\s*---\n([\s\S]*?)\n---\s*\n/);
  if (fm) {
    const t = fm[1].match(/^title:\s*(.+)$/m);
    if (t) title = t[1].trim().replace(/^["']|["']$/g, '');
    src = src.slice(fm[0].length);
  }
  const lines = src.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean);
  return { lines, title };
}

export const isMermaid = text => {
  const { lines } = prepare(text);
  return lines.length > 0 && HEADER.test(lines[0]);
};

// Label text: quotes, line breaks, tags, entities and markdown marks go.
function cleanLabel(s) {
  return String(s).trim().replace(/^"([\s\S]*)"$/, '$1').replace(/^`([\s\S]*)`$/, '$1')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/#quot;/g, '"').replace(/#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
}

// Splits a line into statements at semicolons that are outside brackets and quotes.
function statements(line) {
  const out = [];
  let depth = 0, quote = false, cur = '';
  for (const ch of line) {
    if (ch === '"') quote = !quote;
    else if (!quote && '([{'.includes(ch)) depth++;
    else if (!quote && ')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === ';' && !quote && !depth) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

// ---------- flowcharts
// Node shapes: the opening mark, the closing marks, and the Ferroprint shape.
const SHAPE_MARKS = [
  ['(((', [')))'], 'terminal'], ['((', ['))'], 'terminal'], ['([', ['])'], 'terminal'], ['[[', [']]'], 'subproc'],
  ['[(', [')]'], 'database'], ['[/', ['/]', '\\]'], 'data'], ['[\\', ['\\]', '/]'], 'data'], ['{{', ['}}'], 'prep'],
  ['>', [']'], 'box'], ['{', ['}'], 'decision'], ['(', [')'], 'service'], ['[', [']'], 'box']
];
const ID = /^[\wÀ-￿]+(?:[.-][\wÀ-￿]+)*/;
const TEXT_LINK = /^(<)?(--|==|-\.)\s+([^\s>|=.-][^|]*?)\s+(-{2,}>|-{3,}|={2,}>|={3,}|\.-+>|\.-+)/;
const LINK = /^(<)?(-{2,}>|={2,}>|-\.+->|-{3,}|={3,}|-\.+-|~{3,}|-{2,}[ox](?![\w])|={2,}[ox](?![\w])|-{2}|={2})/;

function parseFlow(lines, dir) {
  const g = { kind: 'flow', dir, nodes: new Map(), edges: [], groups: [], skipped: 0 };
  const open = [];
  const mention = id => {
    if (!g.nodes.has(id)) g.nodes.set(id, { id, label: id, shape: 'box', groups: null });
    const n = g.nodes.get(id);
    // A shape belongs to the innermost subgraph that names it first.
    if (open.length && !n.groups) n.groups = open.map(x => x.id);
    return n;
  };
  const node = rest => {
    const m = rest.match(ID);
    if (!m) return null;
    const id = m[0];
    let i = id.length, label = null, shape = null;
    for (const [mark, ends, kind] of SHAPE_MARKS) {
      if (!rest.startsWith(mark, i)) continue;
      let from = i + mark.length, end = -1, close = '';
      const quoted = rest[from] === '"';
      const scanFrom = quoted ? rest.indexOf('"', from + 1) + 1 : from;
      if (quoted && scanFrom === 0) continue;
      for (const c of ends) { const k = rest.indexOf(c, scanFrom); if (k >= 0 && (end < 0 || k < end)) { end = k; close = c; } }
      if (end < 0) continue;
      label = cleanLabel(rest.slice(from, end));
      // A trapezoid opens with one slant and closes with the other.
      shape = (mark === '[/' && close === '\\]') || (mark === '[\\' && close === '/]') ? 'manualop' : kind;
      i = end + close.length;
      break;
    }
    const cls = rest.slice(i).match(/^:::[\w-]+/);
    if (cls) i += cls[0].length;
    const n = mention(id);
    // The last definition of a shape wins, as in Mermaid.
    if (label != null) { n.label = label; n.shape = shape; }
    return { n, rest: rest.slice(i) };
  };
  const nodeGroup = rest => {
    const list = [];
    let r = rest;
    for (;;) {
      const p = node(r.trimStart());
      if (!p) return list.length ? { list, rest: r } : null;
      list.push(p.n);
      r = p.rest;
      const amp = r.match(/^\s*&\s*/);
      if (!amp) return { list, rest: r };
      r = r.slice(amp[0].length);
    }
  };
  const link = rest => {
    const r = rest.trimStart();
    let m = r.match(TEXT_LINK), label = '', head, tail, start;
    if (m) { start = m[1]; head = m[2]; tail = m[4]; label = cleanLabel(m[3]); }
    else {
      m = r.match(LINK);
      if (!m) return null;
      start = m[1]; head = m[2]; tail = m[2];
    }
    let after = r.slice(m[0].length);
    const pipe = after.match(/^\s*\|([^|]*)\|/);
    if (pipe) { label = cleanLabel(pipe[1]); after = after.slice(pipe[0].length); }
    const end = /[>ox]$/.test(tail);
    return {
      rest: after,
      hidden: /^~/.test(head),
      dashed: head.includes('.') || tail.includes('.'),
      arrow: start ? (end ? 'both' : 'start') : end ? 'end' : 'none',
      label
    };
  };
  lines.forEach(line => statements(line).forEach(st => {
    const sub = st.match(/^subgraph\b\s*(.*)$/i);
    if (sub) {
      const rest = sub[1].trim();
      let id, label;
      const m = rest.match(/^([\w.-]+)\s*\[(.*)\]$/);
      if (m) { id = m[1]; label = cleanLabel(m[2]); }
      else if (/^".*"$/.test(rest)) { label = cleanLabel(rest); id = `sg${g.groups.length}`; }
      else { id = rest || `sg${g.groups.length}`; label = cleanLabel(rest); }
      const grp = { id, label, parent: open.length ? open[open.length - 1].id : null };
      g.groups.push(grp);
      open.push(grp);
      return;
    }
    if (/^end$/i.test(st)) { open.pop(); return; }
    if (/^direction\s+\w+$/i.test(st) || SKIP.test(st)) return;
    let first = nodeGroup(st);
    if (!first) { g.skipped++; return; }
    let rest = first.rest;
    for (;;) {
      const l = link(rest);
      if (!l) break;
      const next = nodeGroup(l.rest);
      if (!next) break;
      if (!l.hidden) {
        first.list.forEach(a => next.list.forEach(b => {
          // A link with its only arrow at the start points the other way.
          const flip = l.arrow === 'start';
          g.edges.push({ from: flip ? b.id : a.id, to: flip ? a.id : b.id, label: l.label, dashed: l.dashed, arrow: flip ? 'end' : l.arrow });
        }));
      }
      first = next;
      rest = next.rest;
    }
    if (rest.trim()) g.skipped++;
  }));
  return g;
}

// ---------- class diagrams
const KINDS = { interface: 'interface', abstract: 'abstract', enumeration: 'enum', enum: 'enum' };
const generic = s => String(s).replace(/~([^~]*)~/g, '<$1>');
// A relation: left class, cardinality, left mark, line, right mark, cardinality, right class, label.
const RELATION = /^([\w.]+)\s*(?:"([^"]*)")?\s*(<\||\*|o|<)?(--|\.\.)(\|>|\*|o|>)?\s*(?:"([^"]*)")?\s*([\w.]+)\s*(?::\s*(.*))?$/;

function parseClass(lines) {
  const g = { kind: 'class', dir: 'TB', nodes: new Map(), edges: [], groups: [], skipped: 0 };
  const open = [];
  const cls = id => {
    if (!g.nodes.has(id)) g.nodes.set(id, { id, label: generic(id), kind: 'class', attrs: [], ops: [], groups: open.length ? open.map(x => x.id) : null });
    const c = g.nodes.get(id);
    if (open.length && !c.groups) c.groups = open.map(x => x.id);
    return c;
  };
  const member = (c, text) => {
    const t = generic(text.trim()).replace(/[$*]$/, '').trim();
    const note = t.match(/^<<\s*(\w+)\s*>>$/);
    if (note) { c.kind = KINDS[note[1].toLowerCase()] || c.kind; return; }
    if (t) (t.includes('(') ? c.ops : c.attrs).push(t);
  };
  let body = null;
  lines.slice(1).forEach(line => {
    if (body) {
      if (/^}\s*$/.test(line)) { body = null; return; }
      member(body, line);
      return;
    }
    const dirm = line.match(/^direction\s+(TB|TD|BT|LR|RL)$/i);
    if (dirm) { g.dir = dirm[1].toUpperCase() === 'TD' ? 'TB' : dirm[1].toUpperCase(); return; }
    const ns = line.match(/^namespace\s+([\w.]+)\s*\{$/);
    if (ns) { const grp = { id: ns[1], label: ns[1], parent: open.length ? open[open.length - 1].id : null, pkg: true }; g.groups.push(grp); open.push(grp); return; }
    if (/^}$/.test(line) && open.length) { open.pop(); return; }
    const decl = line.match(/^class\s+([\w.]+)(~[^~]+~)?\s*(?:\["([^"]*)"\])?\s*(?::::[\w-]+)?\s*(\{(.*?)(\})?)?\s*$/);
    if (decl) {
      const c = cls(decl[1]);
      if (decl[2]) c.label = generic(decl[1] + decl[2]);
      if (decl[3]) c.label = decl[3];
      if (decl[4] != null) {
        const inner = (decl[5] || '').trim();
        if (decl[6]) inner.split(';').forEach(m => member(c, m));
        else { if (inner) member(c, inner); body = c; }
      }
      return;
    }
    const ann = line.match(/^<<\s*(\w+)\s*>>\s*([\w.]+)$/);
    if (ann) { cls(ann[2]).kind = KINDS[ann[1].toLowerCase()] || 'class'; return; }
    const rel = line.match(RELATION);
    if (rel) {
      const [, left, cardL, markL, lineKind, markR, cardR, right, label] = rel;
      cls(left); cls(right);
      const dotted = lineKind === '..', mark = markL || (markR === '|>' ? '<|' : markR === '>' ? '<' : markR);
      const onLeft = !!markL;
      // Triangles and arrows sit at the end of a Ferroprint connector. Diamonds sit at its start.
      const kind = mark === '<|' ? (dotted ? 'realize' : 'inherit') : mark === '*' ? 'compose' : mark === 'o' ? 'aggregate' : mark === '<' ? (dotted ? 'depend' : 'assoc') : null;
      const diamond = kind === 'compose' || kind === 'aggregate';
      const markSide = onLeft ? left : right, other = onLeft ? right : left;
      const from = !kind ? left : diamond ? markSide : other, to = from === left ? right : left;
      const card = { [left]: cardL || '', [right]: cardR || '' };
      g.edges.push({ from, to, label: label ? cleanLabel(label) : '', rel: kind, dashed: !kind && dotted, arrow: 'none', m1: card[from], m2: card[to] });
      return;
    }
    const mem = line.match(/^([\w.]+)\s*:\s*(.+)$/);
    if (mem) { member(cls(mem[1]), mem[2]); return; }
    if (SKIP.test(line)) return;
    g.skipped++;
  });
  return g;
}

export function parseMermaid(text) {
  const { lines, title } = prepare(text);
  const head = lines.length ? lines[0].match(HEADER) : null;
  if (!head) return null;
  const dir = (head[2] || 'TB').toUpperCase().replace('TD', 'TB');
  // A flowchart can start on the line of its header, for example `graph TD; A-->B`.
  const g = head[1] === 'classDiagram' ? parseClass(lines) : parseFlow([lines[0].slice(head[0].length), ...lines.slice(1)], ['TB', 'BT', 'LR', 'RL'].includes(dir) ? dir : 'TB');
  g.title = title;
  return g;
}

// ---------- sheet
const GRID = 20;
const snap = v => Math.round(v / GRID) * GRID;
const ceilTo = v => Math.ceil(v / GRID) * GRID;
const PAD = 28;
const PAD_TOP = 48;

// The size of a flowchart shape that holds its label. Wide labels wrap at the widest size.
function flowSize(n, L) {
  const base = SHAPES[n.shape] || SHAPES.box, font = `${L.weight} 16px ${L.family}`;
  const lines = n.label.split('\n'), wide = Math.max(...lines.map(l => measure(l, font) + l.length * L.ls * 16));
  const k = n.shape === 'decision' ? 1.7 : n.shape === 'data' || n.shape === 'manualop' || n.shape === 'prep' ? 1.3 : 1;
  const w = clamp(ceilTo(wide * k + 48), Math.min(base.w, 160), 300);
  const rows = lines.reduce((t, l) => t + Math.max(1, Math.ceil((measure(l, font) * k + 20) / (w - 20))), 0);
  return { w, h: Math.max(base.h, ceilTo(rows * 20 * L.lh * (n.shape === 'decision' ? 1.8 : 1) + 28)) };
}

// Turns Mermaid text into a sheet: { name, nodes, edges, skipped }. Returns null when the text is not Mermaid.
// `L` and `caps` set the lettering, so class boxes get the size that the editor gives them.
export function mermaidSheet(text, { L, caps = true, route = 'elbow', id = () => Math.random().toString(36).slice(2, 9) }) {
  const g = parseMermaid(text);
  if (!g || !g.nodes.size) return g ? { error: 'The Mermaid text has no shapes.' } : null;
  const ids = new Map([...g.nodes.keys(), ...g.groups.map(x => x.id)].map(k => [k, id()]));
  const nodes = [...g.nodes.values()].map(n => {
    const base = { id: ids.get(n.id), x: 0, y: 0, label: n.label, sub: '', dashed: false, fill: 'none', size: 'm', flip: false };
    if (g.kind === 'class') {
      const c = { ...base, type: 'class', kind: n.kind, attrs: n.attrs.join('\n'), ops: n.ops.join('\n'), w: 200, h: 120 };
      const lay = classLayout(c, L, caps);
      return { ...c, w: Math.max(200, ceilTo(lay.minW)), h: lay.h, groups: n.groups || [] };
    }
    return { ...base, type: n.shape, ...flowSize(n, L), groups: n.groups || [] };
  });
  const byKey = new Map([...g.nodes.keys()].map((k, i) => [k, nodes[i]]));
  // Inheritance points up to the parent, so for the layout the parent comes first.
  const up = e => e.rel === 'inherit' || e.rel === 'realize';
  const place = layout(
    nodes.map(n => ({ id: n.id, w: n.w, h: n.h, groups: n.groups.map(k => ids.get(k)) })),
    g.edges.filter(e => byKey.has(e.from) && byKey.has(e.to)).map(e => (up(e) ? { from: ids.get(e.to), to: ids.get(e.from) } : { from: ids.get(e.from), to: ids.get(e.to) })),
    { dir: g.dir, gapX: 60, gapY: 80 + 40 * Math.max(0, ...nodes.map(n => n.groups.length)) }
  );
  nodes.forEach(n => { const p = place.get(n.id); n.x = snap(p.x) + 80; n.y = snap(p.y) + 80 + (g.groups.length ? PAD_TOP : 0); });
  // Zones: the box around the members of each group, inner groups first, so an outer zone holds them.
  const zones = [], boxOf = new Map();
  [...g.groups].reverse().forEach(grp => {
    const kids = [...nodes.filter(n => n.groups[n.groups.length - 1] === grp.id), ...g.groups.filter(x => x.parent === grp.id).map(x => boxOf.get(x.id)).filter(Boolean)];
    if (!kids.length) return;
    const x0 = Math.min(...kids.map(k => k.x)) - PAD, y0 = Math.min(...kids.map(k => k.y)) - PAD_TOP;
    const x1 = Math.max(...kids.map(k => k.x + k.w)) + PAD, y1 = Math.max(...kids.map(k => k.y + k.h)) + PAD;
    const z = { id: ids.get(grp.id), type: 'zone', x: snap(x0), y: snap(y0), w: ceilTo(x1 - snap(x0)), h: ceilTo(y1 - snap(y0)), label: grp.label, sub: '', dashed: !grp.pkg, fill: 'none', size: 's', flip: false };
    if (grp.pkg) z.pkg = true;
    boxOf.set(grp.id, z);
    zones.unshift(z);
  });
  const known = new Set([...g.nodes.keys(), ...boxOf.keys()]);
  const edges = g.edges.filter(e => known.has(e.from) && known.has(e.to) && e.from !== e.to).map(e => {
    const out = { id: id(), from: ids.get(e.from), to: ids.get(e.to), label: e.label || '', route, arrow: e.arrow || 'end', dashed: !!e.dashed };
    if (e.rel) out.rel = e.rel;
    if (e.m1) out.m1 = e.m1;
    if (e.m2) out.m2 = e.m2;
    return out;
  });
  const name = g.title || (g.kind === 'class' ? 'Class diagram' : 'Flowchart');
  return { name, unit: 'px', nodes: [...zones, ...nodes.map(({ groups: _, ...n }) => n)], edges, skipped: g.skipped };
}

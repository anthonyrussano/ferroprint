// Mermaid import. A flowchart, a class diagram, a state diagram, an entity relationship diagram or a
// sequence diagram becomes a sheet: shapes, connectors, and zones for subgraphs, namespaces and composite
// states. layout.js places the shapes with dagre, as Mermaid does, and routes the connectors. A sequence
// diagram has a layout of its own: participants in a row, and messages down the page in time order.
import { layoutDiagram } from './layout.js';
import { classLayout, measure, wrap, pathFrom } from './engine.js';

// The first line: the diagram type, and for a flowchart an optional direction. Statements can follow a semicolon.
const HEADER = /^(?:(flowchart|graph)(?:-v2|-elk)?(?: (TB|TD|BT|RL|LR|tb|td|bt|rl|lr))?|(classDiagram|stateDiagram|erDiagram|sequenceDiagram)(?:-v2)?) ?(?:;|$)/;
// A longer line is skipped, so a large paste cannot keep the parser busy.
const MAX_LINE = 4000;
const SKIP = /^(classDef|class\s+[\w,]+\s+\w+\s*$|style|linkStyle|click|accTitle|accDescr|callback|link|cssClass)\b/;

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
  // A markdown string can run over more lines. Its line breaks become \n, so each statement stays on one line.
  src = src.replace(/"`[\s\S]*?`"/g, m => m.replace(/[ \t]*\n[ \t]*/g, '\\n'));
  // Runs of spaces become one space, so no pattern below can try many ways to split a run.
  const all = src.split('\n').map(l => l.replace(/%%.*$/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const lines = all.filter(l => l.length <= MAX_LINE);
  return { lines, title, long: all.length - lines.length };
}

export const isMermaid = text => {
  const { lines } = prepare(text);
  return lines.length > 0 && HEADER.test(lines[0]);
};

// Label text: quotes, tags, entities and icons go. <br> and \n become line breaks. A markdown string, in backticks,
// also loses its marks.
function cleanLabel(s) {
  let t = String(s).trim().replace(/^"([\s\S]*)"$/, '$1');
  if (/^`[\s\S]*`$/.test(t)) {
    t = t.slice(1, -1).replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/~~(.+?)~~/g, '$1')
      .replace(/(^|[^\w*])\*(\S(?:.*?\S)?)\*(?![\w*])/g, '$1$2').replace(/(^|[^\w])_(\S(?:.*?\S)?)_(?!\w)/g, '$1$2');
  }
  return t.replace(/<br\s*\/?>/gi, '\n').replace(/\\n/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/\bfa[bsrl]?:fa-[\w-]+\s*/g, '')
    .replace(/#quot;/g, '"').replace(/#(\d+);/g, (_, n) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : ''))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(l => l.trim()).join('\n').trim();
}

// Splits a line into statements at semicolons that are outside brackets, quotes and |link labels|.
function statements(line) {
  const out = [];
  let depth = 0, quote = false, pipe = false, cur = '';
  for (const ch of line) {
    if (ch === '"') quote = !quote;
    else if (!quote && '([{'.includes(ch)) depth++;
    else if (!quote && ')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (!quote && !depth && ch === '|') pipe = !pipe;
    if (ch === ';' && !quote && !depth && !pipe) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

// ---------- flowcharts
// Node shapes: the opening mark, the closing marks, and the Ferroprint shape.
const SHAPE_MARKS = [
  ['(((', [')))'], 'onpage'], ['((', ['))'], 'onpage'], ['([', ['])'], 'terminal'], ['[[', [']]'], 'subproc'],
  ['[(', [')]'], 'database'], ['[/', ['/]', '\\]'], 'data'], ['[\\', ['\\]', '/]'], 'data'], ['{{', ['}}'], 'prep'],
  ['>', [']'], 'box'], ['{', ['}'], 'decision'], ['(', [')'], 'service'], ['[', [']'], 'box']
];
// Mermaid 11 shapes: A@{ shape: cyl, label: "Orders" }. Each name and alias, and the Ferroprint shape.
const V11 = [
  ['box', 'rect proc process rectangle notch-rect card notched-rectangle hourglass collate bolt com-link lightning-bolt curv-trap curved-trapezoid display div-rect div-proc divided-process divided-rectangle tri extract triangle fork join win-pane internal-storage window-pane notch-pent loop-limit notched-pentagon flip-tri flipped-triangle manual-file st-rect processes procs stacked-rectangle odd flag paper-tape tag-rect tag-proc tagged-process tagged-rectangle lin-rect lin-proc lined-process lined-rectangle shaded-process'],
  ['service', 'rounded event'], ['terminal', 'stadium pill terminal'], ['onpage', 'circle circ sm-circ small-circle start dbl-circ double-circle fr-circ framed-circle stop f-circ filled-circle junction cross-circ crossed-circle summary'],
  ['subproc', 'fr-rect framed-rectangle subproc subprocess subroutine'], ['database', 'cyl cylinder database db lin-cyl disk lined-cylinder'],
  ['queue', 'h-cyl das horizontal-cylinder'], ['decision', 'diam decision diamond question'], ['prep', 'hex hexagon prepare'],
  ['data', 'lean-r lean-right in-out lean-l lean-left out-in'], ['manualop', 'trap-t inv-trapezoid manual trapezoid-top trap-b priority trapezoid trapezoid-bottom'],
  ['manual', 'sl-rect manual-input sloped-rectangle'], ['fdoc', 'doc document docs documents st-doc stacked-document lin-doc lined-document tag-doc tagged-document'],
  ['delay', 'delay half-rounded-rectangle'], ['store', 'bow-rect bow-tie-rectangle stored-data'], ['note', 'brace brace-l comment brace-r braces'], ['text', 'text']
];
const V11_SHAPE = Object.fromEntries(V11.flatMap(([kind, names]) => names.split(' ').map(n => [n, kind])));
const props = body => {
  const out = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,]+))/g)) out[m[1]] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
  return out;
};
const ID = /^[\wÀ-￿]+(?:[.-][\wÀ-￿]+)*/;
const TEXT_LINK = /^(<)?(--|==|-\.)\s+([^\s>|=.-][^|]*?)\s+(-{2,}>|-{3,}|={2,}>|={3,}|\.-+>|\.-+)/;
const LINK = /^(<)?(-{2,}>|={2,}>|-\.+->|-{3,}|={3,}|-\.+-|~{3,}|-{2,}[ox](?![\w])|={2,}[ox](?![\w])|-{2}|={2})/;

function parseFlow(lines, dir) {
  const g = { kind: 'flow', dir, nodes: new Map(), edges: [], groups: [], skipped: 0 };
  const open = [], edgeIds = new Set();
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
    // Mermaid 11 writes the shape and the label in braces after an @.
    const v11 = rest.startsWith('@{', i) ? rest.indexOf('}', i) : -1;
    if (v11 > 0) {
      const p = props(rest.slice(i + 2, v11));
      if (p.label != null) label = cleanLabel(p.label);
      shape = V11_SHAPE[String(p.shape || '').toLowerCase()] || null;
      i = v11 + 1;
    }
    for (const [mark, ends, kind] of v11 > 0 ? [] : SHAPE_MARKS) {
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
    if (label != null) { n.label = label; n.defined = true; }
    if (shape) { n.shape = shape; n.defined = true; }
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
    let r = rest.trimStart();
    // An id before a link, as in A e1@--> B, names the link for styles. The name is not needed here.
    const named = r.match(/^([\w-]+)@(?=[<\-=.~])/);
    if (named) { edgeIds.add(named[1]); r = r.slice(named[0].length); }
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
    // A longer link asks for more ranks between its shapes: --> is one rank, ---> is two, and -..-> is two.
    // The closing part of a link with text sets its length.
    const token = head === tail ? head : tail, dots = (token.match(/\./g) || []).length, bars = (token.match(/[-=]/g) || []).length;
    const minlen = Math.max(1, Math.min(6, dots || bars - (end ? 1 : 2)));
    return {
      minlen,
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
    if (st === 'end') { open.pop(); return; }
    if (/^direction\s+\w+$/i.test(st) || SKIP.test(st)) return;
    // Settings of a named link, such as e1@{ animate: true }.
    const linkProps = st.match(/^([\w-]+)@\{/);
    if (linkProps && edgeIds.has(linkProps[1])) return;
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
          g.edges.push({ from: flip ? b.id : a.id, to: flip ? a.id : b.id, label: l.label, dashed: l.dashed, arrow: flip ? 'end' : l.arrow, minlen: l.minlen });
        }));
      }
      first = next;
      rest = next.rest;
    }
    if (rest.trim()) g.skipped++;
  }));
  // The name of a subgraph in a link means the subgraph, so its zone takes the connector.
  g.groups.forEach(grp => { const n = g.nodes.get(grp.id); if (n && !n.defined) g.nodes.delete(grp.id); });
  return g;
}

// ---------- class diagrams
const KINDS = { interface: 'interface', abstract: 'abstract', enumeration: 'enum', enum: 'enum' };
// Mermaid writes generics with tildes: List~int~ is List<int>, and List~List~int~~ is List<List<int>>.
// A tilde between two word characters opens a type parameter. Any other tilde closes one.
function generic(s) {
  const str = String(s);
  let out = '', depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch !== '~') out += ch;
    else if (/\w/.test(str[i - 1] || '') && /\w/.test(str[i + 1] || '')) { out += '<'; depth++; }
    else if (depth > 0) { out += '>'; depth--; }
    else out += ch;
  }
  return out;
}
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
  let body = null, notes = 0;
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
    const decl = line.match(/^class\s+([\w.]+)(~[^{[:]*~)?\s*(?:\["([^"]*)"\])?\s*(?::::[\w-]+)?\s*(\{(.*?)(\})?)?\s*$/);
    if (decl) {
      const c = cls(decl[1]);
      if (decl[2]) c.label = generic(decl[1] + decl[2]);
      if (decl[3]) c.label = cleanLabel(decl[3]);
      if (decl[4] != null) {
        const inner = (decl[5] || '').trim();
        if (decl[6]) inner.split(';').forEach(m => member(c, m));
        else { if (inner) member(c, inner); body = c; }
      }
      return;
    }
    // A note for a class becomes a note shape with a dashed line to the class. A note without a class stands alone.
    const note = line.match(/^note(?:\s+for\s+([\w.]+))?\s+"(.*)"$/);
    if (note) {
      const id = `note${notes++}`, text = note[2].replace(/\\n/g, '\n');
      g.nodes.set(id, { id, label: cleanLabel(text), kind: 'note', attrs: [], ops: [], groups: open.length ? open.map(x => x.id) : null });
      if (note[1]) { cls(note[1]); g.edges.push({ from: id, to: note[1], label: '', rel: null, dashed: true, arrow: 'none', note: true }); }
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

// ---------- state diagrams
function parseState(lines) {
  const g = { kind: 'state', dir: 'TB', nodes: new Map(), edges: [], groups: [], skipped: 0 };
  const open = [], inGroups = () => (open.length ? open.map(x => x.id) : null);
  const state = id => {
    if (!g.nodes.has(id)) g.nodes.set(id, { id, label: id, shape: 'state', sub: '', groups: inGroups() });
    const n = g.nodes.get(id);
    if (open.length && !n.groups) n.groups = inGroups();
    return n;
  };
  // [*] on the left of a transition is the start of its scope, and on the right it is the end.
  const point = (tok, role) => {
    if (tok !== '[*]') return state(tok);
    const id = `[*]${open.length ? open[open.length - 1].id : ''}:${role}`;
    if (!g.nodes.has(id)) g.nodes.set(id, { id, label: '', shape: role, sub: '', groups: inGroups(), defined: true });
    return g.nodes.get(id);
  };
  let note = null, notes = 0;
  // `place` is the side of the state where the note goes: left or right.
  const addNote = (target, text, place) => {
    const id = `note${notes++}`;
    g.nodes.set(id, { id, label: cleanLabel(text), shape: 'note', sub: '', groups: inGroups(), defined: true });
    g.edges.push({ from: id, to: state(target).id, label: '', dashed: true, arrow: 'none', note: true, place });
  };
  lines.slice(1).forEach(line => {
    if (note) {
      if (/^end note$/i.test(line)) { addNote(note.target, note.text.join('\n'), note.place); note = null; } else note.text.push(line);
      return;
    }
    const d = line.match(/^direction\s+(TB|TD|BT|LR|RL)$/i);
    if (d) { if (!open.length) g.dir = d[1].toUpperCase().replace('TD', 'TB'); return; }
    // A line of dashes splits a composite state into regions. The regions share the zone here.
    if (/^-{2,}$/.test(line) || SKIP.test(line) || /^(scale|hide)\b/.test(line)) return;
    if (line === '}') { open.pop(); return; }
    let m = line.match(/^state\s+(?:"([^"]*)"\s+as\s+)?([\w.-]+)\s*(?:<<\s*(fork|join|choice)\s*>>)?\s*(\{)?$/i);
    if (m) {
      const [, desc, id, pseudo, brace] = m;
      if (brace) {
        const grp = { id, label: desc ? cleanLabel(desc) : id, parent: open.length ? open[open.length - 1].id : null };
        g.groups.push(grp);
        open.push(grp);
        return;
      }
      const n = state(id);
      n.defined = true;
      if (desc) n.label = cleanLabel(desc);
      if (pseudo) { n.shape = pseudo.toLowerCase(); n.label = ''; }
      return;
    }
    m = line.match(/^(\[\*\]|[\w.-]+)\s*-->\s*(\[\*\]|[\w.-]+)\s*(?::\s*(.*))?$/);
    if (m) {
      const a = point(m[1], 'start'), b = point(m[2], 'end');
      g.edges.push({ from: a.id, to: b.id, label: m[3] ? cleanLabel(m[3]) : '', dashed: false, arrow: 'end' });
      return;
    }
    m = line.match(/^note\s+(left|right)\s+of\s+([\w.-]+)\s*(?::\s*(.*))?$/i);
    if (m) { const place = m[1].toLowerCase(); if (m[3] != null) addNote(m[2], m[3], place); else note = { target: m[2], text: [], place }; return; }
    // A description goes under the name of the state.
    m = line.match(/^([\w.-]+)\s*:\s*(.+)$/);
    if (m) { const n = state(m[1]); n.defined = true; n.sub = n.sub ? `${n.sub} · ${cleanLabel(m[2])}` : cleanLabel(m[2]); return; }
    if (/^[\w.-]+$/.test(line)) { state(line).defined = true; return; }
    g.skipped++;
  });
  // A composite state is a zone, so a transition to it connects to the zone.
  g.groups.forEach(grp => { const n = g.nodes.get(grp.id); if (n && !n.defined) g.nodes.delete(grp.id); });
  return g;
}

// ---------- entity relationship diagrams
// Crow's foot ends become multiplicities: exactly one, zero or one, one or more, zero or more.
const ER_CARD = { '||': '1', '|o': '0..1', 'o|': '0..1', '}|': '1..*', '|{': '1..*', '}o': '0..*', 'o{': '0..*' };
const ER_WORD = { 'only one': '1', 1: '1', 'zero or one': '0..1', 'one or zero': '0..1', 'one or more': '1..*', 'one or many': '1..*', 'many(1)': '1..*', '1+': '1..*', 'zero or more': '0..*', 'zero or many': '0..*', 'many(0)': '0..*', '0+': '0..*' };
const ER_NAME = '([\\w.-]+|"[^"]+")';
const ER_REL = new RegExp(`^${ER_NAME}\\s*(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s*${ER_NAME}\\s*:\\s*(.+)$`);
const ER_REL_WORDS = new RegExp(`^${ER_NAME}\\s+(.+?)\\s+(optionally to|to)\\s+(.+?)\\s+${ER_NAME}\\s*:\\s*(.+)$`, 'i');

function parseER(lines) {
  const g = { kind: 'er', dir: 'TB', nodes: new Map(), edges: [], groups: [], skipped: 0 };
  const entity = raw => {
    const id = raw.replace(/^"|"$/g, '');
    if (!g.nodes.has(id)) g.nodes.set(id, { id, label: id, kind: 'entity', attrs: [], ops: [], groups: null });
    return g.nodes.get(id);
  };
  const relate = (a, b, m1, m2, dashed, label) => {
    g.edges.push({ from: entity(a).id, to: entity(b).id, label: cleanLabel(label.replace(/^"([\s\S]*)"$/, '$1')), rel: null, dashed, arrow: 'none', m1, m2 });
  };
  let body = null;
  lines.slice(1).forEach(line => {
    if (body) {
      if (line === '}') { body = null; return; }
      // An attribute: type, name, keys and a comment. It shows as "name: type PK".
      const m = line.match(/^(\S+)\s+([\w.-]+)((?:\s+(?:PK|FK|UK)\s*,?)*)\s*(?:"[^"]*")?$/i);
      body.attrs.push(m ? `${m[2]}: ${m[1]}${m[3].trim() ? ' ' + m[3].replace(/[\s,]+/g, ' ').trim().toUpperCase().split(' ').join(', ') : ''}` : line);
      return;
    }
    const d = line.match(/^direction\s+(TB|TD|BT|LR|RL)$/i);
    if (d) { g.dir = d[1].toUpperCase().replace('TD', 'TB'); return; }
    let m = line.match(new RegExp(`^${ER_NAME}(?:\\["([^"]*)"\\])?\\s*\\{$`));
    if (m) { body = entity(m[1]); if (m[2]) body.label = m[2]; return; }
    m = line.match(ER_REL);
    if (m) { relate(m[1], m[5], ER_CARD[m[2]], ER_CARD[m[4]], m[3] === '..', m[6]); return; }
    m = line.match(ER_REL_WORDS);
    if (m && ER_WORD[m[2].toLowerCase()] && ER_WORD[m[4].toLowerCase()]) {
      relate(m[1], m[5], ER_WORD[m[2].toLowerCase()], ER_WORD[m[4].toLowerCase()], m[3].toLowerCase() !== 'to', m[6]);
      return;
    }
    m = line.match(new RegExp(`^${ER_NAME}(?:\\["([^"]*)"\\])?$`));
    if (m) { const e = entity(m[1]); if (m[2]) e.label = m[2]; return; }
    if (SKIP.test(line)) return;
    g.skipped++;
  });
  return g;
}

// ---------- sequence diagrams
// A message: sender, arrow, an optional + or - for activation, receiver, and the text.
const MESSAGE = /^([^\s:+<>-][^:]*?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*([^\s:+-][^:]*?)\s*(?::\s*(.*))?$/;

function parseSequence(lines) {
  const g = { kind: 'sequence', dir: 'TB', parts: new Map(), events: [], nodes: new Map(), edges: [], groups: [], skipped: 0, title: '' };
  const part = (id, label, actor) => {
    const key = id.trim();
    if (!g.parts.has(key)) g.parts.set(key, { id: key, label: key, actor: false });
    const p = g.parts.get(key);
    if (label) p.label = cleanLabel(label);
    if (actor) p.actor = true;
    return p;
  };
  lines.slice(1).forEach(line => {
    let m = line.match(/^(?:create\s+)?(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i);
    if (m) { part(m[2], m[3], m[1].toLowerCase() === 'actor'); return; }
    m = line.match(/^title\s*:?\s*(.+)$/i);
    if (m) { g.title = cleanLabel(m[1]); return; }
    if (/^autonumber\b/i.test(line)) { g.number = 1; return; }
    m = line.match(/^(activate|deactivate)\s+(.+)$/i);
    if (m) { g.events.push({ type: m[1].toLowerCase(), who: part(m[2]).id }); return; }
    m = line.match(/^note\s+(left of|right of|over)\s+([^:]+?)\s*:\s*(.*)$/i);
    if (m) { g.events.push({ type: 'note', at: m[1].toLowerCase(), who: m[2].split(',').map(x => part(x).id), text: cleanLabel(m[3]) }); return; }
    m = line.match(/^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i);
    if (m) { g.events.push({ type: 'open', kind: m[1].toLowerCase(), text: m[1].toLowerCase() === 'rect' ? '' : cleanLabel(m[2]) }); return; }
    m = line.match(/^(else|and|option)\b\s*(.*)$/i);
    if (m) { g.events.push({ type: 'split', text: cleanLabel(m[2]) }); return; }
    if (/^end$/i.test(line)) { g.events.push({ type: 'close' }); return; }
    if (/^(box|destroy|links?|properties|details)\b/i.test(line) || SKIP.test(line)) return;
    m = line.match(MESSAGE);
    if (m) {
      const [, from, arrow, act, to, text] = m;
      g.events.push({ type: 'message', from: part(from).id, to: part(to).id, arrow, act, text: text ? cleanLabel(text) : '' });
      return;
    }
    g.skipped++;
  });
  // A diagram with participants and no messages is still a diagram.
  g.parts.forEach(p => g.nodes.set(p.id, p));
  return g;
}

export function parseMermaid(text) {
  const { lines, title, long } = prepare(text);
  const head = lines.length ? lines[0].match(HEADER) : null;
  if (!head) return null;
  const dir = (head[2] || 'TB').toUpperCase().replace('TD', 'TB');
  // A flowchart can start on the line of its header, for example `graph TD; A-->B`.
  const parse = { classDiagram: parseClass, stateDiagram: parseState, erDiagram: parseER, sequenceDiagram: parseSequence }[head[3]];
  const g = parse ? parse(lines) : parseFlow([lines[0].slice(head[0].length), ...lines.slice(1)], dir);
  g.title = title;
  g.skipped += long;
  return g;
}


// ---------- sheet
const GRID = 20;
const up = v => Math.ceil(v / GRID) * GRID;
// The widest label line before it wraps, in px. A diamond holds its label in its middle, so it wraps sooner.
const WRAP = 200, WRAP_DIAMOND = 130;
// The size of each shape around a label of width tw and height th. The numbers follow where draw.jsx and
// library.jsx put the label in each shape.
const FIT = {
  box: (tw, th) => [tw + 40, th + 28, 100, 60],
  service: (tw, th) => [tw + 44, th + 28, 100, 60],
  terminal: (tw, th) => [tw + 56, th + 24, 120, 60],
  subproc: (tw, th) => [tw + 56, th + 28, 120, 60],
  database: (tw, th) => [tw + 40, th + 64, 100, 100],
  queue: (tw, th) => [tw + 60, th + 28, 140, 60],
  decision: (tw, th) => [tw / 0.6 + 24, th * 2 + 36, 120, 80],
  prep: (tw, th) => [tw + 60, th + 28, 120, 60],
  data: (tw, th) => [tw + 76, th + 28, 140, 60],
  manualop: (tw, th) => [tw + 76, th + 28, 140, 60],
  manual: (tw, th) => [tw + 40, th + 44, 120, 80],
  fdoc: (tw, th) => [tw + 40, th + 44, 120, 80],
  delay: (tw, th) => [tw + 56, th + 28, 120, 60],
  store: (tw, th) => [tw + 48, th + 28, 120, 60],
  onpage: (tw, th) => { const d = Math.max(tw + 28, th + 28); return [d, d, 60, 60]; },
  note: (tw, th) => [tw + 44, th + 30, 140, 60],
  text: (tw, th) => [tw + 20, th + 16, 60, 40]
};

// The size of a flowchart shape that holds its label.
function shapeSize(kind, label, L, caps) {
  const font = `${L.weight} 16px ${L.family}`, ls = L.ls * 16, text = caps ? label.toUpperCase() : label;
  const lines = text ? wrap(text, kind === 'decision' ? WRAP_DIAMOND : WRAP, font, ls) : [''];
  const tw = Math.max(...lines.map(l => measure(l, font) + l.length * ls)), th = lines.length * 16 * L.lh;
  const [w, h, minW, minH] = (FIT[kind] || FIT.box)(tw, th);
  return { w: Math.max(minW, up(w)), h: Math.max(minH, up(h)) };
}

// A shape of a state diagram: a rounded box with the description under the name, a small circle at the start
// and the end, a diamond for a choice, and a bar for a fork or a join.
function stateShape(n, dir, L, caps) {
  if (n.shape === 'start' || n.shape === 'end') return { type: 'onpage', label: '', w: 30, h: 30, fill: n.shape === 'start' ? 'tint' : 'hatch' };
  if (n.shape === 'choice') return { type: 'decision', label: '', w: 60, h: 60 };
  if (n.shape === 'fork' || n.shape === 'join') return { type: 'box', label: '', fill: 'tint', ...(dir === 'LR' || dir === 'RL' ? { w: 10, h: 100 } : { w: 100, h: 10 }) };
  if (n.shape === 'note') return { type: 'note', ...shapeSize('note', n.label, L, caps) };
  const size = shapeSize('service', n.label, L, caps);
  if (!n.sub) return { type: 'service', ...size };
  const subW = measure(n.sub, `400 11px 'IBM Plex Mono', monospace`) + 44;
  return { type: 'service', sub: n.sub, w: Math.max(size.w, up(subW)), h: size.h + 20 };
}

// The size of a connector label, so the layout keeps room for it.
// The tab with the name of a zone, or the folder tab of a package. It matches the zone in draw.jsx.
function tabSize(label, pkg, L, caps) {
  const fs = 13 * 0.95, str = caps ? String(label || '').toUpperCase() : String(label || '');
  const w = str ? Math.ceil(measure(str, `${L.weight} ${fs}px ${L.family}`) + str.length * L.ls * fs + 24) : 0;
  return pkg ? { w: Math.max(80, w), h: 24 } : { w, h: 26 };
}
function labelSize(text, L, caps) {
  if (!text) return null;
  const str = caps ? text.toUpperCase() : text, font = `${L.weight} 13px ${L.family}`;
  const lines = str.split('\n');
  return { w: Math.ceil(Math.max(...lines.map(l => measure(l, font) + l.length * L.ls * 13)) + 16), h: 22 * lines.length };
}

// Turns Mermaid text into a sheet: { name, unit, nodes, edges, skipped }. Returns null when the text is not
// Mermaid, and { error } when it has no shapes. `L` and `caps` set the lettering, so each shape gets the size
// that the editor gives it.
export async function mermaidSheet(text, { L, caps = true, id = () => Math.random().toString(36).slice(2, 9) }) {
  const g = parseMermaid(text);
  if (!g) return null;
  if (!g.nodes.size) return { error: 'The Mermaid text has no shapes.' };
  if (g.kind === 'sequence') return sequenceSheet(g, { L, caps, id });
  // A group and a shape can have the same name, so each has its own map of ids.
  const ids = new Map([...g.nodes.keys()].map(k => [k, id()])), zoneIds = new Map(g.groups.map(x => [x.id, id()]));
  const nodes = [...g.nodes.values()].map(n => {
    const base = { id: ids.get(n.id), x: 0, y: 0, label: n.label, sub: '', dashed: false, fill: 'none', size: 'm', flip: false };
    const groups = n.groups || [], group = groups.length ? zoneIds.get(groups[groups.length - 1]) : null;
    if (g.kind === 'state') return { ...base, ...stateShape(n, g.dir, L, caps), group };
    if ((g.kind === 'class' || g.kind === 'er') && n.kind !== 'note') {
      const c = { ...base, type: 'class', kind: n.kind, attrs: n.attrs.join('\n'), ops: n.ops.join('\n'), w: 200, h: 120 };
      const lay = classLayout(c, L, caps);
      return { ...c, w: Math.max(160, up(lay.minW)), h: lay.h, group };
    }
    const kind = g.kind === 'class' ? 'note' : n.shape;
    return { ...base, type: kind, ...shapeSize(kind, n.label, L, caps), group };
  });
  // Where a connector can meet a side away from its middle. It matches portShare in engine.js.
  const SLIDE = { class: 'all', note: 'all', box: 'all', subproc: 'all', text: 'all', service: 'all', terminal: 'tb' };
  // The space that a port keeps from a corner. It matches portShare in engine.js.
  const MARGIN = { terminal: n => n.h / 2 + 8, service: () => 20 };
  nodes.forEach(n => { n.slide = SLIDE[n.type] || null; n.margin = MARGIN[n.type] ? MARGIN[n.type](n) : 8; });
  const byKey = new Map([...g.nodes.keys()].map((k, i) => [k, nodes[i]]));
  const groups = g.groups.map(x => ({ id: zoneIds.get(x.id), parent: x.parent ? zoneIds.get(x.parent) : null, label: x.label, pkg: !!x.pkg, tab: tabSize(x.label, !!x.pkg, L, caps) }));
  const ref = k => (byKey.has(k) ? byKey.get(k).id : zoneIds.get(k) || null);
  const edges = g.edges.map(e => {
    const out = { id: id(), from: ref(e.from), to: ref(e.to), label: e.label || '', route: 'elbow', arrow: e.arrow || 'end', dashed: !!e.dashed };
    // Connectors of one kind can share a port. The sheet drops these fields.
    out.kind = [e.rel || '', e.dashed ? 'dashed' : '', e.arrow || 'end', e.note ? 'note' : ''].join('|');
    if (e.minlen > 1) out.minlen = e.minlen;
    // A note goes beside its state, on the side that the Mermaid text names.
    if (e.place) out.place = e.place;
    if (e.rel) out.rel = e.rel;
    if (e.m1) out.m1 = e.m1;
    if (e.m2) out.m2 = e.m2;
    return out;
  }).filter(e => e.from && e.to && e.from !== e.to);
  // Inheritance points up to the parent, so for the layout the parent comes first and the connector turns around.
  const flip = new Set(edges.filter(e => e.rel === 'inherit' || e.rel === 'realize').map(e => e.id));
  const plan = await layoutDiagram({
    dir: g.dir,
    nodes: nodes.map(n => ({ id: n.id, w: n.w, h: n.h, group: n.group, slide: n.slide, margin: n.margin })),
    groups,
    edges: edges.map(e => ({
      id: e.id, from: flip.has(e.id) ? e.to : e.from, to: flip.has(e.id) ? e.from : e.to, label: labelSize(e.label, L, caps),
      kind: e.kind, minlen: e.minlen, place: e.place
    }))
  });
  nodes.forEach(n => { const p = plan.pos.get(n.id); n.x = p.x; n.y = p.y; });
  edges.forEach(e => {
    const r = plan.routes.get(e.id);
    if (!r) return;
    const turn = flip.has(e.id);
    e.fromSide = turn ? r.toSide : r.fromSide;
    e.toSide = turn ? r.fromSide : r.toSide;
    if (r.pts) e.pts = turn ? [...r.pts].reverse() : r.pts;
    const fromAt = turn ? r.toAt : r.fromAt, toAt = turn ? r.fromAt : r.toAt;
    if (fromAt != null) e.fromAt = fromAt;
    if (toAt != null) e.toAt = toAt;
    if (r.lt != null) e.lt = turn ? Math.round((1 - r.lt) * 1000) / 1000 : r.lt;
  });
  const zones = new Map();
  groups.forEach(grp => {
    const box = plan.zones.get(grp.id);
    if (!box) return;
    const z = { id: grp.id, type: 'zone', ...box, label: grp.label, sub: '', dashed: !grp.pkg, fill: 'none', size: 's', flip: false };
    if (grp.pkg) z.pkg = true;
    zones.set(grp.id, z);
  });
  // The drawing starts at (80, 80), on the grid.
  const all = [...zones.values(), ...nodes];
  const dx = 80 - Math.floor(Math.min(...all.map(n => n.x)) / GRID) * GRID, dy = 80 - Math.floor(Math.min(...all.map(n => n.y)) / GRID) * GRID;
  all.forEach(n => { n.x += dx; n.y += dy; });
  edges.forEach(e => { if (e.pts) e.pts = e.pts.map(p => ({ x: p.x + dx, y: p.y + dy })); });
  const name = g.title || { class: 'Class diagram', state: 'State diagram', er: 'Entity relationship diagram' }[g.kind] || 'Flowchart';
  return { name, unit: 'px', nodes: [...[...groups].map(x => zones.get(x.id)).filter(Boolean), ...nodes.map(({ group: _g, slide: _s, margin: _m, ...n }) => n)], edges, skipped: g.skipped };
}

// ---------- sequence diagram sheet
const SEQ_TOP = 80, SEQ_GAP = 60, SEQ_ROW = 44, SEQ_LOOP = 30;

// Participants go in a row, in the order the diagram names them. Each event goes one row further down.
// Each participant and its lifeline form a group, so they move together.
function sequenceSheet(g, { L, caps, id }) {
  const font = `${L.weight} 16px ${L.family}`, small = `${L.weight} 13px ${L.family}`;
  // The width of the widest line of a text.
  const width = (t, f, size) => Math.max(...String(t).split('\n').map(l => { const str = caps ? l.toUpperCase() : l; return measure(str, f) + str.length * L.ls * size; }));
  const more = t => (String(t).split('\n').length - 1) * 16;
  const parts = [...g.parts.values()];
  const box = parts.map(p => (p.actor ? { w: 40, h: 60 } : { w: Math.max(100, up(width(p.label, font, 16) + 40)), h: 60 }));
  const index = new Map(parts.map((p, i) => [p.id, i]));
  // The space between two participants fits the widest message between them.
  const gaps = parts.slice(1).map((p, i) => Math.max((box[i].w + box[i + 1].w) / 2 + SEQ_GAP, 160));
  const need = (a, b, w) => {
    if (a === b) { if (a < gaps.length) gaps[a] = Math.max(gaps[a], w + 80); return; }
    const lo = Math.min(a, b), hi = Math.max(a, b), have = gaps.slice(lo, hi).reduce((t, v) => t + v, 0);
    if (have < w + 40) gaps[hi - 1] += w + 40 - have;
  };
  let num = g.number || 0;
  g.events.forEach(e => {
    if (e.type === 'message') { e.label = num ? `${num++}. ${e.text}`.trim() : e.text; need(index.get(e.from), index.get(e.to), width(e.label, small, 13)); }
  });
  const xs = [80 + box[0].w / 2];
  gaps.forEach((v, i) => xs.push(Math.round((xs[i] + v) / 20) * 20));
  const cx = pid => xs[index.get(pid)];
  const nodes = [], base = { sub: '', dashed: false, fill: 'none', size: 'm', flip: false };
  const line = (a, b, extra = {}) => nodes.push({ id: id(), type: 'line', ...pathFrom([a, b]), label: '', weight: 's', ...base, ...extra });
  // A text of more lines grows up, so its last line stays at y.
  const text = (t, x, y, extra = {}) => {
    const w = up(width(t, small, 13) + 24), h = 28 + more(t);
    nodes.push({ id: id(), type: 'text', x: Math.round(x - w / 2), y: Math.round(y + 14 - h), w, h, label: t, ...base, size: 's', ...extra });
  };
  let y = SEQ_TOP + 60 + 30;
  const active = new Map(), blocks = [];
  const activate = who => { if (!active.has(who)) active.set(who, []); active.get(who).push(y); };
  const deactivate = who => {
    const st = active.get(who);
    if (!st || !st.length) return;
    const y0 = st.pop();
    nodes.push({ id: id(), type: 'box', x: cx(who) - 6, y: y0, w: 12, h: Math.max(20, y - y0), label: '', ...base, fill: 'tint' });
  };
  g.events.forEach(e => {
    if (e.type === 'message') {
      const a = cx(e.from), b = cx(e.to), dashed = e.arrow.includes('--'), both = e.arrow.startsWith('<<');
      // -> and --> are lines without an arrowhead. The cross and the open arrow of Mermaid draw as arrowheads.
      const arrow = e.arrow === '->' || e.arrow === '-->' ? undefined : both ? 'both' : 'end';
      blocks.forEach(bl => bl.parts.add(e.from).add(e.to));
      if (a === b) {
        // A message to itself: a small loop at the right of the lifeline.
        y += SEQ_ROW - 10 + Math.max(0, more(e.label) - SEQ_LOOP / 2);
        line({ x: a, y }, { x: a + 40, y }, { dashed });
        line({ x: a + 40, y }, { x: a + 40, y: y + SEQ_LOOP }, { dashed });
        line({ x: a + 40, y: y + SEQ_LOOP }, { x: a, y: y + SEQ_LOOP }, { dashed, ...(arrow ? { arrow } : {}) });
        if (e.label) { const w = up(width(e.label, small, 13) + 24); text(e.label, a + 52 + w / 2, y + SEQ_LOOP / 2 + more(e.label) / 2); }
        y += SEQ_LOOP + 10;
      } else {
        y += SEQ_ROW + more(e.label);
        line({ x: a, y }, { x: b, y }, { dashed, ...(arrow ? { arrow } : {}) });
        if (e.label) text(e.label, (a + b) / 2, y - 16);
      }
      if (e.act === '+') activate(e.to);
      if (e.act === '-') deactivate(e.from);
      return;
    }
    if (e.type === 'activate') { activate(e.who); return; }
    if (e.type === 'deactivate') { deactivate(e.who); return; }
    if (e.type === 'note') {
      const xs2 = e.who.map(cx), lo = Math.min(...xs2), hi = Math.max(...xs2), size = shapeSize('note', e.text, L, caps);
      let x;
      if (e.at === 'over') { size.w = Math.max(size.w, hi - lo + 60); x = (lo + hi) / 2 - size.w / 2; } else x = e.at === 'right of' ? hi + 20 : lo - 20 - size.w;
      y += 16;
      // A note filled with the paper color hides the lifelines that run under it.
      nodes.push({ id: id(), type: 'note', x: Math.round(x), y, ...size, label: e.text, ...base, fill: 'paper' });
      e.who.forEach(w => blocks.forEach(bl => bl.parts.add(w)));
      y += size.h;
      return;
    }
    if (e.type === 'open') { y += 20; blocks.push({ ...e, y0: y, splits: [], parts: new Set() }); y += 30; return; }
    if (e.type === 'split' && blocks.length) { y += 20; blocks[blocks.length - 1].splits.push({ y, text: e.text }); y += 24; return; }
    if (e.type === 'close' && blocks.length) {
      const bl = blocks.pop();
      blocks.forEach(outer => bl.parts.forEach(p => outer.parts.add(p)));
      const ids = bl.parts.size ? [...bl.parts] : parts.map(p => p.id), pxs = ids.map(cx);
      const depth = blocks.length, x0 = Math.min(...pxs) - 70 + depth * 10, x1 = Math.max(...pxs) + 70 - depth * 10;
      y += 16;
      nodes.push({ id: id(), type: 'zone', x: x0, y: bl.y0, w: x1 - x0, h: y - bl.y0, label: bl.kind, ...base, sub: bl.text ? `[${bl.text}]` : '', dashed: true, size: 's' });
      bl.splits.forEach(sp => {
        line({ x: x0, y: sp.y }, { x: x1, y: sp.y }, { dashed: true });
        if (sp.text) text(`[${sp.text}]`, x0 + 16 + up(width(`[${sp.text}]`, small, 13) + 24) / 2, sp.y + 14);
      });
    }
  });
  [...active.keys()].forEach(who => { while (active.get(who).length) deactivate(who); });
  // Participants and their lifelines, in front of the blocks.
  const end = y + 40, heads = [];
  parts.forEach((p, i) => {
    const group = id(), x = xs[i], b = box[i];
    heads.push(p.actor
      ? { id: id(), type: 'actor', x: x - 20, y: SEQ_TOP, w: 40, h: 60, label: p.label, ...base, group }
      : { id: id(), type: 'box', x: x - b.w / 2, y: SEQ_TOP, w: b.w, h: b.h, label: p.label, ...base, group });
    const top = SEQ_TOP + b.h + (p.actor ? 30 : 0);
    heads.push({ id: id(), type: 'line', ...pathFrom([{ x, y: top }, { x, y: end }]), label: '', weight: 's', ...base, dashed: true, group });
  });
  const zones = nodes.filter(n => n.type === 'zone'), rest = nodes.filter(n => n.type !== 'zone');
  return { name: g.title || 'Sequence diagram', unit: 'px', nodes: [...zones, ...heads, ...rest], edges: [], skipped: g.skipped };
}

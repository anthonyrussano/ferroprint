// Pure SVG drawing for shapes, connectors and dimension marks.
// `ctx` holds the theme (t), the lettering (L), the caps flag, the sheet unit and the grid size.
import { SIZES, WEIGHTS, MONO, measure, wrap, linePts, edgeGeom, areaLabel, fmtLen, f1, hitBox, classLayout, REL } from './engine.js';
import { SYMBOLS, makePen, cloudPaths } from './library.jsx';
import { cloudIcon } from './cloud.js';

export const txt = (ctx, s) => (ctx.caps ? String(s).toUpperCase() : String(s));

function labelEls(n, ctx, o) {
  const { t, L } = ctx;
  const fs = SIZES[n.size || 'm'] * (o.scale || 1), lsp = L.ls * fs, font = `${L.weight} ${fs}px ${L.family}`;
  const str = n.label ? txt(ctx, n.label) : '';
  let lines = str ? wrap(str, Math.max(20, o.maxW), font, lsp) : [];
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    lines[o.maxLines - 1] += '…';
  }
  const sub = o.sub !== undefined ? o.sub : n.sub, sfs = Math.max(10, Math.round(fs * 0.7));
  const lh = fs * L.lh, total = lines.length * lh + (sub ? sfs * 1.6 : 0);
  const y0 = o.top != null ? o.top : o.cy - total / 2, anchor = o.anchor || 'middle';
  const els = [];
  // A paper plate behind the label keeps it legible on top of the lines of a symbol.
  if (o.bg && lines.length) {
    const tw = Math.max(...lines.map(ln => measure(ln, font) + ln.length * lsp)) + 12;
    els.push(<rect key="bg" x={anchor === 'start' ? o.x - 6 : o.x - tw / 2} y={y0 - 2} width={tw} height={lines.length * lh + 4} fill={t.paper} />);
  }
  lines.forEach((ln, i) => els.push(
    <text key={'l' + i} x={o.x} y={y0 + lh * i + lh / 2} textAnchor={anchor} dominantBaseline="central" fill={o.color || (o.muted ? t.muted : t.ink)} fontFamily={L.family} fontWeight={L.weight} fontSize={fs} letterSpacing={lsp}>{ln}</text>
  ));
  if (sub) els.push(<text key="sub" x={o.x} y={y0 + lines.length * lh + sfs * 0.95} textAnchor={anchor} dominantBaseline="central" fill={t.muted} fontFamily={MONO} fontSize={sfs}>{sub}</text>);
  return els;
}

// A library symbol draws in its own unrotated box. The transform turns and mirrors it into the node box.
function renderSymbol(n, ctx, sym) {
  const { t } = ctx, rot = n.rot || 0, side = rot % 180 !== 0;
  const lw = side ? n.h : n.w, lh = side ? n.w : n.h, cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const fill = n.fill === 'tint' ? t.tint : n.fill === 'hatch' ? 'url(#fp-hatch)' : 'none';
  const P = makePen(t, fill, n.dashed ? '7 5' : undefined, false);
  const hb = hitBox(n), k = [<rect key="hit" x={hb.x} y={hb.y} width={Math.max(hb.w, 1)} height={Math.max(hb.h, 1)} fill="transparent" />];
  k.push(<g key="s" transform={`translate(${cx} ${cy}) rotate(${rot})${n.flip ? ' scale(-1 1)' : ''} translate(${-lw / 2} ${-lh / 2})`}>{sym.draw(lw, lh, P)}</g>);
  if (sym.lab) {
    const o = sym.lab(n.w, n.h);
    k.push(...labelEls(n, ctx, { ...o, x: n.x + o.dx, cy: o.cy != null ? n.y + o.cy : undefined, top: o.top != null ? n.y + o.top : undefined }));
  }
  return <g key={n.id} data-k="node" data-id={n.id}>{k}</g>;
}

// A cloud icon keeps its aspect ratio inside the box. The label sits below, like the system symbols.
function renderCloud(n, ctx) {
  const { t } = ctx, ic = cloudIcon(n.icon), hb = hitBox(n);
  const k = [<rect key="hit" x={hb.x} y={hb.y} width={Math.max(hb.w, 1)} height={Math.max(hb.h, 1)} fill="transparent" />];
  if (ic) {
    const [vx, vy, vw, vh] = ic.v, s = Math.min(n.w / vw, n.h / vh) || 1;
    const ox = n.x + (n.w - vw * s) / 2, oy = n.y + (n.h - vh * s) / 2;
    k.push(<g key="s" transform={`translate(${ox} ${oy}) scale(${s}) translate(${-vx} ${-vy})`}>{cloudPaths(ic, t, 1.4 / s, false)}</g>);
  } else {
    k.push(<rect key="s" x={n.x} y={n.y} width={n.w} height={n.h} fill="none" stroke={t.line} strokeWidth={1} strokeDasharray="4 3" />);
  }
  k.push(...labelEls(n, ctx, { x: n.x + n.w / 2, top: n.y + n.h + 6, maxW: Math.max(140, n.w * 2) }));
  return <g key={n.id} data-k="node" data-id={n.id}>{k}</g>;
}

// A UML class box: an optional stereotype and the name, then the attributes, then the operations.
function renderClass(n, ctx) {
  const { t, L } = ctx, c = classLayout(n, L, ctx.caps), { x, y, w, h } = n;
  const fill = n.fill === 'tint' ? t.tint : n.fill === 'hatch' ? 'url(#fp-hatch)' : 'none';
  const y1 = y + c.head, y2 = y1 + c.attrsH;
  const k = [
    <rect key="hit" x={x} y={y} width={Math.max(w, 1)} height={Math.max(h, 1)} fill="transparent" />,
    <rect key="s" x={x} y={y} width={w} height={h} fill={fill} stroke={t.ink} strokeWidth={1.6} strokeDasharray={n.dashed ? '7 5' : undefined} />,
    <line key="d1" x1={x} y1={y1} x2={x + w} y2={y1} stroke={t.ink} strokeWidth={1.2} />
  ];
  if (!c.hideOps) k.push(<line key="d2" x1={x} y1={y2} x2={x + w} y2={y2} stroke={t.ink} strokeWidth={1.2} />);
  let ty = y + c.pad;
  if (c.st) {
    k.push(<text key="st" x={x + w / 2} y={ty + c.stFs * 0.6} textAnchor="middle" dominantBaseline="central" fill={t.muted} fontFamily={MONO} fontSize={c.stFs}>{c.st}</text>);
    ty += c.stFs * 1.3;
  }
  k.push(<text key="nm" x={x + w / 2} y={ty + c.nameFs * 0.62} textAnchor="middle" dominantBaseline="central" fill={t.ink} fontFamily={L.family} fontWeight={L.weight} fontStyle={n.kind === 'abstract' ? 'italic' : undefined} fontSize={c.nameFs} letterSpacing={L.ls * c.nameFs}>{c.name}</text>);
  const member = (key, str, yy) => <text key={key} x={x + c.pad * 1.5} y={yy} dominantBaseline="central" fill={t.ink} fontFamily={MONO} fontSize={c.memFs} style={{ whiteSpace: 'pre' }}>{str}</text>;
  c.a.forEach((str, i) => k.push(member('a' + i, str, y1 + c.pad * 0.75 + c.lh * i + c.lh / 2)));
  c.o.forEach((str, i) => k.push(member('o' + i, str, y2 + c.pad * 0.75 + c.lh * i + c.lh / 2)));
  return <g key={n.id} data-k="node" data-id={n.id}>{k}</g>;
}

export function renderNode(n, ctx) {
  if (n.type === 'cloud') return renderCloud(n, ctx);
  if (n.type === 'class') return renderClass(n, ctx);
  const sym = SYMBOLS[n.type];
  if (sym) return renderSymbol(n, ctx, sym);
  const { t, L } = ctx;
  const { x, y, w } = n, hh = n.h, cx = x + w / 2, cy = y + hh / 2;
  const fill = n.fill === 'tint' ? t.tint : n.fill === 'hatch' ? 'url(#fp-hatch)' : 'none';
  const dash = n.dashed ? (n.type === 'zone' ? '10 6' : '7 5') : undefined;
  const S = { stroke: t.ink, strokeWidth: 1.6, fill, strokeDasharray: dash, strokeLinejoin: 'miter' };
  const hit = <rect key="hit" x={x} y={y} width={Math.max(w, 1)} height={Math.max(hh, 1)} fill="transparent" />;
  const lab = o => labelEls(n, ctx, { x: cx, cy, maxW: w - 20, ...o });
  const k = [];
  switch (n.type) {
    case 'box': k.push(hit, <rect key="s" {...S} x={x} y={y} width={w} height={hh} />, ...lab()); break;
    case 'service': k.push(hit, <rect key="s" {...S} x={x} y={y} width={w} height={hh} rx={Math.min(12, hh / 2)} />, ...lab()); break;
    case 'terminal': k.push(hit, <rect key="s" {...S} x={x} y={y} width={w} height={hh} rx={hh / 2} />, ...lab({ maxW: w - hh * 0.6 })); break;
    case 'button': k.push(hit, <rect key="s" {...S} x={x} y={y} width={w} height={hh} rx={6} />, ...lab({ maxW: w - 16 })); break;
    case 'room': k.push(hit, <rect key="s" {...S} x={x} y={y} width={w} height={hh} strokeWidth={5} />, ...lab({ sub: n.sub || areaLabel(n, ctx.unit, ctx.g) })); break;
    case 'database': {
      const e = Math.min(14, hh * 0.16, w * 0.25), rx = w / 2;
      k.push(
        hit,
        <path key="s" {...S} d={`M${x} ${y + e} A${rx} ${e} 0 0 1 ${x + w} ${y + e} V${y + hh - e} A${rx} ${e} 0 0 1 ${x} ${y + hh - e} Z`} />,
        <path key="lip" d={`M${x} ${y + e} A${rx} ${e} 0 0 0 ${x + w} ${y + e}`} fill="none" stroke={t.ink} strokeWidth={1.6} strokeDasharray={dash} />,
        ...lab({ cy: y + e + (hh - e) / 2, maxW: w - 16 })
      );
      break;
    }
    case 'queue': {
      const e = Math.min(14, w * 0.15, hh * 0.3), rr = hh / 2;
      k.push(
        hit,
        <path key="s" {...S} d={`M${x + e} ${y} H${x + w - e} A${e} ${rr} 0 0 1 ${x + w - e} ${y + hh} H${x + e} A${e} ${rr} 0 0 1 ${x + e} ${y} Z`} />,
        <path key="lip" d={`M${x + w - e} ${y} A${e} ${rr} 0 0 0 ${x + w - e} ${y + hh}`} fill="none" stroke={t.ink} strokeWidth={1.6} strokeDasharray={dash} />,
        ...lab({ x: x + (w - e) / 2, maxW: w - e * 3 - 8 })
      );
      break;
    }
    case 'actor': {
      const r = Math.min(w, hh) * 0.17, hy = y + r + 1, neck = hy + r, hip = y + hh * 0.62, arm = neck + hh * 0.1;
      k.push(
        <rect key="hit" x={x - 20} y={y} width={w + 40} height={hh + 30} fill="transparent" />,
        <circle key="hd" {...S} cx={cx} cy={hy} r={r} />,
        <path key="b" d={`M${cx} ${neck} V${hip} M${x + w * 0.08} ${arm} H${x + w * 0.92} M${cx} ${hip} L${x + w * 0.15} ${y + hh} M${cx} ${hip} L${x + w * 0.85} ${y + hh}`} fill="none" stroke={t.ink} strokeWidth={1.6} strokeDasharray={dash} strokeLinecap="round" />,
        ...lab({ top: y + hh + 6, maxW: Math.max(140, w * 2) })
      );
      break;
    }
    case 'zone': {
      // A frame zone shows its group icon in the tab, before the label.
      const fs = SIZES[n.size || 's'] * 0.95, str = n.label ? txt(ctx, n.label) : '', font = `${L.weight} ${fs}px ${L.family}`;
      const ic = n.icon ? cloudIcon(n.icon) : null, iw = n.icon ? 24 : 0, th = 26;
      const tw = str || iw ? Math.min(w, (str ? measure(str, font) + str.length * L.ls * fs + 24 : 12) + iw) : 0;
      if (n.pkg) {
        // A UML package: a folder tab with the name, on top of the body.
        const pw = Math.min(w, Math.max(80, tw)), pt = 24;
        k.push(
          <path key="hs" d={`M${x} ${y + pt} V${y + hh} H${x + w} V${y + pt} H${x + pw} V${y} H${x} Z`} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" />,
          <rect key="tabhit" x={x} y={y} width={pw} height={pt} fill="transparent" />,
          <path key="s" {...S} d={`M${x} ${y + pt} V${y + hh} H${x + w} V${y + pt} H${x + pw} V${y} H${x} Z`} pointerEvents="none" />,
          <line key="tl0" x1={x} y1={y + pt} x2={x + pw} y2={y + pt} stroke={t.ink} strokeWidth={1.2} pointerEvents="none" />
        );
        if (str) k.push(<text key="tl" x={x + 12} y={y + pt / 2 + 1} dominantBaseline="central" fill={t.ink} fontFamily={L.family} fontWeight={L.weight} fontSize={fs} letterSpacing={L.ls * fs} pointerEvents="none">{str}</text>);
        if (n.sub) k.push(<text key="ts" x={x + pw + 10} y={y + pt / 2 + 1} dominantBaseline="central" fill={t.muted} fontFamily={MONO} fontSize={11}>{n.sub}</text>);
        break;
      }
      k.push(
        <rect key="hs" x={x} y={y} width={w} height={hh} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" />,
        <rect key="s" {...S} x={x} y={y} width={w} height={hh} pointerEvents="none" />
      );
      if (tw) k.push(<rect key="tab" x={x} y={y} width={tw} height={th} fill={t.paper} stroke={t.ink} strokeWidth={1.6} />);
      if (ic) {
        const [vx, vy, vw, vh] = ic.v, sc = 18 / Math.max(vw, vh);
        k.push(<g key="ic" transform={`translate(${x + 7 + (18 - vw * sc) / 2} ${y + 4 + (18 - vh * sc) / 2}) scale(${sc}) translate(${-vx} ${-vy})`}>{cloudPaths(ic, t, 1.1 / sc, false)}</g>);
      }
      if (str) k.push(<text key="tl" x={x + 12 + iw} y={y + th / 2 + 1} dominantBaseline="central" fill={t.ink} fontFamily={L.family} fontWeight={L.weight} fontSize={fs} letterSpacing={L.ls * fs}>{str}</text>);
      if (n.sub) k.push(<text key="ts" x={x + tw + 10} y={y + th / 2 + 1} dominantBaseline="central" fill={t.muted} fontFamily={MONO} fontSize={11}>{n.sub}</text>);
      break;
    }
    case 'decision': k.push(hit, <path key="s" {...S} d={`M${cx} ${y} L${x + w} ${cy} L${cx} ${y + hh} L${x} ${cy} Z`} />, ...lab({ maxW: w * 0.6 })); break;
    case 'window': {
      const bar = Math.min(28, hh);
      k.push(hit, <rect key="s" {...S} x={x} y={y} width={w} height={hh} />, <line key="bar" x1={x} y1={y + bar} x2={x + w} y2={y + bar} stroke={t.ink} strokeWidth={1.6} />);
      [14, 28, 42].forEach((dx, i) => k.push(<circle key={'c' + i} cx={x + dx} cy={y + bar / 2} r={4} fill="none" stroke={t.ink} strokeWidth={1.2} />));
      k.push(...lab({ x: x + 58, cy: y + bar / 2, anchor: 'start', maxW: w - 70, maxLines: 1, scale: 0.85, sub: '' }));
      break;
    }
    case 'input': k.push(hit, <rect key="s" {...S} x={x} y={y} width={w} height={hh} rx={2} />, ...lab({ x: x + 12, anchor: 'start', maxW: w - 24, maxLines: 1, color: t.muted, sub: '' })); break;
    case 'image': {
      // A shape with an image file shows the picture. Without one, it is the crossed placeholder of a wireframe.
      const src = n.file && ctx.files ? ctx.files[n.file] : null;
      if (src) k.push(hit, <image key="img" href={src} x={x} y={y} width={w} height={hh} preserveAspectRatio="xMidYMid meet" />, <rect key="s" x={x} y={y} width={w} height={hh} fill="none" stroke={t.ink} strokeWidth={1.2} strokeDasharray={dash} />);
      else k.push(hit, <rect key="s" {...S} x={x} y={y} width={w} height={hh} />, <path key="x" d={`M${x} ${y} L${x + w} ${y + hh} M${x + w} ${y} L${x} ${y + hh}`} stroke={t.line} strokeWidth={1} fill="none" />);
      if (n.label) {
        const fs = SIZES[n.size || 'm'] * 0.85, str = txt(ctx, n.label), tw = measure(str, `${L.weight} ${fs}px ${L.family}`) + str.length * L.ls * fs + 14;
        const ly = src ? y + hh - fs * 1.2 : cy;
        k.push(<rect key="lb" x={cx - tw / 2} y={ly - fs * 0.85} width={tw} height={fs * 1.7} fill={t.paper} />, ...lab({ cy: ly, scale: 0.85, maxLines: 1, maxW: w, sub: '' }));
      }
      break;
    }
    case 'note': {
      const f = Math.min(18, w * 0.2, hh * 0.2);
      k.push(
        hit,
        <path key="s" {...S} d={`M${x} ${y} H${x + w - f} L${x + w} ${y + f} V${y + hh} H${x} Z`} />,
        <path key="f" d={`M${x + w - f} ${y} V${y + f} H${x + w}`} fill="none" stroke={t.ink} strokeWidth={1.6} />,
        ...lab({ x: x + 12, top: y + 12, anchor: 'start', maxW: w - 24 - f * 0.4, scale: 0.9 })
      );
      break;
    }
    case 'path':
    case 'line': {
      const pts = linePts(n), wgt = WEIGHTS[n.weight || 'm'];
      let d, heads = [];
      if (n.type === 'line' && n.arrow && pts.length === 2) {
        // The line stops at the base of each arrowhead, so its end cap does not show past the tip.
        const [a, b] = pts, len = Math.hypot(b.x - a.x, b.y - a.y) || 1, u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
        const Ln = Math.min(len * 0.45, 9 + wgt * 2.5), W = 3.5 + wgt * 1.1;
        const head = (key, tip, dir) => {
          const bx = tip.x - dir.x * Ln, by = tip.y - dir.y * Ln;
          return <polygon key={key} points={`${f1(tip.x)},${f1(tip.y)} ${f1(bx - dir.y * W)},${f1(by + dir.x * W)} ${f1(bx + dir.y * W)},${f1(by - dir.x * W)}`} fill={t.ink} />;
        };
        const s0 = n.arrow === 'both' ? { x: a.x + u.x * Ln * 0.8, y: a.y + u.y * Ln * 0.8 } : a, s1 = { x: b.x - u.x * Ln * 0.8, y: b.y - u.y * Ln * 0.8 };
        d = `M${f1(s0.x)} ${f1(s0.y)} L${f1(s1.x)} ${f1(s1.y)}`;
        heads = [head('h2', b, u), n.arrow === 'both' && head('h1', a, { x: -u.x, y: -u.y })].filter(Boolean);
      } else if (n.type === 'line' || pts.length < 3) d = 'M' + pts.map(q => `${f1(q.x)} ${f1(q.y)}`).join(' L');
      else {
        d = `M${f1(pts[0].x)} ${f1(pts[0].y)}`;
        for (let i = 1; i < pts.length - 1; i++) d += ` Q${f1(pts[i].x)} ${f1(pts[i].y)} ${f1((pts[i].x + pts[i + 1].x) / 2)} ${f1((pts[i].y + pts[i + 1].y) / 2)}`;
        const lp = pts[pts.length - 1];
        d += ` L${f1(lp.x)} ${f1(lp.y)}`;
      }
      k.push(
        <path key="hit" d={d} fill="none" stroke="transparent" strokeWidth={Math.max(14, wgt + 10)} pointerEvents="stroke" />,
        <path key="s" d={d} fill="none" stroke={t.ink} strokeWidth={wgt} strokeLinecap={n.type !== 'line' ? 'round' : n.arrow ? 'butt' : 'square'} strokeLinejoin="round" strokeDasharray={n.dashed ? `${wgt * 3} ${wgt * 2.2}` : undefined} />,
        ...heads
      );
      break;
    }
    default: k.push(hit, ...lab({ maxW: Math.max(w, 40) }));
  }
  return <g key={n.id} data-k="node" data-id={n.id}>{k}</g>;
}

// `geo` is optional: a caller that has the geometry already passes it in.
export function renderEdge(e, map, ctx, selected, geo = edgeGeom(e, map, ctx.obstacles)) {
  const { t, L } = ctx;
  if (!geo) return null;
  const c = selected ? t.accent : t.ink, rel = REL[e.rel];
  const arrow = (key, p, u) => {
    const Ln = 12, W = 4.2, bx = p.x - u.x * Ln, by = p.y - u.y * Ln;
    return <polygon key={key} points={`${p.x},${p.y} ${bx - u.y * W},${by + u.x * W} ${bx + u.y * W},${by - u.x * W}`} fill={c} pointerEvents="none" />;
  };
  // UML end markers. `u` points along the line into the shape, so the tip sits on the shape's edge.
  const at = (p, u, back, side) => `${f1(p.x - u.x * back - u.y * side)},${f1(p.y - u.y * back + u.x * side)}`;
  const marker = (key, type, p, u) => {
    if (type === 'open') return <polyline key={key} points={`${at(p, u, 12, 6)} ${at(p, u, 0, 0)} ${at(p, u, 12, -6)}`} fill="none" stroke={c} strokeWidth={1.5} strokeLinejoin="miter" pointerEvents="none" />;
    if (type === 'triangle') return <polygon key={key} points={`${at(p, u, 0, 0)} ${at(p, u, 15, 8)} ${at(p, u, 15, -8)}`} fill={t.paper} stroke={c} strokeWidth={1.5} pointerEvents="none" />;
    return <polygon key={key} points={`${at(p, u, 0, 0)} ${at(p, u, 9, 6)} ${at(p, u, 18, 0)} ${at(p, u, 9, -6)}`} fill={type === 'filled-diamond' ? c : t.paper} stroke={c} strokeWidth={1.5} pointerEvents="none" />;
  };
  // A multiplicity sits outside the shape, beside the line.
  const mult = (key, text, p, u) => (
    <text key={key} x={p.x - u.x * 16 + u.y * 11} y={p.y - u.y * 16 - u.x * 11} textAnchor="middle" dominantBaseline="central" fill={c} fontFamily={MONO} fontSize={11} stroke={t.paper} strokeWidth={3} paintOrder="stroke" pointerEvents="none">{text}</text>
  );
  const dashed = rel ? !!rel.dashed : e.dashed;
  let label = null;
  if (e.label) {
    const fs = 13, str = txt(ctx, e.label), tw = measure(str, `${L.weight} ${fs}px ${L.family}`) + str.length * L.ls * fs + 12;
    label = [
      <rect key="lb" x={geo.lp.x - tw / 2} y={geo.lp.y - 11} width={tw} height={22} fill={t.paper} />,
      <text key="lt" x={geo.lp.x} y={geo.lp.y} textAnchor="middle" dominantBaseline="central" fill={c} fontFamily={L.family} fontWeight={L.weight} fontSize={fs} letterSpacing={L.ls * fs} pointerEvents="none">{str}</text>
    ];
  }
  return (
    <g key={e.id} data-k="edge" data-id={e.id}>
      <path d={geo.d} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" />
      <path d={geo.d} fill="none" stroke={c} strokeWidth={1.5} strokeDasharray={dashed ? '7 5' : undefined} strokeLinejoin="miter" pointerEvents="none" />
      {!rel && (e.arrow === 'end' || e.arrow === 'both') && arrow('a2', geo.p2, geo.endDir)}
      {!rel && e.arrow === 'both' && arrow('a1', geo.p1, geo.startDir)}
      {rel && rel.end && marker('m2', rel.end, geo.p2, geo.endDir)}
      {rel && rel.start && marker('m1', rel.start, geo.p1, geo.startDir)}
      {e.m1 && mult('t1', e.m1, geo.p1, geo.startDir)}
      {e.m2 && mult('t2', e.m2, geo.p2, geo.endDir)}
      {label}
    </g>
  );
}

// Architectural dimension lines for the selected shape. Sizes stay constant on screen at any zoom.
export function renderDims(n, ctx, k) {
  const { t } = ctx, A = t.accent, sw = 1 / k, off = 22 / k, gap = 4 / k, tk = 4 / k, fs = 10.5 / k, out = [];
  const len = px => fmtLen(px, ctx.unit, ctx.g);
  const Ln = (key, x1, y1, x2, y2) => <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={A} strokeWidth={sw} pointerEvents="none" />;
  const T = (key, x, y, str, rot) => (
    <text key={key} x={x} y={y} fill={A} stroke={t.paper} strokeWidth={3 / k} paintOrder="stroke" fontFamily={MONO} fontSize={fs} textAnchor="middle" transform={rot ? `rotate(-90 ${x} ${y})` : undefined} pointerEvents="none">{str}</text>
  );
  if (n.type === 'line') {
    const [a, b] = linePts(n);
    out.push(T('dl', (a.x + b.x) / 2, (a.y + b.y) / 2 - 10 / k, len(Math.hypot(b.x - a.x, b.y - a.y))));
    return out;
  }
  const yT = n.y - off, xL = n.x - off;
  out.push(
    Ln('e1', n.x, n.y - gap, n.x, yT - gap), Ln('e2', n.x + n.w, n.y - gap, n.x + n.w, yT - gap), Ln('d1', n.x, yT, n.x + n.w, yT),
    Ln('t1', n.x - tk, yT + tk, n.x + tk, yT - tk), Ln('t2', n.x + n.w - tk, yT + tk, n.x + n.w + tk, yT - tk), T('w', n.x + n.w / 2, yT - 5 / k, len(n.w))
  );
  out.push(
    Ln('e3', n.x - gap, n.y, xL - gap, n.y), Ln('e4', n.x - gap, n.y + n.h, xL - gap, n.y + n.h), Ln('d2', xL, n.y, xL, n.y + n.h),
    Ln('t3', xL - tk, n.y + tk, xL + tk, n.y - tk), Ln('t4', xL - tk, n.y + n.h + tk, xL + tk, n.y + n.h - tk), T('h', xL - 6 / k, n.y + n.h / 2, len(n.h), true)
  );
  return out;
}

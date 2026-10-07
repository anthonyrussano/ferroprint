import { cloudIcon, isCloudKey, FRAME } from './cloud.js';

// Symbol library: floor plan, furniture, system, flow and interface symbols.
// Each symbol draws itself in a local w × h box with a "pen". The editor rotates and mirrors that box.
// Sizes follow the drafting grid: on a sheet in feet, 20 px is 1 ft.

const r1 = v => Math.round(v * 10) / 10;
// Scales a path that is written in a unit box ("M0 0 L1 1") to w × h. Absolute M, L, C, Q and Z only.
const U = (d, w, h) => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a, b) => `${r1(a * w)} ${r1(b * h)}`);

// Builds the drawing parts of a symbol. Parts marked `o` (outline) take the shape's fill and dash style.
// In icon mode the strokes do not scale, so small tiles stay legible.
export function makePen(t, fill, dash, icon) {
  let key = 0;
  const ink = icon ? 'currentColor' : t.ink;
  const fills = { ink, tint: t.tint, hatch: 'url(#fp-hatch)', faint: icon ? 'currentColor' : t.line };
  const attrs = (o = {}) => {
    const a = { stroke: ink, strokeWidth: icon ? 1.2 : 1.6, fill: 'none', strokeLinejoin: 'round', strokeLinecap: 'round' };
    if (o.o && !icon) { a.fill = fill; a.strokeDasharray = dash; }
    if (o.f === 'paper') { if (icon) a.style = { fill: 'var(--tile-bg)' }; else a.fill = t.paper; }
    else if (o.f) a.fill = fills[o.f];
    if (o.f === 'faint' && icon) a.fillOpacity = 0.35;
    if (o.sw) a.strokeWidth = icon ? Math.min(2.2, o.sw * 0.7) : o.sw;
    if (o.thin) a.strokeWidth = icon ? 0.9 : 1;
    if (o.faint) { a.stroke = icon ? 'currentColor' : t.line; if (icon) a.strokeOpacity = 0.5; }
    if (o.dash) a.strokeDasharray = o.dash;
    if (o.ns) a.stroke = 'none';
    if (icon) a.vectorEffect = 'non-scaling-stroke';
    return a;
  };
  return {
    icon,
    path: (d, o) => <path key={key++} d={d} {...attrs(o)} />,
    rect: (x, y, w, h, o = {}) => <rect key={key++} x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)} rx={o.rx} {...attrs(o)} />,
    circle: (cx, cy, r, o) => <circle key={key++} cx={cx} cy={cy} r={Math.max(0, r)} {...attrs(o)} />,
    ellipse: (cx, cy, rx, ry, o) => <ellipse key={key++} cx={cx} cy={cy} rx={Math.max(0, rx)} ry={Math.max(0, ry)} {...attrs(o)} />,
    line: (x1, y1, x2, y2, o) => <line key={key++} x1={x1} y1={y1} x2={x2} y2={y2} {...attrs(o)} />,
    // A wall cut paints paper over the wall line under an opening. A tile has no wall, so it skips the cut.
    cutLine: (x1, y1, x2, y2) => (icon ? null : <line key={key++} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.paper} strokeWidth={7} />),
    cutRect: (x, y, w, h) => (icon ? null : <rect key={key++} x={x} y={y} width={w} height={h} fill={t.paper} stroke="none" />)
  };
}

// Label placements, relative to the shape's box on the sheet.
const AT = {
  center: (w, h) => ({ dx: w / 2, cy: h / 2, maxW: w - 20 }),
  plate: (w, h) => ({ dx: w / 2, cy: h / 2, maxW: Math.max(40, w - 8), bg: true }),
  below: (w, h) => ({ dx: w / 2, top: h + 6, maxW: Math.max(140, w * 2) }),
  right: off => (w, h) => ({ dx: off(h) + 10, cy: h / 2, anchor: 'start', maxW: w - off(h) - 10, maxLines: 1, sub: '' }),
  inside: (off, end) => (w, h) => ({ dx: off(h), cy: h / 2, anchor: 'start', maxW: w - off(h) - end, maxLines: 1, muted: true, sub: '' })
};

const couch = (w, h, P) => {
  const a = Math.min(w * 0.12, 14), b = h * 0.32, n = w >= 110 ? 3 : w >= 70 ? 2 : 1, seat = (w - 2 * a) / n;
  const out = [P.rect(0, 0, w, h, { o: 1, rx: 5 }), P.path(`M${a} ${h} V${b} H${w - a} V${h}`, { thin: 1 })];
  for (let i = 1; i < n; i++) out.push(P.line(a + seat * i, b, a + seat * i, h, { thin: 1 }));
  return out;
};
const bed = pillows => (w, h, P) => {
  const out = [P.rect(0, 0, w, h, { o: 1, rx: 3 })];
  const pw = (w * (pillows === 1 ? 0.72 : 0.84) - (pillows - 1) * w * 0.08) / pillows;
  for (let i = 0; i < pillows; i++) out.push(P.rect(w * (pillows === 1 ? 0.14 : 0.08) + i * (pw + w * 0.08), h * 0.05, pw, h * 0.15, { thin: 1, rx: 5 }));
  out.push(P.line(0, h * 0.3, w, h * 0.3, { thin: 1 }), P.line(w * 0.6, h * 0.3, w, h * 0.44, { thin: 1 }));
  return out;
};

const PLAN = [
  {
    id: 'door', name: 'Door', w: 60, h: 60, lab: null, fill: false, keys: 'swing hinge entry',
    draw: (w, h, P) => [P.cutLine(0, h, w, h), P.line(0, h, 0, 0, { sw: 2.5 }), P.path(`M${w} ${h} A${w} ${h} 0 0 0 0 0`, { thin: 1, dash: '4 3' })]
  },
  {
    id: 'doubledoor', name: 'Double door', w: 120, h: 60, lab: null, fill: false, keys: 'french entry swing',
    draw: (w, h, P) => [
      P.cutLine(0, h, w, h), P.line(0, h, 0, 0, { sw: 2.5 }), P.line(w, h, w, 0, { sw: 2.5 }),
      P.path(`M${w / 2} ${h} A${w / 2} ${h} 0 0 0 0 0`, { thin: 1, dash: '4 3' }), P.path(`M${w / 2} ${h} A${w / 2} ${h} 0 0 1 ${w} 0`, { thin: 1, dash: '4 3' })
    ]
  },
  {
    id: 'sliding', name: 'Sliding door', w: 120, h: 12, lab: null, fill: false, keys: 'slide patio pocket',
    draw: (w, h, P) => [
      P.cutRect(0, 0, w, h), P.line(0, 0, 0, h, { sw: 2 }), P.line(w, 0, w, h, { sw: 2 }),
      P.rect(0, h * 0.1, w * 0.56, h * 0.38, { thin: 1 }), P.rect(w * 0.44, h * 0.52, w * 0.56, h * 0.38, { thin: 1 })
    ]
  },
  {
    id: 'wallwin', name: 'Wall window', w: 80, h: 12, lab: null, fill: false, keys: 'glass glazing window pane',
    draw: (w, h, P) => [P.cutRect(0, 0, w, h), P.rect(0, 0, w, h, { sw: 1.4 }), P.line(0, h / 2, w, h / 2, { thin: 1 })]
  },
  {
    id: 'opening', name: 'Opening', w: 60, h: 12, lab: null, fill: false, keys: 'gap arch passage doorway',
    draw: (w, h, P) => [
      P.cutRect(0, 0, w, h), P.line(0, 0, 0, h, { sw: 2.5 }), P.line(w, 0, w, h, { sw: 2.5 }),
      P.line(0, 0, w, 0, { thin: 1, faint: 1, dash: '4 3' }), P.line(0, h, w, h, { thin: 1, faint: 1, dash: '4 3' })
    ]
  },
  {
    id: 'stairs', name: 'Stairs', w: 70, h: 200, label: 'Up', lab: AT.plate, keys: 'steps staircase up down',
    draw: (w, h, P) => {
      const n = Math.max(3, Math.round(h / 20)), out = [P.rect(0, 0, w, h, { o: 1 })];
      for (let i = 1; i < n; i++) out.push(P.line(0, (h * i) / n, w, (h * i) / n, { thin: 1 }));
      const cx = w / 2, a = Math.min(8, w * 0.15);
      out.push(P.circle(cx, h - 10, 3, { f: 'ink' }), P.line(cx, h - 10, cx, 8), P.path(`M${cx - a} ${8 + a * 1.4} L${cx} 8 L${cx + a} ${8 + a * 1.4}`));
      return out;
    }
  },
  { id: 'column', name: 'Column', w: 20, h: 20, lab: null, fill: false, keys: 'pillar post structure', draw: (w, h, P) => [P.rect(0, 0, w, h, { f: 'hatch' })] }
];

const FURNITURE = [
  { id: 'bed', name: 'Single bed', w: 70, h: 130, keys: 'bedroom sleep twin', draw: bed(1) },
  { id: 'bed2', name: 'Double bed', w: 100, h: 140, keys: 'bedroom sleep queen king', draw: bed(2) },
  { id: 'sofa', name: 'Sofa', w: 140, h: 60, keys: 'couch living lounge', draw: couch },
  { id: 'armchair', name: 'Armchair', w: 60, h: 60, keys: 'seat living lounge', draw: couch },
  { id: 'chair', name: 'Chair', w: 30, h: 30, keys: 'seat', draw: (w, h, P) => [P.rect(w * 0.1, h * 0.22, w * 0.8, h * 0.78, { o: 1, rx: 3 }), P.line(w * 0.04, h * 0.08, w * 0.96, h * 0.08, { sw: 2.5 })] },
  {
    id: 'dining', name: 'Dining table', w: 160, h: 120, keys: 'table chairs eat kitchen',
    draw: (w, h, P) => {
      const cw = w * 0.16, ch = h * 0.14, sw = w * 0.1, sh = h * 0.22, tx = w * 0.14, ty = h * 0.2;
      const out = [P.rect(tx, ty, w - 2 * tx, h - 2 * ty, { o: 1, rx: 2 })];
      [0.32, 0.68].forEach(f => out.push(P.rect(w * f - cw / 2, h * 0.02, cw, ch, { thin: 1, rx: 3 }), P.rect(w * f - cw / 2, h * 0.98 - ch, cw, ch, { thin: 1, rx: 3 })));
      out.push(P.rect(w * 0.01, h / 2 - sh / 2, sw, sh, { thin: 1, rx: 3 }), P.rect(w * 0.99 - sw, h / 2 - sh / 2, sw, sh, { thin: 1, rx: 3 }));
      return out;
    }
  },
  {
    id: 'roundtable', name: 'Round table', w: 120, h: 120, keys: 'table chairs eat meeting',
    draw: (w, h, P) => {
      const cx = w / 2, cy = h / 2;
      return [
        P.ellipse(cx, cy, w * 0.3, h * 0.3, { o: 1 }),
        P.rect(cx - w * 0.09, h * 0.03, w * 0.18, h * 0.11, { thin: 1, rx: 3 }), P.rect(cx - w * 0.09, h * 0.86, w * 0.18, h * 0.11, { thin: 1, rx: 3 }),
        P.rect(w * 0.03, cy - h * 0.09, w * 0.11, h * 0.18, { thin: 1, rx: 3 }), P.rect(w * 0.86, cy - h * 0.09, w * 0.11, h * 0.18, { thin: 1, rx: 3 })
      ];
    }
  },
  {
    id: 'desk', name: 'Desk', w: 100, h: 80, keys: 'office work computer',
    draw: (w, h, P) => [
      P.rect(0, 0, w, h * 0.6, { o: 1, rx: 2 }), P.line(w * 0.3, h * 0.14, w * 0.7, h * 0.14, { sw: 2.5 }),
      P.rect(w * 0.35, h * 0.68, w * 0.3, h * 0.24, { thin: 1, rx: 3 }), P.line(w * 0.33, h * 0.98, w * 0.67, h * 0.98, { sw: 2.5 })
    ]
  },
  {
    id: 'toilet', name: 'Toilet', w: 30, h: 50, keys: 'wc bathroom restroom',
    draw: (w, h, P) => [P.rect(0, 0, w, h * 0.28, { o: 1, rx: 2 }), P.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.36, { o: 1 }), P.ellipse(w / 2, h * 0.64, w * 0.26, h * 0.24, { thin: 1 })]
  },
  {
    id: 'sink', name: 'Sink', w: 40, h: 30, keys: 'basin bathroom kitchen wash',
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1, rx: 3 }), P.ellipse(w / 2, h * 0.58, w * 0.36, h * 0.3, { thin: 1 }), P.circle(w / 2, h * 0.14, Math.min(w, h) * 0.06, { f: 'ink', thin: 1 })]
  },
  {
    id: 'bathtub', name: 'Bathtub', w: 50, h: 100, keys: 'bath bathroom tub',
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1, rx: 3 }), P.rect(w * 0.12, h * 0.06, w * 0.76, h * 0.88, { thin: 1, rx: Math.min(w, h) * 0.32 }), P.circle(w / 2, h * 0.84, Math.min(w, h) * 0.06, { thin: 1 })]
  },
  {
    id: 'shower', name: 'Shower', w: 60, h: 60, keys: 'bathroom wet room',
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1 }), P.line(0, 0, w, h, { thin: 1, faint: 1 }), P.line(w, 0, 0, h, { thin: 1, faint: 1 }), P.circle(w / 2, h / 2, Math.min(w, h) * 0.07, { thin: 1, f: 'paper' })]
  },
  {
    id: 'stove', name: 'Stove', w: 50, h: 50, keys: 'cooker oven hob kitchen range',
    draw: (w, h, P) => {
      const m = Math.min(w, h), out = [P.rect(0, 0, w, h, { o: 1, rx: 2 })];
      [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].forEach(([fx, fy]) => out.push(P.circle(w * fx, h * fy, m * 0.14, { thin: 1 }), P.circle(w * fx, h * fy, m * 0.06, { thin: 1 })));
      return out;
    }
  },
  {
    id: 'fridge', name: 'Fridge', w: 60, h: 50, label: 'Ref', lab: AT.plate, keys: 'refrigerator freezer kitchen ref',
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1, rx: 2 }), P.line(0, h * 0.8, w, h * 0.8, { thin: 1 }), P.line(w * 0.12, h * 0.9, w * 0.3, h * 0.9, { sw: 2 })]
  },
  { id: 'counter', name: 'Counter', w: 160, h: 40, keys: 'kitchen worktop cabinet', draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1 }), P.line(0, h * 0.15, w, h * 0.15, { thin: 1, faint: 1 })] },
  {
    id: 'closet', name: 'Closet', w: 80, h: 40, keys: 'wardrobe storage clothes',
    draw: (w, h, P) => {
      const out = [P.rect(0, 0, w, h, { o: 1 }), P.line(w * 0.05, h / 2, w * 0.95, h / 2, { thin: 1, dash: '4 3' })], n = Math.max(3, Math.floor(w / 14));
      for (let i = 1; i < n; i++) { const x = w * 0.05 + (w * 0.9 * i) / n; out.push(P.line(x - 3, h * 0.25, x + 3, h * 0.75, { thin: 1, faint: 1 })); }
      return out;
    }
  },
  {
    id: 'washer', name: 'Washer', w: 50, h: 50, keys: 'laundry washing machine dryer',
    draw: (w, h, P) => { const m = Math.min(w, h); return [P.rect(0, 0, w, h, { o: 1, rx: 3 }), P.line(0, h * 0.2, w, h * 0.2, { thin: 1 }), P.circle(w / 2, h * 0.6, m * 0.28, { thin: 1 }), P.circle(w * 0.18, h * 0.1, m * 0.04, { f: 'ink', thin: 1 })]; }
  },
  {
    id: 'plant', name: 'Plant', w: 30, h: 30, keys: 'tree pot green',
    draw: (w, h, P) => {
      const cx = w / 2, cy = h / 2, rx = w / 2 - 1, ry = h / 2 - 1, out = [P.ellipse(cx, cy, rx, ry, { o: 1 })];
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 + 0.3; out.push(P.line(cx, cy, cx + Math.cos(a) * rx * 0.8, cy + Math.sin(a) * ry * 0.8, { thin: 1 })); }
      out.push(P.ellipse(cx, cy, rx * 0.2, ry * 0.2, { thin: 1, f: 'paper' }));
      return out;
    }
  },
  {
    id: 'car', name: 'Car', w: 120, h: 280, keys: 'garage parking vehicle',
    draw: (w, h, P) => [
      P.rect(w * 0.05, 0, w * 0.9, h, { o: 1, rx: w * 0.3 }),
      P.path(`M${w * 0.16} ${h * 0.33} Q${w / 2} ${h * 0.26} ${w * 0.84} ${h * 0.33} L${w * 0.78} ${h * 0.43} Q${w / 2} ${h * 0.39} ${w * 0.22} ${h * 0.43} Z`, { thin: 1 }),
      P.path(`M${w * 0.2} ${h * 0.82} Q${w / 2} ${h * 0.86} ${w * 0.8} ${h * 0.82} L${w * 0.76} ${h * 0.73} Q${w / 2} ${h * 0.76} ${w * 0.24} ${h * 0.73} Z`, { thin: 1 }),
      P.rect(0, h * 0.3, w * 0.06, h * 0.035, { thin: 1, rx: 1 }), P.rect(w * 0.94, h * 0.3, w * 0.06, h * 0.035, { thin: 1, rx: 1 })
    ]
  }
].map(s => ({ label: '', lab: AT.plate, ...s }));

const SYSTEM = [
  {
    id: 'server', name: 'Server', w: 70, h: 90, keys: 'rack host machine vm',
    draw: (w, h, P) => {
      const out = [P.rect(0, 0, w, h, { o: 1, rx: 3 })], u = (h * 0.84) / 3;
      for (let i = 0; i < 3; i++) {
        const y = h * 0.08 + u * i + u * 0.12, uh = u * 0.76;
        out.push(P.rect(w * 0.1, y, w * 0.8, uh, { thin: 1, rx: 2 }), P.circle(w * 0.22, y + uh / 2, Math.min(2.5, uh * 0.15), { f: 'ink', thin: 1 }), P.line(w * 0.38, y + uh / 2, w * 0.8 - 6, y + uh / 2, { thin: 1, faint: 1 }));
      }
      return out;
    }
  },
  {
    id: 'cloud', name: 'Cloud', w: 140, h: 90, lab: (w, h) => ({ dx: w / 2, cy: h * 0.62, maxW: w * 0.62 }), keys: 'aws gcp azure provider saas',
    draw: (w, h, P) => [P.path(U('M0.2 0.9 C0.06 0.9 0 0.7 0.12 0.6 C0.04 0.42 0.2 0.26 0.36 0.34 C0.4 0.1 0.7 0.06 0.76 0.3 C0.94 0.26 1.02 0.52 0.9 0.62 C1 0.78 0.92 0.92 0.82 0.9 Z', w, h), { o: 1 })]
  },
  {
    id: 'browser', name: 'Browser', w: 200, h: 140, label: 'Web app', keys: 'web site page frontend',
    lab: (w, h) => { const b = Math.min(24, h * 0.25); return { dx: w / 2, cy: b + (h - b) / 2, maxW: w - 24 }; },
    draw: (w, h, P) => {
      const b = Math.min(24, h * 0.25);
      return [P.rect(0, 0, w, h, { o: 1, rx: 4 }), P.line(0, b, w, b), P.circle(10, b / 2, 2.5, { thin: 1 }), P.circle(19, b / 2, 2.5, { thin: 1 }), P.circle(28, b / 2, 2.5, { thin: 1 }), P.rect(38, b * 0.22, Math.max(10, w - 48), b * 0.56, { thin: 1, rx: b * 0.28 })];
    }
  },
  {
    id: 'mobile', name: 'Phone', w: 60, h: 110, label: 'Mobile app', keys: 'mobile ios android device app',
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1, rx: Math.min(w, h) * 0.16 }), P.rect(w * 0.08, h * 0.11, w * 0.84, h * 0.76, { thin: 1, rx: 2 }), P.line(w * 0.38, h * 0.055, w * 0.62, h * 0.055, { thin: 1 }), P.line(w * 0.4, h * 0.94, w * 0.6, h * 0.94, { sw: 2 })]
  },
  {
    id: 'monitor', name: 'Monitor', w: 100, h: 84, label: 'Desktop', keys: 'desktop computer screen pc',
    draw: (w, h, P) => [
      P.rect(0, 0, w, h * 0.74, { o: 1, rx: 3 }), P.rect(w * 0.06, h * 0.07, w * 0.88, h * 0.6, { thin: 1, faint: 1 }),
      P.path(`M${w * 0.42} ${h * 0.74} L${w * 0.38} ${h * 0.96} M${w * 0.58} ${h * 0.74} L${w * 0.62} ${h * 0.96}`, { thin: 1 }), P.line(w * 0.28, h * 0.97, w * 0.72, h * 0.97)
    ]
  },
  {
    id: 'lock', name: 'Lock', w: 44, h: 56, label: 'Auth', keys: 'auth security login padlock identity',
    draw: (w, h, P) => {
      const r = w * 0.27, top = h * 0.42, bh = h - top;
      return [P.path(`M${w / 2 - r} ${top} V${h * 0.3} A${r} ${r} 0 0 1 ${w / 2 + r} ${h * 0.3} V${top}`, { sw: 2 }), P.rect(0, top, w, bh, { o: 1, rx: 4 }), P.circle(w / 2, top + bh * 0.42, Math.min(w, h) * 0.07, { thin: 1 }), P.line(w / 2, top + bh * 0.5, w / 2, top + bh * 0.74, { thin: 1 })];
    }
  },
  {
    id: 'function', name: 'Function', w: 64, h: 64, keys: 'lambda serverless faas',
    draw: (w, h, P) => [P.path(`M${w * 0.25} 0 H${w * 0.75} L${w} ${h / 2} L${w * 0.75} ${h} H${w * 0.25} L0 ${h / 2} Z`, { o: 1 }), P.path(`M${w * 0.36} ${h * 0.26} H${w * 0.45} L${w * 0.66} ${h * 0.74} M${w * 0.54} ${h * 0.48} L${w * 0.36} ${h * 0.74}`, { sw: 1.8 })]
  },
  {
    id: 'container', name: 'Container', w: 70, h: 70, keys: 'docker pod kubernetes package',
    draw: (w, h, P) => [P.path(`M${w / 2} 0 L${w} ${h * 0.25} V${h * 0.75} L${w / 2} ${h} L0 ${h * 0.75} V${h * 0.25} Z`, { o: 1 }), P.path(`M0 ${h * 0.25} L${w / 2} ${h * 0.5} L${w} ${h * 0.25} M${w / 2} ${h * 0.5} V${h}`, { thin: 1 })]
  },
  {
    id: 'globe', name: 'Internet', w: 64, h: 64, keys: 'globe web world dns cdn network',
    draw: (w, h, P) => {
      const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
      return [P.ellipse(cx, cy, rx, ry, { o: 1 }), P.ellipse(cx, cy, rx * 0.42, ry, { thin: 1 }), P.line(0, cy, w, cy, { thin: 1 }), P.path(`M${cx - rx * 0.87} ${cy - ry * 0.5} H${cx + rx * 0.87} M${cx - rx * 0.87} ${cy + ry * 0.5} H${cx + rx * 0.87}`, { thin: 1 })];
    }
  },
  {
    id: 'file', name: 'File', w: 52, h: 66, keys: 'document page report config',
    draw: (w, h, P) => {
      const f = Math.min(w, h) * 0.3, out = [P.path(`M0 0 H${w - f} L${w} ${f} V${h} H0 Z`, { o: 1 }), P.path(`M${w - f} 0 V${f} H${w}`, { thin: 1 })];
      [0.48, 0.62, 0.76].forEach((fy, i) => out.push(P.line(w * 0.18, h * fy, w * (i === 2 ? 0.6 : 0.82), h * fy, { thin: 1, faint: 1 })));
      return out;
    }
  },
  {
    id: 'users', name: 'Users', w: 80, h: 64, keys: 'people group team customers',
    draw: (w, h, P) => [
      P.circle(w * 0.68, h * 0.22, h * 0.15, { thin: 1 }), P.path(`M${w * 0.58} ${h * 0.5} C${w * 0.64} ${h * 0.42} ${w * 0.96} ${h * 0.4} ${w * 0.96} ${h * 0.8}`, { thin: 1 }),
      P.circle(w * 0.38, h * 0.3, h * 0.18, { o: 1 }), P.path(`M${w * 0.06} ${h} C${w * 0.06} ${h * 0.4} ${w * 0.7} ${h * 0.4} ${w * 0.7} ${h} Z`, { o: 1 })
    ]
  },
  {
    id: 'mail', name: 'Email', w: 70, h: 50, keys: 'mail message smtp notification',
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1, rx: 3 }), P.path(`M2 3 L${w / 2} ${h * 0.58} L${w - 2} 3`, { thin: 1 })]
  },
  {
    id: 'bucket', name: 'Storage', w: 64, h: 64, keys: 'bucket s3 blob object files',
    draw: (w, h, P) => { const e = h * 0.13; return [P.path(`M0 ${e} L${w * 0.12} ${h - e * 0.6} Q${w / 2} ${h + e * 0.5} ${w * 0.88} ${h - e * 0.6} L${w} ${e}`, { o: 1 }), P.ellipse(w / 2, e, w / 2, e)]; }
  },
  {
    id: 'firewall', name: 'Firewall', w: 80, h: 60, keys: 'security waf network wall',
    draw: (w, h, P) => {
      const r = h / 3;
      return [P.rect(0, 0, w, h, { o: 1 }), P.line(0, r, w, r, { thin: 1 }), P.line(0, 2 * r, w, 2 * r, { thin: 1 }), P.line(w / 2, 0, w / 2, r, { thin: 1 }), P.line(w / 4, r, w / 4, 2 * r, { thin: 1 }), P.line(w * 0.75, r, w * 0.75, 2 * r, { thin: 1 }), P.line(w / 2, 2 * r, w / 2, h, { thin: 1 })];
    }
  },
  {
    id: 'clock', name: 'Scheduler', w: 56, h: 56, keys: 'clock cron timer job schedule',
    draw: (w, h, P) => {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2, out = [P.ellipse(cx, cy, w / 2, h / 2, { o: 1 }), P.line(cx, cy, cx, cy - r * 0.58, { sw: 1.8 }), P.line(cx, cy, cx + r * 0.42, cy, { sw: 1.8 })];
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([a, b]) => out.push(P.line(cx + a * r * 0.8, cy + b * r * 0.8, cx + a * r * 0.92, cy + b * r * 0.92, { thin: 1 })));
      return out;
    }
  },
  {
    id: 'key', name: 'Secret', w: 70, h: 36, label: 'Secrets', keys: 'key vault credential password token',
    draw: (w, h, P) => {
      const r = h * 0.36, cx = r + 2, cy = h / 2;
      return [P.circle(cx, cy, r, { o: 1 }), P.circle(cx - r * 0.25, cy, r * 0.28, { thin: 1 }), P.path(`M${cx + r} ${cy} H${w} M${w * 0.78} ${cy} V${cy + h * 0.3} M${w * 0.92} ${cy} V${cy + h * 0.24}`)];
    }
  }
].map(s => ({ label: s.name, lab: AT.below, ...s }));

const FLOW = [
  {
    id: 'data', name: 'Data', w: 160, h: 80, keys: 'input output io parallelogram',
    lab: (w, h) => ({ dx: w / 2, cy: h / 2, maxW: w - 2 * Math.min(w * 0.2, h * 0.5) - 8 }),
    draw: (w, h, P) => { const s = Math.min(w * 0.2, h * 0.5); return [P.path(`M${s} 0 H${w} L${w - s} ${h} H0 Z`, { o: 1 })]; }
  },
  {
    id: 'fdoc', name: 'Document', w: 160, h: 90, keys: 'report paper output', lab: (w, h) => ({ dx: w / 2, cy: h * 0.42, maxW: w - 20 }),
    draw: (w, h, P) => [P.path(`M0 0 H${w} V${h * 0.8} C${w * 0.72} ${h * 0.6} ${w * 0.3} ${h * 1.06} 0 ${h * 0.84} Z`, { o: 1 })]
  },
  {
    id: 'subproc', name: 'Subprocess', w: 160, h: 80, keys: 'predefined process routine call', lab: (w, h) => ({ dx: w / 2, cy: h / 2, maxW: w - 36 }),
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1 }), P.line(10, 0, 10, h), P.line(w - 10, 0, w - 10, h)]
  },
  {
    id: 'manual', name: 'Manual input', w: 160, h: 80, keys: 'keyboard entry form', lab: (w, h) => ({ dx: w / 2, cy: h * 0.62, maxW: w - 20 }),
    draw: (w, h, P) => [P.path(`M0 ${h * 0.3} L${w} 0 V${h} H0 Z`, { o: 1 })]
  },
  {
    id: 'delay', name: 'Delay', w: 140, h: 80, keys: 'wait pause',
    lab: (w, h) => { const r = Math.min(h / 2, w / 2); return { dx: (w - r * 0.5) / 2, cy: h / 2, maxW: w - r - 10 }; },
    draw: (w, h, P) => { const r = Math.min(h / 2, w / 2); return [P.path(`M0 0 H${w - r} A${r} ${h / 2} 0 0 1 ${w - r} ${h} H0 Z`, { o: 1 })]; }
  },
  {
    id: 'prep', name: 'Preparation', w: 160, h: 80, keys: 'setup init hexagon',
    lab: (w, h) => ({ dx: w / 2, cy: h / 2, maxW: w - 2 * Math.min(h * 0.4, w * 0.2) - 4 }),
    draw: (w, h, P) => { const s = Math.min(h * 0.4, w * 0.2); return [P.path(`M${s} 0 H${w - s} L${w} ${h / 2} L${w - s} ${h} H${s} L0 ${h / 2} Z`, { o: 1 })]; }
  },
  {
    id: 'manualop', name: 'Manual step', w: 160, h: 80, keys: 'manual operation human task trapezoid',
    lab: (w, h) => ({ dx: w / 2, cy: h / 2, maxW: w - 2 * Math.min(w * 0.15, h * 0.5) - 8 }),
    draw: (w, h, P) => { const s = Math.min(w * 0.15, h * 0.5); return [P.path(`M0 0 H${w} L${w - s} ${h} H${s} Z`, { o: 1 })]; }
  },
  {
    id: 'store', name: 'Data store', w: 160, h: 80, keys: 'stored data storage',
    lab: (w, h) => ({ dx: w / 2, cy: h / 2, maxW: w - 2 * Math.min(w * 0.12, h * 0.25) - 8 }),
    draw: (w, h, P) => { const r = Math.min(w * 0.12, h * 0.25); return [P.path(`M${r} 0 H${w} A${r} ${h / 2} 0 0 0 ${w} ${h} H${r} A${r} ${h / 2} 0 0 1 ${r} 0 Z`, { o: 1 })]; }
  },
  { id: 'onpage', name: 'Page link', w: 48, h: 48, label: 'A', keys: 'connector reference jump circle', lab: (w, h) => ({ dx: w / 2, cy: h / 2, maxW: w - 8 }), draw: (w, h, P) => [P.ellipse(w / 2, h / 2, w / 2, h / 2, { o: 1 })] },
  {
    id: 'offpage', name: 'Off-page link', w: 56, h: 64, label: 'B', keys: 'connector reference continue next page',
    lab: (w, h) => ({ dx: w / 2, cy: h * 0.36, maxW: w - 10 }),
    draw: (w, h, P) => [P.path(`M0 0 H${w} V${h * 0.6} L${w / 2} ${h} L0 ${h * 0.6} Z`, { o: 1 })]
  }
].map(s => ({ label: s.name, ...s }));

// On the sheet the label is the text of a form control. A tile has no label, so it shows a text line.
const iconText = (P, x, h) => (P.icon ? P.line(x + 8, h / 2, x + 40, h / 2, { sw: 2.5, faint: 1 }) : null);

const tabsDraw = (w, h, P) => {
  const tw = w / 3;
  return [
    P.line(0, h, w, h, { thin: 1, faint: 1 }), P.line(tw, h * 0.28, tw, h * 0.72, { thin: 1, faint: 1 }), P.line(2 * tw, h * 0.28, 2 * tw, h * 0.72, { thin: 1, faint: 1 }),
    P.line(tw * 1.25, h / 2, tw * 1.75, h / 2, { sw: 2.5, faint: 1 }), P.line(tw * 2.25, h / 2, tw * 2.75, h / 2, { sw: 2.5, faint: 1 }), P.line(6, h - 1.5, tw - 6, h - 1.5, { sw: 3 })
  ];
};

const INTERFACE = [
  {
    id: 'checkbox', name: 'Checkbox', w: 170, h: 24, ib: 60, label: 'Remember me', lab: AT.right(h => Math.min(h, 18)), keys: 'check tick form option',
    draw: (w, h, P) => { const s = Math.min(h, 18), y = (h - s) / 2; return [P.rect(0, y, s, s, { o: 1, rx: 2 }), P.path(`M${s * 0.22} ${h / 2} L${s * 0.42} ${h / 2 + s * 0.2} L${s * 0.8} ${h / 2 - s * 0.24}`, { sw: 1.8 }), iconText(P, s, h)]; }
  },
  {
    id: 'radio', name: 'Radio', w: 150, h: 24, ib: 60, label: 'Option', lab: AT.right(h => Math.min(h, 18)), keys: 'radio button choice form option',
    draw: (w, h, P) => { const s = Math.min(h, 18); return [P.circle(s / 2, h / 2, s / 2, { o: 1 }), P.circle(s / 2, h / 2, s * 0.22, { f: 'ink' }), iconText(P, s, h)]; }
  },
  {
    id: 'toggle', name: 'Toggle', w: 190, h: 24, ib: 80, label: 'Notifications', lab: AT.right(h => Math.min(h, 20) * 1.8), keys: 'switch on off setting',
    draw: (w, h, P) => { const s = Math.min(h, 20); return [P.rect(0, (h - s) / 2, s * 1.8, s, { o: 1, rx: s / 2 }), P.circle(s * 1.3, h / 2, s * 0.34, { f: 'ink' }), iconText(P, s * 1.8, h)]; }
  },
  {
    id: 'dropdown', name: 'Dropdown', w: 220, h: 40, label: 'Choose an option', lab: AT.inside(() => 12, 40), keys: 'dropdown picker menu combo',
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1, rx: 2 }), P.path(`M${w - 26} ${h / 2 - 3} L${w - 20} ${h / 2 + 3} L${w - 14} ${h / 2 - 3}`)]
  },
  {
    id: 'search', name: 'Search', w: 240, h: 40, label: 'Search', lab: AT.inside(h => h * 0.9, 16), keys: 'find query field',
    draw: (w, h, P) => [P.rect(0, 0, w, h, { o: 1, rx: h / 2 }), P.circle(h * 0.55, h / 2, h * 0.15), P.line(h * 0.66, h / 2 + h * 0.11, h * 0.78, h / 2 + h * 0.23)]
  },
  {
    id: 'slider', name: 'Slider', w: 200, h: 24, lab: null, fill: false, keys: 'range volume',
    draw: (w, h, P) => [P.line(6, h / 2, w - 6, h / 2, { sw: 2, faint: 1 }), P.line(6, h / 2, w * 0.45, h / 2, { sw: 2.6 }), P.circle(w * 0.45, h / 2, Math.min(h / 2 - 2, 8), { f: 'paper' })]
  },
  { id: 'progress', name: 'Progress', w: 200, h: 14, lab: null, fill: false, keys: 'loading bar status', draw: (w, h, P) => [P.rect(0, 0, w * 0.62, h, { f: 'faint', ns: 1, rx: h / 2 }), P.rect(0, 0, w, h, { rx: h / 2 })] },
  {
    id: 'avatar', name: 'Avatar', w: 52, h: 52, label: '', lab: AT.below, keys: 'profile user picture account',
    draw: (w, h, P) => {
      const cx = w / 2, r = Math.min(w, h) / 2;
      return [P.ellipse(cx, h / 2, w / 2, h / 2, { o: 1 }), P.circle(cx, h * 0.4, r * 0.3, { thin: 1 }), P.path(`M${cx - r * 0.58} ${h * 0.86} C${cx - r * 0.5} ${h * 0.58} ${cx + r * 0.5} ${h * 0.58} ${cx + r * 0.58} ${h * 0.86}`, { thin: 1 })];
    }
  },
  {
    id: 'card', name: 'Card', w: 200, h: 170, label: 'Card title', lab: (w, h) => ({ dx: 12, cy: h * 0.6, anchor: 'start', maxW: w - 24, maxLines: 1 }), keys: 'tile panel item product',
    draw: (w, h, P) => [
      P.rect(0, 0, w, h, { o: 1, rx: 4 }), P.line(0, h * 0.48, w, h * 0.48, { thin: 1 }), P.path(`M0 0 L${w} ${h * 0.48} M${w} 0 L0 ${h * 0.48}`, { thin: 1, faint: 1 }),
      P.line(12, h * 0.82, w * 0.75, h * 0.82, { sw: 2.5, faint: 1 }), P.line(12, h * 0.9, w * 0.5, h * 0.9, { sw: 2.5, faint: 1 })
    ]
  },
  {
    id: 'navbar', name: 'Nav bar', w: 360, h: 48, label: 'Brand', lab: (w, h) => ({ dx: 40, cy: h / 2, anchor: 'start', maxW: Math.max(40, w - 220), maxLines: 1, sub: '' }), keys: 'header menu navigation top bar',
    draw: (w, h, P) => {
      const out = [P.rect(0, 0, w, h, { o: 1 }), P.rect(12, h / 2 - 9, 18, 18, { thin: 1, rx: 2 })];
      for (let i = 0; i < 3; i++) { const x = w - 52 - i * 52; out.push(P.line(x, h / 2, x + 36, h / 2, { sw: 2.5, faint: 1 })); }
      return out;
    }
  },
  { id: 'tabs', name: 'Tabs', w: 300, h: 40, label: 'Overview', fill: false, lab: (w, h) => ({ dx: w / 6, cy: h / 2 - 1, maxW: w / 3 - 12, maxLines: 1, sub: '' }), keys: 'tab bar segments', draw: tabsDraw },
  {
    id: 'modal', name: 'Dialog', w: 300, h: 190, label: 'Dialog title', keys: 'modal popup window confirm',
    lab: (w, h) => ({ dx: 14, cy: Math.min(40, h * 0.25) / 2, anchor: 'start', maxW: w - 56, maxLines: 1, sub: '' }),
    draw: (w, h, P) => {
      const b = Math.min(40, h * 0.25), bw = Math.min(78, w * 0.26), x = w - 26;
      return [
        P.rect(0, 0, w, h, { o: 1, rx: 4 }), P.line(0, b, w, b, { thin: 1 }), P.path(`M${x} ${b / 2 - 5} L${x + 10} ${b / 2 + 5} M${x + 10} ${b / 2 - 5} L${x} ${b / 2 + 5}`, { thin: 1 }),
        P.line(14, b + 22, w * 0.8, b + 22, { sw: 2.5, faint: 1 }), P.line(14, b + 36, w * 0.6, b + 36, { sw: 2.5, faint: 1 }),
        P.rect(w - 2 * bw - 22, h - 44, bw, 30, { thin: 1, rx: 3 }), P.rect(w - bw - 14, h - 44, bw, 30, { thin: 1, rx: 3, f: 'faint' })
      ];
    }
  },
  {
    id: 'list', name: 'List', w: 220, h: 150, lab: null, keys: 'items rows menu',
    draw: (w, h, P) => {
      const n = Math.max(2, Math.floor(h / 36)), rh = h / n, out = [P.rect(0, 0, w, h, { o: 1, rx: 3 })];
      for (let i = 0; i < n; i++) {
        const cy = rh * i + rh / 2;
        out.push(P.circle(16, cy, 4, { thin: 1 }), P.line(30, cy, w * (i % 2 ? 0.62 : 0.8), cy, { sw: 2.5, faint: 1 }));
        if (i) out.push(P.line(0, rh * i, w, rh * i, { thin: 1, faint: 1 }));
      }
      return out;
    }
  },
  {
    id: 'textblock', name: 'Text block', w: 220, h: 80, lab: null, fill: false, keys: 'paragraph lorem copy placeholder',
    draw: (w, h, P) => {
      const n = Math.max(2, Math.floor(h / 18)), gap = h / n, out = [];
      for (let i = 0; i < n; i++) out.push(P.line(2, gap * i + gap / 2, i === n - 1 ? w * 0.58 : w - 2, gap * i + gap / 2, { sw: 2.5, faint: 1 }));
      return out;
    }
  },
  {
    id: 'table', name: 'Table', w: 300, h: 160, lab: null, keys: 'grid data rows columns spreadsheet',
    draw: (w, h, P) => {
      const rh = Math.min(32, h / 3), out = [P.rect(0, 0, w, rh, { f: 'faint', ns: 1 }), P.rect(0, 0, w, h, { o: 1, rx: 2 })];
      for (let y = rh; y < h - 1; y += rh) out.push(P.line(0, y, w, y, { thin: 1, faint: y > rh }));
      [1 / 3, 2 / 3].forEach(f => out.push(P.line(w * f, 0, w * f, h, { thin: 1, faint: 1 })));
      return out;
    }
  },
  {
    id: 'chart', name: 'Chart', w: 200, h: 140, lab: null, keys: 'bar graph analytics dashboard',
    draw: (w, h, P) => {
      const out = [P.path(`M10 6 V${h - 10} H${w - 6}`)], vals = [0.45, 0.7, 0.55, 0.9, 0.65], bw = (w - 30) / vals.length;
      vals.forEach((v, i) => { const bh = (h - 24) * v; out.push(P.rect(18 + i * bw + bw * 0.15, h - 10 - bh, bw * 0.7, bh, { o: 1, thin: 1 })); });
      return out;
    }
  },
  {
    id: 'video', name: 'Video', w: 240, h: 140, lab: null, keys: 'player media play',
    draw: (w, h, P) => {
      const cx = w / 2, cy = h * 0.45, s = Math.min(w, h) * 0.14;
      return [P.rect(0, 0, w, h, { o: 1, rx: 3 }), P.path(`M${cx - s * 0.6} ${cy - s} L${cx + s} ${cy} L${cx - s * 0.6} ${cy + s} Z`, { f: 'faint' }), P.line(12, h - 14, w - 12, h - 14, { sw: 2, faint: 1 }), P.line(12, h - 14, w * 0.35, h - 14, { sw: 2.6 }), P.circle(w * 0.35, h - 14, 4, { f: 'ink', thin: 1 })];
    }
  }
].map(s => ({ label: '', lab: AT.center, ...s }));

export const CATEGORIES = [
  { id: 'plan', name: 'Plan', items: PLAN.map(s => ({ ...s, turn: true })) },
  { id: 'furniture', name: 'Furniture', items: FURNITURE.map(s => ({ ...s, turn: true })) },
  { id: 'system', name: 'System', items: SYSTEM },
  { id: 'flow', name: 'Flow', items: FLOW },
  { id: 'interface', name: 'Interface', items: INTERFACE }
];

export const SYMBOLS = Object.fromEntries(
  CATEGORIES.flatMap(c => c.items.map(s => [s.id, { fill: true, label: '', ...s, cat: c.id, below: s.lab === AT.below }]))
);

// A library symbol drawn at tile size, for the library panel and the tool palette.
export function SymbolIcon({ id, size = 40, t }) {
  const s = SYMBOLS[id];
  if (!s) return null;
  // `ib` crops a wide symbol to its first part, so a small control stays readable in a tile.
  const bw = s.ib || s.w, m = Math.max(bw, s.h), pad = m * 0.06;
  return (
    <svg width={size} height={size} viewBox={`${-pad - (m - bw) / 2} ${-pad - (m - s.h) / 2} ${m + 2 * pad} ${m + 2 * pad}`} aria-hidden="true" style={{ overflow: s.ib ? 'hidden' : 'visible' }}>
      {s.draw(s.w, s.h, makePen(t, 'none', undefined, true))}
    </svg>
  );
}

// Draws a converted cloud icon. Modes: f = ink fill, l = light fill, s = source stroke, o = outline.
// `sw` is the outline width in icon units, so the outline keeps the weight of the other symbols.
export function cloudPaths(ic, t, sw, icon) {
  const ink = icon ? 'currentColor' : t.ink, ve = icon ? 'non-scaling-stroke' : undefined;
  return ic.p.map(([m, d, tr, e, w], i) => {
    const transform = tr || undefined, fillRule = e ? 'evenodd' : undefined;
    if (m === 'f') return <path key={i} d={d} transform={transform} fillRule={fillRule} fill={ink} />;
    if (m === 'l') return <path key={i} d={d} transform={transform} fillRule={fillRule} fill={ink} fillOpacity={0.42} />;
    if (m === 's') return <path key={i} d={d} transform={transform} fill="none" stroke={ink} strokeWidth={w || 1} />;
    return <path key={i} d={d} transform={transform} fill="none" stroke={ink} strokeWidth={icon ? 1 : sw} strokeLinejoin="round" vectorEffect={ve} />;
  });
}

export function CloudIcon({ k, size = 40, t }) {
  const ic = cloudIcon(k);
  if (!ic) return <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeOpacity={0.4} strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" /></svg>;
  const [x, y, w, h] = ic.v;
  return <svg width={size} height={size} viewBox={`${x} ${y} ${w} ${h}`} aria-hidden="true">{cloudPaths(ic, t, 1, true)}</svg>;
}

// A boundary frame: a box with a tab that holds the provider's group icon.
export function FrameIcon({ id, size = 40, t }) {
  const f = FRAME[id], ic = f && f.icon ? cloudIcon(f.icon) : null;
  if (!f) return null;
  let icon = null;
  if (ic) {
    const [x, y, w, h] = ic.v, s = 11 / Math.max(w, h);
    icon = <g transform={`translate(5 6.5) scale(${s}) translate(${-x} ${-y})`}>{cloudPaths(ic, t, 1, true)}</g>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor' }}>
      <rect x="2" y="5" width="36" height="31" strokeWidth="1.2" strokeDasharray={f.solid ? undefined : '3 2'} vectorEffect="non-scaling-stroke" />
      <path d="M2 18.5 H20 V5" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {icon}
    </svg>
  );
}

// A class box, an interface, an enum or a package, drawn at tile size.
export function UmlIcon({ kind, size = 40 }) {
  const st = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, vectorEffect: 'non-scaling-stroke' };
  if (kind === 'package') {
    return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><path d="M4 12 V35 H36 V12 H18 V6 H4 Z M4 12 H18" {...st} /></svg>;
  }
  const tag = { abstract: '«A»', interface: '«I»', enum: '«E»' }[kind], head = tag ? 15 : 12, enumK = kind === 'enum' || kind === 'entity';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="6" y="4" width="28" height="32" {...st} />
      <path d={`M6 ${head} H34${enumK ? '' : ' M6 26 H34'}`} {...st} />
      {tag ? <text x="20" y="10.5" textAnchor="middle" fontSize="6.5" fontFamily="monospace" fill="currentColor">{tag}</text> : <path d="M14 8 H26" {...st} strokeWidth={1.6} />}
      <path d={enumK ? 'M10 20 H24 M10 24 H28 M10 28 H22 M10 32 H26' : `M10 ${head + 4} H26 M10 ${head + 8} H22 M10 30 H28 M10 33 H24`} {...st} strokeOpacity={0.6} />
    </svg>
  );
}

// The icon of any tool that places a library shape: a symbol, a cloud icon ("cloud:aws/amazon-ec2")
// or a frame ("frame:aws-vpc").
export function ToolIcon({ id, size, t }) {
  if (id.startsWith('cloud:') && isCloudKey(id.slice(6))) return <CloudIcon k={id.slice(6)} size={size} t={t} />;
  if (id.startsWith('frame:')) return <FrameIcon id={id.slice(6)} size={size} t={t} />;
  if (id.startsWith('uml:')) return <UmlIcon kind={id.slice(4)} size={size} />;
  return <SymbolIcon id={id} size={size} t={t} />;
}

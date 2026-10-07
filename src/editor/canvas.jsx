// The sheet: shapes, connectors, the selection overlay and the label editor.
import * as F from '../engine.js';
import { renderNode, renderEdge, renderDims } from '../draw.jsx';

export const Canvas = Base => class extends Base {
  // ---------- drawing
  cachedNode(n, ctx, key) {
    const c = this.nodeCache.get(n);
    if (c && c.key === key) return c.el;
    const el = renderNode(n, ctx);
    this.nodeCache.set(n, { key, el });
    return el;
  }
  // A connector draws again only when its path changes. A move of a shape elsewhere keeps the drawing.
  cachedEdge(e, map, ctx, key, selected) {
    const a = map[e.from], b = map[e.to], obs = ctx.obstacles, c = this.edgeCache.get(e);
    if (c && c.key === key && c.a === a && c.b === b && c.obs === obs && c.selected === selected) return c.el;
    const geo = F.edgeGeom(e, map, obs), d = geo && geo.d;
    if (c && c.key === key && c.selected === selected && c.d === d) { this.edgeCache.set(e, { ...c, a, b, obs }); return c.el; }
    const el = renderEdge(e, map, ctx, selected, geo);
    this.edgeCache.set(e, { key, a, b, obs, selected, el, d });
    return el;
  }
  renderOverlay(s, t, map, selSet) {
    const st = this.state, k = this.view().k, A = t.accent, sw = 1.25 / k, out = [];
    const selNodes = s.nodes.filter(n => selSet.has(n.id)), groups = {};
    // One outline for each selected group, one for each other shape, and a lock mark on locked ones.
    const outline = (key, b, locked, group) => {
      const p = (group ? 9 : 5) / k;
      out.push(<rect key={'sel' + key} x={b.x - p} y={b.y - p} width={b.w + 2 * p} height={b.h + 2 * p} fill="none" stroke={A} strokeWidth={sw} strokeDasharray={group ? `${10 / k} ${4 / k}` : `${4 / k} ${3 / k}`} pointerEvents="none" />);
      if (locked) {
        out.push(
          <g key={'lock' + key} transform={`translate(${b.x + b.w + p - 4 / k} ${b.y - p - 14 / k}) scale(${1 / k})`} pointerEvents="none">
            <rect x="0" y="5" width="10" height="8" rx="1" fill={A} />
            <path d="M2.5 5 V3.5 a2.5 2.5 0 0 1 5 0 V5" fill="none" stroke={A} strokeWidth="1.6" />
          </g>
        );
      }
    };
    const inGroup = {};
    selNodes.forEach(n => { if (n.group) inGroup[n.group] = (inGroup[n.group] || 0) + 1; });
    selNodes.forEach(n => {
      if (n.group && inGroup[n.group] > 1) { (groups[n.group] = groups[n.group] || []).push(n); return; }
      if (n.type !== 'line' || n.locked) outline(n.id, F.hitBox(n), n.locked, false);
    });
    Object.entries(groups).forEach(([gid, ns]) => outline(gid, F.bounds(ns), ns.some(n => n.locked), true));
    const single = selNodes.length === 1 && st.sel.length === 1 && !st.editing && !selNodes[0].locked ? selNodes[0] : null;
    if (single && st.dims) out.push(...renderDims(single, this.drawCtx(s), k));
    if (single) {
      const hs = 8 / k;
      if (single.type === 'line') {
        F.linePts(single).forEach((q, i) => out.push(<rect key={'p' + i} x={q.x - hs / 2} y={q.y - hs / 2} width={hs} height={hs} fill={t.paper} stroke={A} strokeWidth={1.4 / k} data-k="handle" data-id={single.id} data-h={'p' + i} style={{ cursor: 'move' }} />));
      } else {
        // A class box sets its own height, so it has width handles only.
        Object.keys(F.HANDLES).filter(key => single.type !== 'class' || key === 'e' || key === 'w').forEach(key => {
          const [fx, fy] = F.HANDLES[key];
          out.push(<rect key={'h' + key} x={single.x + single.w * fx - hs / 2} y={single.y + single.h * fy - hs / 2} width={hs} height={hs} fill={t.paper} stroke={A} strokeWidth={1.4 / k} data-k="handle" data-id={single.id} data-h={key} style={{ cursor: F.HCUR[key] }} />);
        });
      }
    }
    const hv = st.hover && map[st.hover];
    if (hv && !this.drag && !st.editing && (st.tool === 'select' || st.tool === 'connector') && hv.type !== 'path' && hv.type !== 'line') {
      const o = 14 / k;
      [['top', 0, -o], ['right', o, 0], ['bottom', 0, o], ['left', -o, 0]].forEach(([sd, ox, oy]) => {
        const q = F.sidePt(hv, sd);
        out.push(<circle key={'pt' + sd} cx={q.x + ox} cy={q.y + oy} r={4.5 / k} fill={t.paper} stroke={t.ink} strokeWidth={1.3 / k} data-k="port" data-id={hv.id} data-side={sd} style={{ cursor: 'crosshair' }} />);
      });
    }
    if (st.temp) {
      const a = map[st.temp.from];
      if (a) {
        const tg = st.temp.target && map[st.temp.target], dash = `${6 / k} ${4 / k}`;
        if (tg) {
          const geo = F.edgeGeom({ from: a.id, to: tg.id, route: this.defRoute(), fromSide: st.temp.fromSide, toSide: st.temp.toSide }, map, this.obstaclesFor(s)), p = 5 / k, o = 14 / k;
          if (geo) out.push(<path key="tmp" d={geo.d} fill="none" stroke={A} strokeWidth={1.6} strokeDasharray={dash} pointerEvents="none" />);
          out.push(<rect key="tgt" x={tg.x - p} y={tg.y - p} width={tg.w + 2 * p} height={tg.h + 2 * p} fill="none" stroke={A} strokeWidth={2 / k} pointerEvents="none" />);
          // The ports of the target: release on one to fix the side where the connector arrives.
          ['top', 'right', 'bottom', 'left'].forEach(sd => {
            const q = F.sidePt(tg, sd), nn = F.NORM[sd], on = st.temp.toSide === sd;
            out.push(<circle key={'tp' + sd} cx={q.x + nn.x * o} cy={q.y + nn.y * o} r={(on ? 6 : 4.5) / k} fill={on ? A : t.paper} stroke={on ? A : t.ink} strokeWidth={1.3 / k} pointerEvents="none" />);
          });
        } else {
          const s1 = st.temp.fromSide || F.autoSides(a, { x: st.temp.p.x, y: st.temp.p.y, w: 0, h: 0 })[0], q = F.sidePt(a, s1);
          out.push(
            <line key="tmp" x1={q.x} y1={q.y} x2={st.temp.p.x} y2={st.temp.p.y} stroke={A} strokeWidth={1.6} strokeDasharray={dash} pointerEvents="none" />,
            <circle key="tmpc" cx={st.temp.p.x} cy={st.temp.p.y} r={3.5 / k} fill={A} pointerEvents="none" />
          );
        }
      }
    }
    const selEdge = st.sel.length === 1 && !st.editing && !this.drag ? s.edges.find(x => x.id === st.sel[0]) : null;
    const geoSel = selEdge && F.edgeGeom(selEdge, map, this.obstaclesFor(s));
    if (geoSel) {
      // Round handles add a bend. Square handles move a bend, and a double-click removes it.
      geoSel.handles.forEach(hd => out.push(<circle key={'wa' + hd.i} cx={hd.x} cy={hd.y} r={4 / k} fill={t.paper} stroke={A} strokeWidth={1.3 / k} data-k="wpadd" data-id={selEdge.id} data-i={hd.i} style={{ cursor: 'copy' }}><title>Drag to bend the connector</title></circle>));
      // The end handles move an end of the connector to a different shape.
      [geoSel.p1, geoSel.p2].forEach((q, i) => out.push(
        <g key={'end' + i} data-k="end" data-id={selEdge.id} data-i={i} style={{ cursor: 'move' }}>
          <circle cx={q.x} cy={q.y} r={10 / k} fill="transparent" />
          <circle cx={q.x} cy={q.y} r={4.5 / k} fill={A} stroke={t.paper} strokeWidth={1.2 / k} />
          <title>Drag this end to a different shape</title>
        </g>
      ));
      (selEdge.pts || []).forEach((q, i) => out.push(<rect key={'wp' + i} x={q.x - 4.5 / k} y={q.y - 4.5 / k} width={9 / k} height={9 / k} fill={A} stroke={t.paper} strokeWidth={1 / k} data-k="wp" data-id={selEdge.id} data-i={i} style={{ cursor: 'move' }}><title>Drag to move the bend. Double-click to remove it.</title></rect>));
    }
    st.guides.forEach((gd, i) => out.push(<line key={'g' + i} x1={gd.x1} y1={gd.y1} x2={gd.x2} y2={gd.y2} stroke={A} strokeWidth={1 / k} strokeDasharray={`${3 / k} ${3 / k}`} pointerEvents="none" />));
    if (st.marquee) { const m = st.marquee; out.push(<rect key="mq" x={m.x} y={m.y} width={m.w} height={m.h} fill={A} fillOpacity={0.08} stroke={A} strokeWidth={1 / k} strokeDasharray={`${4 / k} ${3 / k}`} pointerEvents="none" />); }
    if (st.ghost) {
      const n = { ...F.newNode(st.ghost.shape, this.placeRect(st.ghost.shape, st.ghost.p)), id: '__ghost' }, b = F.hitBox(n);
      out.push(
        <g key="ghost" opacity={0.6} pointerEvents="none">{renderNode(n, this.drawCtx(s))}</g>,
        <rect key="ghostbox" x={b.x - 5 / k} y={b.y - 5 / k} width={b.w + 10 / k} height={b.h + 10 / k} fill="none" stroke={A} strokeWidth={1 / k} strokeDasharray={`${4 / k} ${3 / k}`} pointerEvents="none" />
      );
    }
    if (st.draft && st.draft.pts.length > 1) out.push(<path key="dr" d={'M' + st.draft.pts.map(q => `${q.x} ${q.y}`).join(' L')} fill="none" stroke={t.ink} strokeWidth={st.draft.kind === 'line' ? F.WEIGHTS.m : F.WEIGHTS.s} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />);
    return out;
  }
  renderEditor(s, ctx) {
    const ed = this.state.editing;
    if (!ed) return null;
    const { t, L } = ctx, v = this.view(), k = v.k;
    let box, align = 'center', fs = 16, member = null;
    if (ed.kind === 'node') {
      const n = s.nodes.find(q => q.id === ed.id);
      if (!n) return null;
      if (n.type === 'class') {
        const lay = F.classLayout(n, L, ctx.caps), f = ed.field || 'label';
        if (f === 'label') { box = { x: n.x, y: n.y + (lay.st ? lay.stFs * 1.3 : 0), w: n.w, h: lay.head - (lay.st ? lay.stFs * 1.3 : 0) }; fs = lay.nameFs; }
        else {
          // The members of a class: one per line, in the monospace font. Enter adds a line.
          const top = n.y + lay.head + (f === 'ops' ? lay.attrsH : 0), count = Math.max(1, String(ed.value).split('\n').length);
          box = { x: n.x, y: top, w: Math.max(n.w, 180), h: Math.max(f === 'ops' ? lay.opsH : lay.attrsH, count * lay.lh + lay.pad * 1.5) };
          member = lay;
        }
      }
    }
    if (member) {
      const left = v.x + box.x * k, top = v.y + box.y * k;
      return (
        <textarea
          key="ed" autoFocus value={ed.value} spellCheck={false} aria-label={ed.field === 'ops' ? 'Operations' : 'Attributes'}
          placeholder={ed.field === 'ops' ? '+ method(): Type' : '- field: Type'}
          onChange={ev => this.setState({ editing: { ...this.state.editing, value: ev.target.value } })}
          onKeyDown={ev => {
            if (ev.key === 'Escape') { ev.preventDefault(); this.cancelEdit(); }
            else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); this.commitEdit(); }
          }}
          onBlur={() => this.commitEdit()}
          onPointerDown={ev => ev.stopPropagation()}
          onDoubleClick={ev => ev.stopPropagation()}
          className="label-editor"
          style={{ left, top, width: box.w * k, height: box.h * k, padding: `${member.pad * 0.75 * k}px ${member.pad * 1.5 * k}px 0`, background: t.paper, color: t.ink, border: `1.5px solid ${t.accent}`, textAlign: 'left', fontFamily: F.MONO, fontSize: member.memFs * k, lineHeight: `${member.lh * k}px`, whiteSpace: 'pre', overflow: 'auto' }}
        />
      );
    }
    if (box) {
      // A class name: the box is set above.
    } else if (ed.kind === 'node') {
      const n = s.nodes.find(q => q.id === ed.id);
      fs = F.SIZES[n.size || 'm'] * (n.type === 'note' ? 0.9 : n.type === 'zone' ? 0.95 : 1);
      if (n.type === 'actor') box = { x: n.x + n.w / 2 - 90, y: n.y + n.h + 2, w: 180, h: 44 };
      else if (n.type === 'zone') { box = { x: n.x + (n.icon ? 24 : 0), y: n.y, w: Math.max(220, Math.min(n.w, 320)), h: 30 }; align = 'left'; }
      else if (n.type === 'window') { box = { x: n.x + 50, y: n.y, w: Math.max(120, n.w - 50), h: 28 }; align = 'left'; fs *= 0.85; }
      else if (n.type === 'note' || n.type === 'input') { box = { x: n.x, y: n.y, w: n.w, h: n.h }; align = 'left'; }
      else box = { x: n.x, y: n.y, w: Math.max(n.w, 120), h: Math.max(n.h, 40) };
    } else {
      const e = s.edges.find(q => q.id === ed.id), geo = e && F.edgeGeom(e, this.nodeMap(s), this.obstaclesFor(s));
      if (!geo) return null;
      fs = 13; box = { x: geo.mid.x - 90, y: geo.mid.y - 18, w: 180, h: 36 };
    }
    const left = v.x + box.x * k, top = v.y + box.y * k, w = box.w * k, hh = box.h * k, fpx = fs * k;
    const lines = Math.max(1, String(ed.value).split('\n').length), lhp = fpx * L.lh;
    const padTop = align === 'center' ? Math.max(2, (hh - lines * lhp) / 2) : Math.max(2, Math.min(10 * k, (hh - lhp) / 2));
    return (
      <textarea
        key="ed" autoFocus value={ed.value} spellCheck={false} aria-label="Label"
        onFocus={ev => ev.target.select()}
        onChange={ev => this.setState({ editing: { ...this.state.editing, value: ev.target.value } })}
        onKeyDown={ev => {
          if (ev.key === 'Escape') { ev.preventDefault(); this.cancelEdit(); }
          else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); this.commitEdit(); }
        }}
        onBlur={() => this.commitEdit()}
        onPointerDown={ev => ev.stopPropagation()}
        onDoubleClick={ev => ev.stopPropagation()}
        className="label-editor"
        style={{ left, top, width: w, height: hh, padding: `${padTop}px ${8 * k}px 0`, background: t.paper, color: t.ink, border: `1.5px solid ${t.accent}`, textAlign: align, fontFamily: L.family, fontWeight: L.weight, fontSize: fpx, lineHeight: L.lh, letterSpacing: `${L.ls}em`, textTransform: ctx.caps ? 'uppercase' : 'none' }}
      />
    );
  }
  renderCanvas(s, ctx) {
    const st = this.state, v = this.view(), k = v.k, g = this.g(), { t } = ctx;
    const map = this.nodeMap(s), selSet = new Set(st.sel);
    const zones = s.nodes.filter(n => n.type === 'zone'), rest = s.nodes.filter(n => n.type !== 'zone');
    const ptf = `translate(${v.x} ${v.y}) scale(${k})`;
    const key = `${st.mode}|${ctx.L.id}|${ctx.caps}|${s.unit}|${g}|${this.fontGen}|${this.cloudGen}`;
    const panTool = st.tool === 'hand' || st.space;
    const cursor = panTool ? (st.panning ? 'grabbing' : 'grab') : st.tool === 'select' ? 'default' : 'crosshair';
    // While shapes move or change size, only their own connectors find a new route. The others keep the
    // shapes in their way from before the drag, so they keep their drawing. The drop routes them all again.
    const d = this.drag, busy = d && (d.type === 'move' ? new Set(Object.keys(d.orig)) : d.type === 'resize' ? new Set([d.orig.id]) : d.type === 'create' && d.id ? new Set([d.id]) : null);
    if (!busy) this._calmObs = ctx.obstacles;
    const calm = busy && this._calmObs ? { ...ctx, obstacles: this._calmObs } : ctx;
    const edgeCtx = e => (busy && !busy.has(e.from) && !busy.has(e.to) ? calm : ctx);
    return (
      <div ref={this.setCanvas} className="canvas" onPointerDown={this.onDown} onDoubleClick={this.onDbl} onDragOver={this.onDragOver} onDrop={this.onDrop} onContextMenu={e => e.preventDefault()} style={{ cursor }}>
        <svg width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <pattern id="fp-minor" width={g} height={g} patternUnits="userSpaceOnUse" patternTransform={ptf}><path d={`M${g} 0 L0 0 0 ${g}`} fill="none" stroke={t.minor} strokeWidth={2 / k} /></pattern>
            <pattern id="fp-major" width={g * 5} height={g * 5} patternUnits="userSpaceOnUse" patternTransform={ptf}><path d={`M${g * 5} 0 L0 0 0 ${g * 5}`} fill="none" stroke={t.major} strokeWidth={2 / k} /></pattern>
            <pattern id="fp-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={4} y1={0} x2={4} y2={8} stroke={t.hatch} strokeWidth={1.5} /></pattern>
          </defs>
          {g * k >= 8 && <rect width="100%" height="100%" fill="url(#fp-minor)" />}
          <rect width="100%" height="100%" fill="url(#fp-major)" />
          <g transform={ptf}>
            <g ref={this.setContent}>
              {zones.map(n => this.cachedNode(n, ctx, key))}
              {s.edges.map(e => (st.temp && st.temp.hide === e.id ? null : this.cachedEdge(e, map, edgeCtx(e), key, selSet.has(e.id))))}
              {rest.map(n => this.cachedNode(n, ctx, key))}
            </g>
            <g>{this.renderOverlay(s, t, map, selSet)}</g>
          </g>
        </svg>
        {this.renderEditor(s, ctx)}
      </div>
    );
  }
};

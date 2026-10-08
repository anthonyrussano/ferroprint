// The editor: state, lifecycle and layout. The modules in src/editor/ add the behavior.
import { Component, createRef } from 'react';
import * as F from './engine.js';
import { onCloudLoad } from './cloud.js';
import { Frame, TopBar, Palette, Inspector, HelpPanel, SetupPanel, LibraryPanel, NewPanel, ProjectsPanel, SharePanel, IncomingPanel, TitleBlock, StatusBar, Toast } from './chrome.jsx';
import { loadUI, setTabProject } from './storage.js';
import { History } from './editor/history.js';
import { Pointer } from './editor/pointer.js';
import { Commands } from './editor/commands.js';
import { Project } from './editor/project.js';
import { Exporter } from './editor/exporter.js';
import { Canvas } from './editor/canvas.jsx';
import { Clipboard } from './editor/clipboard.js';
import { Live } from './editor/live.js';
import { RECENT_MAX, PIN_MAX, isLibraryTool, without } from './editor/util.js';

function textureFor(mode) {
  const [r, g, b] = F.THEMES[mode].tex;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 0.55 -0.22'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const TEXTURES = { blue: textureFor('blue'), white: textureFor('white') };

export default class Editor extends Canvas(Exporter(Live(Clipboard(Project(Commands(Pointer(History(Component)))))))) {
  // `boot` holds the store and the project to open. See boot() in storage.js.
  constructor(props) {
    super(props);
    const { boot } = props, ui = loadUI();
    this.store = boot.store;
    this.projectId = boot.id || F.uid();
    this.tabId = F.uid();
    setTabProject(this.projectId);
    this.state = {
      doc: boot.doc || F.blankDoc(),
      tool: 'select', sel: [], hover: null, editing: null, marquee: null, guides: [], temp: null, draft: null,
      snap: ui.snap !== false, dims: ui.dims !== false, mode: ui.mode === 'white' ? 'white' : 'blue', clean: ui.clean === true,
      recent: Array.isArray(ui.recent) ? ui.recent.filter(isLibraryTool).slice(0, RECENT_MAX) : ['stairs', 'sofa', 'cloud'],
      pins: Array.isArray(ui.pins) ? ui.pins.filter(isLibraryTool).slice(0, PIN_MAX) : [], ghost: null,
      size: { w: 0, h: 0 }, cursor: { x: 0, y: 0 }, space: false, panning: false,
      panel: null, toast: null, delArm: false, palTop: 92, share: null, incoming: null, projects: null,
      win: { w: window.innerWidth, h: window.innerHeight },
      save: boot.store.kind === 'none' ? 'off' : 'saved'
    };
    this._savedJSON = boot.json;
    // A first visit opens a blank project. A share link then takes its place.
    this._fresh = boot.fresh;
    this.undoStack = []; this.redoStack = [];
    this.drag = null; this.clip = null; this.pasteN = 0;
    this.pointers = new Map();
    this.fontCache = {}; this.fontGen = 0;
    this.nodeCache = new WeakMap(); this.edgeCache = new WeakMap(); this.classFit = new WeakMap(); this.obsCache = new WeakMap(); this.cloudGen = 0;
    this.barRef = createRef(); this.fileRef = createRef(); this.imageRef = createRef(); this.logoRef = createRef();
    this.canvasEl = null; this.contentEl = null;
    ['onDown', 'onMove', 'onUp', 'onDbl', 'onWheel', 'onKey', 'onKeyUp', 'onResize', 'setCanvas', 'setContent', 'onFile', 'onBlurWin', 'onHide', 'onHash', 'onCopy', 'onCut', 'onPaste', 'onDragOver', 'onDrop', 'onImageFile', 'onLogoFile'].forEach(k => { this[k] = this[k].bind(this); });
    // Stable handlers let the library panel skip renders while the pointer moves.
    this.lib = { pick: id => this.pickSymbol(id), pin: id => this.togglePin(id), drag: (id, e) => this.startPlace(id, e), close: () => this.setState({ panel: null }) };
    this.tpl = { add: id => this.addTemplate(id), mermaid: text => this.importMermaid(text).then(ok => ok || this.flash('Ferroprint reads Mermaid flowcharts, and class, state, entity relationship and sequence diagrams. This text is not one of them.', 5000)), blankDoc: () => { this.setState({ panel: null }); this.newDoc(); }, blankSheet: () => { this.setState({ panel: null }); this.addSheet(); }, close: this.lib.close };
    this.shareUI = { copied: ok => this.flash(ok ? 'Link copied. Anyone with the link can open this project.' : 'Copy the selected link with Ctrl C.', 4000), close: () => this.setState({ panel: null, share: null }) };
    this.inUI = { add: () => this.acceptShared('add'), open: () => this.acceptShared('new'), cancel: () => this.acceptShared('cancel') };
    this.projUI = {
      open: id => this.openProject(id), duplicate: id => this.duplicateProject(id), remove: id => this.deleteProject(id),
      blank: () => this.newDoc(), file: () => this.openFile(), close: this.lib.close
    };
  }

  componentDidMount() {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlurWin);
    window.addEventListener('pagehide', this.onHide);
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('hashchange', this.onHash);
    document.addEventListener('copy', this.onCopy);
    document.addEventListener('cut', this.onCut);
    document.addEventListener('paste', this.onPaste);
    this.openChannel();
    if (this.store.fallback) this.flash('The browser database did not open, so this visit saves to localStorage. The next start moves the projects into the database.', 9000);
    this.checkShared();
    this.openLive();
    // A cloud set arrives after the first render, so the sheet draws again when one loads.
    this.offCloud = onCloudLoad(() => { this.cloudGen++; this.forceUpdate(); });
    this.persist();
    if (document.fonts) {
      // Labels are measured on a canvas, so redraw once the drafting fonts are ready.
      Promise.all(['500 16px "Barlow Condensed"', '400 16px "Architects Daughter"', '400 12px "IBM Plex Mono"'].map(f => document.fonts.load(f).catch(() => null)))
        .then(() => { this.fontGen++; this.forceUpdate(); });
    }
  }
  componentWillUnmount() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlurWin);
    window.removeEventListener('pagehide', this.onHide);
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('hashchange', this.onHash);
    document.removeEventListener('copy', this.onCopy);
    document.removeEventListener('cut', this.onCut);
    document.removeEventListener('paste', this.onPaste);
    if (this.offCloud) this.offCloud();
    this.closeChannel();
    this.closeLive();
    if (this._saveT) this.flushSave();
    [this._toastT, this._armT].forEach(clearTimeout);
  }
  componentDidUpdate() { this.persist(); }

  // ---------- accessors
  sheet() { const d = this.state.doc; return d.sheets.find(s => s.id === d.active) || d.sheets[0]; }
  g() { return this.state.doc.settings.grid; }
  letter() { return this.state.doc.settings.lettering === 'technical' ? F.LETTER.technical : F.LETTER.hand; }
  defRoute() { return this.state.doc.settings.route; }
  drawCtx(s) { return { t: F.THEMES[this.state.mode], L: this.letter(), caps: this.state.doc.settings.caps, unit: s.unit, g: this.g(), files: this.state.doc.files, obstacles: this.obstaclesFor(s) }; }
  // The shapes that elbow connectors go around. The list changes only when the shapes change.
  obstaclesFor(s) {
    let o = this.obsCache.get(s.nodes);
    if (!o) { o = F.obstaclesOf(s.nodes); this.obsCache.set(s.nodes, o); }
    return o;
  }
  measure() { const r = this.canvasEl ? this.canvasEl.getBoundingClientRect() : null; return r && r.width ? { w: r.width, h: r.height } : this.state.size; }
  view() { return this.sheet().view || this.fitView() || { x: 160, y: 120, k: 1 }; }
  fitView() {
    const s = this.sheet(), { w, h: H } = this.measure();
    if (!w) return null;
    // Leave room for the toolbars. Clean mode keeps only the tool palette on the left.
    const [L, R, T, B] = this.state.clean ? [130, 40, 40, 40] : [140, 60, 80, 160];
    const b = F.bounds(s.nodes), aw = Math.max(100, w - L - R), ah = Math.max(100, H - T - B);
    if (!b) return { x: L + 40, y: T + 40, k: 1 };
    const k = F.clamp(Math.min(aw / b.w, ah / b.h), 0.2, 1.25);
    return { k, x: L + aw / 2 - (b.x + b.w / 2) * k, y: T + ah / 2 - (b.y + b.h / 2) * k };
  }
  sn(v) { const g = this.g(); return this.state.snap ? Math.round(v / g) * g : Math.round(v); }
  updSheet(fn, cb) { this.setState(st => { const d = st.doc; return { doc: { ...d, sheets: d.sheets.map(s => (s.id === d.active ? { ...s, ...fn(s) } : s)) } }; }, cb); }
  setView(v) { this.updSheet(() => ({ view: v })); }
  setNodes(fn) { this.updSheet(s => ({ nodes: fn(s.nodes) })); }
  setEdges(fn) { this.updSheet(s => ({ edges: fn(s.edges) })); }
  setMeta(key, val) { this.pushHistory('meta-' + key); this.setState(st => ({ doc: { ...st.doc, meta: { ...st.doc.meta, [key]: val } } })); }
  setSettings(patch) { this.pushHistory(); this.setState(st => ({ doc: { ...st.doc, settings: { ...st.doc.settings, ...patch } } })); }
  nodeMap(s) { const m = {}; s.nodes.forEach(n => { m[n.id] = n; }); return m; }
  toWorld(cx, cy) { const r = this.canvasEl ? this.canvasEl.getBoundingClientRect() : { left: 0, top: 0 }, v = this.view(); return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k }; }

  onImageFile(e) {
    const f = e.target.files && e.target.files[0], id = this.state.sel[0];
    e.target.value = '';
    if (f && id) this.setImage(id, f);
  }
  onLogoFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) this.setLogo(f);
  }
  flash(msg, ms = 2400, action = null) {
    this.setState({ toast: { msg, action } });
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.setState({ toast: null }), ms);
  }

  render() {
    const st = this.state, d = st.doc, s = this.sheet(), ctx = this.drawCtx(s), t = ctx.t, v = this.view(), g = this.g();
    const ids = new Set(st.sel), map = this.nodeMap(s);
    const nc = Math.max(4, Math.round((st.win.w - 56) / 210)), nr = Math.max(3, Math.round((st.win.h - 56) / 210));
    const cols = Array.from({ length: nc }, (_, i) => String.fromCharCode(65 + i));
    const rows = Array.from({ length: nr }, (_, i) => String(i + 1));
    const wide = st.win.w >= 1080, tiny = st.win.w < 640;
    const tool = st.space ? 'hand' : st.tool;
    const idx = d.sheets.findIndex(q => q.id === s.id), meta = d.meta;
    const updS = key => val => { this.pushHistory(`sheet-${key}-${s.id}`); this.updSheet(() => ({ [key]: val })); };
    const vars = {
      '--paper': t.paper, '--ink': t.ink, '--muted': t.muted, '--panel': t.panel, '--hover': t.hover, '--line': t.line,
      '--accent': t.accent, '--accent-ink': t.accentInk, '--vig': t.vig, '--pal-top': st.palTop + 'px'
    };
    return (
      <div className={'app' + (tiny ? ' tiny' : '') + (st.clean ? ' clean' : '')} style={vars}>
        <div className="sheet-area">{this.renderCanvas(s, ctx)}</div>
        <Frame cols={cols} rows={rows} texture={TEXTURES[st.mode]} clean={st.clean} />

        {s.nodes.length === 0 && !this.drag && !st.clean && (
          <div className="empty">
            <div>
              <h2>EMPTY SHEET</h2>
              <p>Pick a shape on the left and click or drag on the sheet. The library has doors, furniture and cloud icons, and NEW has templates. Drag from the small circles around a shape to connect it to another. Double-click empty space to write a label.</p>
            </div>
          </div>
        )}

        {!st.clean && <TopBar
          barRef={this.barRef} save={st.save} canUndo={this.undoStack.length > 0} canRedo={this.redoStack.length > 0}
          snap={st.snap} dims={st.dims} mode={st.mode} panel={st.panel}
          on={{
            undo: () => this.doUndo(), redo: () => this.doRedo(),
            snap: () => this.setState({ snap: !st.snap }), dims: () => this.setState({ dims: !st.dims }),
            blue: () => this.setState({ mode: 'blue' }), white: () => this.setState({ mode: 'white' }),
            projects: () => this.showProjects(), newDoc: () => this.togglePanel('new'), open: () => this.openFile(), share: () => (st.panel === 'share' ? this.shareUI.close() : this.openShare()),
            png: () => this.exportImg('png'), svg: () => this.exportImg('svg'), pdf: () => this.exportPDF(), json: () => this.exportJSON(),
            setup: () => this.togglePanel('setup'), help: () => this.togglePanel('help'), clean: () => this.toggleClean()
          }}
        />}
        <Palette
          tool={st.tool} onTool={id => this.setTool(id)} recent={st.recent} pins={st.pins} onUnpin={id => this.togglePin(id)} theme={t}
          libraryOpen={st.panel === 'library'} onLibrary={() => this.togglePanel('library')} onSymbol={id => this.pickSymbol(id)}
          clean={st.clean} onClean={() => this.toggleClean()}
        />

        {(!st.clean || st.sel.length > 0) && <Inspector
          nodes={s.nodes.filter(n => ids.has(n.id))} edges={s.edges.filter(e => ids.has(e.id))} nodeById={map}
          fmt={px => F.fmtLen(px, s.unit, g)}
          setNode={(id, patch, key) => { this.pushHistory(key); this.setNodes(a => a.map(q => (q.id === id ? { ...q, ...patch } : q))); }}
          setEdge={(id, patch, key) => { this.pushHistory(key); this.setEdges(a => a.map(q => (q.id === id ? { ...q, ...patch } : q))); }}
          act={{
            front: () => this.arrange(true), back: () => this.arrange(false), dup: () => this.duplicate(), del: () => this.del(), wrap: () => this.wrapZone(),
            align: kind => this.align(kind), distribute: axis => this.distribute(axis),
            rotate: () => this.rotateSel(), flip: () => this.flipSel(), reverseLine: () => this.reverseLine(), style: (field, value) => this.styleSel(field, value),
            group: () => this.groupSel(), ungroup: () => this.ungroupSel(), lock: () => this.lockSel(),
            sides: patch => this.setEdgeSides(st.sel[0], patch), straighten: () => this.clearBends(st.sel[0]), straightenAll: () => this.straightenSel(),
            chooseImage: () => { if (this.imageRef.current) this.imageRef.current.click(); },
            removeImage: () => { const id = st.sel[0]; this.pushHistory(); this.setNodes(a => a.map(q => (q.id === id ? without(q, 'file') : q))); },
            copyImage: () => this.copyImage(),
            noIcon: () => { const id = st.sel[0]; this.pushHistory(); this.setNodes(a => a.map(q => (q.id === id ? without(q, 'icon') : q))); },
            reverse: () => {
              const id = st.sel[0];
              this.pushHistory();
              this.setEdges(a => a.map(q => {
                if (q.id !== id) return q;
                let r = ['fromSide', 'toSide', 'fromAt', 'toAt', 'lt'].reduce((o, k) => without(o, k), { ...q, from: q.to, to: q.from });
                if (q.toSide) r.fromSide = q.toSide;
                if (q.fromSide) r.toSide = q.fromSide;
                if (q.toAt != null) r.fromAt = q.toAt;
                if (q.fromAt != null) r.toAt = q.fromAt;
                if (q.lt != null) r.lt = Math.round((1 - q.lt) * 1000) / 1000;
                if (q.pts) r = { ...r, pts: [...q.pts].reverse() };
                return r;
              }));
            }
          }}
        />}

        {st.panel === 'help' && <HelpPanel onClose={() => this.setState({ panel: null })} />}
        {st.panel === 'library' && (
          <LibraryPanel
            tool={st.tool} theme={t} pins={st.pins} onPin={this.lib.pin} onPick={this.lib.pick} onDragStart={this.lib.drag} onClose={this.lib.close}
          />
        )}
        {st.panel === 'new' && <NewPanel theme={t} letter={ctx.L} caps={ctx.caps} grid={g} on={this.tpl} />}
        {st.panel === 'projects' && <ProjectsPanel data={st.projects} current={this.projectId} name={d.meta.project} kind={this.store.kind} on={this.projUI} />}
        {st.panel === 'share' && <SharePanel share={st.share} on={this.shareUI} />}
        {st.panel === 'incoming' && st.incoming && <IncomingPanel doc={st.incoming} on={this.inUI} />}
        {st.panel === 'setup' && <SetupPanel settings={d.settings} onSet={patch => this.setSettings(patch)} onClose={() => this.setState({ panel: null })} />}

        {!tiny && !st.clean && (
          <TitleBlock
            wide={wide}
            tb={{
              project: meta.project, setProject: val => this.setMeta('project', val),
              drawn: meta.drawnBy, setDrawn: val => this.setMeta('drawnBy', val),
              date: meta.date, setDate: val => this.setMeta('date', val),
              rev: meta.rev, setRev: val => this.setMeta('rev', val),
              num: s.number, setNum: updS('number'), name: s.name, setName: updS('name'),
              scale: F.scaleLabel(s.unit, g), sheetOf: `${idx + 1} OF ${d.sheets.length}`,
              cycleUnit: () => { this.pushHistory(); this.updSheet(q => ({ unit: F.UNITS[(F.UNITS.indexOf(q.unit) + 1) % F.UNITS.length] })); },
              logo: meta.logo && d.files ? d.files[meta.logo] || null : null,
              chooseLogo: () => { if (this.logoRef.current) this.logoRef.current.click(); },
              clearLogo: () => this.clearLogo()
            }}
          />
        )}

        {!st.clean && <StatusBar
          right={wide ? 500 : tiny ? 40 : 280} cursor={st.cursor} zoomPct={Math.round(v.k * 100) + '%'}
          tool={F.toolName(tool).toUpperCase() + (F.KEY_OF[tool] ? ` · ${F.KEY_OF[tool]}` : '')}
          hint={F.HINTS[tool] || (F.TURN[tool] ? 'Click to place · drag to size · ⇧R rotates' : 'Click to place · drag to size')}
          tabs={d.sheets.map(q => ({ id: q.id, num: q.number, name: q.name || 'Untitled', full: `${q.number} ${q.name || ''}`, active: q.id === s.id, on: () => this.switchSheet(q.id) }))}
          delLabel={st.delArm ? 'CONFIRM DELETE' : 'DELETE SHEET'}
          on={{
            zoomIn: () => this.zoomCenter(1.2), zoomOut: () => this.zoomCenter(1 / 1.2), zoom100: () => this.zoomCenter(1 / v.k), fit: () => this.fit(),
            addSheet: () => this.addSheet(), delSheet: () => this.delSheet()
          }}
        />}

        <Toast toast={st.toast} />
        <input ref={this.fileRef} type="file" accept=".json,.mmd,.mermaid,.md,application/json,text/markdown,text/plain" onChange={this.onFile} hidden />
        <input ref={this.imageRef} type="file" accept="image/*" onChange={this.onImageFile} hidden />
        <input ref={this.logoRef} type="file" accept="image/*" onChange={this.onLogoFile} hidden />
      </div>
    );
  }
}

// Live file, for development only: `npm run live` keeps the open tab and a project file on disk in step.
// A change to the file redraws the tab, and Ctrl Z takes it back. A change in the tab goes to the file.
// A Mermaid file next to it lays out the open sheet again. scripts/live-file.mjs is the server side.
import * as F from '../engine.js';
import { mermaidSheet } from '../mermaid.js';

// The file that the server watches, or undefined when live mode is off. The build never has it.
const LIVE = import.meta.env.FERROPRINT_LIVE;
// The live project has a fixed id, so each start opens the same project.
export const LIVE_ID = 'live';
// The wait after a change in the tab before the file gets it, so a drag writes the file once.
const WRITE_DELAY = 300;

// The file leaves out the pan and zoom of each sheet, so a pan or a zoom does not rewrite it.
const fileText = doc => JSON.stringify({ ...doc, sheets: doc.sheets.map(({ view: _, ...s }) => s) }, null, 2) + '\n';
const summary = doc => doc.sheets.map(s => ({ id: s.id, number: s.number, name: s.name, nodes: s.nodes.length, edges: s.edges.length }));
const count = (raw, key) => (Array.isArray(raw && raw.sheets) ? raw.sheets.reduce((n, s) => n + (s && Array.isArray(s[key]) ? s[key].length : 0), 0) : 0);

export const Live = Base => class extends Base {
  openLive() {
    const hot = import.meta.hot;
    if (!LIVE || !hot) return;
    this._liveOn = m => { this.onLive(m); };
    hot.on('ferroprint:live', this._liveOn);
    // React mounts the editor twice in development, and the server answers each hello.
    if (!this._liveHello) { this._liveHello = true; hot.send('ferroprint:live-hello'); }
  }
  closeLive() {
    clearTimeout(this._liveT); clearTimeout(this._liveWait);
    if (this._liveOn && import.meta.hot) import.meta.hot.off('ferroprint:live', this._liveOn);
  }
  liveStatus(s) { if (import.meta.hot) import.meta.hot.send('ferroprint:live-status', s); }
  // The editor calls this after each change to the project.
  liveChanged() {
    if (!this._liveReady || this.projectId !== LIVE_ID) return;
    clearTimeout(this._liveT);
    this._liveT = setTimeout(() => this.writeLive(), WRITE_DELAY);
  }
  writeLive() {
    if (this.projectId !== LIVE_ID) return;
    const text = fileText(F.pruneFiles(this.state.doc));
    if (text === this._liveText) return;
    this._liveText = text;
    import.meta.hot.send('ferroprint:live-save', { text });
  }

  async onLive(m) {
    if (!m) return;
    if (m.kind === 'error') { this.flash(m.message, 6000); return; }
    // A file change waits while a drag or a label edit runs, so it does not cut the gesture short.
    if (this.drag || this.state.editing) {
      clearTimeout(this._liveWait);
      this._liveWait = setTimeout(() => this.onLive(m), 250);
      return;
    }
    if (m.kind === 'mermaid') { await this.liveMermaid(m.text); return; }
    if (m.initial) { await this.startLive(m.text); return; }
    this.applyLive(m.text);
  }
  // Returns the project in a file as a valid document, or null after it reports the problem.
  readLive(text) {
    let raw;
    try { raw = JSON.parse(text); } catch (err) { raw = null; this.liveStatus({ ok: false, message: `Not valid JSON: ${err.message}` }); }
    const doc = raw && F.cleanDoc(raw);
    if (raw && !doc) this.liveStatus({ ok: false, message: 'Not a Ferroprint project. It needs a "sheets" array with at least one sheet.' });
    if (!doc) { this.flash(`${LIVE} is not a Ferroprint project. The tab keeps its drawing.`, 6000); return null; }
    return { raw, doc };
  }
  report(raw, doc, message) {
    const dropped = { nodes: count(raw, 'nodes') - count(doc, 'nodes'), edges: count(raw, 'edges') - count(doc, 'edges') };
    const ok = !dropped.nodes && !dropped.edges;
    this.liveStatus({
      ok, message: ok ? message : `${message} The tab left out ${dropped.nodes} shapes and ${dropped.edges} connectors that are not valid.`,
      dropped, active: doc.active, sheets: summary(doc)
    });
  }
  // The first message: open the live project from the file, or start the file from the project in this browser.
  async startLive(text) {
    let doc = null, raw = null;
    if (text) {
      const r = this.readLive(text);
      if (!r) return;
      ({ raw, doc } = r);
    } else {
      const json = await this.store.get(LIVE_ID), saved = json && F.cleanDoc(JSON.parse(json));
      doc = saved || { ...F.blankDoc(), meta: { ...F.blankDoc().meta, project: 'Live session' } };
    }
    if (this.projectId !== LIVE_ID) {
      // An empty project that was never saved stays out of the list.
      const blank = this._savedJSON == null && this.state.doc.sheets.every(s => !s.nodes.length);
      if (!blank && !(await this.leaveProject())) return;
      this.showProject(LIVE_ID, doc, null, `Live: this tab follows ${LIVE}`);
    } else {
      this.clearHistory();
      this.setState({ doc, sel: [], editing: null });
    }
    this._liveActive = doc.active;
    this._liveReady = true;
    // The file gets the project in the form the tab keeps, with ids and sizes filled in.
    this.writeLive();
    this.report(raw || doc, doc, text ? 'Opened the file.' : 'Wrote a new file from the project in the browser.');
  }
  applyLive(text) {
    if (!this._liveReady) { this.startLive(text); return; }
    const r = this.readLive(text);
    if (!r) return;
    const { raw, doc: inc } = r;
    if (this.projectId !== LIVE_ID) {
      // The tab shows a different project, so the live project waits in the list until the user opens it.
      this.store.put({ id: LIVE_ID, name: inc.meta.project || '', sheets: inc.sheets.length, updated: Date.now() }, JSON.stringify(inc));
      this.flash(`${LIVE} changed.`, 6000, { label: 'SHOW', run: () => this.openProject(LIVE_ID) });
      return;
    }
    if (fileText(inc) === fileText(F.pruneFiles(this.state.doc))) { this._liveText = text; this.report(raw, inc, 'No change.'); return; }
    const cur = this.state.doc, views = new Map(cur.sheets.map(s => [s.id, s.view]));
    // The open sheet changes only when the file names a different sheet than before.
    const follow = inc.active !== this._liveActive;
    this._liveActive = inc.active;
    const active = follow || !inc.sheets.some(s => s.id === cur.active) ? inc.active : cur.active;
    const doc = { ...inc, active, sheets: inc.sheets.map(s => (views.has(s.id) ? { ...s, view: views.get(s.id) } : s)) };
    const act = doc.sheets.find(s => s.id === active), ids = new Set([...act.nodes, ...act.edges].map(x => x.id));
    this.pushHistory();
    this.setState(st => ({ doc, sel: st.sel.filter(x => ids.has(x)), hover: null, temp: null }));
    this.report(raw, inc, 'Drew the change.');
  }
  // The Mermaid file replaces the shapes and connectors of the open sheet with a new layout.
  async liveMermaid(text) {
    if (!this._liveReady || this.projectId !== LIVE_ID) return;
    let r;
    try { r = await mermaidSheet(text, { L: this.letter(), caps: this.state.doc.settings.caps, id: F.uid }); } catch (err) { r = { error: `Could not read the Mermaid text: ${err.message}` }; }
    if (!r || r.error) {
      const message = r ? r.error : 'The Mermaid file is not a flowchart, class, state, entity relationship or sequence diagram.';
      this.flash(message, 6000);
      this.liveStatus({ ok: false, message });
      return;
    }
    const cur = this.sheet(), others = new Set(this.state.doc.sheets.filter(s => s.id !== cur.id).map(s => s.id));
    const sh = F.cleanSheet({ ...r, id: cur.id, number: cur.number, view: null }, others, cur.number);
    this.pushHistory();
    this.updSheet(s => ({ nodes: sh.nodes, edges: sh.edges, view: null, name: s.name === 'Untitled sheet' ? sh.name : s.name }));
    const skipped = r.skipped ? ` It skipped ${r.skipped} lines that it cannot read.` : '';
    this.liveStatus({ ok: true, message: `Laid out sheet ${cur.number} from the Mermaid file.${skipped}`, active: cur.id, sheets: summary({ sheets: [{ ...cur, ...sh }] }) });
  }
};

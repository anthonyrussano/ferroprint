// Saving, sheets, templates, share links, and JSON files.
import * as F from '../engine.js';
import { loadCloud, cloudSet, cloudFailed } from '../cloud.js';
import { DOC_KEY, parseDoc, saveDoc, saveUI } from '../storage.js';
import { shareLink, sharedPayload, readShared, clearShared } from '../share.js';
import { TEMPLATES } from '../templates.js';
import { SAVE_DELAY, toolCloud } from './util.js';

export const Project = Base => class extends Base {
  // ---------- persistence
  persist() {
    const st = this.state;
    if (this._mode !== st.mode) { this._mode = st.mode; this.applyTheme(); }
    if (this._doc !== st.doc) { this._doc = st.doc; this.scheduleSave(); }
    const prefs = { snap: st.snap, dims: st.dims, mode: st.mode, clean: st.clean, recent: st.recent, pins: st.pins }, ui = JSON.stringify(prefs);
    if (ui !== this._ui) { this._ui = ui; saveUI(prefs); }
    this.ensureClouds();
    this.fitClasses();
    if (!this.sheet().view && this.canvasEl && this.canvasEl.getBoundingClientRect().width > 0) this.fit();
    const bar = this.barRef.current;
    if (bar) {
      const h = bar.offsetHeight;
      if (h && h !== this._topH) { this._topH = h; this.setState({ palTop: 40 + h + 12 }); }
    }
  }
  // Loads the cloud sets that the active sheet, the pins and the recent list use.
  cloudsInUse(nodes) {
    const need = new Set();
    nodes.forEach(n => { const p = F.nodeCloud(n); if (p) need.add(p); });
    [...this.state.pins, ...this.state.recent].forEach(id => { const p = toolCloud(id); if (p) need.add(p); });
    return [...need];
  }
  // Class boxes grow to fit their text. The fit runs after every change, so each way to edit a class keeps it right.
  fitClasses() {
    const s = this.sheet(), L = this.letter(), caps = this.state.doc.settings.caps, key = `${L.css}|${caps}|${this.fontGen}`, fix = {};
    s.nodes.forEach(n => {
      if (n.type !== 'class') return;
      const c = this.classFit.get(n);
      if (c === key) return;
      this.classFit.set(n, key);
      const lay = F.classLayout(n, L, caps), w = Math.max(n.w, lay.minW);
      if (w !== n.w || lay.h !== n.h) fix[n.id] = { w, h: lay.h };
    });
    if (Object.keys(fix).length) this.setNodes(ns => ns.map(n => (fix[n.id] ? { ...n, ...fix[n.id] } : n)));
  }
  ensureClouds() {
    this.cloudsInUse(this.sheet().nodes).forEach(p => { if (!cloudSet(p) && !cloudFailed(p)) loadCloud(p).catch(() => {}); });
  }
  scheduleSave() {
    if (this.state.save === 'off') return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.flushSave(), SAVE_DELAY);
    if (this.state.save === 'saved') this.setState({ save: 'pending' });
  }
  flushSave() {
    clearTimeout(this._saveT); this._saveT = null;
    if (this.state.save === 'off') return false;
    const json = JSON.stringify(this.state.doc);
    const ok = json === this._savedJSON || saveDoc(json);
    if (ok) { this._savedJSON = json; this._warned = false; }
    const save = ok ? 'saved' : 'error';
    if (this.state.save !== save) this.setState({ save });
    if (!ok && !this._warned) { this._warned = true; this.flash('Could not save. Browser storage is full. Export JSON to keep your work.', 7000); }
    return ok;
  }
  saveNow() {
    if (this.state.save === 'off') { this.flash('This browser blocks local storage. Use Export JSON to keep your work.', 5000); return; }
    if (this.flushSave()) this.flash('Saved in this browser');
  }
  onHide(e) {
    if (e.type === 'visibilitychange' && document.visibilityState !== 'hidden') return;
    if (this._saveT) this.flushSave();
  }
  // Another tab saved the project. Take its content, but keep this tab's sheet and view.
  onStorage(e) {
    if (e.key !== DOC_KEY || e.newValue == null || e.newValue === this._savedJSON) return;
    const parsed = parseDoc(e.newValue);
    if (!parsed) return;
    const cur = this.state.doc, inc = parsed.doc, local = new Map(cur.sheets.map(s => [s.id, s]));
    const doc = {
      ...inc,
      active: inc.sheets.some(s => s.id === cur.active) ? cur.active : inc.active,
      sheets: inc.sheets.map(s => (local.has(s.id) ? { ...s, view: local.get(s.id).view } : s))
    };
    clearTimeout(this._saveT); this._saveT = null;
    this._savedJSON = e.newValue; this._doc = doc;
    this.undoStack = []; this.redoStack = []; this.drag = null;
    const act = doc.sheets.find(s => s.id === doc.active), ids = new Set([...act.nodes.map(n => n.id), ...act.edges.map(x => x.id)]);
    const ed = this.state.editing;
    this.setState({ doc, sel: this.state.sel.filter(id => ids.has(id)), editing: ed && ids.has(ed.id) ? ed : null, hover: null, temp: null, draft: null, marquee: null, guides: [], panning: false, save: 'saved' });
  }
  applyTheme() {
    const t = F.THEMES[this.state.mode];
    document.body.style.background = t.paper;
    document.documentElement.style.colorScheme = this.state.mode === 'blue' ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.paper);
  }

  // ---------- sheets and whole-project changes
  resetTransient() { this.undoStack = []; this.redoStack = []; this.drag = null; return { sel: [], editing: null, hover: null, temp: null, draft: null, marquee: null, guides: [], delArm: false }; }
  switchSheet(id) {
    if (id === this.state.doc.active) return;
    this.setState(st => ({ doc: { ...st.doc, active: id }, ...this.resetTransient() }));
  }
  addSheet() {
    const d = this.state.doc;
    const nums = d.sheets.map(s => parseInt(String(s.number).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    const sh = F.newSheet('A-' + (nums.length ? Math.max(...nums) + 1 : 101));
    this.setState({ doc: { ...d, sheets: [...d.sheets, sh], active: sh.id }, ...this.resetTransient() });
  }
  delSheet() {
    if (!this.state.delArm) {
      this.setState({ delArm: true });
      clearTimeout(this._armT);
      this._armT = setTimeout(() => this.setState({ delArm: false }), 2500);
      return;
    }
    const d = this.state.doc, s = this.sheet();
    if (d.sheets.length < 2) return;
    const i = d.sheets.indexOf(s), rest = d.sheets.filter(q => q !== s);
    this.replaceDoc({ ...d, sheets: rest, active: rest[Math.max(0, i - 1)].id }, `Deleted ${s.number}`);
  }
  // Swaps in a new project and offers an undo, because these changes are outside the shape history.
  replaceDoc(doc, msg) {
    const prev = this.state.doc;
    this.setState({ doc, ...this.resetTransient() });
    this.flash(msg, 7000, { label: 'UNDO', run: () => { this.setState({ doc: prev, toast: null, ...this.resetTransient() }); } });
  }
  newDoc() {
    const d = this.state.doc, doc = F.blankDoc();
    doc.settings = { ...d.settings };
    doc.meta.drawnBy = d.meta.drawnBy;
    this.replaceDoc(doc, 'Started a new project');
  }

  // ---------- templates and share links
  addTemplate(id) {
    const tpl = TEMPLATES.find(x => x.id === id);
    if (!tpl) return;
    const d = this.state.doc;
    const nums = d.sheets.map(sh => parseInt(String(sh.number).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    const number = 'A-' + (nums.length ? Math.max(...nums) + 1 : 101);
    const sh = F.cleanSheet({ ...tpl.sheet(), number, view: null }, new Set(d.sheets.map(x => x.id)), number);
    this.setState({ panel: null });
    this.replaceDoc({ ...d, sheets: [...d.sheets, sh], active: sh.id }, `Added the ${tpl.name} template`);
  }
  async openShare() {
    this.setState({ panel: 'share', share: { url: null } });
    try {
      const url = await shareLink(this.state.doc);
      this.setState(st => (st.panel === 'share' ? { share: { url } } : null));
    } catch {
      this.setState(st => (st.panel === 'share' ? { share: { error: true } } : null));
    }
  }
  onHash() { this.checkShared(); }
  // Opens a project from a share link. A reader with a project of their own chooses what happens to it.
  async checkShared() {
    const payload = sharedPayload();
    if (!payload) return;
    const raw = await readShared(payload);
    clearShared();
    const doc = raw && F.cleanDoc(raw);
    if (!doc) { this.flash('This share link is damaged or incomplete. Ask for a new link.', 5000); return; }
    doc.sheets = doc.sheets.map(sh => ({ ...sh, view: null }));
    if (!this._hadStored && !this._savedJSON) { this.replaceDoc(doc, 'Opened a shared project'); return; }
    this.setState({ incoming: doc, panel: 'incoming' });
  }
  acceptShared(mode) {
    const inc = this.state.incoming;
    this.setState({ incoming: null, panel: null });
    if (!inc || mode === 'cancel') return;
    if (mode === 'replace') { this.replaceDoc(inc, 'Opened the shared project'); return; }
    const d = this.state.doc, ids = new Set(d.sheets.map(sh => sh.id));
    const added = inc.sheets.map((sh, i) => F.cleanSheet(sh, ids, 'A-' + (101 + d.sheets.length + i)));
    this.replaceDoc({ ...d, sheets: [...d.sheets, ...added], active: added[0].id }, `Added ${added.length} shared ${added.length === 1 ? 'sheet' : 'sheets'}`);
  }

  onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let data = null;
      try { data = JSON.parse(r.result); } catch { data = null; }
      const doc = F.cleanDoc(data);
      if (doc) {
        doc.sheets = doc.sheets.map(s => ({ ...s, view: null }));
        this.replaceDoc(doc, 'Opened ' + f.name);
        return;
      }
      if (data && Array.isArray(data.nodes)) {
        // A single sheet, for example from another tool: add it to this project.
        const d = this.state.doc, sh = F.cleanSheet({ ...data, view: null }, new Set(d.sheets.map(s => s.id)), 'A-' + (101 + d.sheets.length));
        if (!data.name) sh.name = f.name.replace(/\.json$/i, '');
        this.replaceDoc({ ...d, sheets: [...d.sheets, sh], active: sh.id }, 'Added ' + f.name + ' as a new sheet');
        return;
      }
      this.flash('Could not read that file. Choose a Ferroprint JSON file.', 4000);
    };
    r.onerror = () => this.flash('Could not read that file.', 4000);
    r.readAsText(f);
  }
  exportJSON() {
    this.flushSave();
    const d = this.state.doc;
    F.download(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), `${F.slug(d.meta.project || 'ferroprint')}.ferroprint.json`);
    this.flash('Downloaded JSON');
  }
};

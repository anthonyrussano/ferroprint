// Saving, projects, sheets, templates, share links, and JSON files.
import * as F from '../engine.js';
import { loadCloud, cloudSet, cloudFailed } from '../cloud.js';
import { parseDoc, projectMeta, saveUI, setTabProject, writeJournal, clearJournal, storageUse, keepStorage } from '../storage.js';
import { shareLink, sharedPayload, readShared, clearShared } from '../share.js';
import { TEMPLATES } from '../templates.js';
import { mermaidSheet } from '../mermaid.js';
import { SAVE_DELAY, toolCloud } from './util.js';

// Tabs tell each other when they save or delete a project.
const CHANNEL = 'ferroprint';
// True when two versions of a project differ only in their views and their open sheet.
const sameContent = (a, b) => {
  const strip = d => JSON.stringify({ ...d, active: null, sheets: d.sheets.map(s => ({ ...s, view: null })) });
  return strip(a) === strip(b);
};

export const Project = Base => class extends Base {
  // ---------- persistence
  persist() {
    const st = this.state;
    if (this._mode !== st.mode) { this._mode = st.mode; this.applyTheme(); }
    if (this._doc !== st.doc) { this._doc = st.doc; this.scheduleSave(); }
    const prefs = { snap: st.snap, dims: st.dims, mode: st.mode, clean: st.clean, recent: st.recent, pins: st.pins, project: this.projectId }, ui = JSON.stringify(prefs);
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
    const s = this.sheet(), L = this.letter(), caps = this.state.doc.settings.caps, key = `${L.id}|${caps}|${this.fontGen}`, fix = {};
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
  // Writes the project to the store. Writes run in order, so the last one holds the newest content.
  async flushSave() {
    clearTimeout(this._saveT); this._saveT = null;
    if (this.state.save === 'off') return false;
    const doc = F.pruneFiles(this.state.doc), json = JSON.stringify(doc), id = this.projectId;
    if (json === this._savedJSON) {
      if (this.state.save !== 'saved' && !this._writing) this.setState({ save: 'saved' });
      return true;
    }
    const meta = projectMeta(id, doc);
    this._writing = (this._writing || 0) + 1;
    const ok = await this.store.put(meta, json);
    this._writing--;
    if (id !== this.projectId) return ok;
    if (ok) {
      this._savedJSON = json; this._warned = false;
      if (this._journaled) { this._journaled = false; clearJournal(id); }
      this.post({ type: 'saved', id });
    }
    const save = !ok ? 'error' : this._saveT || this._writing ? 'pending' : 'saved';
    if (this.state.save !== save) this.setState({ save });
    if (!ok && !this._warned) { this._warned = true; this.flash('Could not save. Browser storage is full or blocked. Export JSON to keep your work.', 7000); }
    return ok;
  }
  async saveNow() {
    if (this.state.save === 'off') { this.flash('This browser blocks storage. Use Export JSON to keep your work.', 5000); return; }
    if (await this.flushSave()) this.flash('Saved in this browser');
  }
  // The page can close before an IndexedDB write ends, so unsaved changes also go to a journal at once.
  onHide(e) {
    if (e.type === 'visibilitychange' && document.visibilityState !== 'hidden') return;
    if (this.state.save === 'off') return;
    const doc = F.pruneFiles(this.state.doc), json = JSON.stringify(doc);
    if (json === this._savedJSON) return;
    this._journaled = writeJournal(projectMeta(this.projectId, doc), json) || this._journaled;
    this.flushSave();
  }

  // ---------- other tabs
  openChannel() {
    if (typeof BroadcastChannel !== 'function') return;
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = e => this.onChannel(e.data);
  }
  closeChannel() { if (this.channel) this.channel.close(); }
  post(msg) { if (this.channel) try { this.channel.postMessage({ ...msg, tab: this.tabId }); } catch { /* the channel is closed */ } }
  onChannel(m) {
    if (!m || m.tab === this.tabId) return;
    if (this.state.panel === 'projects') this.refreshProjects();
    if (m.id !== this.projectId) return;
    if (m.type === 'saved') this.pullProject();
    else if (m.type === 'deleted') {
      // Keep the work in this tab. The next save writes the project again.
      this._savedJSON = null;
      this.flash('Another tab deleted this project. Your next change saves it again.', 6000);
    }
  }
  // Another tab saved this project. Take its content, but keep this tab's sheet and view.
  async pullProject() {
    const id = this.projectId, json = await this.store.get(id);
    if (id !== this.projectId || !json || json === this._savedJSON) return;
    const parsed = parseDoc(json);
    if (!parsed) return;
    // A pan, a zoom or a sheet change in the other tab changes nothing here, so this tab keeps its undo history.
    if (sameContent(parsed.doc, F.pruneFiles(this.state.doc))) { this._savedJSON = parsed.json; return; }
    const cur = this.state.doc, inc = parsed.doc, local = new Map(cur.sheets.map(s => [s.id, s]));
    const doc = {
      ...inc,
      active: inc.sheets.some(s => s.id === cur.active) ? cur.active : inc.active,
      sheets: inc.sheets.map(s => (local.has(s.id) ? { ...s, view: local.get(s.id).view } : s))
    };
    clearTimeout(this._saveT); this._saveT = null;
    this._savedJSON = parsed.json; this._doc = doc;
    this.clearHistory(); this.drag = null;
    const act = doc.sheets.find(s => s.id === doc.active), ids = new Set([...act.nodes.map(n => n.id), ...act.edges.map(x => x.id)]);
    const ed = this.state.editing;
    this.setState({ doc, sel: this.state.sel.filter(x => ids.has(x)), editing: ed && ids.has(ed.id) ? ed : null, hover: null, temp: null, draft: null, marquee: null, guides: [], panning: false, save: 'saved' });
  }
  applyTheme() {
    const t = F.THEMES[this.state.mode];
    document.body.style.background = t.paper;
    document.documentElement.style.colorScheme = this.state.mode === 'blue' ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.paper);
  }

  // ---------- projects
  async showProjects() {
    if (this.state.panel === 'projects') { this.setState({ panel: null }); return; }
    this.setState({ panel: 'projects' });
    await this.flushSave();
    this.refreshProjects();
    keepStorage();
  }
  async refreshProjects() {
    const [list, use] = await Promise.all([this.store.list(), storageUse()]);
    this.setState(st => (st.panel === 'projects' ? { projects: { list, use } } : null));
  }
  // Shows a project in this tab. The tab remembers it, so a reload opens the same project.
  showProject(id, doc, json, msg) {
    this.projectId = id; this._savedJSON = json;
    setTabProject(id);
    this.clearHistory();
    this.setState({ doc, panel: null, ...this.resetTransient() });
    if (msg) this.flash(msg, 4000);
  }
  // Saves the open project before a different project takes its place. If the save fails, the
  // project stays open, so its edits are not lost.
  async leaveProject() {
    if (this._busy) { this.flash('Wait for the export to finish.', 3000); return false; }
    if (await this.flushSave()) return true;
    this.flash('Could not save this project, so it stays open. Export JSON to keep a copy, or free some browser storage.', 7000);
    return false;
  }
  async openProject(id) {
    if (id === this.projectId) { this.setState({ panel: null }); return; }
    if (!(await this.leaveProject())) return;
    const json = await this.store.get(id), parsed = json && parseDoc(json);
    if (!parsed) { this.flash('Could not read that project.', 4000); this.refreshProjects(); return; }
    this.showProject(id, parsed.doc, parsed.json, `Opened ${parsed.doc.meta.project || 'the project'}`);
  }
  // A new project goes to the list. The open project stays in the list, so nothing is lost.
  async newProject(doc, msg) {
    // A browser that blocks storage keeps one project. The change then has an undo instead.
    if (this.state.save === 'off') { this.replaceDoc(doc, 'Replaced the project. This browser blocks storage, so it keeps one project.'); return; }
    if (!(await this.leaveProject())) return;
    this.showProject(F.uid(), doc, null, msg);
  }
  async duplicateProject(id) {
    const json = await this.store.get(id), parsed = json && parseDoc(json);
    if (!parsed) { this.flash('Could not read that project.', 4000); return; }
    const doc = { ...parsed.doc, meta: { ...parsed.doc.meta, project: `${parsed.doc.meta.project || 'Untitled project'} copy` } };
    if (await this.store.put(projectMeta(F.uid(), doc), JSON.stringify(doc))) { this.post({ type: 'list' }); this.refreshProjects(); }
    else this.flash('Could not copy the project. Browser storage is full.', 5000);
  }
  async deleteProject(id) {
    if (id === this.projectId) return;
    const [list, json] = await Promise.all([this.store.list(), this.store.get(id)]), meta = list.find(p => p.id === id);
    if (!(await this.store.remove(id))) { this.flash('Could not delete the project.', 4000); return; }
    // A journal from a tab that closed with unsaved changes would bring the project back.
    clearJournal(id);
    this.post({ type: 'deleted', id });
    this.refreshProjects();
    this.flash(`Deleted ${(meta && meta.name) || 'the project'}`, 7000, meta && json ? {
      label: 'UNDO',
      run: async () => { this.setState({ toast: null }); await this.store.put(meta, json); this.post({ type: 'list' }); this.refreshProjects(); }
    } : null);
  }

  // ---------- sheets and whole-project changes
  resetTransient() { this.drag = null; return { sel: [], editing: null, hover: null, temp: null, draft: null, marquee: null, guides: [], delArm: false }; }
  switchSheet(id) {
    if (id === this.state.doc.active) return;
    this.setState(st => ({ doc: { ...st.doc, active: id }, ...this.resetTransient() }));
  }
  // The drawing number after the highest one in the project, such as A-104.
  nextNumber() {
    const nums = this.state.doc.sheets.map(s => parseInt(String(s.number).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    return 'A-' + (nums.length ? Math.max(...nums) + 1 : 101);
  }
  addSheet() {
    const d = this.state.doc;
    const sh = F.newSheet(this.nextNumber());
    this.pushHistory();
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
  // A large change to the project, such as a deleted sheet. The message has an UNDO button, which
  // works while no other change comes after this one.
  replaceDoc(doc, msg) {
    const prev = this.state.doc;
    this.pushHistory();
    this.setState({ doc, ...this.resetTransient() });
    this.flash(msg, 7000, { label: 'UNDO', run: () => { this.setState({ toast: null }); if (this.undoStack[this.undoStack.length - 1] === prev) this.doUndo(); } });
  }
  newDoc() {
    const d = this.state.doc, doc = F.blankDoc();
    doc.settings = { ...d.settings };
    doc.meta.drawnBy = d.meta.drawnBy;
    this.newProject(doc, 'Started a new project. The previous project is in PROJECTS.');
  }

  // ---------- templates and share links
  addTemplate(id) {
    const tpl = TEMPLATES.find(x => x.id === id);
    if (!tpl) return;
    const d = this.state.doc, number = this.nextNumber();
    const sh = F.cleanSheet({ ...tpl.sheet(), number, view: null }, new Set(d.sheets.map(x => x.id)), number);
    this.setState({ panel: null });
    this.replaceDoc({ ...d, sheets: [...d.sheets, sh], active: sh.id }, `Added the ${tpl.name} template`);
  }
  // A Mermaid flowchart or class diagram fills an empty sheet, or else becomes a new sheet.
  // Returns false when the text is not Mermaid. With `quiet`, Mermaid text without shapes also returns false.
  importMermaid(text, quiet = false) {
    let r;
    try {
      r = mermaidSheet(text, { L: this.letter(), caps: this.state.doc.settings.caps, route: this.defRoute(), id: F.uid });
    } catch (err) {
      console.warn(err);
      this.flash('Could not read the Mermaid text.', 4000);
      return true;
    }
    if (!r) return false;
    if (r.error) { if (quiet) return false; this.flash(r.error, 4000); return true; }
    const d = this.state.doc, cur = this.sheet(), number = cur.nodes.length ? this.nextNumber() : cur.number;
    const sh = F.cleanSheet({ ...r, number, view: null }, new Set(d.sheets.filter(s => s.id !== cur.id).map(x => x.id)), number);
    const skipped = r.skipped ? ` Ferroprint skipped ${r.skipped} ${r.skipped === 1 ? 'line' : 'lines'} that it cannot read.` : '';
    this.setState({ panel: null });
    if (!cur.nodes.length) {
      this.pushHistory();
      this.updSheet(s => ({ nodes: sh.nodes, edges: sh.edges, view: null, name: s.name === 'Untitled sheet' ? sh.name : s.name }));
      this.flash(`Drew the Mermaid diagram on this sheet.${skipped}`, skipped ? 6000 : 3000);
    } else this.replaceDoc({ ...d, sheets: [...d.sheets, sh], active: sh.id }, `Added a sheet from Mermaid.${skipped}`);
    return true;
  }
  async openShare() {
    this.setState({ panel: 'share', share: { url: null } });
    try {
      const url = await shareLink(F.pruneFiles(this.state.doc));
      this.setState(st => (st.panel === 'share' ? { share: { url } } : null));
    } catch {
      this.setState(st => (st.panel === 'share' ? { share: { error: true } } : null));
    }
  }
  onHash() { this.checkShared(); }
  // Opens a project from a share link. A reader with projects of their own chooses what happens to it.
  async checkShared() {
    const payload = sharedPayload();
    if (!payload) return;
    const raw = await readShared(payload);
    clearShared();
    const doc = raw && F.cleanDoc(raw);
    if (!doc) { this.flash('This share link is damaged or incomplete. Ask for a new link.', 5000); return; }
    doc.sheets = doc.sheets.map(sh => ({ ...sh, view: null }));
    // On a first visit, the shared project takes the place of the example project.
    if (this._fresh && !this.undoStack.length) { this._fresh = false; this.showProject(this.projectId, doc, null, 'Opened a shared project'); return; }
    this.setState({ incoming: doc, panel: 'incoming' });
  }
  acceptShared(mode) {
    const inc = this.state.incoming;
    this.setState({ incoming: null, panel: null });
    if (!inc || mode === 'cancel') return;
    if (mode === 'new') { this.newProject(inc, 'Opened the shared project as a new project'); return; }
    const d = this.state.doc, ids = new Set(d.sheets.map(sh => sh.id)), files = this.mergeFiles(inc.files);
    const added = inc.sheets.map((sh, i) => F.cleanSheet(sh, ids, 'A-' + (101 + d.sheets.length + i)))
      .map(sh => ({ ...sh, nodes: sh.nodes.map(n => (n.file ? { ...n, file: files.ids[n.file] } : n)) }));
    const merged = files.add ? { ...d, files: { ...(d.files || {}), ...files.add } } : d;
    this.replaceDoc({ ...merged, sheets: [...d.sheets, ...added], active: added[0].id }, `Added ${added.length} shared ${added.length === 1 ? 'sheet' : 'sheets'}`);
  }

  onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) this.readFile(f);
  }
  readFile(f) {
    const r = new FileReader();
    r.onload = () => {
      let data = null;
      try { data = JSON.parse(r.result); } catch { data = null; }
      if (!data && this.importMermaid(r.result)) return;
      const doc = F.cleanDoc(data);
      if (doc) {
        doc.sheets = doc.sheets.map(s => ({ ...s, view: null }));
        this.newProject(doc, `Opened ${f.name} as a new project`);
        return;
      }
      if (data && Array.isArray(data.nodes)) {
        // A single sheet, for example from another tool: add it to this project.
        const d = this.state.doc, sh = F.cleanSheet({ ...data, view: null }, new Set(d.sheets.map(s => s.id)), 'A-' + (101 + d.sheets.length));
        if (!data.name) sh.name = f.name.replace(/\.json$/i, '');
        this.replaceDoc({ ...d, sheets: [...d.sheets, sh], active: sh.id }, 'Added ' + f.name + ' as a new sheet');
        return;
      }
      this.flash('Could not read that file. Choose a Ferroprint JSON file or a Mermaid file.', 4000);
    };
    r.onerror = () => this.flash('Could not read that file.', 4000);
    r.readAsText(f);
  }
  exportJSON() {
    this.flushSave();
    const d = F.pruneFiles(this.state.doc);
    F.download(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), `${F.slug(d.meta.project || 'ferroprint')}.ferroprint.json`);
    this.flash('Downloaded JSON');
  }
};

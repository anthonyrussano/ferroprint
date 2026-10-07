// Local persistence. Each project is a record in IndexedDB. If the browser has no IndexedDB, the
// projects go to localStorage. Every call is safe when the browser blocks or fills the storage.
import { cleanDoc } from './engine.js';

const DB_NAME = 'ferroprint';
const LEGACY_KEY = 'ferroprint.doc.v1';
const UI_KEY = 'ferroprint.ui.v1';
const LIST_KEY = 'ferroprint.projects.v2';
const DOC_PREFIX = 'ferroprint.project.';
const JOURNAL_PREFIX = 'ferroprint.pending.';
const TAB_KEY = 'ferroprint.tab.project';
const OPEN_TIMEOUT = 4000;

function probe(s) {
  try {
    const key = 'ferroprint.probe';
    s.setItem(key, '1');
    s.removeItem(key);
    return s;
  } catch {
    return null;
  }
}
const local = () => { try { return probe(window.localStorage); } catch { return null; } };
const session = () => { try { return probe(window.sessionStorage); } catch { return null; } };

export function parseDoc(json) {
  try {
    const doc = cleanDoc(JSON.parse(json));
    return doc ? { doc, json: JSON.stringify(doc) } : null;
  } catch {
    return null;
  }
}

// The list record of a project. The list shows these fields without the content of each project.
export const projectMeta = (id, doc) => ({ id, name: doc.meta.project || '', sheets: doc.sheets.length, updated: Date.now() });
const newest = list => list.slice().sort((a, b) => b.updated - a.updated);

// ---------- IndexedDB
const result = r => new Promise((ok, bad) => { r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
const complete = tx => new Promise((ok, bad) => { tx.oncomplete = () => ok(true); tx.onerror = tx.onabort = () => bad(tx.error); });

async function openIDB(factory) {
  if (!factory) return null;
  try {
    const open = factory.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('projects', { keyPath: 'id' });
      open.result.createObjectStore('docs', { keyPath: 'id' });
    };
    // A browser can leave the request open, for example when another tab blocks an upgrade.
    const db = await Promise.race([result(open), new Promise((_, bad) => setTimeout(() => bad(new Error('IndexedDB did not open')), OPEN_TIMEOUT))]);
    db.onversionchange = () => db.close();
    const tx = (names, mode) => db.transaction(names, mode);
    return {
      kind: 'idb',
      async list() { return newest(await result(tx('projects').objectStore('projects').getAll())); },
      async get(id) { const r = await result(tx('docs').objectStore('docs').get(id)); return r ? r.json : null; },
      async put(meta, json) {
        const t = tx(['projects', 'docs'], 'readwrite');
        t.objectStore('projects').put(meta);
        t.objectStore('docs').put({ id: meta.id, json });
        return complete(t);
      },
      async remove(id) {
        const t = tx(['projects', 'docs'], 'readwrite');
        t.objectStore('projects').delete(id);
        t.objectStore('docs').delete(id);
        return complete(t);
      }
    };
  } catch {
    return null;
  }
}

// ---------- localStorage, when IndexedDB is not available
function openLocal(s) {
  if (!s) return null;
  const readList = () => { try { const v = JSON.parse(s.getItem(LIST_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
  return {
    kind: 'local',
    async list() { return newest(readList()); },
    async get(id) { return s.getItem(DOC_PREFIX + id); },
    async put(meta, json) {
      s.setItem(DOC_PREFIX + meta.id, json);
      s.setItem(LIST_KEY, JSON.stringify([...readList().filter(p => p.id !== meta.id), meta]));
      return true;
    },
    async remove(id) {
      s.removeItem(DOC_PREFIX + id);
      s.setItem(LIST_KEY, JSON.stringify(readList().filter(p => p.id !== id)));
      return true;
    }
  };
}

const NONE = { kind: 'none', list: async () => [], get: async () => null, put: async () => false, remove: async () => false };

// Every call returns a value. An error gives false, null or an empty list, so the editor can report it.
function safe(store, fallback) {
  return {
    kind: store.kind,
    // True when the browser has IndexedDB, but it did not open. The projects then go to localStorage for this visit.
    fallback: !!fallback,
    list: () => store.list().catch(() => []),
    get: id => store.get(id).catch(() => null),
    put: (meta, json) => store.put(meta, json).then(ok => ok === true, () => false),
    remove: id => store.remove(id).then(ok => ok === true, () => false)
  };
}

export async function openStore(env = {}) {
  const factory = 'indexedDB' in env ? env.indexedDB : typeof indexedDB !== 'undefined' ? indexedDB : null;
  const ls = 'localStorage' in env ? env.localStorage && probe(env.localStorage) : local();
  const idb = await openIDB(factory);
  if (idb) return safe(idb);
  return safe(openLocal(ls) || NONE, !!factory);
}

// ---------- recovery
// A tab that closes with unsaved changes writes them here at once, because the browser can stop
// an IndexedDB write that starts as the page closes. The next start moves them into the store.
export function writeJournal(meta, json) {
  const s = local();
  if (!s) return false;
  try { s.setItem(JOURNAL_PREFIX + meta.id, JSON.stringify({ meta, json })); return true; } catch { return false; }
}
export function clearJournal(id) {
  const s = local();
  if (s) try { s.removeItem(JOURNAL_PREFIX + id); } catch { /* not critical */ }
}

async function recover(store, s) {
  if (!s || store.kind === 'none') return null;
  const list = await store.list(), keys = [];
  for (let i = 0; i < s.length; i++) keys.push(s.key(i));
  for (const key of keys.filter(k => k && k.startsWith(JOURNAL_PREFIX))) {
    try {
      const { meta, json } = JSON.parse(s.getItem(key));
      const cur = list.find(p => p.id === meta.id);
      // A newer save from a tab that is still open wins over the journal.
      if (parseDoc(json) && (!cur || cur.updated < meta.updated)) await store.put(meta, json);
    } catch { /* a damaged journal is dropped */ }
    s.removeItem(key);
  }
  // Projects that a visit saved to localStorage, because IndexedDB did not open then, move into IndexedDB.
  if (store.kind === 'idb' && s.getItem(LIST_KEY) != null) {
    let saved = [];
    try { saved = JSON.parse(s.getItem(LIST_KEY)) || []; } catch { saved = []; }
    let moved = true;
    for (const meta of Array.isArray(saved) ? saved : []) {
      const json = meta && s.getItem(DOC_PREFIX + meta.id), cur = meta && (await store.list()).find(p => p.id === meta.id);
      if (!json || !parseDoc(json) || (cur && cur.updated >= meta.updated)) continue;
      moved = (await store.put(meta, json)) && moved;
    }
    if (moved) {
      (Array.isArray(saved) ? saved : []).forEach(meta => { if (meta) s.removeItem(DOC_PREFIX + meta.id); });
      s.removeItem(LIST_KEY);
    }
  }
  // Ferroprint 1 kept one project in localStorage. Move it into the store as a project.
  const legacy = s.getItem(LEGACY_KEY);
  if (legacy == null) return null;
  const parsed = parseDoc(legacy);
  if (!parsed) return null;
  const meta = projectMeta(Math.random().toString(36).slice(2, 9), parsed.doc);
  if (!(await store.put(meta, parsed.json))) return null;
  // The old key goes, so the next start does not move the project again.
  s.removeItem(LEGACY_KEY);
  return meta.id;
}

// ---------- start
// Opens the store and chooses a project: the one this tab had open, then the last one opened in
// this browser, then the newest one. `fresh` is true when the browser has no projects yet.
export async function boot(env = {}) {
  const store = await openStore(env);
  const s = 'localStorage' in env ? env.localStorage : local();
  const run = async () => {
    const migrated = await recover(store, s);
    const list = await store.list();
    const want = [migrated, tabProject(), loadUI().project, ...list.map(p => p.id)].filter(id => id && list.some(p => p.id === id));
    for (const id of new Set(want)) {
      const json = await store.get(id), parsed = json && parseDoc(json);
      if (parsed) return { store, id, doc: parsed.doc, json: parsed.json, fresh: false };
    }
    return { store, id: null, doc: null, json: null, fresh: !list.length };
  };
  // Two tabs that start at the same time must not both move the old project.
  const locks = typeof navigator !== 'undefined' && navigator.locks;
  return locks ? locks.request('ferroprint-boot', run) : run();
}

export function tabProject() {
  const s = session();
  try { return s ? s.getItem(TAB_KEY) : null; } catch { return null; }
}
export function setTabProject(id) {
  const s = session();
  if (s) try { s.setItem(TAB_KEY, id); } catch { /* not critical */ }
}

export function loadUI() {
  const s = local();
  try {
    const ui = s && JSON.parse(s.getItem(UI_KEY));
    return ui && typeof ui === 'object' ? ui : {};
  } catch {
    return {};
  }
}

export function saveUI(ui) {
  const s = local();
  if (!s) return;
  try { s.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* not critical */ }
}

// The space that this site uses, and the space the browser allows, in bytes.
export async function storageUse() {
  try {
    const e = await navigator.storage.estimate();
    return { used: e.usage || 0, quota: e.quota || 0 };
  } catch {
    return null;
  }
}

// Asks the browser to keep the data when it runs low on space. Some browsers ask the user first.
export async function keepStorage() {
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

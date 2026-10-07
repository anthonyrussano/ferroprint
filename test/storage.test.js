import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { boot, openStore, projectMeta } from '../src/storage.js';
import { exampleDoc, blankDoc } from '../src/engine.js';

// A minimal Storage for Node.
class MemoryStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

let env;
beforeEach(() => { env = { indexedDB: new IDBFactory(), localStorage: new MemoryStorage() }; });

describe.each([
  ['IndexedDB', () => env],
  ['localStorage', () => ({ indexedDB: null, localStorage: env.localStorage })]
])('the %s store', (_, getEnv) => {
  it('saves, lists, reads and deletes projects', async () => {
    const store = await openStore(getEnv());
    const a = exampleDoc(), b = blankDoc();
    expect(await store.put({ ...projectMeta('a', a), updated: 1 }, JSON.stringify(a))).toBe(true);
    expect(await store.put({ ...projectMeta('b', b), updated: 2 }, JSON.stringify(b))).toBe(true);
    const list = await store.list();
    expect(list.map(p => p.id)).toEqual(['b', 'a']);
    expect(list[1]).toMatchObject({ name: 'Acme Commerce', sheets: 3 });
    expect(JSON.parse(await store.get('a')).meta.project).toBe('Acme Commerce');
    expect(await store.remove('a')).toBe(true);
    expect((await store.list()).map(p => p.id)).toEqual(['b']);
    expect(await store.get('a')).toBeNull();
  });
});

describe('boot', () => {
  it('reports a fresh browser', async () => {
    const b = await boot(env);
    expect(b).toMatchObject({ id: null, doc: null, fresh: true });
    expect(b.store.kind).toBe('idb');
  });

  it('moves the single project of Ferroprint 1 into the store', async () => {
    env.localStorage.setItem('ferroprint.doc.v1', JSON.stringify(exampleDoc()));
    const b = await boot(env);
    expect(b.doc.meta.project).toBe('Acme Commerce');
    expect(b.fresh).toBe(false);
    expect(env.localStorage.getItem('ferroprint.doc.v1')).toBeNull();
    expect((await b.store.list()).map(p => p.id)).toEqual([b.id]);
  });

  it('opens the newest project when nothing else is known', async () => {
    const store = await openStore(env), a = exampleDoc(), b = blankDoc();
    b.meta.project = 'Newer';
    await store.put({ ...projectMeta('a', a), updated: 1 }, JSON.stringify(a));
    await store.put({ ...projectMeta('b', b), updated: 2 }, JSON.stringify(b));
    const out = await boot(env);
    expect(out.id).toBe('b');
    expect(out.doc.meta.project).toBe('Newer');
  });

  it('applies a journal that is newer than the stored project', async () => {
    const store = await openStore(env), doc = exampleDoc();
    await store.put({ ...projectMeta('a', doc), updated: 1 }, JSON.stringify(doc));
    const changed = { ...doc, meta: { ...doc.meta, project: 'Changed' } };
    env.localStorage.setItem('ferroprint.pending.a', JSON.stringify({ meta: { ...projectMeta('a', changed), updated: 2 }, json: JSON.stringify(changed) }));
    const out = await boot(env);
    expect(out.doc.meta.project).toBe('Changed');
    expect(env.localStorage.getItem('ferroprint.pending.a')).toBeNull();
  });

  it('ignores a journal that is older than the stored project', async () => {
    const store = await openStore(env), doc = exampleDoc();
    await store.put({ ...projectMeta('a', doc), updated: 5 }, JSON.stringify(doc));
    const old = { ...doc, meta: { ...doc.meta, project: 'Old' } };
    env.localStorage.setItem('ferroprint.pending.a', JSON.stringify({ meta: { ...projectMeta('a', old), updated: 2 }, json: JSON.stringify(old) }));
    expect((await boot(env)).doc.meta.project).toBe('Acme Commerce');
  });

  it('skips a project that does not parse', async () => {
    const store = await openStore(env), doc = exampleDoc();
    await store.put({ id: 'bad', name: '', sheets: 0, updated: 9 }, '{not json');
    await store.put({ ...projectMeta('good', doc), updated: 1 }, JSON.stringify(doc));
    expect((await boot(env)).id).toBe('good');
  });

  it('uses localStorage when IndexedDB is missing', async () => {
    const b = await boot({ indexedDB: null, localStorage: env.localStorage });
    expect(b.store.kind).toBe('local');
  });

  it('reports a browser that blocks all storage', async () => {
    const b = await boot({ indexedDB: null, localStorage: null });
    expect(b.store.kind).toBe('none');
    expect(await b.store.put({ id: 'x' }, '{}')).toBe(false);
  });
});

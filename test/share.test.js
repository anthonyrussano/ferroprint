import { beforeEach, describe, expect, it } from 'vitest';
import { shareLink, sharedPayload, readShared } from '../src/share.js';
import { cleanDoc, exampleDoc } from '../src/engine.js';

beforeEach(() => {
  globalThis.location = { origin: 'https://example.test', pathname: '/ferroprint/', search: '', hash: '' };
});

describe('share links', () => {
  it('carries the project in the fragment and reads it back', async () => {
    const doc = exampleDoc();
    const url = await shareLink(doc);
    expect(url.startsWith('https://example.test/ferroprint/#p=z')).toBe(true);
    location.hash = url.slice(url.indexOf('#'));
    const back = cleanDoc(await readShared(sharedPayload()));
    expect(back.sheets.map(s => s.name)).toEqual(doc.sheets.map(s => s.name));
    expect(back.sheets[0].nodes).toEqual(doc.sheets[0].nodes);
    expect(back.sheets.every(s => s.view === null)).toBe(true);
  });

  it('returns null for a damaged link', async () => {
    expect(await readShared('z!!!')).toBeNull();
    expect(await readShared('zAAAA')).toBeNull();
  });

  it('ignores a fragment that is not a project', () => {
    location.hash = '#section';
    expect(sharedPayload()).toBeNull();
  });
});

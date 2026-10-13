import { describe, expect, it } from 'vitest';
import { fileText, missingIcons } from '../src/editor/live.js';

const doc = {
  meta: { project: 'P' },
  sheets: [
    { id: 's1', view: { x: 1, y: 2, k: 1 }, nodes: [{ id: 'a', type: 'cloud', icon: 'aws/amazon-ec2' }, { id: 'b', type: 'cloud', icon: 'aws/no-such-icon' }], edges: [] },
    { id: 's2', view: null, nodes: [{ id: 'c', type: 'zone', icon: 'aws/no-such-icon' }, { id: 'd', type: 'box' }], edges: [] }
  ],
  active: 's1'
};

describe('live file', () => {
  it('leaves out the view of each sheet, so a pan or a zoom does not change the file', () => {
    const out = JSON.parse(fileText(doc));
    expect(out.sheets.every(s => !('view' in s))).toBe(true);
    expect(fileText(doc)).toBe(fileText({ ...doc, sheets: doc.sheets.map(s => ({ ...s, view: { x: 9, y: 9, k: 2 } })) }));
    expect(fileText(doc).endsWith('}\n')).toBe(true);
  });

  it('lists each cloud icon key that the icon sets do not have, once', () => {
    expect(missingIcons(doc, k => k === 'aws/amazon-ec2')).toEqual(['aws/no-such-icon']);
    expect(missingIcons(doc, () => true)).toEqual([]);
  });
});

// Constants and helpers that the editor modules share.
import { UML } from '../engine.js';
import { SYMBOLS } from '../library.jsx';
import { cloudProvider, isCloudKey, FRAME } from '../cloud.js';

export const SAVE_DELAY = 400;
// The space between the window edge and the sheet. Clean mode removes it.
export const FRAME_INSET = 29;
export const HISTORY_LIMIT = 150;
export const RECENT_MAX = 3;
export const PIN_MAX = 24;
export const PALETTE_TOOLS = new Set(['door']);
// A tool that places a library shape: a symbol, a cloud icon or a frame.
export const isLibraryTool = id => typeof id === 'string' && (!!SYMBOLS[id] || (id.startsWith('cloud:') && isCloudKey(id.slice(6))) || (id.startsWith('frame:') && !!FRAME[id.slice(6)]) || (id.startsWith('uml:') && !!UML[id.slice(4)]));
// The cloud set that a library tool needs.
export const toolCloud = id => (id.startsWith('cloud:') ? cloudProvider(id.slice(6)) : id.startsWith('frame:') && FRAME[id.slice(6)] ? FRAME[id.slice(6)].p : null);
export const without = (o, key) => { const { [key]: _, ...rest } = o; return rest; };

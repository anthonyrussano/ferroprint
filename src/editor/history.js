// Undo and redo for the whole project: shapes, connectors, sheets, the title block and the setup.
// The editor never changes a document in place, so a version is a reference to a document, and
// the versions share every part that did not change.
import { HISTORY_LIMIT } from './util.js';

const pushTo = (stack, doc) => {
  if (stack[stack.length - 1] === doc) return;
  stack.push(doc);
  if (stack.length > HISTORY_LIMIT) stack.shift();
};
// Undo does not move the view. Each sheet keeps its current pan and zoom.
function keepViews(doc, cur) {
  const views = new Map(cur.sheets.map(s => [s.id, s.view]));
  return { ...doc, sheets: doc.sheets.map(s => (views.has(s.id) && views.get(s.id) !== s.view ? { ...s, view: views.get(s.id) } : s)) };
}

export const History = Base => class extends Base {
  // Call this before a change. Changes with the same key in a short time make one step, for example typing.
  pushHistory(key) {
    const now = Date.now();
    if (key && key === this.hKey && now - this.hT < 1200) { this.hT = now; return; }
    this.hKey = key; this.hT = now;
    this.redoStack = [];
    // The updater runs after the updates that come before it, so it sees the version just before this change.
    this.setState(st => { pushTo(this.undoStack, st.doc); return null; });
  }
  // A step goes back to the sheet where the change happened, so the change is in view.
  stepHistory(from, to) {
    if (!from.length) return;
    const p = from.pop();
    this.hKey = null;
    this.setState(st => { pushTo(to, st.doc); return { doc: keepViews(p, st.doc), sel: [], editing: null }; });
  }
  doUndo() { this.stepHistory(this.undoStack, this.redoStack); }
  doRedo() { this.stepHistory(this.redoStack, this.undoStack); }
  clearHistory() { this.undoStack = []; this.redoStack = []; this.hKey = null; }
};

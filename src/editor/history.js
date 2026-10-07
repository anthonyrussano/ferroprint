// Undo and redo: snapshots of the active sheet's shapes and connectors.
import { HISTORY_LIMIT } from './util.js';

export const History = Base => class extends Base {
  // ---------- history: snapshots of the active sheet's shapes and connectors
  pushHistory(key) {
    const now = Date.now();
    if (key && key === this.hKey && now - this.hT < 1200) { this.hT = now; return; }
    this.hKey = key; this.hT = now;
    const s = this.sheet();
    this.undoStack.push(JSON.stringify({ nodes: s.nodes, edges: s.edges }));
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }
  stepHistory(from, to) {
    if (!from.length) return;
    const s = this.sheet();
    to.push(JSON.stringify({ nodes: s.nodes, edges: s.edges }));
    const p = JSON.parse(from.pop());
    this.hKey = null;
    this.updSheet(() => p);
    this.setState({ sel: [], editing: null });
  }
  doUndo() { this.stepHistory(this.undoStack, this.redoStack); }
  doRedo() { this.stepHistory(this.redoStack, this.undoStack); }
};

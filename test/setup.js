// The engine measures text on a canvas. Node has no canvas, so a fixed-width stand-in gives stable sizes.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ font: '', measureText: t => ({ width: String(t).length * 7 }) }) })
  };
}

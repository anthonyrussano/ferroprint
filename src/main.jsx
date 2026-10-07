import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Editor from './Editor.jsx';
import { boot } from './storage.js';
import './styles.css';

// The projects live in IndexedDB, which opens asynchronously. The editor starts when the store is ready.
boot().then(b => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Editor boot={b} />
    </StrictMode>
  );
});

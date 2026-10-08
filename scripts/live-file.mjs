// Live file: with `npm run live`, a project file on disk and the open tab stay in step. An agent or an
// editor writes the file and the tab redraws. A change in the tab goes back to the file. A Mermaid file
// next to it lays out the open sheet again. See docs/LIVE.md.
// The messages go over the websocket of the development server, so the build has none of this.
import fs from 'node:fs';
import path from 'node:path';

// Editors often write a file in more than one step, so a change waits this long before it goes to the tab.
const SETTLE = 120;

export function liveFile(file) {
  if (!file) return null;
  return {
    name: 'ferroprint-live',
    apply: 'serve',
    config: () => ({ define: { 'import.meta.env.FERROPRINT_LIVE': JSON.stringify(file) } }),
    configureServer(server) {
      const json = path.resolve(server.config.root, file), stem = json.replace(/\.json$/i, '');
      const mmd = stem + '.mmd', status = stem + '.status.json';
      const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
      const rel = f => path.relative(server.config.root, f);
      // The text that the server wrote last. A watcher event for it is our own write, so it goes nowhere.
      let written = null;
      const timers = new Map();
      const writeStatus = s => fs.writeFileSync(status, JSON.stringify({ at: new Date().toISOString(), ...s }, null, 2) + '\n');
      fs.mkdirSync(path.dirname(json), { recursive: true });

      const changed = f => {
        if (f !== json && f !== mmd) return;
        clearTimeout(timers.get(f));
        timers.set(f, setTimeout(() => {
          const text = read(f);
          if (!text || !text.trim()) return;
          if (f === mmd) { server.ws.send('ferroprint:live', { kind: 'mermaid', text }); return; }
          if (text === written) return;
          try { JSON.parse(text); } catch (err) {
            const message = `${rel(json)} is not valid JSON: ${err.message}`;
            writeStatus({ ok: false, message });
            server.ws.send('ferroprint:live', { kind: 'error', message });
            return;
          }
          server.ws.send('ferroprint:live', { kind: 'json', text });
        }, SETTLE));
      };
      // The folder, not the files: the watcher misses a file that does not exist yet when the watch starts.
      server.watcher.add(path.dirname(json));
      server.watcher.on('add', changed);
      server.watcher.on('change', changed);

      // A tab starts with the file, or with an empty project when there is no file yet.
      server.ws.on('ferroprint:live-hello', (_data, client) => client.send('ferroprint:live', { kind: 'json', text: read(json), initial: true }));
      server.ws.on('ferroprint:live-save', data => {
        if (!data || typeof data.text !== 'string' || data.text === read(json)) return;
        written = data.text;
        fs.writeFileSync(json, data.text);
      });
      // The tab reports what it drew, so an agent that cannot see the tab can check its change.
      server.ws.on('ferroprint:live-status', data => { if (data && typeof data === 'object') writeStatus(data); });

      server.httpServer?.once('listening', () => {
        server.config.logger.info(`\n  Live file:   ${rel(json)}  (Mermaid: ${rel(mmd)}, status: ${rel(status)})`);
      });
    }
  };
}

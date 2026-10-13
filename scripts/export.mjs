// Exports a Ferroprint project or a Mermaid file without a person at the browser:
//   npm run export -- <file.json|file.mmd|file.md> [--out DIR] [--format png,svg,pdf,json]
//                     [--theme white|blue] [--sheet A-101] [--chrome PATH]
// It starts its own development server with live mode off, so it never joins a live session. It
// opens the project in a headless Chromium and uses the app's own export buttons, so a file looks
// the same as an export from the toolbar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FORMATS = ['png', 'svg', 'pdf', 'json'];
const USAGE = 'usage: npm run export -- <file.json|file.mmd|file.md> [--out DIR] [--format png,svg,pdf,json] [--theme white|blue] [--sheet NUMBER] [--chrome PATH]';

function parseArgs(argv) {
  const o = { out: 'export', format: ['png', 'svg'], theme: 'white', sheet: null, chrome: process.env.FERROPRINT_CHROME || null, input: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--out') o.out = next();
    else if (a === '--format') o.format = next().split(',').map(f => f.trim().toLowerCase()).filter(Boolean);
    else if (a === '--theme') o.theme = next();
    else if (a === '--sheet') o.sheet = next();
    else if (a === '--chrome') o.chrome = next();
    else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else o.input = a;
  }
  if (!o.input) throw new Error('Give the file to export.');
  const bad = o.format.filter(f => !FORMATS.includes(f));
  if (bad.length) throw new Error(`Unknown format ${bad.join(', ')}. Use ${FORMATS.join(', ')}.`);
  if (!['white', 'blue'].includes(o.theme)) throw new Error('--theme is white or blue.');
  return o;
}

// A Chromium from Playwright's cache, then a system Chrome or Chromium.
function findChrome() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const found = [];
  if (fs.existsSync(cache)) {
    fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])).forEach(d => {
      found.push(path.join(cache, d, 'chrome-linux64/chrome'), path.join(cache, d, 'chrome-linux/chrome'),
        path.join(cache, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'), path.join(cache, d, 'chrome-win/chrome.exe'));
    });
  }
  found.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return found.find(p => fs.existsSync(p)) || null;
}

const kindOf = file => (/\.json$/i.test(file) ? 'json' : 'mermaid');

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const text = fs.readFileSync(o.input, 'utf8');
  const chrome = o.chrome || findChrome();
  if (!chrome) throw new Error('No Chromium found. Run `npx playwright install chromium`, or give --chrome PATH or FERROPRINT_CHROME.');
  fs.mkdirSync(o.out, { recursive: true });

  // Live mode is off for this server. vite.config.js turns it on only for FERROPRINT_LIVE or mode "live".
  delete process.env.FERROPRINT_LIVE;
  const { createServer } = await import('vite');
  const { chromium } = await import('playwright-core');
  const server = await createServer({ root, mode: 'development', logLevel: 'error', server: { port: 0, strictPort: false, hmr: false } });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ executablePath: chrome });
  const written = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.error('page error:', e.message));
    await page.goto(base);
    // Build the project in the page, so text sizes come from the real fonts.
    const doc = await page.evaluate(async ({ text, kind }) => {
      const F = await import('/src/engine.js');
      if (kind === 'json') {
        const d = F.cleanDoc(JSON.parse(text));
        if (!d) throw new Error('The file is not a Ferroprint project. It needs a "sheets" array.');
        return d;
      }
      const { mermaidSheet, isMermaid } = await import('/src/mermaid.js');
      const m = /```mermaid\s*\n([\s\S]*?)```/.exec(text), src = m ? m[1] : text;
      if (!isMermaid(src)) throw new Error('The file is not a Ferroprint JSON project or a Mermaid diagram.');
      await document.fonts.ready;
      const d = F.blankDoc();
      const r = await mermaidSheet(src, { L: F.LETTER[d.settings.lettering], caps: d.settings.caps, id: F.uid });
      if (!r || r.error) throw new Error(r ? r.error : 'The Mermaid text has no diagram that Ferroprint reads.');
      const sh = F.cleanSheet({ ...r, number: 'A-101', view: null }, new Set(), 'A-101');
      return { ...d, meta: { ...d.meta, project: sh.name }, sheets: [sh], active: sh.id };
    }, { text, kind: kindOf(o.input) });
    await ctx.close();

    const sheets = o.sheet ? doc.sheets.filter(s => s.number === o.sheet) : doc.sheets;
    if (!sheets.length) throw new Error(`No sheet ${o.sheet}. The sheets are ${doc.sheets.map(s => s.number).join(', ')}.`);
    const perSheet = o.format.filter(f => f === 'png' || f === 'svg'), whole = o.format.filter(f => f === 'pdf' || f === 'json');
    // A new browser context opens a share link at once, without asking, so each sheet gets its own.
    const jobs = sheets.map(s => ({ active: s.id, kinds: perSheet }));
    if (whole.length) jobs.push({ active: doc.active, kinds: whole });
    for (const job of jobs.filter(j => j.kinds.length)) {
      const c = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
      const p = await c.newPage();
      await p.goto(base);
      const link = await p.evaluate(async d => (await import('/src/share.js')).shareLink(d), { ...doc, active: job.active });
      await p.goto(link);
      await p.getByRole('button', { name: 'PNG', exact: true }).waitFor();
      await p.getByRole('button', { name: o.theme === 'blue' ? 'Blue' : 'White', exact: true }).click();
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(500);
      for (const kind of job.kinds) {
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: kind.toUpperCase(), exact: true }).click()]);
        const to = path.join(o.out, dl.suggestedFilename());
        await dl.saveAs(to);
        written.push(to);
        console.log(`${kind.toUpperCase().padEnd(4)} ${to}`);
      }
      await c.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return written;
}

main().catch(err => { console.error(`export: ${err.message}`); process.exit(1); });

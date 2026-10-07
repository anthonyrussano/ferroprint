// The drafting fonts. The app bundles them, so it works offline and sends no request to a font service.
import '@fontsource/architects-daughter/latin-400.css';
import '@fontsource/architects-daughter/latin-ext-400.css';
import '@fontsource/barlow-condensed/latin-400.css';
import '@fontsource/barlow-condensed/latin-ext-400.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-ext-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-ext-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-ext-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import hand400 from '@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff2?url';
import barlow500 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2?url';
import barlow600 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2?url';
import mono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';

const face = (family, weight, url) => ({ family, weight, url });
// An exported SVG cannot use the fonts of the page, so it carries the faces that its lettering needs.
const EXPORT_FACES = {
  technical: [face('Barlow Condensed', 500, barlow500), face('Barlow Condensed', 600, barlow600), face('IBM Plex Mono', 400, mono400)],
  hand: [face('Architects Daughter', 400, hand400), face('Barlow Condensed', 600, barlow600), face('IBM Plex Mono', 400, mono400)]
};

const dataURL = blob => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(blob); });

// Returns @font-face rules with the font files inside, for the lettering `id` ("technical" or "hand").
export async function fontCSS(id, cache) {
  if (cache[id] != null) return cache[id];
  let out = '';
  try {
    for (const f of EXPORT_FACES[id] || []) {
      const data = await dataURL(await (await fetch(f.url)).blob());
      out += `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};src:url(${data}) format('woff2');}\n`;
    }
  } catch {
    out = '';
  }
  cache[id] = out;
  return out;
}

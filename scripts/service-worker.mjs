// A Vite plugin that writes sw.js into the build. The worker keeps the app shell, the latin fonts,
// the icons and the cloud icon sets. The version changes when any of these files change.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const KEEP = name => name !== 'og.png' && !/\.(map|woff)$/.test(name) && !(/\.woff2$/.test(name) && !/-latin(-ext)?-\d+-normal/.test(name));

export function serviceWorker({ publicDir = 'public', template = 'scripts/sw-template.js' } = {}) {
  return {
    name: 'ferroprint-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const hash = createHash('sha256');
      const built = Object.keys(bundle).filter(KEEP).sort();
      built.forEach(name => {
        const item = bundle[name];
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      });
      const pub = readdirSync(publicDir, { recursive: true, withFileTypes: true })
        .filter(d => d.isFile())
        .map(d => relative(publicDir, join(d.parentPath, d.name)).split(sep).join('/'))
        .filter(KEEP)
        .sort();
      pub.forEach(name => hash.update(name).update(readFileSync(join(publicDir, name))));
      const files = ['./', ...built.filter(n => n !== 'index.html'), ...pub];
      const source = readFileSync(template, 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(files, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

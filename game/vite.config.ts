import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** `virtual:embedded-assets`: null normally; in `--mode single` the manifest plus every image as a WebP data URI,
 *  so the single-file build runs straight from disk (double-click) with no server. */
function embeddedAssets(single: boolean): Plugin {
  const id = 'virtual:embedded-assets', rid = '\0' + id;
  return {
    name: 'embedded-assets',
    resolveId: i => (i === id ? rid : null),
    async load(i) {
      if (i !== rid) return null;
      if (!single) return 'export default null';
      const pub = path.resolve(import.meta.dirname, 'public');
      const manifest = JSON.parse(fs.readFileSync(path.join(pub, 'assets/manifest.json'), 'utf8'));
      const files = new Set<string>();
      for (const e of Object.values<any>(manifest)) { if (e.file) files.add(e.file); for (const p of e.pieces || []) files.add(p.file); }
      const data: Record<string, string> = {};
      await Promise.all([...files].map(async f => {
        const buf = await sharp(path.join(pub, f)).webp({ quality: f.endsWith('.jpg') ? 78 : 86, alphaQuality: 90, effort: 5 }).toBuffer();
        data[f] = 'data:image/webp;base64,' + buf.toString('base64');
      }));
      return `export default ${JSON.stringify({ manifest, data })}`;
    },
  };
}

// relative asset paths so the normal build runs from any folder / host (e.g. an itch.io HTML5 zip)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [embeddedAssets(single), ...(single ? [viteSingleFile()] : [])],
    publicDir: single ? false : 'public',
    build: { target: 'es2022', chunkSizeWarningLimit: 40000, outDir: single ? 'dist-single' : 'dist' },
  };
});

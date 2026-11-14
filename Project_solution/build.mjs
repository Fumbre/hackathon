// Build script: one TypeScript codebase → dist/chrome and dist/firefox.
// Usage: node build.mjs [all|chrome|firefox] [--watch] [--zip]
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const which = args.find((a) => !a.startsWith('--')) ?? 'all';
const watch = args.includes('--watch');
const zip = args.includes('--zip');
const targets = which === 'all' ? ['chrome', 'firefox'] : [which];

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const r = (...p) => path.join(ROOT, ...p);

// Every script entry point is bundled into a single IIFE file, so neither
// browser has to deal with ES modules in service workers or content scripts.
const ENTRIES = {
  'background': 'src/background/index.ts',
  'content/ai-badge': 'src/content/ai-badge.ts',
  'popup/popup': 'src/popup/popup.ts',
  'dashboard/dashboard': 'src/dashboard/dashboard.ts',
  'onboarding/onboarding': 'src/onboarding/onboarding.ts',
};

// HTML + CSS that sit next to the scripts.
const PAGES = ['popup', 'dashboard', 'onboarding'];

function manifestFor(target, base, version) {
  const m = structuredClone(base);
  m.version = version;
  if (target === 'chrome') {
    m.background = { service_worker: 'background.js' };
    m.minimum_chrome_version = '116';
  } else {
    // Firefox MV3 uses an event page instead of a service worker.
    m.background = { scripts: ['background.js'] };
    m.browser_specific_settings = {
      gecko: {
        id: 'mothlight@team1.campus-unleashed',
        strict_min_version: '140.0',
        // Firefox's built-in data-consent declaration: we collect nothing.
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    };
  }
  return m;
}

async function copyAssets(out) {
  // Static files (icons, Nocturne stylesheet).
  await cp(r('static'), out, { recursive: true });

  // Pages: html + css.
  for (const page of PAGES) {
    await mkdir(path.join(out, page), { recursive: true });
    for (const file of await readdir(r('src', page))) {
      if (file.endsWith('.html') || file.endsWith('.css')) {
        await cp(r('src', page, file), path.join(out, page, file));
      }
    }
  }

  // Inter font, vendored locally (no Google Fonts request).
  const fontsOut = path.join(out, 'fonts');
  await mkdir(fontsOut, { recursive: true });
  let faces = '';
  for (const weight of [400, 500, 600]) {
    for (const subset of ['latin', 'latin-ext', 'cyrillic']) {
      const name = `inter-${subset}-${weight}-normal.woff2`;
      await cp(r('node_modules/@fontsource/inter/files', name), path.join(fontsOut, name));
      faces += `@font-face{font-family:"Inter";font-style:normal;font-weight:${weight};font-display:swap;src:url("./${name}") format("woff2");}\n`;
    }
  }
  await writeFile(path.join(fontsOut, 'inter.css'), faces);

  // Phosphor icons (regular + fill), vendored locally, woff2 only.
  for (const [dir, font] of [['regular', 'Phosphor'], ['fill', 'Phosphor-Fill']]) {
    const src = r('node_modules/@phosphor-icons/web/src', dir);
    const dst = path.join(out, 'phosphor', dir);
    await mkdir(dst, { recursive: true });
    await cp(path.join(src, `${font}.woff2`), path.join(dst, `${font}.woff2`));
    let css = await readFile(path.join(src, 'style.css'), 'utf8');
    css = css.replace(/src:[^;]+;/, `src: url("./${font}.woff2") format("woff2");`);
    await writeFile(path.join(dst, 'style.css'), css);
  }
}

/** Every file under `dir`, as paths relative to it. */
async function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(path.relative(base, p));
  }
  return out;
}

/**
 * Make `dest` match `src` without ever emptying `dest`: files are overwritten in place,
 * then stale ones removed. `npm run run:firefox` (web-ext) watches dist/firefox and reloads
 * the extension on every change; deleting the folder first made it reload a half-empty build.
 */
async function syncDir(src, dest) {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
  const keep = new Set(await listFiles(src));
  for (const f of await listFiles(dest)) if (!keep.has(f)) await rm(path.join(dest, f), { force: true });
}

async function buildTarget(target) {
  const final = r('dist', target);
  // Watch mode writes straight into dist; a one-off build is staged first, then synced in.
  const out = watch ? final : r('dist', `.staging-${target}`);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const pkg = JSON.parse(await readFile(r('package.json'), 'utf8'));
  const base = JSON.parse(await readFile(r('manifest.base.json'), 'utf8'));
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifestFor(target, base, pkg.version), null, 2));
  await copyAssets(out);

  const options = {
    entryPoints: Object.fromEntries(Object.entries(ENTRIES).map(([k, v]) => [k, r(v)])),
    outdir: out,
    bundle: true,
    format: 'iife',
    target: ['chrome116', 'firefox140'],
    sourcemap: watch ? 'inline' : false,
    define: { __TARGET__: JSON.stringify(target) },
    logLevel: 'info',
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
    await syncDir(out, final);
    await rm(out, { recursive: true, force: true });
  }

  if (zip) {
    await mkdir(r('release'), { recursive: true });
    const file = r('release', `mothlight-${target}-${pkg.version}.zip`);
    if (existsSync(file)) await rm(file);
    execFileSync('zip', ['-qr', file, '.'], { cwd: final });
    console.log(`zipped → ${path.relative(ROOT, file)}`);
  }
  console.log(`built ${target} → dist/${target}`);
}

for (const t of targets) await buildTarget(t);

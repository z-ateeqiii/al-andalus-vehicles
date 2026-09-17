/**
 * Packages the Angular SSR build for Vercel using the Build Output API v3.
 *
 *   ng build && node scripts/vercel-output.mjs      (this is `npm run build`)
 *
 * Why this exists: with `outputMode: "server"` the build writes
 * `dist/al-andalus/browser` (with `index.csr.html`, no `index.html`) and a
 * self-contained Express server in `dist/al-andalus/server`. Vercel's Angular
 * preset deployed only the browser folder, so no function ever ran and every
 * deep link hit Vercel's own 404.
 *
 * When the build leaves a `.vercel/output` directory behind, Vercel deploys
 * exactly that:
 *
 *   .vercel/output/static/              ← dist/al-andalus/browser, served by the CDN
 *   .vercel/output/functions/ssr.func/  ← dist/al-andalus/server + a small launcher
 *   .vercel/output/config.json          ← real files first, everything else → /ssr
 *
 * The server bundle imports only Node built-ins, so it is copied as-is with no
 * node_modules. It only calls `listen()` when run directly, so importing it
 * from the launcher is safe.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist', 'al-andalus');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'ssr.func');

for (const required of [join(dist, 'browser'), join(dist, 'server', 'server.mjs')]) {
  if (!existsSync(required)) {
    console.error(`vercel-output: ${required} is missing — run ng build first.`);
    process.exit(1);
  }
}

// Only `.vercel/output` is replaced; `.vercel/project.json` from `vercel link`
// is left alone.
rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

cpSync(join(dist, 'browser'), join(out, 'static'), { recursive: true });
cpSync(join(dist, 'server'), fn, { recursive: true });

const write = (path, value) =>
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);

write(join(fn, 'package.json'), { type: 'module' });

/**
 * The route below rewrites every non-file request to `/ssr` and passes the
 * original path along as `__pathname`, because the function would otherwise
 * see the rewritten URL. The launcher puts the real path back before Express
 * and Angular look at it. A request that already carries its own path (no
 * `__pathname`) is passed through untouched.
 */
write(
  join(fn, 'index.mjs'),
  `import { reqHandler } from './server.mjs';

export default function handler(req, res) {
  const params = new URLSearchParams((req.url ?? '/').split('?')[1] ?? '');
  const pathname = params.get('__pathname');

  if (pathname !== null) {
    params.delete('__pathname');
    const query = params.toString();
    req.url = '/' + pathname.replace(/^\\/+/, '') + (query ? '?' + query : '');
  }

  return reqHandler(req, res);
}
`,
);

write(join(fn, '.vc-config.json'), {
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  supportsResponseStreaming: true,
});

write(join(out, 'config.json'), {
  version: 3,
  routes: [
    // Hashed build output never changes under the same name.
    {
      src: '^/(?:chunk|main|polyfills|styles)-[A-Za-z0-9]+\\.(?:js|css)$',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    // Fonts, favicon and bundles are served straight from the CDN.
    { handle: 'filesystem' },
    // Everything else — pages, /sitemap.xml, /robots.txt — is rendered.
    { src: '^/(.*)$', dest: '/ssr?__pathname=/$1' },
  ],
});

console.log(`vercel-output: wrote ${out}`);

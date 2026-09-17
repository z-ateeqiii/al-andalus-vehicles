import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore, orderBy, query, where } from 'firebase/firestore';
import { environment } from './environments/environment';
import { PUBLIC_VEHICLE_STATUSES } from './app/core/models/vehicle.model';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
/**
 * Vercel's edge sets these on every request it forwards to the function.
 * Any `x-forwarded-*` header outside this list makes the engine log a warning
 * and silently serve the client-rendered shell instead of SSR — a 200 with an
 * empty `<app-root>` — so `x-forwarded-for` has to be here even though the
 * URL is never built from it. `x-forwarded-prefix` is left out: Vercel does
 * not set it, so trusting it would only trust the caller.
 */
const angularApp = new AngularNodeAppEngine({
  trustProxyHeaders: ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-forwarded-for'],
});

const SITEMAP_APP_NAME = 'al-andalus-sitemap';

interface SitemapEntry {
  readonly loc: string;
  readonly priority: string;
  readonly changefreq: string;
  readonly lastmod?: string;
}

/** The origin this request arrived on, so previews and production both work. */
function originOf(req: express.Request): string {
  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0];
  const protocol = forwardedProto || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;

  return host ? `${protocol}://${host}` : environment.siteUrl;
}

function sitemapFirestore() {
  const firebaseApp = getApps().some((a) => a.name === SITEMAP_APP_NAME)
    ? getApp(SITEMAP_APP_NAME)
    : initializeApp(environment.firebase, SITEMAP_APP_NAME);

  return getFirestore(firebaseApp);
}

/**
 * `/sitemap.xml`, generated from Firestore at request time.
 *
 * Not prerendered, because inventory changes whenever the owner adds or sells
 * a vehicle and a stale sitemap is worse than none.
 */
app.get('/sitemap.xml', (req, res) => {
  const origin = originOf(req);

  const staticEntries: SitemapEntry[] = [
    { loc: `${origin}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${origin}/vehicles`, priority: '0.9', changefreq: 'daily' },
  ];

  getDocs(
    query(
      collection(sitemapFirestore(), 'vehicles'),
      where('status', 'in', [...PUBLIC_VEHICLE_STATUSES]),
      orderBy('createdAt', 'desc'),
    ),
  )
    .then((snapshot) => {
      const vehicleEntries: SitemapEntry[] = snapshot.docs.map((doc) => {
        const updatedAt: unknown = doc.data()['updatedAt'];
        const lastmod =
          updatedAt && typeof updatedAt === 'object' && 'seconds' in updatedAt
            ? new Date((updatedAt as { seconds: number }).seconds * 1000).toISOString()
            : undefined;

        return {
          loc: `${origin}/vehicles/${doc.id}`,
          priority: '0.8',
          changefreq: 'weekly',
          lastmod,
        };
      });

      const urls = [...staticEntries, ...vehicleEntries]
        .map((entry) =>
          [
            '  <url>',
            `    <loc>${entry.loc}</loc>`,
            entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
            `    <changefreq>${entry.changefreq}</changefreq>`,
            `    <priority>${entry.priority}</priority>`,
            '  </url>',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n');

      res
        .status(200)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .set('Cache-Control', 'public, max-age=600')
        .send(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        );
    })
    .catch(() => {
      // Still advertise the stable pages if Firestore is unreachable.
      const urls = staticEntries
        .map((entry) => `  <url>\n    <loc>${entry.loc}</loc>\n  </url>`)
        .join('\n');

      res
        .status(200)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .send(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        );
    });
});

/** `/robots.txt`. The admin area is never indexed. */
app.get('/robots.txt', (req, res) => {
  const origin = originOf(req);

  res
    .status(200)
    .set('Content-Type', 'text/plain; charset=utf-8')
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        '',
        `Sitemap: ${origin}/sitemap.xml`,
        '',
      ].join('\n'),
    );
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlib, createGzip, gzip } from 'node:zlib';
import { createBackendClient, type BackendQueryClient } from './backend.ts';
import { isDynamicRoute, resolvePage, resolveSiteName, resolveSitemap } from './pages.ts';
import {
  canonicalLocalizedPath,
  isMarketingPath,
  parseInstanceMode,
  type InstanceMode,
} from './public-routes.ts';
import { localeOfPath } from '../src/shared/localizedRoutes.ts';
import { isAppRoute } from '../src/shared/appRoutes.ts';
import { shortProductLinkTarget } from '../src/shared/productLinks.ts';
import {
  injectRuntime,
  rewriteSiteUrl,
  type ClientConfig,
  type RuntimeOptions,
} from './runtime.ts';
import { injectHead, notFoundMeta } from './seo.ts';

/**
 * Production web server for the frontend. Serves the Vite build like the
 * previous nginx config (prerendered pages, SPA shell fallback, immutable
 * assets) and adds server-side SEO for data-driven public pages and a live
 * sitemap.
 */

export interface ServerOptions {
  distDir: string;
  siteUrl: string;
  /** The backend for server-side SEO and the live sitemap; null serves the build only */
  backend: BackendQueryClient | null;
  /** Values the browser reads at startup instead of the ones baked into the build */
  clientConfig?: ClientConfig;
  /** Site URL the build was prerendered with; replaced by siteUrl in served pages */
  buildSiteUrl?: string;
  /** `single`: no landing and marketing pages, the app decides what `/` shows */
  mode?: InstanceMode;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  // QR decoder of the scanner (zxing-wasm); browsers compile it while it loads only with this type
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

// Text files that may contain the build-time site URL or need the config script
const REWRITTEN = new Set(['.html', '.xml', '.txt']);
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json|wasm)|image\/svg\+xml)/;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function acceptsGzip(req: IncomingMessage): boolean {
  return /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
}

function send(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  contentType: string,
  cacheControl: string,
  body: string
) {
  const gzip = COMPRESSIBLE.test(contentType) && acceptsGzip(req);
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': Buffer.byteLength(body) }),
  });
  if (req.method === 'HEAD') return res.end();
  if (!gzip) return res.end(body);
  const stream = createGzip();
  stream.pipe(res);
  stream.end(body);
}

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);

type Encoding = 'br' | 'gzip';

/** Brotli where the browser takes it: the main script is an eighth smaller than with gzip. */
function assetEncoding(req: IncomingMessage): Encoding | null {
  const accepted = String(req.headers['accept-encoding'] ?? '');
  if (/\bbr\b/.test(accepted)) return 'br';
  return /\bgzip\b/.test(accepted) ? 'gzip' : null;
}

/**
 * Compressed copies of the hashed assets, made once per file and encoding and kept in
 * memory: the files never change and there are only those of the build. Compressing the
 * main script for every request cost 75 ms CPU, so 20 new visitors per second kept both
 * cores of the server busy (load test of 16.11.2026).
 */
type AssetCache = Map<string, Promise<Buffer>>;

function compressedAsset(cache: AssetCache, filePath: string, encoding: Encoding) {
  const key = `${encoding}:${filePath}`;
  let copy = cache.get(key);
  if (!copy) {
    copy = readFile(filePath).then((raw) =>
      encoding === 'br'
        ? compressBrotli(raw, {
            params: {
              // 11 would save another 8 % but takes seconds, which the first visitor waits
              [zlib.BROTLI_PARAM_QUALITY]: 9,
              [zlib.BROTLI_PARAM_SIZE_HINT]: raw.length,
            },
          })
        : compressGzip(raw, { level: 9 })
    );
    copy.catch(() => cache.delete(key));
    cache.set(key, copy);
  }
  return copy;
}

async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  size: number,
  cacheControl: string,
  assets: AssetCache | null
) {
  const contentType = contentTypeFor(filePath);
  const compressible = COMPRESSIBLE.test(contentType);
  const encoding = compressible && assets ? assetEncoding(req) : null;
  if (encoding && assets) {
    const body = await compressedAsset(assets, filePath, encoding);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      Vary: 'Accept-Encoding',
      'Content-Encoding': encoding,
      'Content-Length': body.length,
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  const gzip = compressible && acceptsGzip(req);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': size }),
  });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(filePath);
  if (gzip) stream.pipe(createGzip()).pipe(res);
  else stream.pipe(res);
}

/** Resolves a URL path inside distDir; null for paths escaping it. */
function resolveInDist(distDir: string, urlPath: string): string | null {
  const resolved = path.resolve(distDir, `.${urlPath}`);
  return resolved === distDir || resolved.startsWith(`${distDir}${path.sep}`) ? resolved : null;
}

async function findFile(filePath: string | null): Promise<{ path: string; size: number } | null> {
  if (!filePath) return null;
  try {
    const info = await stat(filePath);
    if (info.isFile()) return { path: filePath, size: info.size };
    if (info.isDirectory()) {
      const index = path.join(filePath, 'index.html');
      const indexInfo = await stat(index);
      if (indexInfo.isFile()) return { path: index, size: indexInfo.size };
    }
  } catch {
    // not found
  }
  return null;
}

export async function createServer({
  distDir,
  siteUrl,
  backend,
  clientConfig = {},
  buildSiteUrl,
  mode = 'platform',
}: ServerOptions): Promise<Server> {
  const root = path.resolve(distDir);
  const runtime: RuntimeOptions = {
    clientConfig: { ...clientConfig, mode },
    buildSiteUrl,
    siteUrl,
  };
  // spa.html is the unrendered shell; index.html is the prerendered landing page
  const shellHtml = injectRuntime(
    await readFile(path.join(root, 'spa.html'), 'utf8').catch(() =>
      readFile(path.join(root, 'index.html'), 'utf8')
    ),
    runtime
  );

  const assets: AssetCache = new Map();

  return createHttpServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }

      let pathname: string;
      let search: string;
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        pathname = decodeURIComponent(url.pathname);
        search = url.search;
      } catch {
        res.writeHead(400).end();
        return;
      }

      // `/Features/` or `/en/`: one address per page and language
      const canonicalPath = canonicalLocalizedPath(pathname);
      if (canonicalPath) {
        res.writeHead(301, {
          Location: `${canonicalPath}${search}`,
          'Cache-Control': 'public, max-age=86400',
        });
        res.end();
        return;
      }

      // The address decides the language of these pages; Bing reads it from the header
      const pageLanguage = localeOfPath(pathname);
      if (pageLanguage) res.setHeader('Content-Language', pageLanguage);

      // Short link of a printed label: permanent, the labels stay in circulation
      const productPage = shortProductLinkTarget(pathname);
      if (productPage) {
        res.writeHead(301, { Location: productPage, 'Cache-Control': 'public, max-age=86400' });
        res.end();
        return;
      }

      if (pathname === '/healthz') {
        send(req, res, 200, 'text/plain; charset=utf-8', REVALIDATE, 'ok');
        return;
      }

      if (pathname === '/sitemap.xml' && backend) {
        const sitemap = await resolveSitemap(backend, siteUrl, mode);
        if (sitemap) {
          send(req, res, 200, CONTENT_TYPES['.xml'], 'public, max-age=300', sitemap);
          return;
        }
        // Backend unavailable: fall through to the sitemap generated at build time
      }

      // The prerendered landing and marketing pages advertise BazarPro itself
      if (mode === 'single' && isMarketingPath(pathname)) {
        send(req, res, 200, CONTENT_TYPES['.html'], REVALIDATE, shellHtml);
        return;
      }

      if (isDynamicRoute(pathname)) {
        const page = backend
          ? await resolvePage(pathname, backend, siteUrl, await resolveSiteName(backend, mode))
          : null;
        const html = page ? injectHead(shellHtml, page.meta) : shellHtml;
        send(req, res, page?.status ?? 200, CONTENT_TYPES['.html'], REVALIDATE, html);
        return;
      }

      const file = await findFile(resolveInDist(root, pathname));
      if (file) {
        const hashed = pathname.startsWith('/assets/');
        const cacheControl = hashed ? IMMUTABLE : REVALIDATE;
        const ext = path.extname(file.path).toLowerCase();
        if (!pathname.startsWith('/assets/') && REWRITTEN.has(ext)) {
          const text = await readFile(file.path, 'utf8');
          const body =
            ext === '.html' ? injectRuntime(text, runtime) : rewriteSiteUrl(text, runtime);
          send(req, res, 200, contentTypeFor(file.path), cacheControl, body);
          return;
        }
        await sendFile(req, res, file.path, file.size, cacheControl, hashed ? assets : null);
        return;
      }

      if (pathname.startsWith('/assets/') || path.extname(pathname)) {
        send(req, res, 404, 'text/plain; charset=utf-8', REVALIDATE, 'Not found');
        return;
      }

      // Client-side route: the SPA decides what to render
      if (isAppRoute(pathname)) {
        send(req, res, 200, CONTENT_TYPES['.html'], REVALIDATE, shellHtml);
        return;
      }

      // Unknown path: the app sends visitors to the start page, search engines get a 404
      const siteName = backend ? await resolveSiteName(backend, mode) : undefined;
      send(
        req,
        res,
        404,
        CONTENT_TYPES['.html'],
        REVALIDATE,
        injectHead(shellHtml, notFoundMeta(siteName))
      );
    } catch (err) {
      console.error('[server] request failed', req.url, err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}

async function main() {
  const port = Number(process.env.PORT ?? 8080);
  const distDir = process.env.DIST_DIR ?? fileURLToPath(new URL('../dist', import.meta.url));
  const siteUrl = (process.env.SITE_URL ?? 'https://bazarpro.de').replace(/\/+$/, '');
  // Inside the network, e.g. http://backend:3000; browsers reach it under SITE_URL/api
  const backendUrl = process.env.BACKEND_URL;
  const mode = parseInstanceMode(process.env.BAZARPRO_MODE);
  if (!backendUrl) {
    console.warn('[server] BACKEND_URL not set, serving without server-side SEO');
  }

  const server = await createServer({
    distDir,
    siteUrl,
    backend: backendUrl ? createBackendClient(backendUrl) : null,
    clientConfig: {
      siteUrl,
      plausibleDomain: process.env.PLAUSIBLE_DOMAIN,
      plausibleApiHost: process.env.PLAUSIBLE_API_HOST,
    },
    buildSiteUrl: process.env.BUILD_SITE_URL?.replace(/\/+$/, ''),
    mode,
  });
  server.listen(port, () =>
    console.log(`[server] listening on :${port} (site ${siteUrl}, mode ${mode})`)
  );

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}

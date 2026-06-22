#!/usr/bin/env node
/**
 * Local-only CMS server for the lab mini-site. Not deployed — run on your machine,
 * edit posts via lab/admin.html. Saving writes the post's JSON but does NOT rebuild
 * the static site — posts stay "draft" until you click Build (or POST /api/build).
 *
 *   Run: node admin-server.js
 *   Open: http://localhost:4848/admin.html
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { listPosts, getPost, savePost, deletePost, reorderPosts, markDraft, readDraftSlugs, IMAGES_DIR, ROOT } = require('./lib');

// Re-require build.js (and lib.js, which it depends on) fresh from disk on every build,
// so edits to either file take effect without restarting this server.
function freshBuild() {
  delete require.cache[require.resolve('./build')];
  delete require.cache[require.resolve('./lib')];
  return require('./build').build();
}

const PORT = 4848;
const SITE_ROOT = ROOT;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.xml': 'application/xml', '.ico': 'image/x-icon',
};

// ---------- live reload (dev only) ----------
const reloadClients = new Set();

function notifyReload(kind = 'reload') {
  for (const client of reloadClients) {
    try { client.write(`data: ${kind}\n\n`); } catch { /* dropped on next close */ }
  }
}

function handleLiveReload(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 1000\n\n');
  reloadClients.add(res);
  req.on('close', () => reloadClients.delete(res));
}

// Watch the stylesheets so editing css/*.css hot-swaps without a full rebuild.
let cssDebounce = null;
try {
  fs.watch(path.join(ROOT, 'css'), () => {
    clearTimeout(cssDebounce);
    cssDebounce = setTimeout(() => notifyReload('css'), 80);
  });
} catch { /* no css dir yet — fine */ }

const LIVE_RELOAD_SNIPPET = `
<script>
(function () {
  try {
    var es = new EventSource('/api/livereload');
    es.onmessage = function (e) {
      if (e.data === 'css') {
        document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
          var u = new URL(l.href, location.href);
          if (u.host !== location.host) return; // skip CDN stylesheets
          u.searchParams.set('_lr', Date.now());
          l.href = u.href;
        });
      } else {
        location.reload();
      }
    };
  } catch (_) {}
})();
</script>
`;

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/livereload' && req.method === 'GET') {
    return handleLiveReload(req, res);
  }
  if (url.pathname === '/api/posts' && req.method === 'GET') {
    const drafts = new Set(readDraftSlugs());
    return sendJson(res, 200, listPosts().map(p => ({ ...p, draft: drafts.has(p.slug) })));
  }
  if (url.pathname.startsWith('/api/posts/') && req.method === 'GET') {
    const slug = decodeURIComponent(url.pathname.slice('/api/posts/'.length));
    const post = getPost(slug);
    return post ? sendJson(res, 200, post) : sendJson(res, 404, { error: 'Not found' });
  }
  if (url.pathname === '/api/posts' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const saved = savePost(body);
    markDraft(saved.slug);
    return sendJson(res, 200, { ...saved, draft: true });
  }
  if (url.pathname.startsWith('/api/posts/') && req.method === 'DELETE') {
    const slug = decodeURIComponent(url.pathname.slice('/api/posts/'.length));
    deletePost(slug);
    return sendJson(res, 200, { ok: true });
  }
  if (url.pathname === '/api/reorder' && req.method === 'POST') {
    const { slugs } = JSON.parse((await readBody(req)).toString('utf8'));
    if (!Array.isArray(slugs)) return sendJson(res, 400, { error: 'Expected { slugs: [...] }' });
    reorderPosts(slugs);
    slugs.forEach(markDraft);
    return sendJson(res, 200, { ok: true });
  }
  if (url.pathname === '/api/upload' && req.method === 'POST') {
    const { filename, dataUrl } = JSON.parse((await readBody(req)).toString('utf8'));
    const m = /^data:([\w/+.-]+);base64,(.*)$/.exec(dataUrl || '');
    if (!m) return sendJson(res, 400, { error: 'Invalid data URL' });
    const ext = (filename.match(/\.[a-zA-Z0-9]+$/) || ['.bin'])[0].toLowerCase();
    const safeName = `${Date.now()}-${path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9_-]+/g, '-')}${ext}`;
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMAGES_DIR, safeName), Buffer.from(m[2], 'base64'));
    return sendJson(res, 200, { filename: safeName });
  }
  if (url.pathname === '/api/build' && req.method === 'POST') {
    freshBuild();
    notifyReload('reload');
    return sendJson(res, 200, { ok: true });
  }
  sendJson(res, 404, { error: 'Unknown API route' });
}

function serveStatic(req, res, url) {
  let filePath = path.join(SITE_ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/') filePath = path.join(ROOT, 'admin.html');
  if (!filePath.startsWith(SITE_ROOT)) return send(res, 403, 'Forbidden');
  fs.stat(filePath, (err, stat) => {
    if (err) return send(res, 404, 'Not found');
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) return send(res, 404, 'Not found');
      const ext = path.extname(filePath);
      // inject the live-reload client into site pages (not the CMS editor itself)
      if (ext === '.html' && path.basename(filePath) !== 'admin.html') {
        let html = data.toString('utf8');
        html = html.includes('</body>')
          ? html.replace('</body>', `${LIVE_RELOAD_SNIPPET}</body>`)
          : html + LIVE_RELOAD_SNIPPET;
        return send(res, 200, html, { 'Content-Type': 'text/html' });
      }
      send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Lab CMS running at http://localhost:${PORT}/lab/admin.html`);
});

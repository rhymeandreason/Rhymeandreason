#!/usr/bin/env node
/**
 * Static site generator for the lab mini-site.
 *
 *   - Posts live as JSON in lab/data/posts/<slug>.json (3 types: note, journal, artifact)
 *   - Run: node lab/build.js
 *   - Generates lab/index.html (grid + modal), lab/<type>/<slug>.html (direct-link pages), lab/feed.xml
 */
const fs = require('fs');
const path = require('path');
const { md, preview, escapeHtml, listPosts, clearDrafts, ROOT } = require('./lib');

const SITE = {
  title: 'Rhyme & Reason - lab and studio',
  description: 'Notes, journals, and artifacts from ongoing work.',
  url: 'https://rhymeandreason.studio',
  basePath: '/',
  author: 'Mary Huang',
};

const escapeXml = escapeHtml;
const formatDate = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
const rfc822 = d => new Date((d || '1970-01-01') + 'T12:00:00Z').toUTCString();

function postUrl(p) { return `${p.type}/${p.slug}.html`; }

// ---------- render each post's inner content (shared by standalone page + modal template) ----------
function renderPost(p, imgBase = '../images/') {
  if (p.type === 'note' || p.type === 'journal') {
    const images = (p.images || []).map(src => `<img class="post-image" src="${imgBase}${escapeHtml(src)}" alt="">`).join('\n');
    return `<div class="post-content post-content--${p.type}">
      <p class="post-date">${formatDate(p.date)}</p>
      ${p.title ? `<h1 class="post-title">${escapeHtml(p.title)}</h1>` : ''}
      <div class="post-body">${md(p.body)}</div>
      ${images ? `<div class="post-images">${images}</div>` : ''}
    </div>`;
  }
  // artifact
  const notes = (p.notes || []).map(n => `<div class="artifact-note">
        ${n.title ? `<h3>${escapeHtml(n.title)}</h3>` : ''}
        ${n.date ? `<p class="post-date">${formatDate(n.date)}</p>` : ''}
        <div class="post-body">${md(n.body)}</div>
        ${(n.images || []).map(src => `<img class="post-image" src="${imgBase}${escapeHtml(src)}" alt="">`).join('\n')}
      </div>`).join('\n');
  return `<div class="post-content post-content--artifact">
    ${p.mainImage ? `<img class="artifact-main-image" src="${imgBase}${escapeHtml(p.mainImage)}" alt="">` : ''}
    <h1 class="post-title">${escapeHtml(p.title)}</h1>
    ${p.subtitle ? `<p class="post-subtitle">${escapeHtml(p.subtitle)}</p>` : ''}
    <div class="post-body">${md(p.description)}</div>
    ${notes ? `<div class="artifact-notes">${notes}</div>` : ''}
  </div>`;
}

function cardPreviewHtml(p) {
  if (p.type === 'artifact') {
    return `${p.mainImage ? `<img class="card-image" src="images/${escapeHtml(p.mainImage)}" alt="">` : ''}
      <div class="card-text">
      <h2 class="card-title">${escapeHtml(p.title)}</h2>
      ${p.subtitle ? `<p class="card-subtitle">${escapeHtml(p.subtitle)}</p>` : ''}
      </div>`;
  }
  const meta = `<p class="card-meta">${p.type === 'journal' ? `<span class="card-kicker">Journal</span>` : ''}<span class="card-date">${formatDate(p.date)}</span></p>`;
  const main = `${p.title ? `<h2 class="card-title">${escapeHtml(p.title)}</h2>` : ''}
      ${(p.images && p.images[0]) ? `<img class="card-image" src="images/${escapeHtml(p.images[0])}" alt="">` : ''}`;

  if (p.type === 'journal' && p.blurb) {
    if (p.columns === 2 || p.columns === 3) {
      return `${meta}
      <div class="card-cols">
      <div class="card-col-main">${main}</div>
      <div class="card-col-blurb"><p class="card-blurb">${escapeHtml(p.blurb)}</p></div>
    </div>`;
    }
    return `${meta}\n      ${main}\n      <p class="card-blurb">${escapeHtml(p.blurb)}</p>`;
  }
  return `${meta}\n      ${main}`;
}

// ---------- templates ----------
const head = (title, prefix = '') => `  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://use.typekit.net/mwr2qgm.css">
  <link rel="icon" type="image/png" href="${prefix}images/favicon.png">
  <link rel="stylesheet" href="${prefix}css/layout.css">
  <link rel="stylesheet" href="${prefix}css/lab.css">
  <link rel="alternate" type="application/rss+xml" title="${SITE.title}" href="${SITE.basePath}/feed.xml">`;

const pageHeader = `  <header class="page-header">
    <a href="/index.html"><h5 class="name-title">Mary Huang</h5></a>
  </header>`;

function standalonePage(p) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(`${p.title || preview(p.body, 60)} — ${SITE.author}`, '../')}
</head>
<body>
${pageHeader}
  <main class="lab-standalone">
    ${renderPost(p, '../images/')}
    <p class="back-link"><a href="../index.html">← All posts</a></p>
  </main>
</body>
</html>
`;
}

function indexPage(posts) {
  const cards = posts.map(p => `      <a class="lab-card lab-card--${p.type} cols-${p.columns}" href="${postUrl(p)}" data-slug="${p.slug}">
${cardPreviewHtml(p)}
      </a>`).join('\n');

  const templates = posts.map(p => `  <template id="tpl-${p.slug}">${renderPost(p, 'images/')}</template>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(SITE.title)}
</head>
<body>
  <section class="lab-list-section">
    <header class="lab-list-header">
      <h1>Rhyme &amp; Reason</h1>
      <p class="lab-list-intro"><a href="feed.xml">RSS</a> · <a href="https://github.com/rhymeandreason/Studio" target="_blank" rel="noopener">GitHub</a> · <a href="https://www.linkedin.com/in/maryhuang1/" target="_blank" rel="noopener">LinkedIn</a> · <a href="mailto:rhymeandreason1.0@gmail.com">Email</a></p>
      <h2>Studio &amp; Lab</h2>
    </header>
    <div class="lab-grid">
${cards}
    </div>
  </section>

  <div class="lab-modal-overlay" id="lab-modal-overlay" hidden>
    <button class="lab-modal-close" id="lab-modal-close" aria-label="Close"><img src="icons/ic_close.svg" alt=""></button>
    <div class="lab-modal-image" id="lab-modal-image"></div>
    <div class="lab-modal" role="dialog" aria-modal="true">
      <div class="lab-modal-body" id="lab-modal-body"></div>
    </div>
  </div>

${templates}

  <script src="js/lab.js"></script>
</body>
</html>
`;
}

function feed(posts) {
  const base = SITE.url + SITE.basePath + '/';
  const items = posts.map(p => `    <item>
      <title>${escapeXml(p.title || preview(p.body, 60))}</title>
      <link>${base}${postUrl(p)}</link>
      <guid isPermaLink="true">${base}${postUrl(p)}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <category>${p.type}</category>
      <description><![CDATA[${renderPost(p, base + 'images/')}]]></description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.title)}</title>
    <link>${base}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>en-us</language>
    <atom:link href="${base}feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

function build() {
  const posts = listPosts();
  const typeBySlug = new Map(posts.map(p => [p.slug, p.type]));
  for (const type of ['note', 'journal', 'artifact']) {
    const dir = path.join(ROOT, type);
    fs.mkdirSync(dir, { recursive: true });
    // remove generated pages for posts that no longer exist, or that moved to a different type
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.html')) continue;
      const slug = f.slice(0, -'.html'.length);
      if (typeBySlug.get(slug) !== type) fs.unlinkSync(path.join(dir, f));
    }
  }
  for (const p of posts) {
    fs.writeFileSync(path.join(ROOT, postUrl(p)), standalonePage(p));
  }
  fs.writeFileSync(path.join(ROOT, 'index.html'), indexPage(posts));
  fs.writeFileSync(path.join(ROOT, 'feed.xml'), feed(posts));
  clearDrafts();
  console.log(`Built ${posts.length} post${posts.length === 1 ? '' : 's'} → ${ROOT}`);
}

if (require.main === module) build();
module.exports = { build };

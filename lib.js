/** Shared markdown rendering + post utilities for the lab mini-site (build.js + admin-server.js). */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname; // lab/
const POSTS_DIR = path.join(ROOT, 'data', 'posts');
const IMAGES_DIR = path.join(ROOT, 'images');

const TYPES = ['note', 'journal', 'artifact'];

// ---------- markdown (same hand-rolled renderer as build-blog.js) ----------
const inline = t => t
  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

function md(src) {
  if (!src) return '';
  const out = [];
  let para = [], list = null, quote = [], code = null;
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push('<blockquote><p>' + inline(quote.join(' ')) + '</p></blockquote>'); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const ln of src.split('\n')) {
    if (code !== null) {
      if (ln.startsWith('```')) { out.push('<pre><code>' + code.join('\n') + '</code></pre>'); code = null; }
      else code.push(ln);
      continue;
    }
    if (ln.startsWith('```')) { flushAll(); code = []; continue; }
    const h = ln.match(/^(#{1,4}) (.+)$/);
    if (h) { flushAll(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^[-*] /.test(ln)) {
      flushPara(); flushQuote();
      if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; }
      out.push('<li>' + inline(ln.slice(2)) + '</li>'); continue;
    }
    if (/^\d+\. /.test(ln)) {
      flushPara(); flushQuote();
      if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; }
      out.push('<li>' + inline(ln.replace(/^\d+\. /, '')) + '</li>'); continue;
    }
    if (ln.startsWith('> ')) { flushPara(); flushList(); quote.push(ln.slice(2)); continue; }
    if (ln.trim() === '') { flushAll(); continue; }
    if (/^<\w/.test(ln) || /^<\//.test(ln)) { flushAll(); out.push(ln); continue; }
    flushList(); flushQuote();
    para.push(ln);
  }
  flushAll();
  return out.join('\n');
}

function preview(text, max = 160) {
  if (!text) return '';
  const plain = text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut) + '…';
}

const escapeHtml = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' })[c]);

// ---------- posts data access ----------
function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8')))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function getPost(slug) {
  const file = path.join(POSTS_DIR, slug + '.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'post';
}

function savePost(post) {
  if (!TYPES.includes(post.type)) throw new Error('Invalid post type: ' + post.type);
  if (!post.slug) throw new Error('Missing slug');
  post.slug = slugify(post.slug);
  post.columns = post.columns === 2 ? 2 : 1;
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(POSTS_DIR, post.slug + '.json'), JSON.stringify(post, null, 2));
  return post;
}

function deletePost(slug) {
  const file = path.join(POSTS_DIR, slugify(slug) + '.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  unmarkDraft(slug);
}

// ---------- draft tracking (posts saved since the last build) ----------
const DRAFT_STATE_FILE = path.join(ROOT, 'data', '.draft-state.json');

function readDraftSlugs() {
  try { return JSON.parse(fs.readFileSync(DRAFT_STATE_FILE, 'utf8')); }
  catch { return []; }
}

function writeDraftSlugs(slugs) {
  fs.mkdirSync(path.dirname(DRAFT_STATE_FILE), { recursive: true });
  fs.writeFileSync(DRAFT_STATE_FILE, JSON.stringify(slugs));
}

function markDraft(slug) {
  const s = new Set(readDraftSlugs());
  s.add(slug);
  writeDraftSlugs([...s]);
}

function unmarkDraft(slug) {
  const s = new Set(readDraftSlugs());
  s.delete(slug);
  writeDraftSlugs([...s]);
}

function clearDrafts() {
  writeDraftSlugs([]);
}

module.exports = {
  md, inline, preview, escapeHtml, listPosts, getPost, savePost, deletePost, slugify,
  readDraftSlugs, markDraft, unmarkDraft, clearDrafts,
  TYPES, POSTS_DIR, IMAGES_DIR, ROOT,
};

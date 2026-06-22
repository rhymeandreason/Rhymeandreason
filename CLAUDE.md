# Rhyme & Reason — lab and studio site

A static site generated from JSON post data, with a local-only CMS for editing.

## Architecture

- **Source of truth**: `data/posts/<slug>.json` — one file per post (`type`: `note`, `journal`, or `artifact`).
- **Generator**: [build.js](build.js) reads `data/posts/`, then writes the static output:
  - `index.html` — grid of all posts + hidden `<template>` per post used by the modal
  - `<type>/<slug>.html` — standalone page per post (e.g. `artifact/code-editor.html`)
  - `feed.xml` — RSS feed
  - Run with `node build.js`
- **Shared logic**: [lib.js](lib.js) — markdown rendering, post read/write, sorting/ordering, slugify.
- **CMS**: [admin.html](admin.html) (frontend) + [admin-server.js](admin-server.js) (backend, port 4848). Local-only, not deployed. Saving a post writes its JSON but does **not** rebuild the site — posts stay "draft" until Build is triggered (button in admin, or `POST /api/build`).
- **Client behavior on the live site**: [js/lab.js](js/lab.js) handles the modal (click a card → open `<template id="tpl-{slug}">` content in a modal, deep-linkable via `#slug`, browser back/forward supported).
- **Styling**: [css/lab.css](css/lab.css) (grid, cards, modal, post content) and [css/layout.css](css/layout.css).

## Critical gotcha: index.html and feed.xml are generated — don't hand-edit and expect it to stick

`index.html`, `feed.xml`, and the per-post pages in `note/`, `journal/`, `artifact/` are **build output**. Any manual edit to them is silently overwritten the next time `build.js` runs (which happens on every CMS save+build).

Instructions:
1. Edit the relevant template function in `build.js` (`indexPage`, `standalonePage`, `renderPost`, `cardPreviewHtml`, `feed`).
2. Run `node build.js` to regenerate all output files.
3. Verify the generated `index.html` / post pages reflect the change.

`admin-server.js`'s `/api/build` handler busts `require.cache` for `build.js`/`lib.js` before each build, so editing those files takes effect immediately on the next "Build Site" click — no server restart needed. (If you ever bypass the API and call `build()` some other way, watch out for Node's `require()` module cache serving a stale version.)

## Post ordering

- `lib.js`'s `listPosts()` sorts by `order` field if present on **both** posts being compared, otherwise falls back to `date` descending.
- Drag-reordering in the CMS calls `reorderPosts()`, which sets `order` on every post.

## Dev workflow

- `./dev-open.sh` — starts `admin-server.js` if not running (port 4848), opens both the CMS and the live `index.html` in the browser.
- `./dev-stop.sh` — stops the dev server.
- The CMS and static site are served from the same local server so post pages/images resolve correctly.

## Conventions

- No build framework/bundler — plain HTML/CSS/JS, Node for the generator and CMS server only.
- Keep generated and source files in sync: never treat `index.html`/`feed.xml`/`<type>/<slug>.html` as editable by hand for anything beyond a quick throwaway preview.
- `images/` holds uploaded post images, referenced by filename from each post's JSON (`mainImage`, `images[]`).

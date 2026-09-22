# MyFLS — Document Browser

A React + Vite web app that recreates the navigation tree and search
from the old myFLS "CD viewer" (`ACC line 1/html/mfcdappstart.html`),
extended to cover several plant/project folders under `Desktop/MyFLS`.

**No backend, no login, no Google account check.** The tree/search data
is static JSON served by GitHub Pages; opening a document reads it
straight off disk, via the browser's File System Access API, from
wherever Google Drive for Desktop has synced the shared folder on the
visitor's own PC (granted once per machine from Settings — see "Local
files" below; Chrome/Edge only). There's nothing server-side to
misconfigure or redeploy, and nothing that can be "down."

Deployed automatically to GitHub Pages by GitHub Actions on every push
to `main` — no manual "build and upload" step.

It's also a **PWA (Progressive Web App)**: once published, visitors can
install it as an app — "Add to Home Screen" on a phone, or the install
icon in Chrome/Edge's address bar on desktop — which gives it its own
app icon and opens without browser chrome. The tree/search works fully
offline once loaded; opening a document works offline too as long as the
Drive-for-Desktop-synced folder is available locally (the whole point of
this setup).

## Project layout

```
index.html, vite.config.js, package.json   - Vite app entry + build config
src/                                        - the real source code
  main.jsx, App.jsx                         - app shell + all state (sources, selection, local-root name)
  config.js                                 - theme localStorage helpers
  localFiles.js                             - File System Access API wrapper (folder picker, permission,
                                               resolving a path to a File) - the IndexedDB-backed folder handle
  api.js                                    - fetches source data, reads a document off disk to open it
  domain.js                                 - pure data-shaping (catalog, tree traversal, formatting)
  ThemeContext.jsx                          - the 10-theme picker
  components/                               - Sidebar, DocumentTable, SettingsPanel, TopBar, etc.
  index.css                                 - the whole app's styling (CSS custom-property theme tokens)
public/                                     - static files served as-is (not processed by Vite)
  data/<source-id>/                         - tree.json + documents.json (rich) or folderTree.json (plain)
  data/sources.json                         - the manifest of every source
  acc-logo.png, fls-logo.png, manifest.json, sw.js, icon-*.png
apps-script/                                - a Google Apps Script project kept for its DriveManifest export
                                               tool only (see "Regenerating the data") - not used by the live
                                               app at all; see apps-script/README.md
scripts/                                    - Node tools that generate public/data/*.json (not part of the
                                               deployed app itself) - see "Regenerating the data" below
legacy-exact-copy/                          - an earlier plain HTML/JS/CSS build (still Apps-Script-backed),
                                               kept for reference; not what's served live
.github/workflows/                          - ci.yml (lint + format + build on every push/PR) and
                                               deploy.yml (build + publish to GitHub Pages on push to main)
```

## What's in the app

The left sidebar lists every source — plants and project folders — as a
tree, in two kinds:

- **Rich sources** — real myFLS CD exports with a tree + document
  database behind them. Clicking one shows every document under it
  immediately; expanding it reveals its own Process view / Discipline
  view areas to drill into, plus "show all levels," a sortable/paginated
  table, and search across document numbers and titles.
  - `ACC Line 1` — 6,998 docs (plus, nested under it, `New Bucket
Elevators - L1 (CD)` — 2,715 docs)
  - `ACC Line 2` — 12,306 docs
  - `Myfls Cement Line 1` — 3,471 docs
  - Under **AF Systems**: `HOTDISC-Updated`, `MyFLS AF - Updated
8-12-2015`
  - Under **Coal Systems**: `ACC Coal Mill-Extension`, `Myfls Coal-1`,
    `Myfls Coal-2`
- **Plain sources** — ordinary nested folders with no tree database, get
  a simpler Explorer-style browser: subfolders on the left, current
  folder's contents (name/path/size) on the right, search by file name.
  - `New Bucket Elevators - L1 (Files)` (nested under ACC Line 1)
  - Under **AF Systems**: `AF#3 New Line`
  - Under **Packing Area**: `Packer Machines`, `Packing Beumer Disc 1`,
    `Packing Beumer Disc 2`
  - `Cooler Upgrade`, `New Bag Filter BF300`, `Palletizer`, `Material
Standard`

Several other folders under `Desktop/MyFLS` (Projects, and a few smaller
ones) are intentionally left out for now — see "Regenerating the data."

There's no login screen — anyone with the link can browse the tree and
search. Everyone can open **Settings** (gear icon, top right) to pick one
of 10 color themes and, under **Local files**, click **Choose folder**
to grant the app access to wherever Google Drive for Desktop has synced
the shared plant-documents folder on their own PC — a native OS folder
picker, not typing a path. That's the only setup step (once per browser
per machine); after that, clicking a document reads it straight off disk
via the File System Access API, no network round-trip involved. Needs
Chrome or Edge.

## Local development

```bash
npm install
npm run dev          # starts Vite's dev server with hot reload
npm run build         # production build to dist/
npm run preview       # serve that build locally
npm run lint           # eslint
npm run format:check   # prettier --check
npm run format          # prettier --write
```

## Publishing to GitHub Pages

One-time setup on GitHub: repo → **Settings → Pages → Source: "GitHub
Actions"**. After that, every push to `main` runs `.github/workflows/deploy.yml`,
which builds the app and publishes `dist/` — no manual branch or
"upload build" step, ever.

## Regenerating the data

Nothing under `public/data/` is hand-written.

**Rich sources** (myFLS CD exports) — if FLSmidth/the plant issues an
updated export for a plant, re-run:

```bash
node scripts/extract.js "/path/to/ACC line 1" ./public/data/acc-line-1
node scripts/extract.js "/path/to/ACC line 2" ./public/data/acc-line-2
node scripts/extract.js "/path/to/Myfls Cement line 1" ./public/data/myfls-cement-line-1
node scripts/extract.js "/path/to/AF Systems/HOTDISC-Updated" ./public/data/af-hotdisc-updated
node scripts/extract.js "/path/to/AF Systems/MyFLS AF- Updated @ 8-12-2015" ./public/data/af-myfls-af-2015
node scripts/extract.js "/path/to/Coal systems/ACC Coal Mill-Extension" ./public/data/coal-acc-mill-extension
node scripts/extract.js "/path/to/Coal systems/Myfls Coal-1" ./public/data/coal-myfls-coal-1
node scripts/extract.js "/path/to/Coal systems/Myfls Coal-2" ./public/data/coal-myfls-coal-2
node scripts/extract.js "/path/to/New Bucket Elevators - L1/CD" ./public/data/new-bucket-elevators-cd
```

This reads `js/view_1.js`, `js/view_2.js` and every file in `xml/` from
the export root, cross-checks against `documents/` to flag any file
referenced in the metadata but missing on disk, and rewrites that
source's two JSON files.

**Plain sources** — if a project folder's contents change, re-run:

```bash
node scripts/extract-plain.js "/path/to/AF Systems/AF#3 New Line" af3-new-line ./public/data
node scripts/extract-plain.js "/path/to/New Bucket Elevators - L1" new-bucket-elevators-files ./public/data --exclude=CD
```

(source id must match the `id` used in `public/data/sources.json`;
`--exclude` skips a named subfolder that's handled separately as its
own rich source).

**Adding a source that's currently left out** (Projects, or anything
else under `Desktop/MyFLS` not listed above): first check whether it's
a myFLS export (has `js/`, `xml/`, and `documents/` subfolders — use
`extract.js`) or a plain folder (use `extract-plain.js`), run the
appropriate script into a new `public/data/<id>/` folder, then add one
entry to `public/data/sources.json` with that `id`, a `label`, `kind`
("rich" or "plain"), an optional `group` (sidebar section header, e.g.
"AF Systems") or `parentSourceId` (to nest under another source's own
row, like the New Bucket Elevators entries under `acc-line-1`), and
`driveFolderName` (the exact name/path of the corresponding folder once
mirrored into Drive, e.g. `"Coal systems/Myfls Coal-1"`). No other code
changes are needed — commit and push, and the Actions deploy picks it
up.

## Known limitations

- **Version history**: for rich sources, every revision of a document
  that has its own file on the original CD is kept as a separate row
  (the legacy viewer's default counts were sometimes lower, likely
  showing only current revisions). Nothing is hidden; if you'd rather
  only show the latest version per document number, that's a small
  follow-up to the extractor.
- **TIFF viewing** depends entirely on the browser/OS having a handler
  for multi-page TIFFs when a document opens as a downloaded blob —
  Windows' Photos app and most browsers handle single-page TIFFs fine,
  but multi-page support varies. This is unrelated to the app itself;
  it's whatever opens `.tif` files on that PC.
- **Plain-source search** only matches file names, not folder names or
  file contents.
- **Needs Chrome or Edge** (the File System Access API opening documents
  relies on isn't implemented in Firefox or Safari as of when this was
  written).
- **Only works on a PC with Google Drive for Desktop installed and
  synced** to the same folder structure as `Desktop/MyFLS` (granted once
  in Settings — see "What's in the app"). There's no way to host this for
  people without that set up locally; it's a deliberate trade for having
  no backend at all.
- **`Projects` and a few smaller folders are intentionally not in the
  app yet** — adding any of them back is the same process described
  above.

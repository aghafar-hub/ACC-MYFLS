# MyFLS — Document Browser

A web app that recreates the navigation tree and search from the old
myFLS "CD viewer" (`ACC line 1/html/mfcdappstart.html`), extended to
cover several plant/project folders under `Desktop/MyFLS`, and opening
each document from Google Drive instead of a local disk folder.

It's also a **PWA (Progressive Web App)**: once published, visitors can
install it as an app — "Add to Home Screen" on a phone, or the install
icon in Chrome/Edge's address bar on desktop — which gives it its own
app icon, opens without browser chrome, and keeps the tree/search
working offline for any source already opened at least once (opening a
document still needs an internet connection, since that always goes
through Drive). No app store, no separate codebase — same site, same
deploy.

## What's in this app

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

- **`data/sources.json`** — the manifest of all sources (id, label,
  kind, optional `group` for a sidebar section header, optional
  `parentSourceId` to nest under another source, and the Drive folder
  name/path each maps to).
- **`data/<source-id>/`** — one folder per source: `tree.json` +
  `documents.json` for rich sources, `folderTree.json` for plain ones.
  All generated, not hand-written (see "Regenerating the data" below).
- **`index.html` / `app.js` / `style.css`** — the browser app itself.
- **`acc-logo.png`** / **`fls-logo.png`** — the two logos shown in the
  header (ACC on the left, FLSmidth on the right, both with their white
  background removed so they sit cleanly on the dark header).
- **`manifest.json`** / **`sw.js`** / **`icon-192.png`** / **`icon-512.png`**
  / **`apple-touch-icon.png`** — the PWA install manifest, offline
  service worker, and app icons (the ACC leaf mark on navy).
- Documents are opened, and access is controlled, through a small
  **Google Apps Script Web App** (free, no Google Cloud Console, no
  OAuth client, no billing account) — see below.

## Access control

The app has its own **email + password login screen** — not Google
Sign-In. Accounts (email, a salted+hashed password, and a role) live in
a **Google Sheet** (the "settings database"); signing in gets you a
random session token, stored in your browser, that identifies you on
every later request.

**Worth knowing plainly**: this is a real security trade-off versus
Google Sign-In. We're now responsible for password storage and session
handling ourselves, in a platform (Apps Script) that has no
bcrypt/scrypt/Argon2 built in — `AppsScript.gs` stretches SHA-256
10,000 times per password as a reasonable best effort, but that's still
weaker than what Google provides for free, and there's no 2FA, no
breach-detection, no password-reset-by-email flow yet. It was chosen
deliberately so people without a Google account can still get in;
treat the account list as sensitive and keep it small.

One or more people are **admins**: from the app's **Settings** panel
(gear icon, top right) they get a "Manage users" button that opens a
page to add, remove, or reset the password for anyone — no spreadsheet
editing required. `aghafar@arabiancementcompany.com` is hardcoded as a
permanent bootstrap admin in `AppsScript.gs` — a safety net so the app
can never end up with no admin able to get back in.

Everyone can also open **Settings** to pick one of 6 color themes
(3 hues × light/dark) — saved per-browser, not shared.

## One-time setup

Three things: mirror the folders to Drive (a specific folder has
already been created for this — see below), deploy the Apps Script and
its settings sheet, and fill in `config.js`.

### 1. Upload the source folders into the shared Drive folder

The Drive root folder for this app already exists:
[17OeueXcCpoAdjaZYP7xeDzIU99lejH0X](https://drive.google.com/drive/folders/17OeueXcCpoAdjaZYP7xeDzIU99lejH0X)

Upload these folders into it, **preserving their exact names and
internal structure** (including the nesting under `AF Systems`, `Coal
systems`, `Packing Area`, and `New Bucket Elevators - L1`):

```
(Drive root — the folder linked above)
  ACC line 1/           (upload the WHOLE folder, including documents/, xml/, etc. -
                          only documents/ is actually needed, but uploading the whole
                          thing is simplest and harmless)
  ACC line 2/
  Myfls Cement line 1/
  AF Systems/
    HOTDISC-Updated/
    MyFLS AF- Updated @ 8-12-2015/
    AF#3 New Line/
  Coal systems/
    ACC Coal Mill-Extension/
    Myfls Coal-1/
    Myfls Coal-2/
  Packing Area/
    packer machines/
    Packing Beumer Disc 1/
    Packing Beumer Disc 2/
  New Bucket Elevators - L1/        (upload the WHOLE folder, including its CD/ subfolder -
                                      the app treats CD/ as a separate rich source and
                                      everything else in this folder as a separate plain one)
  cooler upgrade/
  New Bag Filter BF300/
  Palletizer/
  Material Standard/
```

The names must match exactly (spelling, capitalization, punctuation,
including the lowercase `cooler upgrade` and `packer machines`) — the
app builds each document's Drive path from these same names.

For this many files/folders, **Google Drive for Desktop** is by far the
easiest route: install it, let it create a synced folder on your PC
mapped to the Drive folder above, then copy each of the folders listed
above into it and let it sync in the background. It can take a while
given the volume (tens of GB across everything), so kick it off and let
it run.

### 2. Deploy the Apps Script Web App and its settings sheet

1. Go to [script.google.com](https://script.google.com/) (signed in
   with the Google account that should own this — `aghafar@arabiancementcompany.com`
   is a reasonable choice since it's the bootstrap admin) → **New
   project** (or open the one you already created).
2. Delete everything in the editor and paste in the current contents of
   [`scripts/AppsScript.gs`](scripts/AppsScript.gs) from this repo.
   `ROOT_FOLDER_ID` and `APP_URL` are already set correctly.
3. **Create/upgrade the settings sheet** — pick whichever applies:
   - **Never ran a setup function before**: select `setupSettingsSheet`
     in the function dropdown, click **Run**.
   - **Already ran the old `setupSettingsSheet()`** (an `AccessControl`
     sheet with just Email/Role/AddedAt already exists): select
     `migrateToPasswordAuth` instead, click **Run**. This upgrades that
     same sheet in place rather than creating a second one.
   - Either way, the first run asks you to authorize the script (Sheets
     access) — approve it, then open **View → Executions** (or
     **Logs**) and copy the sheet id it printed, plus any **temp
     password** lines it logged for existing users (including the
     bootstrap admin) — you'll need those to log in the first time.
4. Paste the sheet id into `SETTINGS_SHEET_ID` near the top of the
   script.
5. **Deploy → Manage deployments** (if you already had a deployment
   from before) → pencil/edit icon, or **Deploy → New deployment** if
   this is the first time → gear icon → **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone** — this app no longer relies on Google
     identity at all, so visitors don't need a Google account either;
     the email+password check inside the script is the real gate.
   - Version: **New version** if editing an existing deployment.
   - Deploy. Approve any additional authorization prompts.
6. Copy the **Web app URL** (ends in `/exec`) if this is a first-time
   deploy — editing an existing deployment keeps the same URL, so
   `config.js` doesn't need to change.

If you previously set "Execute as: User accessing the web app" and
shared the Drive folder with your domain to work around the old
Google-identity limitation, that's no longer necessary — "Execute as:
Me" is back now that identity comes from our own login, and it's
simpler (no per-visitor Google authorization prompt). Leaving the Drive
folder shared doesn't hurt anything, though.

If you ever edit `AppsScript.gs` again, use **Deploy → Manage
deployments → edit (pencil) → New version** to push the change live —
saving the file alone doesn't update the deployed URL's behavior.

**Managing who has access**: sign into the app, open **Settings** (gear
icon) → **Manage users**. The very first login has to use one of the
temp passwords logged in step 3 above; change it to something real via
that same page (re-enter that email with a new password to reset it).

### 3. Fill in `config.js`

Edit [`config.js`](config.js) in this repo:

```js
window.APP_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/xxxxx/exec', // from step 2 above
};
```

This URL isn't secret — it's the same link people click to open a
document anyway. Real access control lives in the settings sheet, not
in this file.

Both logos (`acc-logo.png`, `fls-logo.png`) are already in the repo,
backgrounds already removed — nothing to do here.

### 4. Make documents open instantly (direct Drive links)

By default, opening a document round-trips through Apps Script — which
works, but Google's own interstitial ("this app isn't verified") and
per-request execution overhead make it feel slow and occasionally
flaky. Once every source folder is fully uploaded to Drive, this
one-time step makes documents open with a single, instant, direct
link instead:

1. **Share the Drive root folder** ([the one linked in step 1
   above](https://drive.google.com/drive/folders/17OeueXcCpoAdjaZYP7xeDzIU99lejH0X))
   as **"Anyone with the link" → Viewer**. This is the trade-off: the
   app's login screen still gates who can browse the tree/search and
   *see* a document's link at all, but a raw copied link, once handed
   to someone outside the app, would work without signing in. Treat
   links accordingly (don't paste them somewhere public).
2. In the Apps Script editor, run **`exportDriveManifest`** once (from
   the function dropdown, same as any other setup function). It walks
   the whole Drive tree and writes one row per file — its path, Drive
   file id, and view link — into a new **DriveManifest** tab in the
   settings sheet. For tens of thousands of files this can take
   several minutes; that's normal.
3. Open that sheet, select the **DriveManifest** tab, **File →
   Download → Comma Separated Values (.csv)**.
4. Run the merge script against that CSV:
   ```bash
   node scripts/merge-drive-links.js "/path/to/DriveManifest.csv" ./data
   ```
   This bakes a `driveUrl` field directly into each document's entry in
   `data/<source-id>/documents.json` (rich sources) or
   `folderTree.json` (plain sources) wherever a match was found, and
   prints a matched/missing count per source.
5. Commit and push the updated `data/*.json` files.

Documents with a `driveUrl` now open with a single direct link and no
Apps Script involvement at all. Anything not yet uploaded (or uploaded
after the last export) automatically falls back to the slower Apps
Script path until you re-run steps 2–5 — nothing breaks in the
meantime, it just isn't instant yet for those files.

## Publishing to GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo-name>.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: Deploy from branch → main /
(root)**. The site will be live at `https://<you>.github.io/<repo-name>/`
a minute or two later.

## Regenerating the data

Nothing under `data/` is hand-written. Note that `extract.js` and
`extract-plain.js` each rewrite their source's JSON file from scratch,
which wipes any `driveUrl` fields baked in by `merge-drive-links.js` —
re-run that merge afterward (step 4 above) to restore instant direct
links.

**Rich sources** (myFLS CD exports) — if FLSmidth/the plant issues an
updated export for a plant, re-run:

```bash
node scripts/extract.js "/path/to/ACC line 1" ./data/acc-line-1
node scripts/extract.js "/path/to/ACC line 2" ./data/acc-line-2
node scripts/extract.js "/path/to/Myfls Cement line 1" ./data/myfls-cement-line-1
node scripts/extract.js "/path/to/AF Systems/HOTDISC-Updated" ./data/af-hotdisc-updated
node scripts/extract.js "/path/to/AF Systems/MyFLS AF- Updated @ 8-12-2015" ./data/af-myfls-af-2015
node scripts/extract.js "/path/to/Coal systems/ACC Coal Mill-Extension" ./data/coal-acc-mill-extension
node scripts/extract.js "/path/to/Coal systems/Myfls Coal-1" ./data/coal-myfls-coal-1
node scripts/extract.js "/path/to/Coal systems/Myfls Coal-2" ./data/coal-myfls-coal-2
node scripts/extract.js "/path/to/New Bucket Elevators - L1/CD" ./data/new-bucket-elevators-cd
```

This reads `js/view_1.js`, `js/view_2.js` and every file in `xml/` from
the export root, cross-checks against `documents/` to flag any file
referenced in the metadata but missing on disk, and rewrites that
source's two JSON files.

**Plain sources** — if a project folder's contents change, re-run:

```bash
node scripts/extract-plain.js "/path/to/AF Systems/AF#3 New Line" af3-new-line ./data
node scripts/extract-plain.js "/path/to/New Bucket Elevators - L1" new-bucket-elevators-files ./data --exclude=CD
```

(source id must match the `id` used in `data/sources.json`; `--exclude`
skips a named subfolder that's handled separately as its own rich
source).

**Adding a source that's currently left out** (Projects, or anything
else under `Desktop/MyFLS` not listed above): first check whether it's
a myFLS export (has `js/`, `xml/`, and `documents/` subfolders — use
`extract.js`) or a plain folder (use `extract-plain.js`), run the
appropriate script into a new `data/<id>/` folder, then add one entry to
`data/sources.json` with that `id`, a `label`, `kind` ("rich" or
"plain"), an optional `group` (sidebar section header, e.g. "AF
Systems") or `parentSourceId` (to nest under another source's own row,
like the New Bucket Elevators entries under `acc-line-1`), and
`driveFolderName` (the exact name/path of the corresponding folder once
mirrored into Drive, e.g. `"Coal systems/Myfls Coal-1"`). No other code
changes are needed.

## Known limitations

- **Version history**: for rich sources, every revision of a document
  that has its own file on the original CD is kept as a separate row
  (the legacy viewer's default counts were sometimes lower, likely
  showing only current revisions). Nothing is hidden; if you'd rather
  only show the latest version per document number, that's a small
  follow-up to the extractor.
- **TIFF previews**: Google Drive's built-in preview does not always
  render multi-page TIFF scans well. Drive still lets you download the
  original file from the preview page.
- **Plain-source search** only matches file names, not folder names or
  file contents.
- **Opening a deeply nested plain-source file** walks that many folders
  one at a time inside the Apps Script, so it can take a second or two
  longer than a rich-source document, which is a flat one-hop lookup.
- **`Projects` and a few smaller folders are intentionally not in the
  app yet** — adding any of them back is the same process described
  above.

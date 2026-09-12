# MyFLS — Document Browser

A static web app that recreates the navigation tree and search from the
old myFLS "CD viewer" (`ACC line 1/html/mfcdappstart.html`), extended to
cover every plant/project folder under `Desktop/MyFLS`, and opening each
document from Google Drive instead of a local disk folder.

## What's in this app

A **source picker** at the top switches between 21 folders, in two kinds:

- **Rich sources** (3) — real myFLS CD exports with a tree + document
  database behind them: `ACC line 1` (RAMLIYA CEMENT PLANT, 6,998 docs),
  `ACC line 2` (12,306 docs), `Myfls Cement line 1` (3,471 docs). These
  get the full original experience: Process view / Discipline view
  switcher, tree navigation, "show all levels," sortable/paginated table
  with Document No./Version/Eqp. No./Title/Type/Status/Date, and search
  across document numbers and titles.
- **Plain sources** (18) — ordinary nested folders with no tree database
  (`AF Systems`, `Coal systems`, `Palletizer`, `Projects`, etc., plus a
  synthetic `General Files` source for the 5 loose files sitting directly
  under `Desktop/MyFLS`). These get a simpler Explorer-style folder
  browser: tree of subfolders on the left, current folder's contents
  (name/path/size) on the right, search by file name across the whole
  source.

- **`data/sources.json`** — the manifest of all 21 sources (id, label,
  kind, and the Drive folder name each maps to).
- **`data/<source-id>/`** — one folder per source: `tree.json` +
  `documents.json` for rich sources, `folderTree.json` for plain ones.
  All generated, not hand-written (see "Regenerating the data" below).
- **`index.html` / `app.js` / `style.css`** — the browser app itself.
- Documents are opened through a small **Google Apps Script Web App**
  (free, no Google Cloud Console, no OAuth client, no billing account) so
  only people you approve can actually view the files — the tree/titles
  are public (in the GitHub repo + Pages site), but the real files are
  not.

## One-time setup

You need to do three things before this works: mirror the folders to
Drive, deploy the Apps Script, and fill in `config.js`.

### 1. Mirror `Desktop/MyFLS` into one Google Drive folder

Create **one Drive folder** (call it whatever you like, e.g. "MyFLS") and
upload every one of these folders into it, **preserving their exact
names and internal structure**:

```
MyFLS/                                  <- this is your Drive root folder
  ACC line 1/           (upload the WHOLE folder, including documents/, xml/, etc. -
                          only documents/ is actually needed, but uploading the whole
                          thing is simplest and harmless)
  ACC line 2/
  Myfls Cement line 1/
  AF Systems/
  Coal systems/
  New Bucket Elevators - L1/
  Projects/
  Palletizer/
  Packing Beumer Disc 1/
  Packing Beumer Disc 2/
  Bypass system (CM3,4)/
  CM 3 and CM 4 modification/
  New Bag Filter BF300/
  new bag filter/
  new compressor/
  packer machines/
  cement mill drawing/
  cooler upgrade/
  Material Standard/
  Spechial DWG/
  cooler upgrade.zip                    <- the 5 loose files go directly in
  material code manual.PDF                 the Drive root, not in a subfolder
  New FLENDER_DMG2 Gearbox_for (ACC) 46032567_EN.pdf
  part list 40.pdf
  Z-5435105 (002).pdf
```

The names must match exactly (spelling, capitalization, punctuation) —
the app builds each document's Drive path from these same names.

For this many files/folders, **Google Drive for Desktop** is by far the
easiest route: install it, let it create a synced folder on your PC, then
copy the entire contents of `Desktop/MyFLS` into it (skip the
`drive-viewer` folder itself — that's this app's source code, not a
document set) and let it sync in the background. It can take a while
given the volume (tens of GB across everything), so kick it off and let
it run.

Once uploaded, open your Drive root folder ("MyFLS") on drive.google.com
and copy its id out of the URL:

```
https://drive.google.com/drive/folders/<THIS_PART_IS_THE_FOLDER_ID>
```

### 2. Deploy the Apps Script Web App

This is what makes opening a document "restricted to specific people"
rather than public — and it needs nothing beyond a normal Google account,
no Cloud Console, no billing:

1. Go to [script.google.com](https://script.google.com/) (signed in with
   whichever Google account owns the Drive folder from step 1) → **New
   project**.
2. Delete the placeholder code and paste in the contents of
   [`scripts/AppsScript.gs`](scripts/AppsScript.gs) from this repo.
3. Set `ROOT_FOLDER_ID` near the top to the folder id from step 1.
   Optionally list specific emails in `ALLOWED_EMAILS` for a tighter
   allow-list on top of the deployment setting below.
4. **Deploy → New deployment** → click the gear icon → type **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone within arabiancementcompany.com** (this is
     the actual access control — only people signed into a Google account
     on your domain can reach the script at all) — or **Anyone with a
     Google account** if you'd rather rely on `ALLOWED_EMAILS` alone for a
     narrower list regardless of domain.
   - Deploy. The first time, it'll ask you to authorize the script's
     access to your Drive — that's you (the owner) approving it once, not
     something every viewer has to do.
5. Copy the **Web app URL** it gives you (ends in `/exec`).

If you ever edit `AppsScript.gs`, use **Deploy → Manage deployments →
edit (pencil) → New version** to push the change live — saving the file
alone doesn't update the deployed URL's behavior.

### 3. Fill in `config.js`

Edit [`config.js`](config.js) in this repo:

```js
window.APP_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/xxxxx/exec', // from step 2
};
```

This URL isn't secret — it's the same link people click to open a
document anyway. Real access control lives in the Apps Script deployment
settings (who can even reach it) and the `ALLOWED_EMAILS` list inside
`AppsScript.gs` itself (not in this file, so it can't be tampered with
from the browser).

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
a minute or two later — no Apps Script setting needs to reference this
URL, since access is controlled at the Apps Script deployment, not by
origin.

## Regenerating the data

Nothing under `data/` is hand-written.

**Rich sources** (myFLS CD exports) — if FLSmidth/the plant issues an
updated export for a plant, re-run:

```bash
node scripts/extract.js "/path/to/ACC line 1" ./data/acc-line-1
node scripts/extract.js "/path/to/ACC line 2" ./data/acc-line-2
node scripts/extract.js "/path/to/Myfls Cement line 1" ./data/myfls-cement-line-1
```

This reads `js/view_1.js`, `js/view_2.js` and every file in `xml/` from
the export root, cross-checks against `documents/` to flag any file
referenced in the metadata but missing on disk, and rewrites that
source's two JSON files.

**Plain sources** — if a project folder's contents change, re-run:

```bash
node scripts/extract-plain.js "/path/to/Coal systems" coal-systems ./data
```

(source id must match the `id` used in `data/sources.json`).

**Adding a brand-new source** (a new plant export or a new project
folder): run the appropriate script above into a new `data/<id>/`
folder, then add one entry to `data/sources.json` with that `id`, a
`label`, `kind` ("rich" or "plain"), and `driveFolderName` (the exact
name of the corresponding folder once mirrored into Drive — see step 1
above). No other code changes are needed.

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
- **Opening a deeply nested plain-source file** (e.g. six folders deep in
  `Palletizer`) walks that many folders one at a time inside the Apps
  Script, so it can take a second or two longer than a rich-source
  document, which is a flat one-hop lookup.

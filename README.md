# MyFLS — Document Browser

A web app that recreates the navigation tree and search from the old
myFLS "CD viewer" (`ACC line 1/html/mfcdappstart.html`), extended to
cover several plant/project folders under `Desktop/MyFLS`, and opening
each document from Google Drive instead of a local disk folder.

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
- **`fls-logo.gif`** / **`acc-logo.png`** — the two logos shown in the
  header (ACC on the left, FLSmidth on the right, matching the
  original CD viewer's branding).
- Documents are opened, and access is controlled, through a small
  **Google Apps Script Web App** (free, no Google Cloud Console, no
  OAuth client, no billing account) — see below.

## Access control

There's no login page in the app itself — it relies on the visitor
already being signed into a Google account in their browser (which
Apps Script can read), checked against an **access list stored in a
Google Sheet** (the "settings database"). Only emails in that sheet can
open documents; everyone else gets a polite "not authorized" message.

One or more people are **admins**: they get an extra management page
(the Apps Script URL with `?admin=1` appended) to add or remove allowed
emails, with no spreadsheet editing required. `aghafar@arabiancementcompany.com`
is hardcoded as a permanent bootstrap admin in `AppsScript.gs` — a
safety net so the app can never be locked with no admin able to get
back in, even if the sheet is deleted or misconfigured.

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
   project**.
2. Delete the placeholder code and paste in the contents of
   [`scripts/AppsScript.gs`](scripts/AppsScript.gs) from this repo.
   `ROOT_FOLDER_ID` is already set to the Drive folder from step 1.
3. **Create the settings sheet**: in the function dropdown near the Run
   button, select `setupSettingsSheet`, then click Run. The first time,
   it'll ask you to authorize the script (Sheets + Drive access) — approve
   it. Then open **View → Logs** (or **Executions**) and copy the sheet
   id it printed.
4. Paste that id into `SETTINGS_SHEET_ID` near the top of the script.
5. **Deploy → New deployment** → click the gear icon → type **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone with a Google account** — the sheet from
     step 3/4 is the real access control, not this setting; this just
     lets any Google account technically reach the script, and the
     access list decides who actually gets past the door.
   - Deploy. Approve any additional authorization prompts.
6. Copy the **Web app URL** it gives you (ends in `/exec`).

If you ever edit `AppsScript.gs`, use **Deploy → Manage deployments →
edit (pencil) → New version** to push the change live — saving the file
alone doesn't update the deployed URL's behavior.

**Managing who has access**: visit `<your Web App URL>?admin=1` while
signed in as an admin (the bootstrap admin, or anyone you've granted the
`admin` role) to add or remove emails — no spreadsheet needed. You can
still open the underlying Google Sheet directly if you ever want to see
the raw list.

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

### 4. Logos

`fls-logo.gif` is already in the repo (pulled from the original CD
export). `acc-logo.png` needs to be added — save the Arabian Cement Co.
logo file at `drive-viewer/acc-logo.png` (same folder as `index.html`);
the header is already wired to display it to the left of the FLSmidth
logo once it's there.

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

Nothing under `data/` is hand-written.

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

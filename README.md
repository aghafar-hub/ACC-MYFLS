# RAMLIYA CEMENT PLANT — Document Browser

A static web app that recreates the navigation tree and search from the old
myFLS "CD viewer" (`ACC line 1/html/mfcdappstart.html`), but opens each
document from Google Drive instead of a local disk folder.

- **`data/tree.json`** and **`data/documents.json`** — the navigation tree
  and the full document index (6,998 documents), extracted once from the
  original export's `js/view_*.js` tree files and `xml/*.xml` metadata.
- **`index.html` / `app.js` / `style.css`** — the browser app: tree on the
  left (with a Process view / Discipline view switcher, matching the
  original's two views), search, sortable/paginated document table.
- Documents are opened through a small **Google Apps Script Web App**
  (free, no Google Cloud Console, no OAuth client, no billing account) so
  only people you approve can actually view the files — the tree/titles
  are public (in the GitHub repo + Pages site), but the real drawings are
  not.

## One-time setup

You need to do three things before this works: upload the documents to
Drive, deploy the Apps Script, and fill in `config.js`.

### 1. Upload the documents to Google Drive

Upload the entire local `documents/` folder (the one with ~6,946 files
named like `05-46003-321-201_A1-L________1.0_EN.TIF`) into **one flat
Google Drive folder** — keep the file names exactly as they are, no
subfolders needed. The app looks files up by exact file name.

The easiest way for ~7,000 files is **Google Drive for Desktop**: install
it, let it create a synced folder on your PC, then copy/move the
`documents/` folder's contents into it and let it sync. Drag-and-drop
through drive.google.com works too, just slower for this many files.

Once uploaded, open the folder on drive.google.com and copy its id out of
the URL:

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
3. Set `FOLDER_ID` near the top to the folder id from step 1. Optionally
   list specific emails in `ALLOWED_EMAILS` for a tighter allow-list on
   top of the deployment setting below.
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

## Regenerating the data (if the source CD export ever changes)

`data/tree.json` and `data/documents.json` are generated, not
hand-written. If FLSmidth/the plant issues an updated export, re-run:

```bash
node scripts/extract.js "/path/to/ACC line 1" ./data
```

This reads `js/view_1.js`, `js/view_2.js` and every file in `xml/` from
the export root, cross-checks against `documents/` to flag any file
referenced in the metadata but missing on disk, and rewrites the two JSON
files. Commit and push the updated `data/` folder — no other code changes
needed as long as the export's format hasn't changed.

## Known limitations

- **Version history**: every revision of a document that has its own file
  on the original CD is kept as a separate row (the legacy viewer's
  default counts were sometimes lower, likely showing only current
  revisions). Nothing is hidden; if you'd rather only show the latest
  version per document number, that's a small follow-up to the extractor.
- **TIFF previews**: Google Drive's built-in preview does not always
  render multi-page TIFF scans well. Drive still lets you download the
  original file from the preview page.
- This covers the `ACC line 1` export. If you want `ACC line 2` or other
  plants in the same app, re-run `extract.js` against each export into
  separate `data/` subfolders and add a plant switcher — ask if you want
  that built out.

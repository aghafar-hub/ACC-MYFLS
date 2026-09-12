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
- Documents are opened via the **Google Drive API**, gated behind
  **Google Sign-In** so only people you approve can actually view the
  files — the tree/titles are public (in the GitHub repo + Pages site),
  but the real drawings are not.

## One-time setup

You need to do three things before this works: upload the documents to
Drive, create a Google OAuth client, and fill in `config.js`.

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

### 2. Create a restricted Google OAuth client

This is what makes sign-in "restricted to specific people" rather than
public:

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   create a new project (any name, e.g. "ramliya-doc-browser").
2. **APIs & Services → Library** → enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (unless you have a Google Workspace domain,
     in which case **Internal** restricts it to your domain automatically
     and you can skip the test-user step below).
   - Fill in the required app name/support email fields.
   - Scopes: add `.../auth/drive.readonly` and `.../auth/userinfo.email`.
   - **Leave publishing status as "Testing"** — in Testing mode, only the
     test users you list below can ever complete sign-in; this is what
     restricts access (no need to submit for Google verification).
   - Under **Test users**, add every Google account (e.g. Gmail or work
     Google account) that should be able to open documents.
4. **APIs & Services → Credentials → Create Credentials → OAuth client
   ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: add the URL this app will be served
     from, e.g. `https://<your-github-username>.github.io`.
   - Create it, then copy the **Client ID** (looks like
     `123-abc.apps.googleusercontent.com`). You don't need the secret —
     browser apps only use the Client ID.

### 3. Fill in `config.js`

Edit [`config.js`](config.js) in this repo:

```js
window.APP_CONFIG = {
  GOOGLE_CLIENT_ID: 'xxxxx.apps.googleusercontent.com', // from step 2
  DRIVE_FOLDER_ID: 'xxxxxxxxxxxxxxxxxxxxxxxx',           // from step 1
  ALLOWED_EMAILS: [
    'aghafar@arabiancementcompany.com',                  // optional extra allow-list
  ],
};
```

`ALLOWED_EMAILS` is an extra check inside the app itself, on top of the
Google "Testing" test-user list from step 2. You can leave it empty and
rely on the test-user list alone, or use both for defense in depth.

None of these values are secret — an OAuth Client ID for a browser app is
meant to be public; real access control comes from the Testing/test-user
list in Google Cloud and the read-only Drive scope.

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
(root)**. The site will be live at
`https://<you>.github.io/<repo-name>/` — use that exact origin (or a
custom domain) as the "Authorized JavaScript origin" in step 2 above.

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

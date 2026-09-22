# Apps Script backend (not used by the live app)

**The live app no longer uses any of this.** It pivoted to a fully
local, no-backend setup — opening a document is a plain `file://` link
built from a Drive-for-Desktop-synced folder on the visitor's own PC
(see the main [README](../README.md)'s "What's in the app" section) -
after Apps Script's platform-level restrictions (no CORS, no iframing,
Drive access tied to whichever identity mode the deployment runs under)
turned out to be too unreliable for login and document-opening both.
This whole file is kept for historical reference only, in case any of it
is useful again later.

`Code.gs` was the backend: it served the admin page and resolved/opened
a document from Drive when there was no direct link baked in yet.

This file is tracked here as the source of truth, but Google Apps
Script has no git integration — you paste its contents into the online
editor by hand and redeploy from there. That's a real limitation
(easy to forget a redeploy after a code change), not a workaround; keep
this file and what's pasted into script.google.com in sync manually.

## Access control

**The React app itself has no login screen** — anyone with the GitHub
Pages link can browse the tree/search. What actually protects the
documents is Google Drive's own sharing: the Drive folder/files are
shared only within `arabiancementcompany.com`, so opening a document
still requires signing into a Google account in that domain — Google's
own sign-in screen handles that, outside this app entirely, exactly like
opening any other domain-shared Drive file.

`Session.getActiveUser()` is still used server-side (for the admin page,
and to resolve the Drive path when there's no direct link yet), which is
why the deployment still needs to require authentication (see step 5
below) rather than being open to "Anyone" — Apps Script only resolves a
real identity when the platform made the visitor sign in to reach it at
all.

The "Users" sheet is **not** an access allowlist — domain membership on
the Drive folder is. It only ever holds `Email` + `Role`, and only
controls who additionally gets **admin** access: from the app's
**Settings** panel (gear icon, top right), an admin gets a "Manage
admins" button that opens a page to promote or demote anyone by email —
no spreadsheet editing required. `aghafar@arabiancementcompany.com` is
hardcoded as a permanent bootstrap admin in `Code.gs` — a safety net so
the app can never end up with no admin able to get back in.

If you're picking this project back up and it still has an older
email+password version's settings sheet (password/session columns), run
`migrateToGoogleIdentity()` once (see step 3) to drop those columns —
there's nothing left that needs them.

## One-time setup

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
   [`Code.gs`](Code.gs) from this repo.
   `ROOT_FOLDER_ID` and `APP_URL` are already set correctly.
3. **Create/upgrade the settings sheet** — pick whichever applies:
   - **Never ran a setup function before**: select `setupSettingsSheet`
     in the function dropdown, click **Run**.
   - **Already have a settings sheet from an earlier version of this
     app** (either the very first Google-identity version, or the later
     email+password one): select `migrateToGoogleIdentity` instead,
     click **Run**. This upgrades that same sheet in place (dropping any
     password columns) rather than creating a second one.
   - Either way, the first run asks you to authorize the script (Sheets
     access) — approve it.
4. `setupSettingsSheet()`/`migrateToPasswordAuth()` save the sheet id
   automatically as a **Script Property** — not as a constant in the
   code — specifically so that pasting in a future update (step 2) never
   wipes it out again. If login ever throws `Exception: You do not have
   permission to access the requested document`, this is almost always
   why: check Project Settings (gear icon, left sidebar) → **Script
   Properties** → confirm `SETTINGS_SHEET_ID` is present and matches your
   sheet's id (from its URL). Add or fix it there directly if needed —
   no code change required.
5. **Deploy → Manage deployments** (if you already had a deployment
   from before) → pencil/edit icon, or **Deploy → New deployment** if
   this is the first time → gear icon → **Web app**.
   - Execute as: **User accessing the web app** — this is required for
     `Session.getActiveUser()` to resolve a real identity at all; with
     "Execute as: Me" it always comes back blank.
   - Who has access: **Anyone within arabiancementcompany.com** — NOT
     plain "Anyone": a public deployment never makes the visitor
     authenticate, so there'd be no identity to resolve either. Requiring
     the domain is what makes sign-in work with zero extra setup for
     everyone who already has a Workspace account.
   - Version: **New version** if editing an existing deployment.
   - Deploy. Approve any additional authorization prompts.
6. Copy the **Web app URL** (ends in `/exec`) if this is a first-time
   deploy — editing an existing deployment keeps the same URL, so
   `src/config.js` doesn't need to change.

If you ever edit `Code.gs` again, use **Deploy → Manage deployments →
edit (pencil) → New version** to push the change live — saving the file
alone does not update the deployed URL's behavior. This is the #1
source of "I fixed it but it's still broken" confusion with this
backend — always double check you redeployed.

**Managing admins**: open the app, open **Settings** (gear icon) →
**Manage admins** — Google will ask you to sign in at that point if you
aren't already. Anyone else in the domain can already open and use the
app itself with no action needed from you at all.

### 3. Fill in `src/config.js`

Edit [`../src/config.js`](../src/config.js):

```js
export const APP_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/xxxxx/exec", // from step 2 above
};
```

This URL isn't secret — it's the same link people click to open a
document anyway. Real access control lives in the settings sheet, not
in this file. After editing it, commit and push — the GitHub Actions
workflow rebuilds and redeploys the site automatically.

### 4. Make documents open instantly (direct Drive links)

By default, opening a document round-trips through Apps Script — which
works, but per-request execution overhead makes it feel slower than a
plain link. Once every source folder is fully uploaded to Drive, this
one-time step makes documents open with a single, instant, direct link
instead:

1. **Share the Drive root folder** ([the one linked in step 1
   above](https://drive.google.com/drive/folders/17OeueXcCpoAdjaZYP7xeDzIU99lejH0X))
   as **"Anyone with the link" → Viewer**. This is the trade-off: the
   app's login screen still gates who can browse the tree/search and
   _see_ a document's link at all, but a raw copied link, once handed
   to someone outside the app, would work without signing in. Treat
   links accordingly (don't paste them somewhere public).
2. In the Apps Script editor, run **`exportDriveManifest`** once (from
   the function dropdown, same as any other setup function). It walks
   the whole Drive tree and writes one row per file — its path, Drive
   file id, and view link — into a new **DriveManifest** tab in the
   settings sheet. For tens of thousands of files this can take several
   minutes; that's normal.
3. Open that sheet, select the **DriveManifest** tab, **File → Download
   → Comma Separated Values (.csv)**.
4. Run the merge script from the repo root against that CSV:
   ```bash
   node scripts/merge-drive-links.js "/path/to/DriveManifest.csv" ./public/data
   ```
   This bakes a `driveUrl` field directly into each document's entry in
   `public/data/<source-id>/documents.json` (rich sources) or
   `folderTree.json` (plain sources) wherever a match was found, and
   prints a matched/missing count per source.
5. Commit and push the updated `public/data/*.json` files.

Documents with a `driveUrl` now open with a single direct link and no
Apps Script involvement at all. Anything not yet uploaded (or uploaded
after the last export) automatically falls back to the slower Apps
Script path until you re-run steps 2–5 — nothing breaks in the
meantime, it just isn't instant yet for those files.

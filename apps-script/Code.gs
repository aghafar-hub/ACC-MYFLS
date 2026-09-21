/**
 * Paste this into a new project at script.google.com (ROOT_FOLDER_ID and
 * APP_URL below are already set), run setupSettingsSheet() once - it
 * creates your settings spreadsheet and saves its id as a Script
 * Property automatically, so pasting in future updates never wipes it -
 * then Deploy > New deployment > type "Web app". See README.md for the
 * full walkthrough. No Google Cloud Console, no billing, no OAuth client.
 *
 * This version signs people in with their existing Google Workspace
 * identity (Session.getActiveUser()) rather than a separate email+
 * password system - anyone signed into a @yourcompany.com Google account
 * can use the app with no signup step at all. The "Users" sheet only
 * ever holds Email + Role, purely to control who additionally gets admin
 * access; it is not an access allowlist (domain membership is).
 *
 * This requires the deployment to be:
 *   Execute the app as: User accessing the web app
 *   Who has access: Anyone within [your domain]
 * ("Anyone" (public) won't work here - Session.getActiveUser() only
 * resolves a real identity when the visitor had to authenticate to reach
 * the script at all.)
 *
 * ROOT_FOLDER_ID must point to a Drive folder that mirrors the local
 * Desktop/MyFLS folder structure: one subfolder per plant/project, with
 * the exact same names and nesting, containing the same files. The app
 * asks for a document by its path under that root, e.g.
 *   "ACC line 1/documents/05-46003-321-201_A1-L________1.0_EN.TIF"
 *   "Coal systems/Myfls Coal-1/some/nested/drawing.pdf"
 */

const ROOT_FOLDER_ID = '17OeueXcCpoAdjaZYP7xeDzIU99lejH0X';

// The settings spreadsheet's id lives in Script Properties, NOT as a
// constant here - on purpose. Code.gs gets replaced wholesale every time
// you paste in an update from GitHub, and a hardcoded id would get wiped
// back to a placeholder every single time, breaking sign-in with a
// confusing "You do not have permission to access the requested
// document" exception. Script Properties survive code updates.
//
// setupSettingsSheet() / migrateToGoogleIdentity() below set this
// property automatically. If it's ever missing - a setup step skipped, a
// Script Properties edit that didn't save, etc. - getSettingsSheetId_()
// below self-heals by finding the sheet in Drive by its known name and
// saving the property itself, rather than requiring a precise manual UI
// step every time something goes wrong.
function getSettingsSheetId_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SETTINGS_SHEET_ID');
  if (id) return id;

  const candidateNames = ['MyFLS Document Browser - Access Control', 'MyFLS Document Browser - Settings'];
  for (const name of candidateNames) {
    const files = DriveApp.getFilesByName(name);
    if (files.hasNext()) {
      id = files.next().getId();
      props.setProperty('SETTINGS_SHEET_ID', id);
      Logger.log('SETTINGS_SHEET_ID was unset - found "' + name + '" in Drive and saved its id (' + id + ') automatically.');
      return id;
    }
  }

  throw new Error(
    'SETTINGS_SHEET_ID is not set, and no settings spreadsheet named "MyFLS Document Browser - Access ' +
      'Control" or "MyFLS Document Browser - Settings" was found in Drive. Run setupSettingsSheet() once ' +
      '(function dropdown in the Apps Script editor, then Run), or set the SETTINGS_SHEET_ID script ' +
      "property manually under Project Settings (gear icon) > Script Properties."
  );
}

// The GitHub Pages URL this app is served from - used both to redirect
// back after opening a document and as the target origin for the
// postMessage handoff described down by postMessageHtml_.
const APP_URL = 'https://aghafar-hub.github.io/ACC-MYFLS/';

// Seeded as an admin if not already present, so the app can never end up
// with zero admins.
const BOOTSTRAP_ADMIN_EMAILS = ['aghafar@arabiancementcompany.com'];

// Sheets/Drive calls occasionally throw a transient "You do not have
// permission to access the requested document" even with correct,
// unchanged sharing settings - this is a known Apps Script flake, most
// common right after publishing a new deployment version while its
// execution context is still propagating. A short retry clears it up.
function withRetry_(fn, attempts) {
  var lastErr;
  for (var i = 0; i < (attempts || 3); i++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      Utilities.sleep(300 * (i + 1));
    }
  }
  throw lastErr;
}

function openSettingsSpreadsheet_() {
  return withRetry_(function () {
    return SpreadsheetApp.openById(getSettingsSheetId_());
  });
}

// Diagnostic only - select this in the function dropdown above the editor
// and click Run, then View > Executions (or View > Logs) to see exactly
// which step fails and why, straight from Apps Script itself rather than
// guessing from what the web app's error page shows.
function testSettingsAccess() {
  Logger.log('Script property SETTINGS_SHEET_ID = ' + PropertiesService.getScriptProperties().getProperty('SETTINGS_SHEET_ID'));
  var id;
  try {
    id = getSettingsSheetId_();
    Logger.log('OK: getSettingsSheetId_() -> ' + id);
  } catch (e) {
    Logger.log('FAILED at getSettingsSheetId_(): ' + e);
    return;
  }
  try {
    var ss = openSettingsSpreadsheet_();
    Logger.log('OK: opened spreadsheet "' + ss.getName() + '"');
  } catch (e) {
    Logger.log('FAILED at openSettingsSpreadsheet_(): ' + e);
    return;
  }
  try {
    var users = getUserList_();
    Logger.log('OK: read Users sheet, ' + users.length + ' row(s)');
  } catch (e) {
    Logger.log('FAILED at getUserList_() (reading Users sheet): ' + e);
    return;
  }
  Logger.log(
    'Session.getActiveUser(): ' +
      (getIdentityEmail_() || '(blank when run from the editor directly - only resolves during a real web request)')
  );
  Logger.log('ALL CHECKS PASSED - the settings sheet is fully readable and writable.');
}

// ---------------- one-time setup / migration ----------------
// Run ONE of these once from the Apps Script editor (select it in the
// function dropdown, click Run) - both set the SETTINGS_SHEET_ID script
// property for you automatically.

// Use this for a brand-new settings sheet.
function setupSettingsSheet() {
  const ss = SpreadsheetApp.create('MyFLS Document Browser - Settings');
  const users = ss.getActiveSheet();
  users.setName('Users');
  users.getRange(1, 1, 1, 2).setValues([['Email', 'Role']]);

  seedBootstrapAdmins_(users);
  PropertiesService.getScriptProperties().setProperty('SETTINGS_SHEET_ID', ss.getId());
  Logger.log('Created settings sheet and saved its id as the SETTINGS_SHEET_ID script property: ' + ss.getId());
}

// Use this INSTEAD if you already have a settings sheet from the earlier
// email+password version of this app (a "Users" sheet with password
// columns) - it drops the password columns (no longer needed - Google
// identity replaces them) and removes the old "Sessions" sheet, which
// this version has no use for. Safe to run more than once.
function migrateToGoogleIdentity() {
  const ss = SpreadsheetApp.openById(getSettingsSheetId_());
  const users = ss.getSheetByName('Users') || ss.getSheetByName('AccessControl');
  if (!users) throw new Error('No "Users" or "AccessControl" sheet found in the settings spreadsheet.');
  if (users.getName() !== 'Users') users.setName('Users');

  const data = users.getDataRange().getValues();
  const rows = [['Email', 'Role']];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    rows.push([String(data[i][0]).toLowerCase().trim(), data[i][1] || 'user']);
  }
  users.clear();
  users.getRange(1, 1, rows.length, 2).setValues(rows);

  const sessions = ss.getSheetByName('Sessions');
  if (sessions) ss.deleteSheet(sessions);

  seedBootstrapAdmins_(users);
  PropertiesService.getScriptProperties().setProperty('SETTINGS_SHEET_ID', ss.getId());
  Logger.log('Migrated to Google-identity auth: Users sheet is now Email/Role only, Sessions sheet removed.');
}

function seedBootstrapAdmins_(usersSheet) {
  const existing = usersSheet.getDataRange().getValues().slice(1).map((r) => String(r[0]).toLowerCase());
  BOOTSTRAP_ADMIN_EMAILS.forEach((adminEmail) => {
    const email = adminEmail.toLowerCase();
    if (existing.indexOf(email) !== -1) return;
    usersSheet.appendRow([email, 'admin']);
  });
}

// ---------------- Drive manifest export (for direct-link mode) ----------------
// Run this ONCE, after every source folder has been fully uploaded to
// Drive and the ROOT_FOLDER_ID folder has been shared "Anyone with the
// link can view." It walks the whole Drive tree and writes one row per
// file - its full path under the root, Drive file id, and view link -
// into a "DriveManifest" tab in the settings sheet. Download that tab
// as CSV (File > Download > Comma-separated values) and hand it to
// whoever runs scripts/merge-drive-links.js, which bakes those links
// directly into data/*.json so the app can open files with a plain
// link and no Apps Script round-trip. Safe to re-run after uploading
// more files later - it replaces the whole tab each time.
function exportDriveManifest() {
  const ss = openSettingsSpreadsheet_();
  const old = ss.getSheetByName('DriveManifest');
  if (old) ss.deleteSheet(old);
  const sheet = ss.insertSheet('DriveManifest');
  sheet.appendRow(['Path', 'FileId', 'WebViewLink']);

  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const rows = [];
  walkDriveFolder_(root, '', rows);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  Logger.log('Exported ' + rows.length + ' files to the DriveManifest sheet tab.');
}

function walkDriveFolder_(folder, prefix, rows) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    rows.push([prefix + f.getName(), f.getId(), f.getUrl()]);
  }
  const folders = folder.getFolders();
  while (folders.hasNext()) {
    const sub = folders.next();
    walkDriveFolder_(sub, prefix + sub.getName() + '/', rows);
  }
}

// ---------------- identity ----------------

// The requesting visitor's Google identity. Only resolves to a real
// address when the deployment is "Execute as: User accessing the web
// app" AND "Who has access" requires the visitor to authenticate first
// (a plain "Anyone" deployment never prompts for sign-in, so there is no
// identity to report - this would come back blank).
function getIdentityEmail_() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email ? email.toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

// ---------------- users sheet (admin role only - not an access gate) ----------------

function getUsersSheet_() {
  return openSettingsSpreadsheet_().getSheetByName('Users');
}

function getUserList_() {
  const values = getUsersSheet_().getDataRange().getValues().slice(1);
  return values
    .filter((r) => r[0])
    .map((r) => ({ email: String(r[0]).toLowerCase().trim(), role: r[1] || 'user' }));
}

function getUserRole_(email) {
  const e = (email || '').toLowerCase().trim();
  const u = getUserList_().find((x) => x.email === e);
  return u ? u.role : 'user';
}

function isAdmin_(email) {
  return getUserRole_(email) === 'admin';
}

function setUserRole_(email, role) {
  const sheet = getUsersSheet_();
  const list = getUserList_();
  const idx = list.findIndex((u) => u.email === email);
  if (idx !== -1) {
    sheet.getRange(idx + 2, 2).setValue(role);
  } else {
    sheet.appendRow([email, role]);
  }
}

function removeUser_(email) {
  const sheet = getUsersSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).toLowerCase().trim() === email) sheet.deleteRow(i + 1);
  }
}

// ---------------- web app entry points ----------------

function doGet(e) {
  if (e.parameter.identify === '1') return handleIdentify_();
  if (e.parameter.admin === '1') return handleAdminPage_();

  const email = getIdentityEmail_();
  if (!email) {
    return htmlMsg_('Could not verify your Google account. Go back to the app and try signing in again.');
  }

  const path = e.parameter.path;
  if (!path) return htmlMsg_('Missing "path" parameter.');

  const segments = path.split('/').filter(Boolean);
  const fileName = segments.pop();

  let folder;
  try {
    folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  } catch (err) {
    return htmlMsg_('ROOT_FOLDER_ID is not set correctly in Code.gs.');
  }

  for (const seg of segments) {
    const it = folder.getFoldersByName(seg);
    if (!it.hasNext()) {
      return htmlMsg_('Folder "' + seg + '" not found under Drive path "' + path + '". Has this been uploaded to Drive yet?');
    }
    folder = it.next();
  }

  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) {
    return htmlMsg_('"' + fileName + '" was not found in Drive at "' + path + '". It may not be uploaded yet.');
  }

  const url = files.next().getUrl();
  return redirectHtml_(url, 'Opening ' + escapeHtml_(fileName) + '&hellip;', 'Open document');
}

function doPost(e) {
  const action = e.parameter.action;
  if (action === 'admin-set-role' || action === 'admin-remove') return handleAdminMutation_(e);
  return htmlMsg_('Unknown action.');
}

// ---------------- sign-in ----------------

// Opened in a small popup (see LoginScreen.jsx) - no form, no password,
// just a plain GET that reports back whichever Google account the
// visitor is already signed in as.
function handleIdentify_() {
  const email = getIdentityEmail_();
  if (!email) {
    return postMessageHtml_('error=' + encodeURIComponent('Could not verify your Google account. Please try again.'));
  }
  return postMessageHtml_(identityHash_(email, getUserRole_(email)));
}

// The hash-fragment payload (never a full URL - see postMessageHtml_ for
// why) that tells the React app who's signed in.
function identityHash_(email, role) {
  return 'email=' + encodeURIComponent(email) + '&role=' + encodeURIComponent(role);
}

// ---------------- admin page ----------------

function handleAdminPage_() {
  const email = getIdentityEmail_();
  if (!email || !isAdmin_(email)) {
    return htmlMsg_('You must be signed in as an administrator to view this page.');
  }
  return renderAdminPage_(email, '');
}

function handleAdminMutation_(e) {
  const email = getIdentityEmail_();
  if (!email || !isAdmin_(email)) {
    return htmlMsg_('You must be signed in as an administrator to do that.');
  }

  let notice = '';
  if (e.parameter.action === 'admin-set-role') {
    const targetEmail = (e.parameter.email || '').trim().toLowerCase();
    if (!targetEmail) {
      notice = 'Email is required.';
    } else {
      setUserRole_(targetEmail, 'admin');
      notice = 'Made ' + targetEmail + ' an admin.';
    }
  } else if (e.parameter.action === 'admin-remove') {
    const targetEmail = (e.parameter.email || '').trim().toLowerCase();
    if (targetEmail === email) {
      notice = "You can't remove your own admin access while signed in as it.";
    } else {
      removeUser_(targetEmail);
      notice = 'Removed admin access for ' + targetEmail + '.';
    }
  }

  return renderAdminPage_(email, notice);
}

function renderAdminPage_(email, notice) {
  const baseUrl = ScriptApp.getService().getUrl();
  const admins = getUserList_().filter((u) => u.role === 'admin');

  const rows = admins
    .map((u) => {
      return (
        '<tr><td>' + escapeHtml_(u.email) + '</td>' +
        '<td><form method="post" action="' + baseUrl + '" onsubmit="return confirm(\'Remove admin access for ' + escapeHtml_(u.email) + '?\')">' +
        '<input type="hidden" name="action" value="admin-remove" />' +
        '<input type="hidden" name="email" value="' + escapeHtml_(u.email) + '" />' +
        '<button type="submit">Remove</button></form></td></tr>'
      );
    })
    .join('');

  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Manage Admins &mdash; MyFLS</title><style>' +
    ':root{--bg:#0a1628;--panel:#0d1e35;--border:#1e3a5f;--text:#e8f4fd;--muted:#6b8cae;--accent:#00b4d8;--accent-text:#0a1628;}' +
    'body{font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;padding:32px 16px 64px;' +
    'color:var(--text);background:var(--bg);}' +
    'a{color:var(--accent);text-decoration:none;} a:hover{text-decoration:underline;}' +
    '.back{display:inline-block;margin-bottom:20px;font-size:13px;background:none;border:none;' +
    'color:var(--accent);cursor:pointer;padding:0;font-family:inherit;}' +
    'h1{font-size:19px;margin:0 0 4px;} .sub{color:var(--muted);font-size:13px;margin:0 0 20px;}' +
    'table{width:100%;border-collapse:collapse;margin:16px 0;background:var(--panel);border-radius:8px;overflow:hidden;}' +
    'th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--border);font-size:13px;}' +
    'th{color:var(--muted);font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.03em;}' +
    'tr:last-child td{border-bottom:none;}' +
    'form.add-form{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;align-items:center;}' +
    'input{padding:8px 10px;font-size:13px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;flex:1 1 220px;}' +
    'button{padding:8px 14px;font-size:13px;cursor:pointer;background:var(--accent);color:var(--accent-text);border:none;border-radius:4px;font-weight:600;}' +
    'td button{background:transparent;color:var(--accent);font-weight:400;padding:2px 4px;}' +
    '.notice{background:var(--panel);border:1px solid var(--border);padding:9px 12px;border-radius:6px;margin:12px 0;font-size:13px;}' +
    '</style></head><body>' +
    '<button class="back" type="button" onclick="window.close()">&larr; Close this tab</button>' +
    '<h1>Manage admins</h1>' +
    '<p class="sub">Signed in as ' + escapeHtml_(email) + '</p>' +
    (notice ? '<p class="notice">' + escapeHtml_(notice) + '</p>' : '') +
    '<p class="sub">Anyone signed in with an arabiancementcompany.com Google account can already open this app - ' +
    'this list only controls who additionally gets admin access (this page, and any future admin-only features).</p>' +
    '<table><tr><th>Email</th><th></th></tr>' + rows + '</table>' +
    '<form class="add-form" method="post" action="' + baseUrl + '">' +
    '<input type="hidden" name="action" value="admin-set-role" />' +
    '<input type="email" name="email" placeholder="name@arabiancementcompany.com" required />' +
    '<button type="submit">Make admin</button>' +
    '</form>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html);
}

// ---------------- helpers ----------------

// Apps Script's HtmlService always renders inside Google's own sandboxed
// iframe (even for a "direct" visit to the /exec URL) — its sandbox
// permissions do not include cross-origin top navigation, so a
// script-driven window.top.location.replace() to a different origin (our
// GitHub Pages app) is silently blocked. A same-frame location.href
// fallback doesn't help either: it just loads the destination *inside*
// that same iframe, trapping the user under the script.google.com address
// forever with our real app rendered one level too deep.
//
// Used for document-open only (see postMessageHtml_ below for sign-in,
// which doesn't need any of this). Opening a document is launched as its
// own standalone tab with rel="noopener" (see api.js) specifically so
// it's disposable - there's nothing to hand control back to, and no
// reason to: it exists only to show one file, so a same-frame
// location.replace() ending up with the Drive viewer rendered inside
// Google's iframe (address bar unchanged) is a fine trade for not making
// every document open require a manual click. The visible button remains
// as a last-resort manual option either way.
function redirectHtml_(url, message, linkLabel) {
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;background:#0a1628;color:#e8f4fd;' +
    'text-align:center;padding-top:20vh;margin:0;">' +
    '<p>' + (message || 'Redirecting&hellip;') + '</p>' +
    '<p><a href="' + url + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;padding:10px 22px;' +
    'background:#00b4d8;color:#0a1628;font-weight:600;text-decoration:none;border-radius:6px;">' + (linkLabel || 'Continue to MyFLS') + ' &rarr;</a></p>' +
    '<script>' +
    '(function () {' +
    '  var url = ' + JSON.stringify(url) + ';' +
    '  try {' +
    '    if (window.opener && !window.opener.closed) {' +
    '      window.opener.location = url;' +
    '      if (window.opener.focus) window.opener.focus();' +
    '      window.close();' +
    '      return;' +
    '    }' +
    '  } catch (e) {}' +
    '  try { (window.top || window).location.replace(url); } catch (e2) {}' +
    '  try { window.location.replace(url); } catch (e3) {}' +
    '})();' +
    '</script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html);
}

// Sign-in happens inside a small named popup window (see LoginScreen.jsx),
// not a hidden <iframe> - a hidden iframe was tried first and seemed
// cleaner (no window for the visitor to notice at all), but Google's Apps
// Script responses always send `X-Frame-Options: SAMEORIGIN` and
// `Content-Security-Policy: frame-ancestors 'self'`, so the browser
// silently refuses to render Apps Script content inside an iframe on any
// other origin at all - the iframe just stays blank forever. That
// restriction doesn't apply to a popup: a popup is its own top-level
// browsing context, not "framed" by anything, so this loads normally.
//
// This response is still wrapped in Google's own sandboxed iframe *within
// that popup* (as redirectHtml_ above explains), so navigating anywhere
// directly is still out - but postMessage is a message, not a
// navigation, and was built specifically to cross exactly this kind of
// boundary. window.top resolves to the popup's own top-level window
// (the popup itself, not the original tab) no matter how deep this is
// nested inside Google's wrapper, and window.top.opener from there reaches
// back to the *original* tab that opened the popup - postMessage-ing that
// window directly, then closing the popup, gets the result to the React
// app with no navigation anywhere. App.jsx's message listener applies the
// payload (a URL hash fragment) to its own session state.
//
// window.top.opener can come back empty even though the popup really was
// opened from the app tab: a domain-restricted deployment sometimes
// routes the very first popup through an extra Google account-
// confirmation step, and that kind of cross-origin hop can sever the
// opener link as a browser security measure - nothing this code can
// prevent. When that happens there is no window left to message at all,
// so the fallback here is a visible link the visitor can click by hand
// (LoginScreen.jsx also detects this - the popup closing without ever
// completing - and retries automatically once, which is usually enough
// since the retry doesn't need that extra confirmation step).
function postMessageHtml_(hash) {
  // Apps Script's server-side V8 runtime has no URL constructor (unlike a
  // browser or Node), so this has to be plain string surgery instead of
  // new URL(APP_URL).origin - APP_URL always looks like
  // "https://host/path/", and the origin is just its first two segments.
  const targetOrigin = APP_URL.split('/').slice(0, 3).join('/');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;background:#0a1628;color:#e8f4fd;' +
    'text-align:center;padding-top:20vh;margin:0;">' +
    '<div id="fallback" hidden>' +
    '<p>Couldn\'t signal the original tab automatically.</p>' +
    '<p><a href="' + APP_URL + '#' + escapeHtml_(hash) + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;padding:10px 22px;' +
    'background:#00b4d8;color:#0a1628;font-weight:600;text-decoration:none;border-radius:6px;">Continue to MyFLS &rarr;</a></p>' +
    '</div>' +
    '<script>' +
    '(function () {' +
    '  var payload = { source: "myfls-auth", hash: ' + JSON.stringify(hash) + ' };' +
    '  var target = ' + JSON.stringify(targetOrigin) + ';' +
    '  try {' +
    '    if (window.top.opener && !window.top.opener.closed) {' +
    '      window.top.opener.postMessage(payload, target);' +
    '      window.top.close();' +
    '      return;' +
    '    }' +
    '  } catch (e) {}' +
    '  document.getElementById("fallback").hidden = false;' +
    '})();' +
    '</script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html);
}

function htmlMsg_(text) {
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>body{font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;max-width:440px;margin:15vh auto 0;' +
    'padding:0 20px;color:#e8f4fd;background:#0a1628;text-align:center;}' +
    'a{color:#00b4d8;text-decoration:none;} a:hover{text-decoration:underline;}' +
    'p{font-size:14px;line-height:1.5;}' +
    'button{margin-top:4px;padding:9px 18px;background:#00b4d8;color:#0a1628;font-weight:600;border:none;' +
    'border-radius:6px;font-size:13px;cursor:pointer;font-family:inherit;}</style></head><body>' +
    '<p>' + escapeHtml_(text) + '</p>' +
    '<p><button type="button" onclick="window.close()">Close this tab</button></p>' +
    '<p><a href="' + APP_URL + '" target="_blank" rel="noopener">Open MyFLS Document Browser in a new tab</a></p>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html);
}

function escapeHtml_(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

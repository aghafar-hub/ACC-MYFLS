/**
 * Paste this into a new project at script.google.com (ROOT_FOLDER_ID and
 * APP_URL below are already set), run setupSettingsSheet() once - it
 * creates your settings spreadsheet and saves its id as a Script
 * Property automatically, so pasting in future updates never wipes it -
 * then Deploy > New deployment > type "Web app". See README.md for the
 * full walkthrough. No Google Cloud Console, no billing, no OAuth client.
 *
 * This version uses its own email+password login (not Google Sign-In):
 * passwords are hashed+salted (never stored in plain text) in a "Users"
 * sheet, and a "Sessions" sheet holds short-lived random session tokens
 * so the app can recognize a signed-in visitor on later requests.
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
// back to a placeholder every single time, breaking login with a
// confusing "You do not have permission to access the requested
// document" exception. Script Properties survive code updates.
//
// setupSettingsSheet() / migrateToPasswordAuth() below set this property
// automatically. If it's ever missing - a setup step skipped, a Script
// Properties edit that didn't save, etc. - getSettingsSheetId_() below
// self-heals by finding the sheet in Drive by its known name and saving
// the property itself, rather than requiring a precise manual UI step
// every time something goes wrong.
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

// The GitHub Pages URL this app is served from - used to redirect back
// after a successful login.
const APP_URL = 'https://aghafar-hub.github.io/ACC-MYFLS/';

// Seeded as an admin (with a random temp password logged once) if not
// already present, so the app can never end up with zero admins.
const BOOTSTRAP_ADMIN_EMAILS = ['aghafar@arabiancementcompany.com'];

const SESSION_TTL_HOURS = 12;
const REMEMBER_TTL_HOURS = 24 * 30; // "Keep me signed in" - 30 days
const HASH_ITERATIONS = 10000;

// Sheets/Drive calls occasionally throw a transient "You do not have
// permission to access the requested document" even with correct,
// unchanged sharing settings - this is a known Apps Script flake, most
// common right after publishing a new deployment version while its
// execution context is still propagating. A short retry clears it up
// without making the user re-submit the login form.
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
// guessing from what the web app's error page shows. Safe to run anytime;
// it writes one throwaway row to Sessions and leaves everything else
// untouched.
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
  try {
    var token = createSession_('diagnostic-test@example.com');
    Logger.log('OK: wrote a test row to Sessions, token starts with ' + token.slice(0, 8));
  } catch (e) {
    Logger.log('FAILED at createSession_() (writing to Sessions sheet): ' + e);
    return;
  }
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
  users.getRange(1, 1, 1, 6).setValues([['Email', 'Role', 'PasswordHash', 'Salt', 'CreatedAt', 'MustChangePassword']]);

  const sessions = ss.insertSheet('Sessions');
  sessions.getRange(1, 1, 1, 4).setValues([['Token', 'Email', 'CreatedAt', 'ExpiresAt']]);

  seedBootstrapAdmins_(users);
  PropertiesService.getScriptProperties().setProperty('SETTINGS_SHEET_ID', ss.getId());
  Logger.log('Created settings sheet and saved its id as the SETTINGS_SHEET_ID script property: ' + ss.getId());
}

// Use this INSTEAD if you already ran the old version's setupSettingsSheet()
// and have an existing sheet with an "AccessControl" tab (Email/Role/AddedAt,
// no passwords) - it upgrades that sheet in place rather than creating a
// second one. Safe to run more than once. Set the SETTINGS_SHEET_ID script
// property (Project Settings > Script Properties) to your existing settings
// sheet's id before running this.
function migrateToPasswordAuth() {
  const ss = SpreadsheetApp.openById(getSettingsSheetId_());
  let users = ss.getSheetByName('AccessControl') || ss.getSheetByName('Users');
  if (!users) {
    users = ss.insertSheet('Users');
  } else if (users.getName() !== 'Users') {
    users.setName('Users');
  }
  users.getRange(1, 1, 1, 6).setValues([['Email', 'Role', 'PasswordHash', 'Salt', 'CreatedAt', 'MustChangePassword']]);

  // give every existing row without a password a random temp one. Check
  // the Salt column (D), not PasswordHash (C) - the old 3-column schema
  // (Email/Role/AddedAt) already had *something* sitting in column C
  // (its AddedAt value), which would wrongly look like "already has a
  // hash" if we checked that column instead.
  const data = users.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const email = data[i][0];
    if (!email || data[i][3]) continue; // blank row, or already migrated (has a salt)
    const legacyAddedAt = data[i][2]; // old schema stored AddedAt here - preserve it
    if (legacyAddedAt && !data[i][4]) {
      users.getRange(i + 1, 5).setValue(legacyAddedAt);
    }
    setTempPassword_(users, i + 1, email);
  }

  if (!ss.getSheetByName('Sessions')) {
    const sessions = ss.insertSheet('Sessions');
    sessions.getRange(1, 1, 1, 4).setValues([['Token', 'Email', 'CreatedAt', 'ExpiresAt']]);
  }

  seedBootstrapAdmins_(users);
  PropertiesService.getScriptProperties().setProperty('SETTINGS_SHEET_ID', ss.getId());
  Logger.log('Migration complete.');
}

function seedBootstrapAdmins_(usersSheet) {
  const existing = usersSheet.getDataRange().getValues().slice(1).map((r) => String(r[0]).toLowerCase());
  BOOTSTRAP_ADMIN_EMAILS.forEach((adminEmail) => {
    const email = adminEmail.toLowerCase();
    if (existing.indexOf(email) !== -1) return;
    const salt = makeSalt_();
    const tempPassword = Utilities.getUuid().slice(0, 8);
    const hash = hashPassword_(tempPassword, salt);
    usersSheet.appendRow([email, 'admin', hash, salt, new Date().toISOString(), true]);
    Logger.log('Temp password for ' + email + ': ' + tempPassword + ' - sign in with this; you will be prompted to set a real password.');
  });
}

function setTempPassword_(sheet, row, email) {
  const salt = makeSalt_();
  const tempPassword = Utilities.getUuid().slice(0, 8);
  const hash = hashPassword_(tempPassword, salt);
  sheet.getRange(row, 3, 1, 2).setValues([[hash, salt]]);
  sheet.getRange(row, 6).setValue(true); // MustChangePassword
  Logger.log('Temp password for ' + email + ': ' + tempPassword + ' - sign in with this; you will be prompted to set a real password.');
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

// ---------------- password hashing ----------------
// Apps Script has no bcrypt/scrypt/Argon2 built in, so this stretches
// SHA-256 many times as a reasonable best-effort substitute. Never store
// or log a password itself once set - only its hash.

function makeSalt_() {
  return Utilities.getUuid();
}

function hashPassword_(password, salt) {
  let value = String(password) + ':' + salt;
  for (let i = 0; i < HASH_ITERATIONS; i++) {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value + salt);
    value = digest.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
  }
  return value;
}

function verifyPassword_(password, salt, expectedHash) {
  return hashPassword_(password, salt) === expectedHash;
}

// ---------------- users sheet ----------------

function getUsersSheet_() {
  return openSettingsSpreadsheet_().getSheetByName('Users');
}

function getUserList_() {
  const values = getUsersSheet_().getDataRange().getValues().slice(1);
  return values
    .filter((r) => r[0])
    .map((r) => ({
      email: String(r[0]).toLowerCase().trim(),
      role: r[1] || 'user',
      passwordHash: r[2] || '',
      salt: r[3] || '',
      createdAt: r[4] || '',
      mustChangePassword: r[5] === true || String(r[5]).toUpperCase() === 'TRUE',
    }));
}

function findUser_(email) {
  const e = (email || '').toLowerCase().trim();
  return getUserList_().find((u) => u.email === e) || null;
}

// Used by the admin panel to add a user or reset someone's password.
// Marks the account as needing a password change on next login, since
// an admin-issued password is provisional until the person personalizes
// it via the self-service change-password screen.
function upsertUser_(email, role, password) {
  const sheet = getUsersSheet_();
  const list = getUserList_();
  const idx = list.findIndex((u) => u.email === email);
  const salt = makeSalt_();
  const hash = hashPassword_(password, salt);
  if (idx !== -1) {
    sheet.getRange(idx + 2, 2, 1, 5).setValues([[role, hash, salt, list[idx].createdAt || new Date().toISOString(), true]]);
  } else {
    sheet.appendRow([email, role, hash, salt, new Date().toISOString(), true]);
  }
}

// Used by the self-service change-password screen: updates the
// password and clears the "must change" flag, without touching role.
function setUserPassword_(email, newPassword) {
  const sheet = getUsersSheet_();
  const list = getUserList_();
  const idx = list.findIndex((u) => u.email === email);
  if (idx === -1) return false;
  const salt = makeSalt_();
  const hash = hashPassword_(newPassword, salt);
  sheet.getRange(idx + 2, 3, 1, 2).setValues([[hash, salt]]);
  sheet.getRange(idx + 2, 6).setValue(false);
  return true;
}

function removeUser_(email) {
  const sheet = getUsersSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).toLowerCase().trim() === email) sheet.deleteRow(i + 1);
  }
}

// ---------------- sessions ----------------

function getSessionsSheet_() {
  return openSettingsSpreadsheet_().getSheetByName('Sessions');
}

function createSession_(email, ttlHours) {
  const sheet = getSessionsSheet_();
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const now = new Date();
  const expires = new Date(now.getTime() + (ttlHours || SESSION_TTL_HOURS) * 3600 * 1000);
  withRetry_(function () {
    sheet.appendRow([token, email, now.toISOString(), expires.toISOString()]);
  });
  return token;
}

function getSessionEmail_(token) {
  if (!token) return null;
  const values = getSessionsSheet_().getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === token) {
      if (new Date(values[i][3]) < now) return null; // expired
      return String(values[i][1]).toLowerCase();
    }
  }
  return null;
}

function deleteSession_(token) {
  const values = getSessionsSheet_().getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === token) getSessionsSheet_().deleteRow(i + 1);
  }
}

function isAdmin_(email) {
  const u = findUser_(email);
  return !!u && u.role === 'admin';
}

// ---------------- web app entry points ----------------

function doGet(e) {
  if (e.parameter.admin === '1') return handleAdminPage_(e);

  const email = getSessionEmail_(e.parameter.token);
  if (!email) {
    return htmlMsg_('Your session has expired or you are not signed in. Go back to the app and sign in again.');
  }
  if (!findUser_(email)) {
    return htmlMsg_(email + ' is not authorized to use this app. Ask your administrator to add you.');
  }

  const path = e.parameter.path;
  if (!path) return htmlMsg_('Missing "path" parameter.');

  const segments = path.split('/').filter(Boolean);
  const fileName = segments.pop();

  let folder;
  try {
    folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  } catch (err) {
    return htmlMsg_('ROOT_FOLDER_ID is not set correctly in AppsScript.gs.');
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
  if (action === 'login') return handleLogin_(e);
  if (action === 'logout') return handleLogout_(e);
  if (action === 'change-password') return handleChangePassword_(e);
  if (action === 'admin-add' || action === 'admin-remove') return handleAdminMutation_(e);
  return htmlMsg_('Unknown action.');
}

// ---------------- login / logout / change password ----------------

function handleLogin_(e) {
  const email = (e.parameter.email || '').trim().toLowerCase();
  const password = e.parameter.password || '';
  const user = findUser_(email);

  if (!user || !verifyPassword_(password, user.salt, user.passwordHash)) {
    return postMessageHtml_('error=' + encodeURIComponent('Incorrect email or password.'));
  }

  const remember = e.parameter.remember === '1';
  const token = createSession_(email, remember ? REMEMBER_TTL_HOURS : SESSION_TTL_HOURS);
  return postMessageHtml_(loginHash_(token, email, user.role, user.mustChangePassword));
}

function handleLogout_(e) {
  if (e.parameter.token) deleteSession_(e.parameter.token);
  return redirectHtml_(APP_URL);
}

function handleChangePassword_(e) {
  const email = getSessionEmail_(e.parameter.token);
  if (!email) {
    return postMessageHtml_('error=' + encodeURIComponent('Your session has expired. Please sign in again.'));
  }
  const newPassword = e.parameter.newPassword || '';
  if (newPassword.length < 6) {
    return postMessageHtml_('error=' + encodeURIComponent('Password must be at least 6 characters.'));
  }
  const user = findUser_(email);
  setUserPassword_(email, newPassword);
  return postMessageHtml_(loginHash_(e.parameter.token, email, user.role, false));
}

// The hash-fragment payload (never a full URL - see postMessageHtml_ for
// why) that tells the React app which session to use.
function loginHash_(token, email, role, mustChangePassword) {
  return 'token=' + encodeURIComponent(token) +
    '&email=' + encodeURIComponent(email) +
    '&role=' + encodeURIComponent(role) +
    '&mustChange=' + (mustChangePassword ? '1' : '0');
}

// ---------------- admin page ----------------

function handleAdminPage_(e) {
  const email = getSessionEmail_(e.parameter.token);
  if (!email || !isAdmin_(email)) {
    return htmlMsg_('You must be signed in as an administrator to view this page. Go back to the app, sign in, then open Settings > Admin.');
  }
  return renderAdminPage_(email, e.parameter.token, '');
}

function handleAdminMutation_(e) {
  const email = getSessionEmail_(e.parameter.token);
  if (!email || !isAdmin_(email)) {
    return htmlMsg_('You must be signed in as an administrator to do that.');
  }

  let notice = '';
  if (e.parameter.action === 'admin-add') {
    const newEmail = (e.parameter.email || '').trim().toLowerCase();
    const role = e.parameter.role === 'admin' ? 'admin' : 'user';
    const password = e.parameter.password || '';
    if (!newEmail || password.length < 6) {
      notice = 'Email is required and password must be at least 6 characters.';
    } else {
      upsertUser_(newEmail, role, password);
      notice = 'Saved ' + newEmail + '.';
    }
  } else if (e.parameter.action === 'admin-remove') {
    const targetEmail = (e.parameter.email || '').trim().toLowerCase();
    if (targetEmail === email) {
      notice = "You can't remove your own account while signed in as it.";
    } else {
      removeUser_(targetEmail);
      notice = 'Removed ' + targetEmail + '.';
    }
  }

  return renderAdminPage_(email, e.parameter.token, notice);
}

function renderAdminPage_(email, token, notice) {
  const baseUrl = ScriptApp.getService().getUrl();
  const list = getUserList_();

  const rows = list.map((u) => {
    return (
      '<tr><td>' + escapeHtml_(u.email) + '</td><td>' + escapeHtml_(u.role) + '</td>' +
      '<td>' + (u.mustChangePassword ? 'Must change password' : '') + '</td>' +
      '<td><form method="post" action="' + baseUrl + '" onsubmit="return confirm(\'Remove ' + escapeHtml_(u.email) + '?\')">' +
      '<input type="hidden" name="action" value="admin-remove" />' +
      '<input type="hidden" name="token" value="' + escapeHtml_(token) + '" />' +
      '<input type="hidden" name="email" value="' + escapeHtml_(u.email) + '" />' +
      '<button type="submit">Remove</button></form></td></tr>'
    );
  }).join('');

  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Manage Access &mdash; MyFLS</title><style>' +
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
    'input,select{padding:8px 10px;font-size:13px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;}' +
    'button{padding:8px 14px;font-size:13px;cursor:pointer;background:var(--accent);color:var(--accent-text);border:none;border-radius:4px;font-weight:600;}' +
    'td button{background:transparent;color:var(--accent);font-weight:400;padding:2px 4px;}' +
    '.notice{background:var(--panel);border:1px solid var(--border);padding:9px 12px;border-radius:6px;margin:12px 0;font-size:13px;}' +
    '</style></head><body>' +
    '<button class="back" type="button" onclick="window.close()">&larr; Close this tab</button>' +
    '<h1>Manage access</h1>' +
    '<p class="sub">Signed in as ' + escapeHtml_(email) + '</p>' +
    (notice ? '<p class="notice">' + escapeHtml_(notice) + '</p>' : '') +
    '<table><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr>' + rows + '</table>' +
    '<p class="sub">Add a user, or re-enter an existing email with a new password to reset it (they will be asked to set their own on next sign-in):</p>' +
    '<form class="add-form" method="post" action="' + baseUrl + '">' +
    '<input type="hidden" name="action" value="admin-add" />' +
    '<input type="hidden" name="token" value="' + escapeHtml_(token) + '" />' +
    '<input type="email" name="email" placeholder="name@example.com" required />' +
    '<input type="password" name="password" placeholder="password (min 6 chars)" minlength="6" required />' +
    '<select name="role"><option value="user">user</option><option value="admin">admin</option></select>' +
    '<button type="submit">Save</button>' +
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
// Used for document-open only (see postMessageHtml_ below for
// login/logout/change-password, which don't need any of this). Opening a
// document is launched as its own standalone tab with rel="noopener" (see
// api.js) specifically so it's disposable - there's nothing to hand
// control back to, and no reason to: it exists only to show one file, so
// a same-frame location.replace() ending up with the Drive viewer
// rendered inside Google's iframe (address bar unchanged) is a fine
// trade for not making every document open require a manual click. The
// visible button remains as a last-resort manual option either way.
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

// Login, change-password and their errors happen inside a hidden
// <iframe> embedded directly in the React app's own page (see
// LoginScreen.jsx / ChangePasswordScreen.jsx) - not a popup window, so
// there's no separate window for the visitor to notice at all, and
// nothing for a popup blocker to ever interfere with. This response is
// still wrapped in Google's own sandboxed iframe on top of that (as
// redirectHtml_ above explains), so navigation of any kind is out - but
// postMessage is a message, not a navigation, and is never subject to
// that sandbox regardless of how many iframes it has to cross.
// window.top always resolves to the outermost real browser window no
// matter how deep this is nested (our hidden iframe, inside Google's own
// wrapper, inside Google's inner iframe), so a single postMessage reaches
// the React app directly. App.jsx's message listener applies the payload
// (a URL hash fragment, same shape as the old redirect-based flow) to its
// own session state - no page navigation happens anywhere.
function postMessageHtml_(hash) {
  const targetOrigin = new URL(APP_URL).origin;
  const html =
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>' +
    'try { window.top.postMessage({ source: "myfls-auth", hash: ' + JSON.stringify(hash) + ' }, ' + JSON.stringify(targetOrigin) + '); } catch (e) {}' +
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

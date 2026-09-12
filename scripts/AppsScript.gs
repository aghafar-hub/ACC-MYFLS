/**
 * Paste this into a new project at script.google.com, fill in
 * ROOT_FOLDER_ID and (after running setupSettingsSheet() once)
 * SETTINGS_SHEET_ID below, then Deploy > New deployment > type "Web app".
 * See README.md for the full walkthrough. No Google Cloud Console, no
 * billing, no OAuth client needed.
 *
 * Access control lives entirely in a Google Sheet (the "settings
 * database"), not in the deployment's "Who has access" setting - deploy
 * with "Anyone with a Google account" and let the AccessControl sheet
 * decide exactly who gets in. Manage it via the built-in admin page
 * (this script's URL with ?admin=1) rather than editing the sheet by
 * hand.
 *
 * ROOT_FOLDER_ID must point to a Drive folder that mirrors the local
 * Desktop/MyFLS folder structure: one subfolder per plant/project, with
 * the exact same names and nesting, containing the same files. The app
 * asks for a document by its path under that root, e.g.
 *   "ACC line 1/documents/05-46003-321-201_A1-L________1.0_EN.TIF"
 *   "Coal systems/Myfls Coal-1/some/nested/drawing.pdf"
 */

const ROOT_FOLDER_ID = '17OeueXcCpoAdjaZYP7xeDzIU99lejH0X';

// Fill this in after running setupSettingsSheet() once (see below) and
// copying the id it logs.
const SETTINGS_SHEET_ID = 'YOUR_SETTINGS_SHEET_ID';

// Always treated as an admin, even if the sheet is empty, missing, or
// this email isn't in it yet - a safety net so you can never lock
// yourself out.
const BOOTSTRAP_ADMIN_EMAILS = ['aghafar@arabiancementcompany.com'];

// ---------------- one-time setup ----------------
// Run this once from the Apps Script editor (select it in the function
// dropdown, click Run), then copy the id it logs (View > Logs) into
// SETTINGS_SHEET_ID above.
function setupSettingsSheet() {
  const ss = SpreadsheetApp.create('MyFLS Document Browser - Access Control');
  const sheet = ss.getActiveSheet();
  sheet.setName('AccessControl');
  sheet.getRange(1, 1, 1, 3).setValues([['Email', 'Role', 'AddedAt']]);
  BOOTSTRAP_ADMIN_EMAILS.forEach((adminEmail) => {
    sheet.appendRow([adminEmail.toLowerCase(), 'admin', new Date().toISOString()]);
  });
  Logger.log('Created settings sheet. Set SETTINGS_SHEET_ID to: ' + ss.getId());
}

// ---------------- access control (backed by the sheet) ----------------

function getSettingsSheet_() {
  return SpreadsheetApp.openById(SETTINGS_SHEET_ID).getSheetByName('AccessControl');
}

function getAccessList_() {
  const sheet = getSettingsSheet_();
  const values = sheet.getDataRange().getValues().slice(1); // skip header row
  return values
    .filter((r) => r[0])
    .map((r) => ({ email: String(r[0]).toLowerCase().trim(), role: r[1] || 'user', addedAt: r[2] }));
}

function isBootstrapAdmin_(email) {
  const e = (email || '').toLowerCase();
  return BOOTSTRAP_ADMIN_EMAILS.some((a) => a.toLowerCase() === e);
}

function isAllowed_(email) {
  if (isBootstrapAdmin_(email)) return true;
  const e = (email || '').toLowerCase();
  try {
    return getAccessList_().some((u) => u.email === e);
  } catch (err) {
    return false; // sheet not configured yet - fail closed except for bootstrap admins
  }
}

function isAdmin_(email) {
  if (isBootstrapAdmin_(email)) return true;
  const e = (email || '').toLowerCase();
  try {
    return getAccessList_().some((u) => u.email === e && u.role === 'admin');
  } catch (err) {
    return false;
  }
}

function addUser_(email, role) {
  const sheet = getSettingsSheet_();
  const list = getAccessList_();
  const idx = list.findIndex((u) => u.email === email);
  if (idx !== -1) {
    sheet.getRange(idx + 2, 2).setValue(role); // +2: header row + 0-index
  } else {
    sheet.appendRow([email, role, new Date().toISOString()]);
  }
}

function removeUser_(email) {
  const sheet = getSettingsSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).toLowerCase().trim() === email) sheet.deleteRow(i + 1);
  }
}

// ---------------- web app entry point ----------------

function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    return htmlMsg_('Could not determine your Google account email. Make sure you are signed in to Google in this browser.');
  }

  if (e.parameter.admin === '1') {
    return handleAdminPage_(e, email);
  }

  if (!isAllowed_(email)) {
    return htmlMsg_(email + ' is not authorized to use this app yet. Ask your administrator to add you.');
  }

  const path = e.parameter.path;
  if (!path) {
    return htmlMsg_('Missing "path" parameter.');
  }

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
      return htmlMsg_('Folder "' + seg + '" not found under Drive path "' + path + '". ' +
        'Has this been uploaded to Drive yet?');
    }
    folder = it.next();
  }

  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) {
    return htmlMsg_('"' + fileName + '" was not found in Drive at "' + path + '". ' +
      'It may not be uploaded yet.');
  }

  const url = files.next().getUrl(); // https://drive.google.com/file/d/<id>/view
  return HtmlService.createHtmlOutput(
    '<script>window.location.replace(' + JSON.stringify(url) + ');</script>' +
    '<p>Opening ' + escapeHtml_(fileName) + '... ' +
    '<a href="' + url + '">Click here</a> if you are not redirected.</p>'
  );
}

// ---------------- admin page ----------------

function handleAdminPage_(e, email) {
  if (!isAdmin_(email)) {
    return htmlMsg_(email + ' is not an administrator of this app.');
  }

  const action = e.parameter.action;
  if (action === 'add' && e.parameter.email) {
    const newEmail = e.parameter.email.trim().toLowerCase();
    const role = e.parameter.role === 'admin' ? 'admin' : 'user';
    addUser_(newEmail, role);
  } else if (action === 'remove' && e.parameter.email) {
    removeUser_(e.parameter.email.trim().toLowerCase());
  }

  const baseUrl = ScriptApp.getService().getUrl();
  const list = getAccessList_();

  const rows = list.map((u) => {
    const removeUrl = baseUrl + '?admin=1&action=remove&email=' + encodeURIComponent(u.email);
    return (
      '<tr><td>' + escapeHtml_(u.email) + '</td><td>' + escapeHtml_(u.role) + '</td>' +
      '<td><a href="' + removeUrl + '" onclick="return confirm(\'Remove ' + escapeHtml_(u.email) + '?\')">Remove</a></td></tr>'
    );
  }).join('');

  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>Manage Access</title><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#1c2733;}' +
    'h1{font-size:18px;} table{width:100%;border-collapse:collapse;margin:16px 0;}' +
    'th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:14px;}' +
    'form{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;}' +
    'input,select,button{padding:7px;font-size:14px;} button{cursor:pointer;}' +
    'a{color:#0b5fa5;}' +
    '</style></head><body>' +
    '<h1>Manage document browser access</h1>' +
    '<p>Signed in as ' + escapeHtml_(email) + '.</p>' +
    '<table><tr><th>Email</th><th>Role</th><th></th></tr>' + rows + '</table>' +
    '<form method="get" action="' + baseUrl + '">' +
    '<input type="hidden" name="admin" value="1" />' +
    '<input type="hidden" name="action" value="add" />' +
    '<input type="email" name="email" placeholder="name@example.com" required />' +
    '<select name="role"><option value="user">user</option><option value="admin">admin</option></select>' +
    '<button type="submit">Add</button>' +
    '</form>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html);
}

function htmlMsg_(text) {
  return HtmlService.createHtmlOutput('<p>' + escapeHtml_(text) + '</p>');
}

function escapeHtml_(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

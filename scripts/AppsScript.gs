/**
 * Paste this into a new project at script.google.com, fill in
 * ROOT_FOLDER_ID below, then Deploy > New deployment > type "Web app".
 * See README.md for the full walkthrough. No Google Cloud Console, no
 * billing, no OAuth client needed - Google enforces who can reach this
 * script based on the "Who has access" setting you choose at deploy time.
 *
 * ROOT_FOLDER_ID must point to a Drive folder that mirrors the local
 * Desktop/MyFLS folder structure: one subfolder per plant/project, with
 * the exact same names and nesting, containing the same files. The app
 * asks for a document by its path under that root, e.g.
 *   "ACC line 1/documents/05-46003-321-201_A1-L________1.0_EN.TIF"
 *   "Coal systems/Myfls Coal-1/some/nested/drawing.pdf"
 */

const ROOT_FOLDER_ID = 'YOUR_ROOT_DRIVE_FOLDER_ID';

// Optional extra allow-list, checked on top of whatever the deployment's
// "Who has access" setting already restricts. Leave empty to rely on that
// setting alone (e.g. "Anyone within arabiancementcompany.com").
const ALLOWED_EMAILS = [
  // 'aghafar@arabiancementcompany.com',
];

function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  if (ALLOWED_EMAILS.length && ALLOWED_EMAILS.indexOf(email) === -1) {
    return htmlMsg((email || 'you') + ' is not authorized to view these documents.');
  }

  const path = e.parameter.path;
  if (!path) {
    return htmlMsg('Missing "path" parameter.');
  }

  const segments = path.split('/').filter(Boolean);
  const fileName = segments.pop();

  let folder;
  try {
    folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  } catch (err) {
    return htmlMsg('ROOT_FOLDER_ID is not set correctly in AppsScript.gs.');
  }

  for (const seg of segments) {
    const it = folder.getFoldersByName(seg);
    if (!it.hasNext()) {
      return htmlMsg('Folder "' + seg + '" not found under Drive path "' + path + '". ' +
        'Has this been uploaded to Drive yet?');
    }
    folder = it.next();
  }

  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) {
    return htmlMsg('"' + fileName + '" was not found in Drive at "' + path + '". ' +
      'It may not be uploaded yet.');
  }

  const url = files.next().getUrl(); // https://drive.google.com/file/d/<id>/view
  return HtmlService.createHtmlOutput(
    '<script>window.location.replace(' + JSON.stringify(url) + ');</script>' +
    '<p>Opening ' + escapeHtml(fileName) + '... ' +
    '<a href="' + url + '">Click here</a> if you are not redirected.</p>'
  );
}

function htmlMsg(text) {
  return HtmlService.createHtmlOutput('<p>' + escapeHtml(text) + '</p>');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

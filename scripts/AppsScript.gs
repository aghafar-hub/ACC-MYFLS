/**
 * Paste this into a new project at script.google.com, fill in FOLDER_ID
 * below, then Deploy > New deployment > type "Web app". See README.md for
 * the full walkthrough. No Google Cloud Console, no billing, no OAuth
 * client needed - Google enforces who can reach this script based on the
 * "Who has access" setting you choose at deploy time.
 */

// The Drive folder holding the uploaded documents (flat, same file names
// as the local documents/ folder). Get this from the folder's URL:
// https://drive.google.com/drive/folders/<FOLDER_ID>
const FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID';

// Optional extra allow-list, checked on top of whatever the deployment's
// "Who has access" setting already restricts. Leave empty to rely on that
// setting alone (e.g. "Anyone within arabiancementcompany.com").
const ALLOWED_EMAILS = [
  // 'aghafar@arabiancementcompany.com',
];

function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  if (ALLOWED_EMAILS.length && ALLOWED_EMAILS.indexOf(email) === -1) {
    return HtmlService.createHtmlOutput(
      '<p>' + escapeHtml(email || 'you') + ' is not authorized to view these documents.</p>'
    );
  }

  const fileName = e.parameter.file;
  if (!fileName) {
    return HtmlService.createHtmlOutput('<p>Missing "file" parameter.</p>');
  }

  let folder;
  try {
    folder = DriveApp.getFolderById(FOLDER_ID);
  } catch (err) {
    return HtmlService.createHtmlOutput('<p>FOLDER_ID is not set correctly in AppsScript.gs.</p>');
  }

  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) {
    return HtmlService.createHtmlOutput(
      '<p>"' + escapeHtml(fileName) + '" was not found in the Drive folder. ' +
      'It may not be uploaded yet.</p>'
    );
  }

  const url = files.next().getUrl(); // https://drive.google.com/file/d/<id>/view
  return HtmlService.createHtmlOutput(
    '<script>window.location.replace(' + JSON.stringify(url) + ');</script>' +
    '<p>Opening ' + escapeHtml(fileName) + '... ' +
    '<a href="' + url + '">Click here</a> if you are not redirected.</p>'
  );
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

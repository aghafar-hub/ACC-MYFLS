// Fill these in after you've created the Google Cloud OAuth client and
// uploaded the documents/ folder to a Google Drive folder. See README.md.
//
// None of these values are secret — an OAuth "Client ID" for a browser app
// is meant to be public. Access is actually restricted by (a) the OAuth
// consent screen's test-user / internal-domain list in Google Cloud, and
// (b) the ALLOWED_EMAILS check below, which runs after sign-in.
window.APP_CONFIG = {
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',

  // The Google Drive folder that holds the uploaded documents (flat, same
  // file names as the local documents/ folder). Get this from the folder's
  // URL: https://drive.google.com/drive/folders/<FOLDER_ID>
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID',

  // Extra client-side allow-list, checked after Google Sign-In succeeds.
  // Leave empty to allow anyone the OAuth consent screen itself allows.
  ALLOWED_EMAILS: [
    // 'aghafar@arabiancementcompany.com',
  ],
};

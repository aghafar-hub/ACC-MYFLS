import { getStoredRootHandle, hasReadPermission, isFileSystemAccessSupported, requestReadPermission, resolveFile } from "./localFiles";

const DATA_BASE = `${import.meta.env.BASE_URL}data`;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

export const fetchSourcesList = () => fetchJson(`${DATA_BASE}/sources.json`).then((d) => d.sources);
export const fetchRichTree = (id) => fetchJson(`${DATA_BASE}/${id}/tree.json`);
export const fetchRichDocs = (id) => fetchJson(`${DATA_BASE}/${id}/documents.json`);
export const fetchPlainFolderTree = (id) => fetchJson(`${DATA_BASE}/${id}/folderTree.json`);

// No backend at all: this reads a document straight off disk, from
// wherever Google Drive for Desktop has synced the shared folder on this
// PC (see the "Local files" section in Settings), via the File System
// Access API - not a file:// link, which every browser refuses to
// navigate to from a page served over http(s).
//
// window.open() is called first and synchronously, before any await -
// popup blockers require a real, immediate user gesture, and everything
// after this point (reading the stored folder handle, checking
// permission, walking into subfolders) is async. The reserved blank tab
// gets redirected to the real blob: URL once the file is actually ready.
export async function openDocument(relativePath) {
  const popup = window.open("", "_blank");

  if (!isFileSystemAccessSupported()) {
    if (popup) popup.close();
    return { ok: false, message: "Local file access needs Chrome or Edge - this browser doesn't support it." };
  }

  const root = await getStoredRootHandle();
  if (!root) {
    if (popup) popup.close();
    return { ok: false, message: "Set your local files folder in Settings first." };
  }

  const granted = (await hasReadPermission(root)) || (await requestReadPermission(root));
  if (!granted) {
    if (popup) popup.close();
    return { ok: false, message: "Permission to your local files folder was denied." };
  }

  let file;
  try {
    file = await resolveFile(root, relativePath);
  } catch {
    if (popup) popup.close();
    return { ok: false, message: `Couldn't find "${relativePath.split("/").pop()}" in your local files folder.` };
  }

  const url = URL.createObjectURL(file);
  if (popup) {
    popup.location = url;
  } else {
    window.open(url, "_blank");
  }
  // The new tab has already loaded the blob by the time this fires -
  // holding the object URL open forever would leak memory over a long
  // session with many documents opened.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { ok: true };
}

// Local document access via the File System Access API - the actual
// working replacement for a plain file:// link. Chrome (and every other
// browser) flatly refuses to navigate from an http(s) page to a file://
// URL at all ("Not allowed to load local resource") - there's no way
// around that from JS, it's a hard security restriction, not a URL-
// formatting problem. This API instead asks the visitor to grant this
// origin permission to a folder (a native OS picker, once), then reads
// files from it directly - fully within the browser's normal same-origin
// permission model, no file:// URL involved anywhere.
//
// Chrome/Edge only (not Firefox or Safari as of when this was written) -
// see isFileSystemAccessSupported().
//
// The picked FileSystemDirectoryHandle is stored in IndexedDB (it isn't
// JSON-serializable, so localStorage can't hold it) so it survives a
// reload without re-picking - though the browser still re-confirms read
// permission periodically as its own security measure, not something
// this code controls.

const DB_NAME = "myfls-local-files";
const STORE_NAME = "handles";
const HANDLE_KEY = "root";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isFileSystemAccessSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// Opens the native folder picker and remembers the chosen folder for
// next time. Must be called directly from a click handler (not after an
// await) - like window.open, the browser requires a real user gesture.
export async function pickLocalRoot() {
  const handle = await window.showDirectoryPicker({ id: "myfls-root", mode: "read" });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function getStoredRootHandle() {
  try {
    return (await idbGet(HANDLE_KEY)) || null;
  } catch {
    return null;
  }
}

export async function hasReadPermission(handle) {
  return (await handle.queryPermission({ mode: "read" })) === "granted";
}

// Re-prompts for permission on an already-picked folder (a quick native
// confirmation, not the full folder picker again). Must be called from a
// user gesture the same way pickLocalRoot is.
export async function requestReadPermission(handle) {
  return (await handle.requestPermission({ mode: "read" })) === "granted";
}

// Resolves a "a/b/c.pdf"-shaped relative path under the given root
// directory handle to a File, or throws if any segment doesn't exist.
export async function resolveFile(rootHandle, relativePath) {
  const segments = relativePath.split("/").filter(Boolean);
  const fileName = segments.pop();
  let dir = rootHandle;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg);
  }
  const fileHandle = await dir.getFileHandle(fileName);
  return fileHandle.getFile();
}

import { APP_CONFIG, getSession, isAppsScriptConfigured } from "./config";

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

// Opening a document: a direct Drive link (baked in by
// scripts/merge-drive-links.js) opens instantly with no backend
// involvement. Anything without one yet falls back to the Apps Script
// path-resolution hop, which still works but is slower and needs a
// valid session token.
export function openDocument(driveUrl, fallbackDrivePath) {
  if (driveUrl) {
    window.open(driveUrl, "_blank", "noopener");
    return { ok: true };
  }
  if (!isAppsScriptConfigured()) {
    return { ok: false, message: "Document opening is not configured yet (see README)." };
  }
  const session = getSession();
  if (!session || !session.token) {
    return { ok: false, message: "Please sign in again." };
  }
  const url = `${APP_CONFIG.APPS_SCRIPT_URL}?path=${encodeURIComponent(fallbackDrivePath)}&token=${encodeURIComponent(session.token)}`;
  window.open(url, "_blank", "noopener");
  return { ok: true };
}

export function adminPanelUrl(token) {
  return `${APP_CONFIG.APPS_SCRIPT_URL}?admin=1&token=${encodeURIComponent(token)}`;
}

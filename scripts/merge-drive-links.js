#!/usr/bin/env node
/**
 * Bakes direct Drive file links into data/*.json so the app can open
 * documents with a plain link - no Apps Script round-trip, no Google
 * interstitial, no per-click delay.
 *
 * Prerequisite: run exportDriveManifest() in AppsScript.gs once (see the
 * comment above that function), then download the resulting
 * "DriveManifest" sheet tab as CSV (File > Download > Comma-separated
 * values (.csv)).
 *
 * Usage: node scripts/merge-drive-links.js <path-to-DriveManifest.csv> [dataDir]
 *   e.g. node scripts/merge-drive-links.js ~/Downloads/DriveManifest.csv ./public/data
 */

const fs = require("fs");
const path = require("path");

const CSV_PATH = process.argv[2];
const DATA_DIR = process.argv[3] || path.join(__dirname, "..", "public", "data");

if (!CSV_PATH) {
  console.error("Usage: node merge-drive-links.js <path-to-DriveManifest.csv> [dataDir]");
  process.exit(1);
}

// Minimal CSV parser handling quoted fields (Sheets quotes any field
// containing a comma, quote, or newline).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeKey(p) {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}

console.log(`Reading ${CSV_PATH}...`);
const csvText = fs.readFileSync(CSV_PATH, "utf8");
const rows = parseCsv(csvText);
const header = rows[0].map((h) => h.trim().toLowerCase());
const pathIdx = header.indexOf("path");
const idIdx = header.indexOf("fileid");
const linkIdx = header.indexOf("webviewlink");
if (pathIdx === -1 || idIdx === -1) {
  console.error("CSV must have Path and FileId columns (from the DriveManifest sheet tab).");
  process.exit(1);
}

const manifest = new Map();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r[pathIdx]) continue;
  manifest.set(normalizeKey(r[pathIdx]), {
    id: r[idIdx],
    webViewLink: linkIdx !== -1 ? r[linkIdx] : "",
  });
}
console.log(`Loaded ${manifest.size} files from the manifest.`);

const sources = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "sources.json"), "utf8")).sources;

function resolveUrl(hit) {
  return hit.webViewLink || `https://drive.google.com/file/d/${hit.id}/view`;
}

let totalMatched = 0;
let totalMissing = 0;

for (const s of sources) {
  if (s.kind === "rich") {
    const docsPath = path.join(DATA_DIR, s.id, "documents.json");
    if (!fs.existsSync(docsPath)) continue;
    const docs = JSON.parse(fs.readFileSync(docsPath, "utf8"));
    let matched = 0;
    for (const d of docs) {
      const joinPath = normalizeKey(`${s.driveFolderName}/documents/${d.fileName}`);
      const hit = manifest.get(joinPath);
      if (hit) {
        d.driveUrl = resolveUrl(hit);
        matched++;
      } else delete d.driveUrl;
    }
    fs.writeFileSync(docsPath, JSON.stringify(docs));
    console.log(`${s.id}: ${matched}/${docs.length} documents matched`);
    totalMatched += matched;
    totalMissing += docs.length - matched;
  } else {
    const treePath = path.join(DATA_DIR, s.id, "folderTree.json");
    if (!fs.existsSync(treePath)) continue;
    const data = JSON.parse(fs.readFileSync(treePath, "utf8"));
    const stats = { matched: 0, missing: 0 };
    mergePlainNode(data.root, "", s.driveFolderName, manifest, stats);
    fs.writeFileSync(treePath, JSON.stringify(data));
    console.log(`${s.id}: ${stats.matched}/${stats.matched + stats.missing} files matched`);
    totalMatched += stats.matched;
    totalMissing += stats.missing;
  }
}

function mergePlainNode(node, relPath, driveFolderName, manifest, stats) {
  if (node.type === "file") {
    const joinPath = normalizeKey(driveFolderName ? `${driveFolderName}/${relPath}` : relPath);
    const hit = manifest.get(joinPath);
    if (hit) {
      node.driveUrl = resolveUrl(hit);
      stats.matched++;
    } else {
      delete node.driveUrl;
      stats.missing++;
    }
    return;
  }
  for (const child of node.children || []) {
    const childRelPath = relPath ? `${relPath}/${child.name}` : child.name;
    mergePlainNode(child, childRelPath, driveFolderName, manifest, stats);
  }
}

console.log(`\nTotal: ${totalMatched} matched, ${totalMissing} not found in Drive yet.`);
console.log("Commit and push the updated data/*.json files to make these links live.");

#!/usr/bin/env node
/**
 * Crawls a plain folder (no myFLS tree/xml database behind it - just
 * nested folders of files) into a JSON tree for the "plain" browser view.
 *
 * Usage: node scripts/extract-plain.js <path-to-folder> <source-id> [outputDir] [--exclude=name1,name2]
 *   e.g. node scripts/extract-plain.js "../Coal systems" coal-systems ./public/data
 *   e.g. node scripts/extract-plain.js "../New Bucket Elevators - L1" new-bucket-elevators-files ./data --exclude=CD
 *
 * --exclude names a top-level child (by exact name) to skip entirely -
 * used when a subfolder is actually its own myFLS export handled
 * separately by extract.js, and shouldn't also show up as plain content.
 *
 * Writes <outputDir>/<source-id>/folderTree.json:
 *   { label: "Coal systems", root: { name, type: 'folder', children: [...] } }
 * Each node is { name, type: 'file'|'folder', size?, children? } - no
 * per-node path stored, the app reconstructs the path by walking from the
 * root, which keeps the file small.
 */

const fs = require("fs");
const path = require("path");

const SRC = process.argv[2];
const SOURCE_ID = process.argv[3];
const OUT = process.argv[4] || path.join(__dirname, "..", "public", "data");
const excludeArg = process.argv.find((a) => a.startsWith("--exclude="));
const EXCLUDE = new Set(excludeArg ? excludeArg.slice("--exclude=".length).split(",") : []);

if (!SRC || !SOURCE_ID) {
  console.error("Usage: node extract-plain.js <path-to-folder> <source-id> [outputDir] [--exclude=name1,name2]");
  process.exit(1);
}

const IGNORE = new Set(["desktop.ini", "Thumbs.db", ".DS_Store"]);

function walk(dir, isTopLevel) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !IGNORE.has(e.name))
    .filter((e) => !(isTopLevel && EXCLUDE.has(e.name)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const children = [];
  let fileCount = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = walk(full, false);
      children.push({ name: entry.name, type: "folder", children: sub.children });
      fileCount += sub.fileCount;
    } else if (entry.isFile()) {
      const stat = fs.statSync(full);
      children.push({ name: entry.name, type: "file", size: stat.size });
      fileCount += 1;
    }
  }
  return { children, fileCount };
}

const label = path.basename(SRC);
console.log(`Scanning "${SRC}"...` + (EXCLUDE.size ? ` (excluding: ${[...EXCLUDE].join(", ")})` : ""));
const { children, fileCount } = walk(SRC, true);
console.log(`Found ${fileCount} files.`);

const outDir = path.join(OUT, SOURCE_ID);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "folderTree.json"), JSON.stringify({ label, root: { name: label, type: "folder", children } }));
console.log(`Wrote ${path.join(outDir, "folderTree.json")}`);

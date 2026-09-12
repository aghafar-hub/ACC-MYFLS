#!/usr/bin/env node
/**
 * Parses the legacy myFLS "CD viewer" export (js/view_*.js trees + xml/*.xml
 * document metadata) into two clean JSON files consumed by the web app:
 *   data/tree.json       - two independent navigation hierarchies (view 1 =
 *                           process/area based, view 2 = discipline based)
 *   data/documents.json  - one record per unique document file, with its
 *                           placement (node id) in each view it appears in
 *
 * Important: the same underlying node (treeid) can sit at a different depth
 * / different parent in view 1 vs view 2 - they are two independently
 * shaped trees over the same document set, not one merged graph. Node ids
 * are therefore namespaced per view: "<view>:<treeid>".
 *
 * Usage: node scripts/extract.js <path-to-myfls-export-root> [outputDir]
 *   e.g. node scripts/extract.js "../ACC line 1" ./data
 */

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = process.argv[3] || path.join(__dirname, '..', 'data');

if (!SRC) {
  console.error('Usage: node extract.js <path-to-myfls-export-root> [outputDir]');
  process.exit(1);
}

const JS_DIR = path.join(SRC, 'js');
const XML_DIR = path.join(SRC, 'xml');
const DOCS_DIR = path.join(SRC, 'documents');

// ---------- helpers ----------

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function parseQuery(qs) {
  const params = {};
  qs.split('&').forEach((pair) => {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = v !== undefined ? decodeURIComponent(v) : '';
  });
  return params;
}

function vKey(view, treeid) {
  return `${view}:${treeid}`;
}

// ---------- 1. parse a tree from js/view_N.js (nodes keyed by "view:treeid") ----------

function parseTreeFile(file, viewNo, nodes) {
  if (!fs.existsSync(file)) return;
  const src = fs.readFileSync(file, 'utf8');

  const fldRe = /gFld\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  const lnkRe = /gLnk\(\s*"[^"]*"\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;

  function ingest(re, isLeaf) {
    let m;
    while ((m = re.exec(src)) !== null) {
      const rawLabel = m[1];
      const url = m[2];
      const qIdx = url.indexOf('?');
      if (qIdx === -1) continue;
      const q = parseQuery(url.slice(qIdx + 1));
      const level = q.level !== undefined ? parseInt(q.level, 10) : NaN;
      const treeid = q.treeid;
      if (!treeid || Number.isNaN(level)) continue;

      let parentLevel = -1;
      let parentId = null;
      for (let n = 1; n <= 9; n++) {
        const key = `level_${n}_id`;
        if (q[key]) {
          if (n > parentLevel) {
            parentLevel = n;
            parentId = q[key];
          }
        }
      }

      const key = vKey(viewNo, treeid);
      if (!nodes.has(key)) {
        nodes.set(key, {
          view: viewNo,
          treeid,
          level,
          label: stripHtml(rawLabel),
          nodeType: /alt="([^"]+)"/.exec(rawLabel) ? /alt="([^"]+)"/.exec(rawLabel)[1] : null,
          parentKey: parentLevel >= 0 ? vKey(viewNo, parentId) : null,
          isLeaf,
          children: [],
        });
      }
    }
  }

  ingest(fldRe, false);
  ingest(lnkRe, true);
}

// ---------- 2. parse documents from xml/*.xml ----------

const FIELD_TAGS = [
  'document_no', 'document_file_name', 'language', 'docm_iso_code', 'eqpno',
  'version_no', 'document_type', 'status_code', 'change_status',
  'disp_date', 'publish_date', 'transmittal_no',
];

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`);
  const m = re.exec(block);
  if (!m) return '';
  return decodeEntities((m[1] !== undefined ? m[1] : m[2] || '').trim());
}

// returns Map(fileName -> { fields, candidates: [{view, key}] })
function parseXmlDocs() {
  const files = fs.readdirSync(XML_DIR).filter((f) => f.endsWith('.xml'));
  console.log(`Scanning ${files.length} xml files...`);
  const trdetailRe = /<trdetail\s+([^>]*)>([\s\S]*?)<\/trdetail>/g;
  const attrRe = /(\w+)="([^"]*)"/g;

  const byFile = new Map();
  let processed = 0;

  for (const f of files) {
    const full = path.join(XML_DIR, f);
    let content;
    try {
      content = fs.readFileSync(full, 'latin1');
    } catch (e) {
      continue;
    }

    let m;
    trdetailRe.lastIndex = 0;
    while ((m = trdetailRe.exec(content)) !== null) {
      const attrsStr = m[1];
      const block = m[2];
      const attrs = {};
      let am;
      attrRe.lastIndex = 0;
      while ((am = attrRe.exec(attrsStr)) !== null) attrs[am[1]] = am[2];

      const fileName = extractTag(block, 'document_file_name');
      if (!fileName || !attrs.treeid) continue;

      let entry = byFile.get(fileName);
      if (!entry) {
        const fields = {};
        for (const tag of FIELD_TAGS) fields[tag] = extractTag(block, tag);
        fields.title = extractTag(block, 'title');
        entry = { fields, candidates: [] };
        byFile.set(fileName, entry);
      }
      entry.candidates.push({ view: attrs.view, key: vKey(attrs.view, attrs.treeid) });
    }

    processed++;
    if (processed % 2000 === 0) console.log(`  ...${processed}/${files.length}`);
  }
  return byFile;
}

// ---------- run ----------

const nodes = new Map();
parseTreeFile(path.join(JS_DIR, 'view_1.js'), '1', nodes);
parseTreeFile(path.join(JS_DIR, 'view_2.js'), '2', nodes);
console.log(`Parsed ${nodes.size} tree nodes.`);

const byFile = parseXmlDocs();
console.log(`Parsed ${byFile.size} unique documents.`);

let existingFiles = null;
if (fs.existsSync(DOCS_DIR)) existingFiles = new Set(fs.readdirSync(DOCS_DIR));

const documents = [];
let missingOnDisk = 0;

function isAncestorOf(ancestorKey, key) {
  let cur = nodes.get(key) ? nodes.get(key).parentKey : null;
  while (cur) {
    if (cur === ancestorKey) return true;
    cur = nodes.get(cur) ? nodes.get(cur).parentKey : null;
  }
  return false;
}

for (const [fileName, entry] of byFile) {
  // a document can legitimately be cross-referenced under several leaf
  // nodes (e.g. one generic instruction sheet filed under many equipment
  // items). Keep every valid candidate per view, but drop any candidate
  // that is itself an ancestor of another candidate (a "show all levels"
  // roll-up node), so "show all levels" doesn't double-count the doc.
  const byView = {};
  for (const cand of entry.candidates) {
    if (!nodes.has(cand.key)) continue;
    if (!byView[cand.view]) byView[cand.view] = new Set();
    byView[cand.view].add(cand.key);
  }

  const placements = {};
  for (const [view, keySet] of Object.entries(byView)) {
    const keys = [...keySet];
    const leaves = keys.filter((k) => !keys.some((other) => other !== k && isAncestorOf(k, other)));
    placements[view] = leaves;
  }

  const onDisk = existingFiles ? existingFiles.has(fileName) : true;
  if (!onDisk) missingOnDisk++;

  const f = entry.fields;
  documents.push({
    fileName,
    docNo: f.document_no,
    title: f.title,
    docType: f.document_type,
    version: f.version_no,
    eqpNo: f.eqpno,
    language: f.docm_iso_code,
    status: f.change_status || f.status_code,
    publishDate: f.disp_date,
    nodeKeys: placements,
    onDisk,
  });
}
if (existingFiles) console.log(`${missingOnDisk} documents referenced in xml but not found in documents/`);

// attach children now that all nodes exist
for (const [key, node] of nodes) {
  if (node.parentKey && nodes.has(node.parentKey)) {
    nodes.get(node.parentKey).children.push(key);
  }
}

const roots = [...nodes.entries()].filter(([, n]) => !n.parentKey).map(([key]) => key);
const withDocs = documents.filter((d) => Object.values(d.nodeKeys).some((arr) => arr.length > 0)).length;
console.log(`${withDocs}/${documents.length} documents placed in at least one tree.`);

const treeOut = { roots, nodes: Object.fromEntries(nodes) };

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'tree.json'), JSON.stringify(treeOut));
fs.writeFileSync(path.join(OUT, 'documents.json'), JSON.stringify(documents));

console.log(`Wrote ${path.join(OUT, 'tree.json')} and ${path.join(OUT, 'documents.json')}`);
console.log(`Total documents: ${documents.length}`);

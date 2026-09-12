// Pure data-shaping functions - no DOM, no React - shared by the sidebar
// and document table. Ported from the original vanilla-JS app.js 1:1.

export function buildCatalog(sources) {
  const groups = new Map();
  const nestedByParent = new Map();
  const topSources = [];
  for (const s of sources) {
    if (s.parentSourceId) {
      if (!nestedByParent.has(s.parentSourceId)) nestedByParent.set(s.parentSourceId, []);
      nestedByParent.get(s.parentSourceId).push(s);
      continue;
    }
    if (s.group) {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group).push(s);
    } else {
      topSources.push(s);
    }
  }
  return { topSources, groups, nestedByParent };
}

const NODE_ICONS = {
  "Process area/Plant": "🏭",
  "Department/Process Unit": "🗂",
  Equipment: "⚙",
  "Document type": "📄",
};

export function nodeIcon(node) {
  return NODE_ICONS[node.nodeType] || "📁";
}

export function buildDocsByNode(docs, view) {
  const map = new Map();
  for (const d of docs) {
    const keys = d.nodeKeys[view];
    if (!keys) continue;
    for (const nk of keys) {
      if (!map.has(nk)) map.set(nk, []);
      map.get(nk).push(d);
    }
  }
  return map;
}

// A document can be cross-referenced under several leaf nodes in the same
// subtree (e.g. a generic instruction reused across equipment) - dedupe by
// file so "show all levels" lists each document once.
export function collectDescendantDocs(tree, docsByNode, key) {
  const seen = new Set();
  const out = [];
  const stack = [key];
  while (stack.length) {
    const k = stack.pop();
    const node = tree.nodes[k];
    if (docsByNode.has(k)) {
      for (const d of docsByNode.get(k)) {
        if (seen.has(d.fileName)) continue;
        seen.add(d.fileName);
        out.push(d);
      }
    }
    stack.push(...node.children);
  }
  return out;
}

export function collectDescendantDocsMulti(tree, docsByNode, keys) {
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    for (const d of collectDescendantDocs(tree, docsByNode, k)) {
      if (seen.has(d.fileName)) continue;
      seen.add(d.fileName);
      out.push(d);
    }
  }
  return out;
}

export function ancestorChain(tree, key) {
  const chain = [];
  let cur = key;
  while (cur) {
    chain.unshift(cur);
    cur = tree.nodes[cur].parentKey;
  }
  return chain;
}

export function indexPlainTree(root) {
  const nodesByPath = new Map();
  const fileIndex = [];
  (function walk(node, parentPath) {
    const key = parentPath ? `${parentPath}/${node.name}` : node.name;
    nodesByPath.set(key, node);
    if (node.type === "folder") {
      for (const child of node.children || []) walk(child, key);
    } else {
      fileIndex.push({ name: node.name, path: key, size: node.size || 0, driveUrl: node.driveUrl || null });
    }
  })(root, "");
  return { nodesByPath, fileIndex };
}

export function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes;
  for (const u of units) {
    v /= 1024;
    if (v < 1024) return `${v.toFixed(1)} ${u}`;
  }
  return `${v.toFixed(1)} TB`;
}

export function statusClass(status) {
  if (!status) return "";
  const s = status.toLowerCase();
  if (s.includes("new")) return "status-new";
  if (s.includes("updat")) return "status-updated";
  return "";
}

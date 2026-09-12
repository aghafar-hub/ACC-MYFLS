(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const PAGE_SIZE = 100;

  let SOURCES = [];
  let currentSource = null; // { id, label, kind: 'rich'|'plain', driveFolderName }

  // ---- rich-source state (myFLS tree + xml export) ----
  let TREE = null;
  let DOCS = null;
  let docsByNode = new Map();
  let selectedNodeKey = null;
  let currentView = '1';
  let showAllLevels = true;

  // ---- plain-source state (plain nested folders) ----
  let PLAIN_ROOT = null;
  let plainNodesByPath = new Map(); // path -> { node, parentPath }
  let plainFileIndex = []; // [{ name, path, size }]
  let selectedFolderPath = '';

  let sortKey = 'docNo';
  let sortDir = 1;
  let page = 1;
  let searchTerm = '';

  const el = (id) => document.getElementById(id);

  // ---------------- bootstrap ----------------

  async function main() {
    const res = await fetch('data/sources.json');
    const data = await res.json();
    SOURCES = data.sources;

    const select = el('sourceSelect');
    select.innerHTML = '';
    const groups = new Map(); // group label -> <optgroup>
    for (const s of SOURCES) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      if (s.group) {
        if (!groups.has(s.group)) {
          const og = document.createElement('optgroup');
          og.label = s.group;
          groups.set(s.group, og);
          select.appendChild(og);
        }
        groups.get(s.group).appendChild(opt);
      } else {
        select.appendChild(opt);
      }
    }
    select.addEventListener('change', () => selectSource(select.value));

    wireControls();
    initAuth();
    await selectSource(SOURCES[0].id);
  }

  async function selectSource(id) {
    currentSource = SOURCES.find((s) => s.id === id);
    el('sourceSelect').value = id;
    searchTerm = '';
    el('searchBox').value = '';
    page = 1;

    const isRich = currentSource.kind === 'rich';
    el('viewSelect').hidden = !isRich;
    el('showAllLevelsWrap').hidden = !isRich;

    if (isRich) {
      await loadRichSource(currentSource.id);
      buildRichTree();
    } else {
      await loadPlainSource(currentSource.id);
      buildPlainTree();
    }
  }

  function nodeLabel(node) {
    const iconMap = {
      'Process area/Plant': '🏭',
      'Department/Process Unit': '🗂',
      Equipment: '⚙',
      'Document type': '📄',
    };
    return (iconMap[node.nodeType] || '📁') + ' ' + node.label;
  }

  // ================= RICH SOURCE (myFLS tree/xml) =================

  async function loadRichSource(id) {
    const [tree, docs] = await Promise.all([
      fetch(`data/${id}/tree.json`).then((r) => r.json()),
      fetch(`data/${id}/documents.json`).then((r) => r.json()),
    ]);
    TREE = tree;
    DOCS = docs;
    currentView = '1';
    el('viewSelect').value = '1';
    rebuildDocsByNode();
  }

  function rebuildDocsByNode() {
    docsByNode = new Map();
    for (const d of DOCS) {
      const keys = d.nodeKeys[currentView];
      if (!keys) continue;
      for (const nk of keys) {
        if (!docsByNode.has(nk)) docsByNode.set(nk, []);
        docsByNode.get(nk).push(d);
      }
    }
  }

  function buildRichTree() {
    const rootUl = el('tree');
    rootUl.innerHTML = '';
    el('treePanelTitle').textContent = 'Complete project';
    const roots = TREE.roots.filter((k) => TREE.nodes[k].view === currentView);
    for (const key of roots) rootUl.appendChild(renderRichNode(key));
    selectedNodeKey = null;
    el('breadcrumb').textContent = '';
    renderDocTableHead();
    renderDocs();
  }

  function renderRichNode(key) {
    const node = TREE.nodes[key];
    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'node-row';
    row.dataset.key = key;

    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.textContent = node.children.length ? '▸' : '';
    row.appendChild(twisty);

    const label = document.createElement('span');
    label.className = 'node-label';
    label.textContent = nodeLabel(node);
    row.appendChild(label);

    const directCount = (docsByNode.get(key) || []).length;
    if (directCount) {
      const badge = document.createElement('span');
      badge.className = 'node-badge';
      badge.textContent = directCount;
      row.appendChild(badge);
    }

    li.appendChild(row);

    let childUl = null;
    let expanded = false;

    function toggle(forceExpand) {
      if (!node.children.length) return;
      expanded = forceExpand !== undefined ? forceExpand : !expanded;
      twisty.textContent = expanded ? '▾' : '▸';
      if (expanded && !childUl) {
        childUl = document.createElement('ul');
        for (const ck of node.children) childUl.appendChild(renderRichNode(ck));
        li.appendChild(childUl);
      }
      if (childUl) childUl.style.display = expanded ? '' : 'none';
    }

    twisty.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    row.addEventListener('click', () => {
      selectRichNode(key);
      if (!expanded) toggle(true);
    });

    return li;
  }

  function selectRichNode(key) {
    selectedNodeKey = key;
    page = 1;
    document.querySelectorAll('.node-row.active').forEach((r) => r.classList.remove('active'));
    const row = document.querySelector(`.node-row[data-key="${CSS.escape(key)}"]`);
    if (row) row.classList.add('active');
    searchTerm = '';
    el('searchBox').value = '';
    renderRichBreadcrumb(key);
    renderDocs();
  }

  function ancestorChain(key) {
    const chain = [];
    let cur = key;
    while (cur) {
      chain.unshift(cur);
      cur = TREE.nodes[cur].parentKey;
    }
    return chain;
  }

  function renderRichBreadcrumb(key) {
    const bc = el('breadcrumb');
    if (!key) { bc.textContent = ''; return; }
    const chain = ancestorChain(key);
    bc.innerHTML =
      escapeHtml(currentSource.label) + ' &raquo; ' +
      chain.map((k, i) => (i === chain.length - 1 ? `<b>${escapeHtml(TREE.nodes[k].label)}</b>` : escapeHtml(TREE.nodes[k].label))).join(' &raquo; ');
  }

  function collectDescendantDocs(key) {
    const seen = new Set();
    const out = [];
    const stack = [key];
    while (stack.length) {
      const k = stack.pop();
      const node = TREE.nodes[k];
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

  function currentRichDocSet() {
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return DOCS.filter(
        (d) =>
          (d.docNo && d.docNo.toLowerCase().includes(t)) ||
          (d.title && d.title.toLowerCase().includes(t)) ||
          (d.eqpNo && d.eqpNo.toLowerCase().includes(t))
      );
    }
    if (!selectedNodeKey) return [];
    return showAllLevels ? collectDescendantDocs(selectedNodeKey) : docsByNode.get(selectedNodeKey) || [];
  }

  function statusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('new')) return 'status-new';
    if (s.includes('updat')) return 'status-updated';
    return '';
  }

  function renderRichRow(d) {
    const tr = document.createElement('tr');

    const tdNo = document.createElement('td');
    const a = document.createElement('a');
    a.className = 'doc-link';
    a.textContent = d.docNo || d.fileName;
    a.title = d.fileName;
    a.addEventListener('click', () => openRichDocument(d));
    tdNo.appendChild(a);
    tr.appendChild(tdNo);

    tr.appendChild(td(d.version));
    tr.appendChild(td(d.eqpNo));
    tr.appendChild(td(d.title));
    tr.appendChild(td(d.docType));

    const tdStatus = td(d.status);
    tdStatus.className = statusClass(d.status);
    tr.appendChild(tdStatus);

    tr.appendChild(td(d.publishDate));
    return tr;
  }

  function openRichDocument(d) {
    const drivePath = `${currentSource.driveFolderName}/documents/${d.fileName}`;
    openViaAppsScript(drivePath);
  }

  // ================= PLAIN SOURCE (nested folders, no metadata) =================

  async function loadPlainSource(id) {
    const data = await fetch(`data/${id}/folderTree.json`).then((r) => r.json());
    PLAIN_ROOT = data.root;
    plainNodesByPath = new Map();
    plainFileIndex = [];
    indexPlainNode(PLAIN_ROOT, '', null);
    selectedFolderPath = '';
  }

  function indexPlainNode(node, parentPath, parentKey) {
    const key = parentPath ? `${parentPath}/${node.name}` : node.name;
    plainNodesByPath.set(key, { node, parentPath: parentKey });
    if (node.type === 'folder') {
      for (const child of node.children || []) indexPlainNode(child, key, key);
    } else {
      plainFileIndex.push({ name: node.name, path: key, size: node.size || 0 });
    }
    return key;
  }

  function buildPlainTree() {
    const rootUl = el('tree');
    rootUl.innerHTML = '';
    el('treePanelTitle').textContent = currentSource.label;
    rootUl.appendChild(renderPlainNode(PLAIN_ROOT.name, PLAIN_ROOT));
    renderDocTableHead();
    selectFolder(PLAIN_ROOT.name);
  }

  function renderPlainNode(key, node) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'node-row';
    row.dataset.key = key;

    const subfolders = (node.children || []).filter((c) => c.type === 'folder');

    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.textContent = subfolders.length ? '▸' : '';
    row.appendChild(twisty);

    const label = document.createElement('span');
    label.className = 'node-label';
    label.textContent = '📁 ' + node.name;
    row.appendChild(label);

    li.appendChild(row);

    let childUl = null;
    let expanded = false;

    function toggle(forceExpand) {
      if (!subfolders.length) return;
      expanded = forceExpand !== undefined ? forceExpand : !expanded;
      twisty.textContent = expanded ? '▾' : '▸';
      if (expanded && !childUl) {
        childUl = document.createElement('ul');
        for (const sub of subfolders) childUl.appendChild(renderPlainNode(`${key}/${sub.name}`, sub));
        li.appendChild(childUl);
      }
      if (childUl) childUl.style.display = expanded ? '' : 'none';
    }

    twisty.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    row.addEventListener('click', () => {
      selectFolder(key);
      if (!expanded) toggle(true);
    });

    return li;
  }

  function selectFolder(key) {
    selectedFolderPath = key;
    page = 1;
    document.querySelectorAll('.node-row.active').forEach((r) => r.classList.remove('active'));
    const row = document.querySelector(`.node-row[data-key="${CSS.escape(key)}"]`);
    if (row) row.classList.add('active');
    searchTerm = '';
    el('searchBox').value = '';
    renderPlainBreadcrumb(key);
    renderDocs();
  }

  function renderPlainBreadcrumb(key) {
    const parts = key.split('/');
    el('breadcrumb').innerHTML = parts
      .map((p, i) => (i === parts.length - 1 ? `<b>${escapeHtml(p)}</b>` : escapeHtml(p)))
      .join(' &raquo; ');
  }

  function currentPlainRowSet() {
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return plainFileIndex.filter((f) => f.name.toLowerCase().includes(t));
    }
    const entry = plainNodesByPath.get(selectedFolderPath);
    if (!entry) return [];
    const children = entry.node.children || [];
    return children.map((c) => ({
      name: c.name,
      path: `${selectedFolderPath}/${c.name}`,
      size: c.type === 'file' ? c.size || 0 : null,
      isFolder: c.type === 'folder',
    }));
  }

  function formatSize(bytes) {
    if (bytes === null || bytes === undefined) return '';
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB'];
    let v = bytes;
    for (const u of units) {
      v /= 1024;
      if (v < 1024) return v.toFixed(1) + ' ' + u;
    }
    return v.toFixed(1) + ' TB';
  }

  function renderPlainRow(f) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');

    if (f.isFolder) {
      const link = document.createElement('a');
      link.className = 'doc-link';
      link.textContent = '📁 ' + f.name;
      link.addEventListener('click', () => {
        expandAncestors(f.path);
        selectFolder(f.path);
      });
      tdName.appendChild(link);
    } else {
      const link = document.createElement('a');
      link.className = 'doc-link';
      link.textContent = '📄 ' + f.name;
      link.title = f.path;
      link.addEventListener('click', () => openPlainFile(f));
      tdName.appendChild(link);
    }
    tr.appendChild(tdName);
    tr.appendChild(td(searchTerm ? f.path : ''));
    tr.appendChild(td(formatSize(f.size)));
    return tr;
  }

  function expandAncestors(path) {
    const row = document.querySelector(`.node-row[data-key="${CSS.escape(path)}"]`);
    if (row) return; // already rendered/expanded
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const ancestorKey = parts.slice(0, i).join('/');
      const ancestorRow = document.querySelector(`.node-row[data-key="${CSS.escape(ancestorKey)}"]`);
      if (ancestorRow) {
        const twisty = ancestorRow.querySelector('.twisty');
        if (twisty && twisty.textContent === '▸') twisty.click();
      }
    }
  }

  function openPlainFile(f) {
    const prefix = currentSource.driveFolderName ? currentSource.driveFolderName + '/' : '';
    // f.path's first segment is the source root's own display name - drop it,
    // the Drive folder already represents that root.
    const withoutRoot = f.path.split('/').slice(1).join('/');
    openViaAppsScript(prefix + withoutRoot);
  }

  // ================= shared: table head/body, paging, sorting =================

  function renderDocTableHead() {
    const thead = el('docTableHead');
    thead.innerHTML = '';
    const tr = document.createElement('tr');
    const columns = currentSource.kind === 'rich'
      ? [['docNo', 'Document No.'], ['version', 'Version'], ['eqpNo', 'Eqp. No.'], ['title', 'Title'], ['docType', 'Document type'], ['status', 'Status'], ['publishDate', 'Publish date']]
      : [[null, 'Name'], [null, 'Path'], [null, 'Size']];
    for (const [key, label] of columns) {
      const th = document.createElement('th');
      th.textContent = label;
      if (key) {
        th.dataset.sort = key;
        th.addEventListener('click', () => {
          sortDir = sortKey === key ? -sortDir : 1;
          sortKey = key;
          renderDocs();
        });
      }
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  }

  function renderDocs() {
    const isRich = currentSource.kind === 'rich';
    let rows = isRich ? currentRichDocSet().slice() : currentPlainRowSet().slice();

    if (isRich) {
      rows.sort((a, b) => {
        const av = (a[sortKey] || '').toString();
        const bv = (b[sortKey] || '').toString();
        return av.localeCompare(bv, undefined, { numeric: true }) * sortDir;
      });
    } else {
      rows.sort((a, b) => {
        if (!!a.isFolder !== !!b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
    }

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(page, pages);
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    el('docCount').textContent = `# ${isRich ? 'Documents' : 'Items'}: ${total}`;
    el('pageLabel').textContent = `Page ${page} of ${pages}`;
    el('prevPage').disabled = page <= 1;
    el('nextPage').disabled = page >= pages;

    const tbody = el('docTableBody');
    tbody.innerHTML = '';
    for (const r of pageRows) tbody.appendChild(isRich ? renderRichRow(r) : renderPlainRow(r));
  }

  function td(text) {
    const cell = document.createElement('td');
    cell.textContent = text || '';
    return cell;
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------- opening documents via the Apps Script backend ----------------
  //
  // No OAuth/Cloud Console involved: a small Google Apps Script Web App
  // (see scripts/AppsScript.gs) resolves a path under the mirrored Drive
  // root and redirects to it. Google itself enforces who may even reach
  // that URL, based on how the script is deployed - see README.

  function initAuth() {
    if (!CFG.APPS_SCRIPT_URL || CFG.APPS_SCRIPT_URL.startsWith('YOUR_')) {
      el('authStatus').textContent = 'Document opening not configured yet (see README).';
    } else {
      el('authStatus').textContent = '';
    }
  }

  function openViaAppsScript(drivePath) {
    if (!CFG.APPS_SCRIPT_URL || CFG.APPS_SCRIPT_URL.startsWith('YOUR_')) {
      showToast('Document opening is not configured yet (see README).');
      return;
    }
    const url = `${CFG.APPS_SCRIPT_URL}?path=${encodeURIComponent(drivePath)}`;
    window.open(url, '_blank', 'noopener');
  }

  function showToast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (t.hidden = true), 4000);
  }

  // ---------------- wiring ----------------

  function wireControls() {
    el('viewSelect').addEventListener('change', (e) => {
      currentView = e.target.value;
      rebuildDocsByNode();
      buildRichTree();
    });

    el('showAllLevels').addEventListener('change', (e) => {
      showAllLevels = e.target.checked;
      page = 1;
      renderDocs();
    });

    el('prevPage').addEventListener('click', () => { page--; renderDocs(); });
    el('nextPage').addEventListener('click', () => { page++; renderDocs(); });

    let searchDebounce;
    el('searchBox').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchTerm = e.target.value.trim();
        page = 1;
        if (searchTerm) {
          document.querySelectorAll('.node-row.active').forEach((r) => r.classList.remove('active'));
          el('breadcrumb').innerHTML = `Search results for &ldquo;${escapeHtml(searchTerm)}&rdquo;`;
        } else if (currentSource.kind === 'rich' && selectedNodeKey) {
          renderRichBreadcrumb(selectedNodeKey);
        } else if (currentSource.kind === 'plain' && selectedFolderPath) {
          renderPlainBreadcrumb(selectedFolderPath);
        }
        renderDocs();
      }, 200);
    });
  }

  main();
})();

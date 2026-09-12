(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const PAGE_SIZE = 100;

  let SOURCES = [];
  let catalog = null; // { topSources: [...], groups: Map(label -> [sources]), nestedByParent: Map(parentId -> [sources]) }
  let sourceCache = new Map(); // sourceId -> loaded data (rich or plain shape)

  let activeSourceId = null;
  let selectedNodeKey = null; // rich only
  let wholeSourceSelected = false; // rich only: true = show every document under this source
  let selectedFolderPath = ''; // plain only

  let sortKey = 'docNo';
  let sortDir = 1;
  let page = 1;
  let searchTerm = '';
  let searchDebounce;

  const el = (id) => document.getElementById(id);

  // ---------------- bootstrap ----------------

  async function main() {
    const res = await fetch('data/sources.json');
    const data = await res.json();
    SOURCES = data.sources;
    buildCatalog();
    buildSidebar();
    wireControls();
    initAuth();
    el('breadcrumb').textContent = 'Select a plant or project from the left to begin.';
  }

  function buildCatalog() {
    const groups = new Map();
    const nestedByParent = new Map();
    const topSources = [];
    for (const s of SOURCES) {
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
    catalog = { topSources, groups, nestedByParent };
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

  // ================= sidebar: catalog (sources + groups) =================

  function buildSidebar() {
    const rootUl = el('tree');
    rootUl.innerHTML = '';
    for (const s of catalog.topSources) rootUl.appendChild(renderSourceLi(s));
    for (const [label, srcs] of catalog.groups) rootUl.appendChild(renderGroupLi(label, srcs));
  }

  function renderGroupLi(label, srcs) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'node-row group-row';

    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.textContent = '▸';
    row.appendChild(twisty);

    const lbl = document.createElement('span');
    lbl.className = 'node-label';
    lbl.textContent = '🗃 ' + label;
    row.appendChild(lbl);

    li.appendChild(row);

    let childUl = null;
    let expanded = false;

    function toggle(force) {
      expanded = force !== undefined ? force : !expanded;
      twisty.textContent = expanded ? '▾' : '▸';
      if (expanded && !childUl) {
        childUl = document.createElement('ul');
        for (const s of srcs) childUl.appendChild(renderSourceLi(s));
        li.appendChild(childUl);
      }
      if (childUl) childUl.style.display = expanded ? '' : 'none';
    }

    row.addEventListener('click', () => toggle());
    return li;
  }

  function renderSourceLi(s) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'node-row source-row';
    row.dataset.rowKey = s.id;

    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.textContent = '▸';
    row.appendChild(twisty);

    const label = document.createElement('span');
    label.className = 'node-label';
    label.textContent = (s.kind === 'rich' ? '🏭 ' : '📁 ') + s.label;
    row.appendChild(label);

    li.appendChild(row);

    let childUl = null;
    let expanded = false;
    let internalLoaded = false;

    async function ensureInternal() {
      if (internalLoaded) return;
      internalLoaded = true;
      childUl = document.createElement('ul');
      li.appendChild(childUl);
      await loadSourceData(s.id);
      sourceCache.get(s.id).branchUl = childUl;
      renderSourceBranch(s.id);
    }

    function toggle(force) {
      expanded = force !== undefined ? force : !expanded;
      twisty.textContent = expanded ? '▾' : '▸';
      if (expanded) ensureInternal();
      if (childUl) childUl.style.display = expanded ? '' : 'none';
    }

    twisty.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    row.addEventListener('click', async () => {
      await activateSource(s.id);
      if (!expanded) toggle(true);
    });

    return li;
  }

  // rebuilds a source's own rendered branch (its internal tree + any
  // nested sources) in place - used on first expand and whenever the
  // active source's Process/Discipline view changes.
  function renderSourceBranch(sourceId) {
    const data = sourceCache.get(sourceId);
    if (!data || !data.branchUl) return;
    data.branchUl.innerHTML = '';
    if (data.kind === 'rich') {
      const roots = data.TREE.roots.filter((k) => data.TREE.nodes[k].view === data.currentView);
      for (const key of roots) data.branchUl.appendChild(renderRichNode(sourceId, key));
    } else {
      const subfolders = (data.PLAIN_ROOT.children || []).filter((c) => c.type === 'folder');
      for (const sub of subfolders) {
        data.branchUl.appendChild(renderPlainNode(sourceId, `${data.PLAIN_ROOT.name}/${sub.name}`, sub));
      }
    }
    for (const nested of catalog.nestedByParent.get(sourceId) || []) {
      data.branchUl.appendChild(renderSourceLi(nested));
    }
  }

  function markActiveRow(rowKey) {
    document.querySelectorAll('.node-row.active').forEach((r) => r.classList.remove('active'));
    const row = document.querySelector(`.node-row[data-row-key="${CSS.escape(rowKey)}"]`);
    if (row) row.classList.add('active');
  }

  // ================= loading source data =================

  async function loadSourceData(id) {
    if (sourceCache.has(id)) return sourceCache.get(id);
    const s = SOURCES.find((x) => x.id === id);
    let data;
    if (s.kind === 'rich') {
      const [tree, docs] = await Promise.all([
        fetch(`data/${id}/tree.json`).then((r) => r.json()),
        fetch(`data/${id}/documents.json`).then((r) => r.json()),
      ]);
      data = { kind: 'rich', source: s, TREE: tree, DOCS: docs, currentView: '1', docsByNode: null, branchUl: null };
      data.docsByNode = buildDocsByNode(data);
    } else {
      const folder = await fetch(`data/${id}/folderTree.json`).then((r) => r.json());
      data = { kind: 'plain', source: s, PLAIN_ROOT: folder.root, plainNodesByPath: new Map(), plainFileIndex: [], branchUl: null };
      indexPlainNode(data, data.PLAIN_ROOT, '', null);
    }
    sourceCache.set(id, data);
    return data;
  }

  function buildDocsByNode(data) {
    const map = new Map();
    for (const d of data.DOCS) {
      const keys = d.nodeKeys[data.currentView];
      if (!keys) continue;
      for (const nk of keys) {
        if (!map.has(nk)) map.set(nk, []);
        map.get(nk).push(d);
      }
    }
    return map;
  }

  function indexPlainNode(data, node, parentPath, parentKey) {
    const key = parentPath ? `${parentPath}/${node.name}` : node.name;
    data.plainNodesByPath.set(key, { node, parentPath: parentKey });
    if (node.type === 'folder') {
      for (const child of node.children || []) indexPlainNode(data, child, key, key);
    } else {
      data.plainFileIndex.push({ name: node.name, path: key, size: node.size || 0 });
    }
    return key;
  }

  // ================= activating / selecting =================

  async function activateSource(id) {
    await loadSourceData(id);
    activeSourceId = id;
    const data = sourceCache.get(id);
    searchTerm = '';
    el('searchBox').value = '';
    page = 1;

    if (data.kind === 'rich') {
      selectedNodeKey = null;
      wholeSourceSelected = true;
      el('viewSelect').hidden = false;
      el('viewSelect').value = data.currentView;
      el('showAllLevelsWrap').hidden = false;
    } else {
      selectedFolderPath = data.PLAIN_ROOT.name;
      el('viewSelect').hidden = true;
      el('showAllLevelsWrap').hidden = true;
    }

    markActiveRow(id);
    renderDocTableHead();
    refreshBreadcrumb();
    renderDocs();
  }

  function selectRichNode(sourceId, key) {
    activeSourceId = sourceId;
    selectedNodeKey = key;
    wholeSourceSelected = false;
    page = 1;
    searchTerm = '';
    el('searchBox').value = '';
    const data = sourceCache.get(sourceId);
    el('viewSelect').hidden = false;
    el('viewSelect').value = data.currentView;
    el('showAllLevelsWrap').hidden = false;
    markActiveRow(`${sourceId}::${key}`);
    renderDocTableHead();
    refreshBreadcrumb();
    renderDocs();
  }

  function selectFolder(sourceId, path) {
    activeSourceId = sourceId;
    selectedFolderPath = path;
    page = 1;
    searchTerm = '';
    el('searchBox').value = '';
    el('viewSelect').hidden = true;
    el('showAllLevelsWrap').hidden = true;
    markActiveRow(`${sourceId}::${path}`);
    renderDocTableHead();
    refreshBreadcrumb();
    renderDocs();
  }

  // ================= RICH tree nodes (sidebar) =================

  function renderRichNode(sourceId, key) {
    const data = sourceCache.get(sourceId);
    const node = data.TREE.nodes[key];
    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'node-row';
    row.dataset.rowKey = `${sourceId}::${key}`;

    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.textContent = node.children.length ? '▸' : '';
    row.appendChild(twisty);

    const label = document.createElement('span');
    label.className = 'node-label';
    label.textContent = nodeLabel(node);
    row.appendChild(label);

    const directCount = (data.docsByNode.get(key) || []).length;
    if (directCount) {
      const badge = document.createElement('span');
      badge.className = 'node-badge';
      badge.textContent = directCount;
      row.appendChild(badge);
    }

    li.appendChild(row);

    let childUl = null;
    let expanded = false;

    function toggle(force) {
      if (!node.children.length) return;
      expanded = force !== undefined ? force : !expanded;
      twisty.textContent = expanded ? '▾' : '▸';
      if (expanded && !childUl) {
        childUl = document.createElement('ul');
        for (const ck of node.children) childUl.appendChild(renderRichNode(sourceId, ck));
        li.appendChild(childUl);
      }
      if (childUl) childUl.style.display = expanded ? '' : 'none';
    }

    twisty.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    row.addEventListener('click', () => {
      selectRichNode(sourceId, key);
      if (!expanded) toggle(true);
    });

    return li;
  }

  function ancestorChain(data, key) {
    const chain = [];
    let cur = key;
    while (cur) {
      chain.unshift(cur);
      cur = data.TREE.nodes[cur].parentKey;
    }
    return chain;
  }

  function renderRichBreadcrumb(sourceId, key) {
    const data = sourceCache.get(sourceId);
    const chain = ancestorChain(data, key);
    el('breadcrumb').innerHTML =
      escapeHtml(data.source.label) + ' &raquo; ' +
      chain.map((k, i) => (i === chain.length - 1 ? `<b>${escapeHtml(data.TREE.nodes[k].label)}</b>` : escapeHtml(data.TREE.nodes[k].label))).join(' &raquo; ');
  }

  function renderWholeSourceBreadcrumb(sourceId) {
    const data = sourceCache.get(sourceId);
    el('breadcrumb').innerHTML = `<b>${escapeHtml(data.source.label)}</b> &raquo; All documents`;
  }

  function collectDescendantDocs(data, key) {
    const seen = new Set();
    const out = [];
    const stack = [key];
    while (stack.length) {
      const k = stack.pop();
      const node = data.TREE.nodes[k];
      if (data.docsByNode.has(k)) {
        for (const d of data.docsByNode.get(k)) {
          if (seen.has(d.fileName)) continue;
          seen.add(d.fileName);
          out.push(d);
        }
      }
      stack.push(...node.children);
    }
    return out;
  }

  function collectDescendantDocsMulti(data, keys) {
    const seen = new Set();
    const out = [];
    for (const k of keys) {
      for (const d of collectDescendantDocs(data, k)) {
        if (seen.has(d.fileName)) continue;
        seen.add(d.fileName);
        out.push(d);
      }
    }
    return out;
  }

  function currentRichDocSet() {
    const data = sourceCache.get(activeSourceId);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return data.DOCS.filter(
        (d) =>
          (d.docNo && d.docNo.toLowerCase().includes(t)) ||
          (d.title && d.title.toLowerCase().includes(t)) ||
          (d.eqpNo && d.eqpNo.toLowerCase().includes(t))
      );
    }
    if (wholeSourceSelected) {
      const roots = data.TREE.roots.filter((k) => data.TREE.nodes[k].view === data.currentView);
      return collectDescendantDocsMulti(data, roots);
    }
    if (!selectedNodeKey) return [];
    return el('showAllLevels').checked ? collectDescendantDocs(data, selectedNodeKey) : data.docsByNode.get(selectedNodeKey) || [];
  }

  function statusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('new')) return 'status-new';
    if (s.includes('updat')) return 'status-updated';
    return '';
  }

  function renderRichRow(sourceId, d) {
    const tr = document.createElement('tr');

    const tdNo = document.createElement('td');
    const a = document.createElement('a');
    a.className = 'doc-link';
    a.textContent = d.docNo || d.fileName;
    a.title = d.fileName;
    a.addEventListener('click', () => openRichDocument(sourceId, d));
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

  function openRichDocument(sourceId, d) {
    const s = SOURCES.find((x) => x.id === sourceId);
    openViaAppsScript(`${s.driveFolderName}/documents/${d.fileName}`);
  }

  // ================= PLAIN folder nodes (sidebar) =================

  function renderPlainNode(sourceId, key, node) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'node-row';
    row.dataset.rowKey = `${sourceId}::${key}`;

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

    function toggle(force) {
      if (!subfolders.length) return;
      expanded = force !== undefined ? force : !expanded;
      twisty.textContent = expanded ? '▾' : '▸';
      if (expanded && !childUl) {
        childUl = document.createElement('ul');
        for (const sub of subfolders) childUl.appendChild(renderPlainNode(sourceId, `${key}/${sub.name}`, sub));
        li.appendChild(childUl);
      }
      if (childUl) childUl.style.display = expanded ? '' : 'none';
    }

    twisty.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    row.addEventListener('click', () => {
      selectFolder(sourceId, key);
      if (!expanded) toggle(true);
    });

    return li;
  }

  function renderPlainBreadcrumb(sourceId, key) {
    const parts = key.split('/');
    el('breadcrumb').innerHTML = parts
      .map((p, i) => (i === parts.length - 1 ? `<b>${escapeHtml(p)}</b>` : escapeHtml(p)))
      .join(' &raquo; ');
  }

  function currentPlainRowSet() {
    const data = sourceCache.get(activeSourceId);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return data.plainFileIndex.filter((f) => f.name.toLowerCase().includes(t));
    }
    const entry = data.plainNodesByPath.get(selectedFolderPath);
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

  function renderPlainRow(sourceId, f) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');

    if (f.isFolder) {
      const link = document.createElement('a');
      link.className = 'doc-link';
      link.textContent = '📁 ' + f.name;
      link.addEventListener('click', () => {
        expandAncestors(sourceId, f.path);
        selectFolder(sourceId, f.path);
      });
      tdName.appendChild(link);
    } else {
      const link = document.createElement('a');
      link.className = 'doc-link';
      link.textContent = '📄 ' + f.name;
      link.title = f.path;
      link.addEventListener('click', () => openPlainFile(sourceId, f));
      tdName.appendChild(link);
    }
    tr.appendChild(tdName);
    tr.appendChild(td(searchTerm ? f.path : ''));
    tr.appendChild(td(formatSize(f.size)));
    return tr;
  }

  function expandAncestors(sourceId, path) {
    const row = document.querySelector(`.node-row[data-row-key="${CSS.escape(`${sourceId}::${path}`)}"]`);
    if (row) return;
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const ancestorKey = parts.slice(0, i).join('/');
      const ancestorRow = document.querySelector(`.node-row[data-row-key="${CSS.escape(`${sourceId}::${ancestorKey}`)}"]`);
      if (ancestorRow) {
        const twisty = ancestorRow.querySelector('.twisty');
        if (twisty && twisty.textContent === '▸') twisty.click();
      }
    }
  }

  function openPlainFile(sourceId, f) {
    const s = SOURCES.find((x) => x.id === sourceId);
    const prefix = s.driveFolderName ? s.driveFolderName + '/' : '';
    const withoutRoot = f.path.split('/').slice(1).join('/');
    openViaAppsScript(prefix + withoutRoot);
  }

  // ================= shared: breadcrumb, table head/body, paging, sorting =================

  function refreshBreadcrumb() {
    if (!activeSourceId) {
      el('breadcrumb').textContent = 'Select a plant or project from the left to begin.';
      return;
    }
    const data = sourceCache.get(activeSourceId);
    if (searchTerm) {
      el('breadcrumb').innerHTML = `Search results for &ldquo;${escapeHtml(searchTerm)}&rdquo; in <b>${escapeHtml(data.source.label)}</b>`;
      return;
    }
    if (data.kind === 'rich') {
      if (wholeSourceSelected || !selectedNodeKey) renderWholeSourceBreadcrumb(activeSourceId);
      else renderRichBreadcrumb(activeSourceId, selectedNodeKey);
    } else {
      renderPlainBreadcrumb(activeSourceId, selectedFolderPath);
    }
  }

  function renderDocTableHead() {
    const thead = el('docTableHead');
    thead.innerHTML = '';
    if (!activeSourceId) return;
    const isRich = sourceCache.get(activeSourceId).kind === 'rich';
    const tr = document.createElement('tr');
    const columns = isRich
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
    if (!activeSourceId) {
      el('docCount').textContent = '';
      el('pageLabel').textContent = '';
      el('docTableBody').innerHTML = '';
      return;
    }

    const isRich = sourceCache.get(activeSourceId).kind === 'rich';
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
    for (const r of pageRows) tbody.appendChild(isRich ? renderRichRow(activeSourceId, r) : renderPlainRow(activeSourceId, r));
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
      if (!activeSourceId) return;
      const data = sourceCache.get(activeSourceId);
      data.currentView = e.target.value;
      data.docsByNode = buildDocsByNode(data);
      wholeSourceSelected = true;
      selectedNodeKey = null;
      page = 1;
      markActiveRow(activeSourceId);
      renderSourceBranch(activeSourceId);
      refreshBreadcrumb();
      renderDocs();
    });

    el('showAllLevels').addEventListener('change', () => {
      page = 1;
      renderDocs();
    });

    el('prevPage').addEventListener('click', () => { page--; renderDocs(); });
    el('nextPage').addEventListener('click', () => { page++; renderDocs(); });

    el('searchBox').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchTerm = e.target.value.trim();
        page = 1;
        refreshBreadcrumb();
        renderDocs();
      }, 200);
    });
  }

  main();
})();

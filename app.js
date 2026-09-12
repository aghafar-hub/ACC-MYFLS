(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const PAGE_SIZE = 100;

  let TREE = null;
  let DOCS = null;
  let docsByNode = new Map(); // nodeKey -> [doc,...] (direct only)
  let selectedNodeKey = null;
  let currentView = '1';
  let showAllLevels = true;
  let sortKey = 'docNo';
  let sortDir = 1;
  let page = 1;
  let searchTerm = '';

  const el = (id) => document.getElementById(id);

  // ---------------- data loading ----------------

  async function loadData() {
    const [tree, docs] = await Promise.all([
      fetch('data/tree.json').then((r) => r.json()),
      fetch('data/documents.json').then((r) => r.json()),
    ]);
    TREE = tree;
    DOCS = docs;
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

  function nodeLabel(node) {
    const iconMap = {
      'Process area/Plant': '🏭',
      'Department/Process Unit': '🗂',
      Equipment: '⚙',
      'Document type': '📄',
    };
    return (iconMap[node.nodeType] || '📁') + ' ' + node.label;
  }

  // ---------------- tree rendering ----------------

  function buildTree() {
    const rootUl = el('tree');
    rootUl.innerHTML = '';
    const roots = TREE.roots.filter((k) => TREE.nodes[k].view === currentView);
    for (const key of roots) rootUl.appendChild(renderNode(key));
    selectedNodeKey = null;
    el('breadcrumb').textContent = '';
    renderDocs();
  }

  function renderNode(key) {
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
        for (const ck of node.children) childUl.appendChild(renderNode(ck));
        li.appendChild(childUl);
      }
      if (childUl) childUl.style.display = expanded ? '' : 'none';
    }

    twisty.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    row.addEventListener('click', () => {
      selectNode(key);
      if (!expanded) toggle(true);
    });

    row._toggle = toggle;
    return li;
  }

  function selectNode(key) {
    selectedNodeKey = key;
    page = 1;
    document.querySelectorAll('.node-row.active').forEach((r) => r.classList.remove('active'));
    const row = document.querySelector(`.node-row[data-key="${CSS.escape(key)}"]`);
    if (row) row.classList.add('active');
    searchTerm = '';
    el('searchBox').value = '';
    renderBreadcrumb(key);
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

  function renderBreadcrumb(key) {
    const bc = el('breadcrumb');
    if (!key) { bc.textContent = ''; return; }
    const chain = ancestorChain(key);
    bc.innerHTML =
      'RAMLIYA CEMENT PLANT &raquo; ' +
      chain.map((k, i) => (i === chain.length - 1 ? `<b>${escapeHtml(TREE.nodes[k].label)}</b>` : escapeHtml(TREE.nodes[k].label))).join(' &raquo; ');
  }

  function collectDescendantDocs(key) {
    // a document can be cross-referenced under several leaf nodes in the
    // same subtree (e.g. a generic instruction reused across equipment) -
    // dedupe by file so "show all levels" lists each document once.
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

  // ---------------- document table ----------------

  function currentDocSet() {
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

  function renderDocs() {
    let docs = currentDocSet().slice();
    docs.sort((a, b) => {
      const av = (a[sortKey] || '').toString();
      const bv = (b[sortKey] || '').toString();
      return av.localeCompare(bv, undefined, { numeric: true }) * sortDir;
    });

    const total = docs.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(page, pages);
    const start = (page - 1) * PAGE_SIZE;
    const pageDocs = docs.slice(start, start + PAGE_SIZE);

    el('docCount').textContent = `# Documents: ${total}`;
    el('pageLabel').textContent = `Page ${page} of ${pages}`;
    el('prevPage').disabled = page <= 1;
    el('nextPage').disabled = page >= pages;

    const tbody = el('docTableBody');
    tbody.innerHTML = '';
    for (const d of pageDocs) tbody.appendChild(renderDocRow(d));
  }

  function statusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('new')) return 'status-new';
    if (s.includes('updat')) return 'status-updated';
    return '';
  }

  function renderDocRow(d) {
    const tr = document.createElement('tr');

    const tdNo = document.createElement('td');
    const a = document.createElement('a');
    a.className = 'doc-link';
    a.textContent = d.docNo || d.fileName;
    a.title = d.fileName;
    a.addEventListener('click', () => openDocument(d));
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
  // (see scripts/AppsScript.gs) looks the file up in Drive and redirects to
  // it. Google itself enforces who may even reach that URL, based on how
  // the script is deployed (e.g. "Anyone within your domain") - see README.

  function initAuth() {
    if (!CFG.APPS_SCRIPT_URL || CFG.APPS_SCRIPT_URL.startsWith('YOUR_')) {
      el('authStatus').textContent = 'Document opening not configured yet (see README).';
    } else {
      el('authStatus').textContent = '';
    }
  }

  function openDocument(d) {
    if (!CFG.APPS_SCRIPT_URL || CFG.APPS_SCRIPT_URL.startsWith('YOUR_')) {
      showToast('Document opening is not configured yet (see README).');
      return;
    }
    const url = `${CFG.APPS_SCRIPT_URL}?file=${encodeURIComponent(d.fileName)}`;
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
      buildTree();
    });

    el('showAllLevels').addEventListener('change', (e) => {
      showAllLevels = e.target.checked;
      page = 1;
      renderDocs();
    });

    el('prevPage').addEventListener('click', () => { page--; renderDocs(); });
    el('nextPage').addEventListener('click', () => { page++; renderDocs(); });

    document.querySelectorAll('#docTable thead th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        sortDir = sortKey === key ? -sortDir : 1;
        sortKey = key;
        renderDocs();
      });
    });

    let searchDebounce;
    el('searchBox').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchTerm = e.target.value.trim();
        page = 1;
        if (searchTerm) {
          document.querySelectorAll('.node-row.active').forEach((r) => r.classList.remove('active'));
          el('breadcrumb').innerHTML = `Search results for &ldquo;${escapeHtml(searchTerm)}&rdquo;`;
        } else if (selectedNodeKey) {
          renderBreadcrumb(selectedNodeKey);
        }
        renderDocs();
      }, 200);
    });
  }

  async function main() {
    await loadData();
    buildTree();
    wireControls();
    initAuth();
  }

  main();
})();

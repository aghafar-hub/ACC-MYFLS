import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPlainFolderTree, fetchRichDocs, fetchRichTree, fetchSourcesList, openDocument } from "./api";
import { getStoredRootHandle } from "./localFiles";
import { ancestorChain, buildCatalog, buildDocsByNode, collectDescendantDocs, collectDescendantDocsMulti, indexPlainTree } from "./domain";

import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import DocumentTable from "./components/DocumentTable";
import SettingsPanel from "./components/SettingsPanel";
import Toast from "./components/Toast";

const PAGE_SIZE = 100;

// No login screen, no backend at all - anyone with the link can browse
// the tree/search here, and opening a document reads it straight off
// disk via the File System Access API, from wherever Google Drive for
// Desktop has synced the shared folder on this PC (see the "Local
// files" section in Settings).
export default function App() {
  // Just a display name ("is a folder connected, and what's it called") -
  // the actual FileSystemDirectoryHandle lives in IndexedDB (see
  // localFiles.js) and openDocument reads it fresh each time, since
  // handles aren't the kind of thing you hold in ordinary state.
  const [localRootName, setLocalRootName] = useState(null);
  useEffect(() => {
    getStoredRootHandle().then((handle) => setLocalRootName(handle?.name || null));
  }, []);
  const handleLocalRootChanged = useCallback((handle) => {
    setLocalRootName(handle?.name || null);
  }, []);

  const [sources, setSources] = useState(null);
  const [sourceData, setSourceData] = useState({});
  const sourceDataRef = useRef(sourceData);
  useEffect(() => {
    sourceDataRef.current = sourceData;
  }, [sourceData]);
  const inFlightRef = useRef({});

  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [selection, setSelection] = useState({ mode: "none" });
  const [showAllLevels, setShowAllLevels] = useState(true);
  const [sortKey, setSortKey] = useState("docNo");
  const [sortDir, setSortDir] = useState(1);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // No-op on desktop (the CSS that reads it only applies at narrow
  // widths) - on mobile, where the tree panel is an off-canvas drawer,
  // this closes it as soon as the visitor picks something so they land
  // straight on the document table instead of the drawer staying open.
  useEffect(() => {
    setSidebarOpen(false);
  }, [activeSourceId, selection]);

  const showToast = useCallback((msg) => setToast(msg), []);

  useEffect(() => {
    fetchSourcesList()
      .then(setSources)
      .catch(() => showToast("Couldn't load the plants/projects list. Check your connection and reload."));
  }, [showToast]);

  const catalog = useMemo(() => (sources ? buildCatalog(sources) : null), [sources]);

  const loadSource = useCallback(
    (id) => {
      if (sourceDataRef.current[id]) return Promise.resolve(sourceDataRef.current[id]);
      if (inFlightRef.current[id]) return inFlightRef.current[id];
      const source = sources.find((s) => s.id === id);
      const promise = (async () => {
        let data;
        if (source.kind === "rich") {
          const [tree, docs] = await Promise.all([fetchRichTree(id), fetchRichDocs(id)]);
          data = { kind: "rich", source, tree, docs, currentView: "1", docsByNode: buildDocsByNode(docs, "1") };
        } else {
          const folder = await fetchPlainFolderTree(id);
          const { nodesByPath, fileIndex } = indexPlainTree(folder.root);
          data = { kind: "plain", source, root: folder.root, nodesByPath, fileIndex };
        }
        setSourceData((prev) => {
          const next = { ...prev, [id]: data };
          sourceDataRef.current = next;
          return next;
        });
        return data;
      })();
      inFlightRef.current[id] = promise;
      // Always clear the in-flight slot, success or failure — otherwise a
      // single failed fetch (e.g. a transient network blip) permanently
      // "poisons" this source: every future attempt to open it would just
      // return the same rejected promise forever, with no way to retry
      // short of a full page reload.
      promise.finally(() => {
        delete inFlightRef.current[id];
      });
      return promise;
    },
    [sources]
  );

  const toggleExpanded = useCallback((key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandKeys = useCallback((keys) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
  }, []);

  const resetViewState = () => {
    setSearchTerm("");
    setPage(1);
  };

  const activateSource = useCallback(
    async (id) => {
      let data;
      try {
        data = await loadSource(id);
      } catch {
        showToast("Couldn't load that source. Check your connection and try again.");
        return;
      }
      setActiveSourceId(id);
      resetViewState();
      setSelection(data.kind === "rich" ? { mode: "wholeSource" } : { mode: "plainFolder", path: data.root.name });
    },
    [loadSource, showToast]
  );

  const selectRichNode = useCallback((sourceId, key) => {
    setActiveSourceId(sourceId);
    setSelection({ mode: "richNode", nodeKey: key });
    resetViewState();
  }, []);

  const selectPlainFolder = useCallback(
    (sourceId, path, revealAncestors) => {
      setActiveSourceId(sourceId);
      setSelection({ mode: "plainFolder", path });
      resetViewState();
      if (revealAncestors) {
        const parts = path.split("/");
        const keys = [`src:${sourceId}`];
        for (let i = 1; i < parts.length; i++) keys.push(`plain:${sourceId}::${parts.slice(0, i).join("/")}`);
        expandKeys(keys);
      }
    },
    [expandKeys]
  );

  const changeView = useCallback(
    (view) => {
      setSourceData((prev) => {
        const data = prev[activeSourceId];
        if (!data || data.kind !== "rich") return prev;
        const updated = { ...data, currentView: view, docsByNode: buildDocsByNode(data.docs, view) };
        const next = { ...prev, [activeSourceId]: updated };
        sourceDataRef.current = next;
        return next;
      });
      setSelection({ mode: "wholeSource" });
      setPage(1);
    },
    [activeSourceId]
  );

  const activeData = activeSourceId ? sourceData[activeSourceId] : null;

  const rows = useMemo(() => {
    if (!activeData) return [];
    if (activeData.kind === "rich") {
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        return activeData.docs.filter(
          (d) =>
            (d.docNo && d.docNo.toLowerCase().includes(t)) ||
            (d.title && d.title.toLowerCase().includes(t)) ||
            (d.eqpNo && d.eqpNo.toLowerCase().includes(t))
        );
      }
      if (selection.mode === "wholeSource") {
        const roots = activeData.tree.roots.filter((k) => activeData.tree.nodes[k].view === activeData.currentView);
        return collectDescendantDocsMulti(activeData.tree, activeData.docsByNode, roots);
      }
      if (selection.mode === "richNode") {
        return showAllLevels
          ? collectDescendantDocs(activeData.tree, activeData.docsByNode, selection.nodeKey)
          : activeData.docsByNode.get(selection.nodeKey) || [];
      }
      return [];
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return activeData.fileIndex.filter((f) => f.name.toLowerCase().includes(t));
    }
    if (selection.mode === "plainFolder") {
      const node = activeData.nodesByPath.get(selection.path);
      if (!node) return [];
      return (node.children || []).map((c) => ({
        name: c.name,
        path: `${selection.path}/${c.name}`,
        size: c.type === "file" ? c.size || 0 : null,
        isFolder: c.type === "folder",
      }));
    }
    return [];
  }, [activeData, selection, searchTerm, showAllLevels]);

  const sortedRows = useMemo(() => {
    const copy = rows.slice();
    if (activeData?.kind === "rich") {
      copy.sort(
        (a, b) => (a[sortKey] || "").toString().localeCompare((b[sortKey] || "").toString(), undefined, { numeric: true }) * sortDir
      );
    } else {
      copy.sort((a, b) => {
        if (!!a.isFolder !== !!b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
    }
    return copy;
  }, [rows, activeData, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = sortedRows.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const breadcrumb = useMemo(() => {
    if (!activeData) return "Select a plant or project from the left to begin.";
    if (searchTerm) return `Search results for “${searchTerm}” in ${activeData.source.label}`;
    if (activeData.kind === "rich") {
      if (selection.mode === "richNode") {
        const chain = ancestorChain(activeData.tree, selection.nodeKey).map((k) => activeData.tree.nodes[k].label);
        return { source: activeData.source.label, chain };
      }
      return { source: activeData.source.label, chain: [] };
    }
    if (selection.mode === "plainFolder") return { parts: selection.path.split("/") };
    return "";
  }, [activeData, selection, searchTerm]);

  const handleSort = (key) => {
    setSortDir((dir) => (sortKey === key ? -dir : 1));
    setSortKey(key);
  };

  const handleOpenRichDoc = async (doc) => {
    const path = `${activeData.source.driveFolderName}/documents/${doc.fileName}`;
    const result = await openDocument(path);
    if (!result.ok) showToast(result.message);
  };

  const handleOpenPlainFile = async (file) => {
    const prefix = activeData.source.driveFolderName ? `${activeData.source.driveFolderName}/` : "";
    const withoutRoot = file.path.split("/").slice(1).join("/");
    const result = await openDocument(prefix + withoutRoot);
    if (!result.ok) showToast(result.message);
  };

  const handleOpenPlainFolderRow = (path) => {
    selectPlainFolder(activeSourceId, path, true);
  };

  return (
    <div id="appRoot">
      <TopBar
        searchTerm={searchTerm}
        onSearchChange={(v) => {
          setSearchTerm(v);
          setPage(1);
        }}
        authNotice={localRootName ? "" : "Set your local files folder in Settings to open documents."}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <main className="layout">
        {catalog && (
          <Sidebar
            catalog={catalog}
            sourceData={sourceData}
            expandedKeys={expandedKeys}
            onToggleExpand={toggleExpanded}
            onLoadSource={loadSource}
            activeSourceId={activeSourceId}
            selection={selection}
            onActivateSource={activateSource}
            onSelectRichNode={selectRichNode}
            onSelectPlainFolder={(sourceId, path) => selectPlainFolder(sourceId, path, false)}
            onChangeView={changeView}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        <DocumentTable
          activeData={activeData}
          breadcrumb={breadcrumb}
          showAllLevels={showAllLevels}
          onToggleShowAllLevels={setShowAllLevels}
          isWholeSource={selection.mode === "wholeSource"}
          rows={pageRows}
          totalCount={sortedRows.length}
          page={clampedPage}
          pageCount={pageCount}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          searchActive={Boolean(searchTerm)}
          onOpenRichDoc={handleOpenRichDoc}
          onOpenPlainFile={handleOpenPlainFile}
          onOpenPlainFolder={handleOpenPlainFolderRow}
        />
      </main>

      {settingsOpen && (
        <SettingsPanel localRootName={localRootName} onLocalRootChanged={handleLocalRootChanged} onClose={() => setSettingsOpen(false)} />
      )}
      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}

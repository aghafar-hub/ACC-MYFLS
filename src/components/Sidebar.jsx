import { nodeIcon } from "../domain";

function Twisty({ expanded, hasChildren }) {
  if (!hasChildren) return <span className="twisty" />;
  return <span className="twisty">{expanded ? "▾" : "▸"}</span>;
}

function RichTreeNode({ sourceId, nodeKey, tree, docsByNode, activeKey, expandedSet, onToggleExpand, onSelect }) {
  const node = tree.nodes[nodeKey];
  const rowKey = `rich:${sourceId}::${nodeKey}`;
  const hasChildren = node.children.length > 0;
  const expanded = expandedSet.has(rowKey);
  const directCount = (docsByNode.get(nodeKey) || []).length;

  return (
    <li>
      <div className={`node-row${activeKey === rowKey ? " active" : ""}`}>
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(rowKey);
          }}
        >
          <Twisty expanded={expanded} hasChildren={hasChildren} />
        </span>
        <span className="node-label" onClick={() => onSelect(sourceId, nodeKey)}>
          {nodeIcon(node)} {node.label}
        </span>
        {directCount > 0 && <span className="node-badge">{directCount}</span>}
      </div>
      {expanded && hasChildren && (
        <ul>
          {node.children.map((ck) => (
            <RichTreeNode
              key={ck}
              sourceId={sourceId}
              nodeKey={ck}
              tree={tree}
              docsByNode={docsByNode}
              activeKey={activeKey}
              expandedSet={expandedSet}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function PlainTreeNode({ sourceId, path, node, activeKey, expandedSet, onToggleExpand, onSelect }) {
  const rowKey = `plain:${sourceId}::${path}`;
  const subfolders = (node.children || []).filter((c) => c.type === "folder");
  const hasChildren = subfolders.length > 0;
  const expanded = expandedSet.has(rowKey);

  return (
    <li>
      <div className={`node-row${activeKey === rowKey ? " active" : ""}`}>
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(rowKey);
          }}
        >
          <Twisty expanded={expanded} hasChildren={hasChildren} />
        </span>
        <span className="node-label" onClick={() => onSelect(sourceId, path)}>
          📁 {node.name}
        </span>
      </div>
      {expanded && hasChildren && (
        <ul>
          {subfolders.map((sub) => (
            <PlainTreeNode
              key={sub.name}
              sourceId={sourceId}
              path={`${path}/${sub.name}`}
              node={sub}
              activeKey={activeKey}
              expandedSet={expandedSet}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SourceRow({
  source,
  sourceData,
  nestedSources,
  expandedKeys,
  onToggleExpand,
  onLoadSource,
  activeKey,
  onActivateSource,
  onSelectRichNode,
  onSelectPlainFolder,
  onChangeView,
  catalog,
  allSourceData,
}) {
  const rowKey = `src:${source.id}`;
  const expanded = expandedKeys.has(rowKey);
  const data = sourceData;

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!expanded) onLoadSource(source.id);
    onToggleExpand(rowKey);
  };

  return (
    <li>
      <div className={`node-row source-row${activeKey === rowKey ? " active" : ""}`}>
        <span onClick={handleToggle}>
          <span className="twisty">{expanded ? "▾" : "▸"}</span>
        </span>
        <span
          className="node-label"
          onClick={() => {
            onActivateSource(source.id);
            if (!expanded) onToggleExpand(rowKey);
          }}
        >
          {source.kind === "rich" ? "🏭" : "📁"} {source.label}
        </span>
      </div>

      {expanded && (
        <ul>
          {!data && (
            <li className="node-row" style={{ opacity: 0.6 }}>
              Loading…
            </li>
          )}
          {data && data.kind === "rich" && (
            <RichBranch
              sourceId={source.id}
              data={data}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              activeKey={activeKey}
              onSelectRichNode={onSelectRichNode}
              onChangeView={onChangeView}
            />
          )}
          {data && data.kind === "plain" && (
            <PlainTreeNode
              sourceId={source.id}
              path={data.root.name}
              node={data.root}
              activeKey={activeKey}
              expandedSet={expandedKeys}
              onToggleExpand={onToggleExpand}
              onSelect={onSelectPlainFolder}
            />
          )}
          {nestedSources.map((nested) => (
            <SourceRow
              key={nested.id}
              source={nested}
              sourceData={allSourceData[nested.id]}
              nestedSources={catalog.nestedByParent.get(nested.id) || []}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              onLoadSource={onLoadSource}
              activeKey={activeKey}
              onActivateSource={onActivateSource}
              onSelectRichNode={onSelectRichNode}
              onSelectPlainFolder={onSelectPlainFolder}
              onChangeView={onChangeView}
              catalog={catalog}
              allSourceData={allSourceData}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RichBranch({ sourceId, data, expandedKeys, onToggleExpand, activeKey, onSelectRichNode, onChangeView }) {
  const roots = data.tree.roots.filter((k) => data.tree.nodes[k].view === data.currentView);
  const hasDiscipline = data.tree.roots.some((k) => data.tree.nodes[k].view === "2");

  return (
    <>
      {hasDiscipline && (
        <li>
          <select
            className="view-select"
            style={{ margin: "4px 8px" }}
            value={data.currentView}
            onChange={(e) => onChangeView(e.target.value)}
          >
            <option value="1">Process view</option>
            <option value="2">Discipline view</option>
          </select>
        </li>
      )}
      {roots.map((k) => (
        <RichTreeNode
          key={k}
          sourceId={sourceId}
          nodeKey={k}
          tree={data.tree}
          docsByNode={data.docsByNode}
          activeKey={activeKey}
          expandedSet={expandedKeys}
          onToggleExpand={onToggleExpand}
          onSelect={onSelectRichNode}
        />
      ))}
    </>
  );
}

function GroupRow({ label, sources, expandedKeys, onToggleExpand, ...rest }) {
  const rowKey = `grp:${label}`;
  const expanded = expandedKeys.has(rowKey);

  return (
    <li>
      <div className="node-row group-row" onClick={() => onToggleExpand(rowKey)}>
        <span className="twisty">{expanded ? "▾" : "▸"}</span>
        <span className="node-label">🗃 {label}</span>
      </div>
      {expanded && (
        <ul>
          {sources.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              sourceData={rest.allSourceData[s.id]}
              nestedSources={rest.catalog.nestedByParent.get(s.id) || []}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              {...rest}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Sidebar({
  catalog,
  sourceData,
  expandedKeys,
  onToggleExpand,
  onLoadSource,
  activeSourceId,
  selection,
  onActivateSource,
  onSelectRichNode,
  onSelectPlainFolder,
  onChangeView,
}) {
  const activeKey = !activeSourceId
    ? null
    : selection.mode === "wholeSource"
      ? `src:${activeSourceId}`
      : selection.mode === "richNode"
        ? `rich:${activeSourceId}::${selection.nodeKey}`
        : selection.mode === "plainFolder"
          ? `plain:${activeSourceId}::${selection.path}`
          : null;

  const commonProps = {
    onLoadSource,
    activeKey,
    onActivateSource,
    onSelectRichNode,
    onSelectPlainFolder,
    onChangeView,
    catalog,
    allSourceData: sourceData,
  };

  return (
    <aside className="tree-panel">
      <div className="panel-title">
        <span>Plants &amp; Projects</span>
      </div>
      <ul className="tree">
        {catalog.topSources.map((s) => (
          <SourceRow
            key={s.id}
            source={s}
            sourceData={sourceData[s.id]}
            nestedSources={catalog.nestedByParent.get(s.id) || []}
            expandedKeys={expandedKeys}
            onToggleExpand={onToggleExpand}
            {...commonProps}
          />
        ))}
        {[...catalog.groups.entries()].map(([label, groupSources]) => (
          <GroupRow
            key={label}
            label={label}
            sources={groupSources}
            expandedKeys={expandedKeys}
            onToggleExpand={onToggleExpand}
            {...commonProps}
          />
        ))}
      </ul>
    </aside>
  );
}

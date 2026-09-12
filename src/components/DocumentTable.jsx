import { formatSize, statusClass } from "../domain";

const RICH_COLUMNS = [
  ["docNo", "Document No."],
  ["version", "Version"],
  ["eqpNo", "Eqp. No."],
  ["title", "Title"],
  ["docType", "Document type"],
  ["status", "Status"],
  ["publishDate", "Publish date"],
];
const PLAIN_COLUMNS = [
  [null, "Name"],
  [null, "Path"],
  [null, "Size"],
];

function Breadcrumb({ breadcrumb }) {
  if (typeof breadcrumb === "string") return <div className="breadcrumb">{breadcrumb}</div>;
  if (breadcrumb.parts) {
    return (
      <div className="breadcrumb">
        {breadcrumb.parts.map((p, i) => (i === breadcrumb.parts.length - 1 ? <b key={i}>{p}</b> : <span key={i}>{p} &raquo; </span>))}
      </div>
    );
  }
  if (breadcrumb.chain !== undefined) {
    const parts = [breadcrumb.source, ...breadcrumb.chain];
    return (
      <div className="breadcrumb">
        {parts.map((p, i) => (i === parts.length - 1 ? <b key={i}>{p}</b> : <span key={i}>{p} &raquo; </span>))}
      </div>
    );
  }
  return <div className="breadcrumb" />;
}

export default function DocumentTable({
  activeData,
  breadcrumb,
  showAllLevels,
  onToggleShowAllLevels,
  isWholeSource,
  rows,
  totalCount,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
  sortKey,
  sortDir,
  onSort,
  searchActive,
  onOpenRichDoc,
  onOpenPlainFile,
  onOpenPlainFolder,
}) {
  const isRich = activeData?.kind === "rich";
  const columns = isRich ? RICH_COLUMNS : PLAIN_COLUMNS;

  return (
    <section className="doc-panel">
      <Breadcrumb breadcrumb={breadcrumb} />

      <div className="toolbar">
        {isRich && (
          <label className="levels-toggle" hidden={isWholeSource}>
            <input type="checkbox" checked={showAllLevels} onChange={(e) => onToggleShowAllLevels(e.target.checked)} />
            Show all levels
          </label>
        )}
        <span className="doc-count">{activeData ? `# ${isRich ? "Documents" : "Items"}: ${totalCount}` : ""}</span>
        <div className="pager">
          <button className="btn small" disabled={page <= 1} onClick={onPrevPage}>
            &lsaquo;
          </button>
          <span>{activeData ? `Page ${page} of ${pageCount}` : ""}</span>
          <button className="btn small" disabled={page >= pageCount} onClick={onNextPage}>
            &rsaquo;
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={label} onClick={key ? () => onSort(key) : undefined} style={{ cursor: key ? "pointer" : "default" }}>
                  {label}
                  {key && sortKey === key ? (sortDir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isRich
              ? rows.map((d) => (
                  <tr key={d.fileName}>
                    <td>
                      <a className="doc-link" title={d.fileName} onClick={() => onOpenRichDoc(d)}>
                        {d.docNo || d.fileName}
                      </a>
                    </td>
                    <td>{d.version}</td>
                    <td>{d.eqpNo}</td>
                    <td>{d.title}</td>
                    <td>{d.docType}</td>
                    <td className={statusClass(d.status)}>{d.status}</td>
                    <td>{d.publishDate}</td>
                  </tr>
                ))
              : rows.map((f) => (
                  <tr key={f.path}>
                    <td>
                      {f.isFolder ? (
                        <a className="doc-link" onClick={() => onOpenPlainFolder(f.path)}>
                          📁 {f.name}
                        </a>
                      ) : (
                        <a className="doc-link" title={f.path} onClick={() => onOpenPlainFile(f)}>
                          📄 {f.name}
                        </a>
                      )}
                    </td>
                    <td>{searchActive ? f.path : ""}</td>
                    <td>{formatSize(f.size)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

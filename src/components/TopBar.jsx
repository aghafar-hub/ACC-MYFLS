export default function TopBar({ session, searchTerm, onSearchChange, authNotice, onOpenSettings, onToggleSidebar }) {
  return (
    <header className="topbar">
      <button
        className="btn icon-btn menu-btn"
        title="Plants & projects"
        aria-label="Toggle plants and projects menu"
        onClick={onToggleSidebar}
      >
        &#9776;
      </button>
      <div className="brand">
        <div className="brand-logos">
          <img
            src={`${import.meta.env.BASE_URL}acc-logo.png`}
            alt="Arabian Cement Company"
            className="brand-logo acc-logo"
            onError={(e) => {
              e.currentTarget.hidden = true;
            }}
          />
          <img src={`${import.meta.env.BASE_URL}fls-logo.png`} alt="FLSmidth" className="brand-logo fls-logo" />
        </div>
        <span className="brand-text">Document Browser</span>
      </div>
      <div className="search">
        <input
          type="search"
          placeholder="Search..."
          autoComplete="off"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="auth">
        <span className="auth-status">{authNotice}</span>
        <span className="user-email">{session.email}</span>
        <button className="btn icon-btn" title="Settings" aria-label="Settings" onClick={onOpenSettings}>
          &#9881;
        </button>
      </div>
    </header>
  );
}

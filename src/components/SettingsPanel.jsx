import { adminPanelUrl } from "../api";
import { THEMES } from "../config";
import { useTheme } from "../ThemeContext";

export default function SettingsPanel({ session, onClose, onSignOut }) {
  const { themeId, setTheme } = useTheme();

  return (
    <div className="settings-panel">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-card">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="btn icon-btn" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>

        <section className="settings-section">
          <h3>Theme</h3>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-swatch${t.id === themeId ? " active" : ""}`}
                style={{ "--sw-bg": t.bg, "--sw-accent": t.accent }}
                onClick={() => setTheme(t.id)}
              >
                <span className="theme-swatch-preview" />
                <span className="theme-swatch-label">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        {session.role === "admin" && (
          <section className="settings-section">
            <h3>Admin</h3>
            <p>Add, remove, or reset passwords for people who can use this app.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                window.open(adminPanelUrl(session.token), "myfls_admin");
              }}
            >
              Manage users
            </button>
          </section>
        )}

        <section className="settings-section">
          <button className="btn secondary" onClick={onSignOut}>
            Sign out
          </button>
        </section>
      </div>
    </div>
  );
}

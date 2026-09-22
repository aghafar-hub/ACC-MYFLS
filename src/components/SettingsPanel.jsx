import { useState } from "react";
import { THEMES } from "../config";
import { isFileSystemAccessSupported, pickLocalRoot } from "../localFiles";
import { useTheme } from "../ThemeContext";

export default function SettingsPanel({ localRootName, onLocalRootChanged, onClose }) {
  const { themeId, setTheme } = useTheme();
  const [error, setError] = useState("");
  const supported = isFileSystemAccessSupported();

  const handleChooseFolder = async () => {
    setError("");
    try {
      const handle = await pickLocalRoot();
      onLocalRootChanged(handle);
    } catch (err) {
      // AbortError just means the visitor closed the picker without choosing anything
      if (err?.name !== "AbortError") setError("Couldn't access that folder.");
    }
  };

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

        <section className="settings-section">
          <h3>Local files</h3>
          {supported ? (
            <>
              <p>
                Opening a document reads it straight from this PC. Point this at the folder where Google Drive for Desktop has synced the
                shared plant-documents folder - the browser will ask to confirm access.
              </p>
              {localRootName && (
                <p>
                  Connected to: <strong>{localRootName}</strong>
                </p>
              )}
              {error && <p className="login-error">{error}</p>}
              <button type="button" className="btn" onClick={handleChooseFolder}>
                {localRootName ? "Change folder" : "Choose folder"}
              </button>
            </>
          ) : (
            <p>Local file access needs Chrome or Edge - this browser doesn't support it.</p>
          )}
        </section>
      </div>
    </div>
  );
}

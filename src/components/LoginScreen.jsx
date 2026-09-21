import { useState } from "react";
import { APP_CONFIG, isAppsScriptConfigured } from "../config";

export default function LoginScreen({ errorMsg }) {
  const [submitting, setSubmitting] = useState(false);

  const handleClick = () => {
    setSubmitting(true);
    // A plain same-tab redirect - no popup, no new window at all. Apps
    // Script resolves whichever Google account is already signed in
    // (handleIdentify_ in Code.gs) and sends this tab straight back with
    // the result on the URL hash (see consumeLoginHash() in App.jsx).
    // The trade-off for never opening a second window: Apps Script's own
    // sandboxed iframe blocks it from escaping back to a clean github.io
    // address automatically, so the app ends up loaded right here
    // instead, with the address bar still showing the script.google.com
    // URL for a moment - a deliberate choice over a popup, not a bug.
    window.location.href = `${APP_CONFIG.APPS_SCRIPT_URL}?identify=1`;
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logos">
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
        <h1>MyFLS Document Browser</h1>
        {errorMsg && <p className="login-error">{errorMsg}</p>}
        {isAppsScriptConfigured() ? (
          <button type="button" className="btn primary" onClick={handleClick} disabled={submitting}>
            {submitting ? "Signing in…" : "Continue with your ACC Google account"}
          </button>
        ) : (
          <p className="login-error">Sign-in is not configured yet (see README).</p>
        )}
        <p className="login-hint">You'll be asked to confirm your arabiancementcompany.com Google account.</p>
      </div>
    </div>
  );
}

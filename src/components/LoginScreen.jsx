import { useEffect, useState } from "react";
import { APP_CONFIG, isAppsScriptConfigured } from "../config";

export default function LoginScreen({ errorMsg, errorSeq }) {
  const [submitting, setSubmitting] = useState(false);

  // errorSeq changes every time a fresh error arrives from the server
  // (even if the text is identical to the last one), so this reliably
  // clears the "Signing in…" state instead of getting stuck.
  useEffect(() => {
    if (errorSeq) setSubmitting(false);
  }, [errorSeq]);

  const handleClick = () => {
    setSubmitting(true);
    // Opens in a small popup rather than this tab or a hidden iframe:
    // Google refuses to let Apps Script responses load inside an iframe
    // on another origin at all (X-Frame-Options: SAMEORIGIN), and a
    // same-tab redirect runs into the same sandboxed-iframe escape
    // problem that made login unreliable before. Apps Script resolves
    // whichever Google account is already signed in (no password, no
    // form) and posts the result back to this tab via
    // window.opener.postMessage, closing itself immediately after (see
    // handleIdentify_ / postMessageHtml_ in Code.gs and App.jsx's
    // message listener).
    window.open(
      `${APP_CONFIG.APPS_SCRIPT_URL}?identify=1`,
      "myfls_auth",
      "width=420,height=360,menubar=no,toolbar=no,location=no,status=no"
    );
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

import { useEffect, useState } from "react";
import { APP_CONFIG, isAppsScriptConfigured } from "../config";

export default function LoginScreen({ errorMsg, errorSeq }) {
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // errorSeq changes every time a fresh error arrives from the server
  // (even if the text is identical to the last one), so this reliably
  // clears the "Signing in…" state instead of getting stuck if someone
  // retries with the same wrong password twice in a row.
  useEffect(() => {
    if (errorSeq) setSubmitting(false);
  }, [errorSeq]);

  const handleSubmit = (e) => {
    if (!isAppsScriptConfigured()) {
      e.preventDefault();
      setLocalError("Sign-in is not configured yet (see README).");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    // The POST opens in a small named popup (Google refuses to let Apps
    // Script responses load inside a same-page iframe on another origin -
    // it sends X-Frame-Options: SAMEORIGIN - so a hidden iframe here just
    // stays blank forever; a popup isn't "framed" so it's unaffected).
    // Apps Script's response posts the result back to this tab via
    // window.opener.postMessage and closes itself (see postMessageHtml_
    // in Code.gs) rather than navigating anywhere - Apps Script's own
    // sandboxed iframe blocks a plain redirect to a different origin
    // regardless of how it's triggered, but postMessage isn't a
    // navigation and was built to cross exactly that kind of boundary.
    window.open("", "myfls_auth", "width=420,height=360,menubar=no,toolbar=no,location=no,status=no");
  };

  const error = localError || errorMsg;

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
        {error && <p className="login-error">{error}</p>}
        <form method="post" action={APP_CONFIG.APPS_SCRIPT_URL} target="myfls_auth" onSubmit={handleSubmit}>
          <input type="hidden" name="action" value="login" />
          <label>
            Email
            <input type="email" name="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <label className="login-remember">
            <input type="checkbox" name="remember" value="1" defaultChecked />
            Keep me signed in on this device
          </label>
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="login-hint">Ask your administrator if you don't have an account yet.</p>
      </div>
    </div>
  );
}

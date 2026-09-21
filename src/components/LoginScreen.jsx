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
    // The form posts into the hidden <iframe> below instead of navigating
    // this tab or opening a popup. Apps Script's own sandboxed iframe
    // blocks a plain redirect back to a different origin no matter how
    // it's triggered, but postMessage was built specifically to cross
    // that kind of boundary and isn't subject to it - so Apps Script's
    // response posts the result back up (see App.jsx's message listener)
    // instead of trying to navigate anywhere. Nothing ever leaves this
    // page, so there's no popup window or extra tab to notice at all.
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
        <form method="post" action={APP_CONFIG.APPS_SCRIPT_URL} target="myfls_auth_frame" onSubmit={handleSubmit}>
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
        <iframe name="myfls_auth_frame" title="Sign-in" hidden />
        <p className="login-hint">Ask your administrator if you don't have an account yet.</p>
      </div>
    </div>
  );
}

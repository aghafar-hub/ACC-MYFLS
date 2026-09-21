import { useEffect, useState } from "react";
import { APP_CONFIG, clearSession, isAppsScriptConfigured } from "../config";

export default function ChangePasswordScreen({ session, errorMsg, errorSeq }) {
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // See LoginScreen.jsx - errorSeq changes every time a fresh error
  // arrives even if its text repeats, so this reliably clears the
  // submitting state instead of getting stuck.
  useEffect(() => {
    if (errorSeq) setSubmitting(false);
  }, [errorSeq]);

  const handleSubmit = (e) => {
    if (!isAppsScriptConfigured()) {
      e.preventDefault();
      setLocalError("Sign-in is not configured yet (see README).");
      return;
    }
    if (newPassword !== confirmPassword) {
      e.preventDefault();
      setLocalError("Passwords don't match.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    // The form posts into the hidden <iframe> below - see LoginScreen.jsx
    // for why (postMessage instead of a popup or page navigation).
  };

  const handleSignOut = (e) => {
    e.preventDefault();
    clearSession();
    window.location.reload();
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
        <h1>Set a new password</h1>
        <p className="login-hint" style={{ margin: "0 0 14px" }}>
          You're signed in with a temporary password. Choose a new one to continue.
        </p>
        {error && <p className="login-error">{error}</p>}
        <form method="post" action={APP_CONFIG.APPS_SCRIPT_URL} target="myfls_auth_frame" onSubmit={handleSubmit}>
          <input type="hidden" name="action" value="change-password" />
          <input type="hidden" name="token" value={session.token} />
          <label>
            New password
            <input
              type="password"
              name="newPassword"
              required
              minLength={6}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? "Saving…" : "Set password"}
          </button>
        </form>
        <iframe name="myfls_auth_frame" title="Change password" hidden />
        <p className="login-hint">
          <a href="#" onClick={handleSignOut}>
            Sign out instead
          </a>
        </p>
      </div>
    </div>
  );
}

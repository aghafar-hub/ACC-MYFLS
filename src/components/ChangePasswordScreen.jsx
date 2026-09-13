import { useState } from "react";
import { APP_CONFIG, clearSession, isAppsScriptConfigured } from "../config";

export default function ChangePasswordScreen({ session }) {
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = (e) => {
    if (!isAppsScriptConfigured()) {
      e.preventDefault();
      setError("Sign-in is not configured yet (see README).");
      return;
    }
    if (newPassword !== confirmPassword) {
      e.preventDefault();
      setError("Passwords don't match.");
      return;
    }
    // otherwise: the POST opens in a named popup (target="myfls_auth"),
    // same handoff as the login form — see LoginScreen.jsx for why.
  };

  const handleSignOut = (e) => {
    e.preventDefault();
    clearSession();
    window.location.reload();
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
        <h1>Set a new password</h1>
        <p className="login-hint" style={{ margin: "0 0 14px" }}>
          You're signed in with a temporary password. Choose a new one to continue.
        </p>
        {error && <p className="login-error">{error}</p>}
        <form method="post" action={APP_CONFIG.APPS_SCRIPT_URL} target="myfls_auth" onSubmit={handleSubmit}>
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
          <button type="submit" className="btn primary">
            Set password
          </button>
        </form>
        <p className="login-hint">
          <a href="#" onClick={handleSignOut}>
            Sign out instead
          </a>
        </p>
      </div>
    </div>
  );
}

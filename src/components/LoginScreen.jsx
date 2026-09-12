import { useState } from "react";
import { APP_CONFIG, isAppsScriptConfigured } from "../config";

export default function LoginScreen({ errorMsg }) {
  const [error, setError] = useState(errorMsg || "");

  const handleSubmit = (e) => {
    if (!isAppsScriptConfigured()) {
      e.preventDefault();
      setError("Sign-in is not configured yet (see README).");
    }
    // otherwise: real form POST navigates to Apps Script, which redirects
    // back here with a token (or an error) on the URL hash.
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
        {error && <p className="login-error">{error}</p>}
        <form method="post" action={APP_CONFIG.APPS_SCRIPT_URL} onSubmit={handleSubmit}>
          <input type="hidden" name="action" value="login" />
          <label>
            Email
            <input type="email" name="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <button type="submit" className="btn primary">
            Sign in
          </button>
        </form>
        <p className="login-hint">Ask your administrator if you don't have an account yet.</p>
      </div>
    </div>
  );
}

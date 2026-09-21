import { useEffect, useRef, useState } from "react";
import { APP_CONFIG, isAppsScriptConfigured } from "../config";

const POPUP_FEATURES = "width=420,height=360,menubar=no,toolbar=no,location=no,status=no";
const POPUP_TIMEOUT_MS = 15000;

export default function LoginScreen({ errorMsg, errorSeq }) {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const popupRef = useRef(null);
  const pollRef = useRef(null);
  const timeoutRef = useRef(null);
  const retriedRef = useRef(false);

  // errorSeq changes every time a fresh error arrives from the server
  // (even if the text is identical to the last one), so this reliably
  // clears the "Signing in…" state instead of getting stuck.
  useEffect(() => {
    if (errorSeq) setSubmitting(false);
  }, [errorSeq]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const openPopup = () => {
    // Opens in a small popup rather than this tab or a hidden iframe:
    // Google refuses to let Apps Script responses load inside an iframe
    // on another origin at all (X-Frame-Options: SAMEORIGIN), and a
    // same-tab redirect runs into the same sandboxed-iframe escape
    // problem that made login unreliable before. Apps Script resolves
    // whichever Google account is already signed in (no password, no
    // form) and posts the result back to this tab via
    // window.top.opener.postMessage, closing itself immediately after
    // (see handleIdentify_ / postMessageHtml_ in Code.gs and App.jsx's
    // message listener).
    const popup = window.open(`${APP_CONFIG.APPS_SCRIPT_URL}?identify=1`, "myfls_auth", POPUP_FEATURES);
    popupRef.current = popup;
    if (!popup) {
      setSubmitting(false);
      setLocalError("Your browser blocked the sign-in popup. Please allow popups for this site and try again.");
      return;
    }

    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // If the popup closes without App.jsx's message listener ever having
    // heard back (that would already have moved this screen away by
    // navigating to the app, unmounting this component and its timers),
    // retry once automatically before giving up. A domain-restricted
    // deployment sometimes routes the very first popup through an extra
    // Google account-confirmation step, which can sever the window.opener
    // link entirely - a browser security behavior for that kind of
    // cross-origin hop, not something this code can prevent. The retry
    // doesn't need that extra step, since the browser is already
    // authenticated with Google by then, so it should complete cleanly.
    pollRef.current = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (!retriedRef.current) {
          retriedRef.current = true;
          openPopup();
        } else {
          setSubmitting(false);
          setLocalError("Sign-in didn't go through. Please try again.");
        }
      }
    }, 400);

    // Belt-and-suspenders: if the popup gets stuck open (loaded but never
    // closes - e.g. that same opener-severing issue, just without the
    // popup managing to close itself first), force it closed after a
    // while so the retry above still kicks in instead of leaving the
    // visitor stuck on an unresponsive blank window indefinitely.
    timeoutRef.current = setTimeout(() => {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    }, POPUP_TIMEOUT_MS);
  };

  const handleClick = () => {
    retriedRef.current = false;
    setLocalError("");
    setSubmitting(true);
    openPopup();
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

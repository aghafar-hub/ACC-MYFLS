// Not a secret - it's the same URL people already need to click to open a
// document. Real access control lives in the Apps Script settings sheet,
// not in this file. See apps-script/README.md for how to deploy your own.
export const APP_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw3-gfpbwFVMU5xIXlAxNSiaXzHMy2g02iHei-h2QndiNW3WHMiYwSfruTTNhx_jRyn/exec",
};

export function isAppsScriptConfigured() {
  return Boolean(APP_CONFIG.APPS_SCRIPT_URL) && !APP_CONFIG.APPS_SCRIPT_URL.startsWith("YOUR_");
}

const SESSION_KEY = "myfls_session";
export const THEME_KEY = "myfls_theme";

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export const THEMES = [
  { id: "ocean-light", label: "Ocean Light", bg: "#f4f6f8", accent: "#0b5fa5" },
  { id: "ocean-dark", label: "Ocean Dark", bg: "#10161d", accent: "#4da3ff" },
  { id: "forest-light", label: "Forest Light", bg: "#f4f7f4", accent: "#1a7f37" },
  { id: "forest-dark", label: "Forest Dark", bg: "#0e1710", accent: "#43c15f" },
  { id: "slate-light", label: "Slate Light", bg: "#f5f5f6", accent: "#52607a" },
  { id: "slate-dark", label: "Slate Dark", bg: "#131417", accent: "#8b95a8" },
];

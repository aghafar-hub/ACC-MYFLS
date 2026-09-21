// Not a secret - it's the same URL people already need to click to open a
// document. Real access control lives in the Apps Script settings sheet,
// not in this file. See apps-script/README.md for how to deploy your own.
export const APP_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw3-gfpbwFVMU5xIXlAxNSiaXzHMy2g02iHei-h2QndiNW3WHMiYwSfruTTNhx_jRyn/exec",
};

export function isAppsScriptConfigured() {
  return Boolean(APP_CONFIG.APPS_SCRIPT_URL) && !APP_CONFIG.APPS_SCRIPT_URL.startsWith("YOUR_");
}

export const THEME_KEY = "myfls_theme";

// Same 10 themes (names + colors) as acc-oil-analysis-app / ACC-Vibration-
// Analysis-App, for a consistent look across all three apps. "id" here is
// the data-theme attribute value; bg/accent are just for the settings
// panel's swatch preview - the full palette lives in index.css.
export const THEMES = [
  { id: "navy-dark", label: "Navy Dark", bg: "#0a1628", accent: "#00b4d8" },
  { id: "midnight-blue", label: "Midnight Blue", bg: "#0d0f1a", accent: "#7c6fe6" },
  { id: "forest-green", label: "Forest Green", bg: "#0a1a12", accent: "#2dc653" },
  { id: "carbon-dark", label: "Carbon Dark", bg: "#111111", accent: "#e63946" },
  { id: "slate-light", label: "Slate Light", bg: "#eef2f6", accent: "#0078a0" },
  { id: "warm-sand", label: "Warm Sand", bg: "#f0ebe0", accent: "#b06010" },
  { id: "pearl-white", label: "Pearl White", bg: "#f7f8fa", accent: "#2563eb" },
  { id: "sky-blue", label: "Sky Blue", bg: "#eff6ff", accent: "#0369a1" },
  { id: "rose-light", label: "Rose Light", bg: "#fff1f2", accent: "#be123c" },
  { id: "mint-fresh", label: "Mint Fresh", bg: "#f0fdf4", accent: "#15803d" },
];

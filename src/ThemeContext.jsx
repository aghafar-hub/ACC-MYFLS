import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { THEME_KEY } from "./config";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || "navy-dark";
    } catch {
      return "navy-dark";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    try {
      localStorage.setItem(THEME_KEY, themeId);
    } catch {
      // localStorage unavailable (private browsing, etc.) - theme still
      // applies for this page load, just won't persist
    }
  }, [themeId]);

  const setTheme = useCallback((id) => setThemeId(id), []);

  return <ThemeContext.Provider value={{ themeId, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

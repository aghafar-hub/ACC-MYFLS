import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path matches how this app is served: a repo-name subpath on GitHub
// Pages. GitHub Pages paths are case-sensitive, and the repo's real name is
// "ACC-MYFLS" - this has to match that exactly or every asset URL 404s (a
// white screen, not an error page, since index.html itself still loads).
export default defineConfig({
  base: "/ACC-MYFLS/",
  plugins: [react()],
});

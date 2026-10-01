import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "./",
  plugins: [
    vue(),
    {
      name: "extension-files",
      generateBundle() {
        const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
        manifest.chrome_url_overrides.newtab = "dashboard.html";
        this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify(manifest, null, 2) });
        this.emitFile({ type: "asset", fileName: "background.js", source: readFileSync("background.js") });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: { dashboard: "dashboard.html", preview: "preview.html" }
    }
  }
});

import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "legal-page-paths",
      closeBundle() {
        const dist = resolve(__dirname, "dist");
        const paths = [
          ["static/terms-of-service", "terms-of-service"],
          ["static/privacy-policy", "privacy-policy"]
        ];

        for (const [from, to] of paths) {
          const fromPath = resolve(dist, from);
          const toPath = resolve(dist, to);

          if (existsSync(fromPath)) {
            mkdirSync(resolve(toPath, ".."), { recursive: true });
            renameSync(fromPath, toPath);
          }
        }

        rmSync(resolve(dist, "static"), { recursive: true, force: true });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        terms: resolve(__dirname, "static/terms-of-service/index.html"),
        privacy: resolve(__dirname, "static/privacy-policy/index.html")
      }
    }
  }
});

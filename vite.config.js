import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const galleryDir = path.resolve("public/gallery");

function galleryManifest() {
  const virtualId = "\0virtual:gallery";
  const read = () => {
    if (!fs.existsSync(galleryDir)) return [];
    const thumbsDir = path.join(galleryDir, "thumbs");
    const thumbNames = fs.existsSync(thumbsDir) ? fs.readdirSync(thumbsDir) : [];
    return fs
      .readdirSync(galleryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(avif|jpe?g|png|webp)$/i.test(entry.name))
      .map((entry) => {
        const stem = entry.name.replace(/\.[^.]+$/, "");
        const thumb = thumbNames.find((name) => name.replace(/\.[^.]+$/, "") === stem);
        return {
          full: `gallery/${entry.name}`,
          thumb: thumb ? `gallery/thumbs/${thumb}` : `gallery/${entry.name}`,
        };
      })
      .sort((a, b) => a.full.localeCompare(b.full, "en", { numeric: true }));
  };

  return {
    name: "gallery-manifest",
    resolveId(source) {
      if (source === "virtual:gallery") return virtualId;
    },
    load(id) {
      if (id !== virtualId) return null;
      return `export default ${JSON.stringify(read())}`;
    },
  };
}

export default defineConfig({
  plugins: [react(), galleryManifest()],
  base: "./",
  optimizeDeps: {
    include: ["pdfjs-dist/legacy/build/pdf.mjs"],
  },
  server: {
    watch: {
      ignored: ["**/public/data/**"],
    },
  },
});

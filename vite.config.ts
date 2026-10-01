import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

function listFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    // The production server rejects hidden hosting metadata; it cannot be precached.
    if (entry.name.startsWith('.')) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [`/${relative(root, path).split(sep).join("/")}`];
  });
}

export default defineConfig({
  plugins: [react(), {
    name: 'yoeo-offline-manifest',
    closeBundle() {
      const root = join(process.cwd(), 'dist');
      const assets = listFiles(root).filter((name) => !['/precache-manifest.json', '/index.html'].includes(name));
      writeFileSync(join(root, 'precache-manifest.json'), JSON.stringify(assets));
    }
  }],
  build: { outDir: 'dist' }
});

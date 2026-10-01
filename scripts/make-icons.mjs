import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(
  path.resolve(process.env.YOEO_TOOLS_DIR || ".", "package.json"),
);
const sharp = require("sharp");
for (const size of [192, 512]) {
  await sharp("assets/icon.png")
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
}

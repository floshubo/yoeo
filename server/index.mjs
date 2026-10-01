import "dotenv/config";
import express from "express";
import path from "node:path";
import { createApp } from "./app.mjs";
const production = process.argv.includes("--production") || process.env.NODE_ENV==='production';
if(process.env.NODE_ENV==='production') {
 const missing=['APP_URL','AI_API_KEY','SUPABASE_URL','SESSION_SECRET'].filter(k=>!process.env[k]);
 if(!(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY))missing.push('SUPABASE_PUBLISHABLE_KEY');
 if(missing.length||process.env.SESSION_SECRET?.length<32||!process.env.APP_URL?.startsWith('https://')) {
  console.error('Production requires HTTPS APP_URL, a 32-character SESSION_SECRET and configured AI/Supabase credentials. Missing fields:',missing.join(', '));process.exit(1);
 }
}
const app = createApp();
const port = Number(process.env.PORT) || 5187;
if (production) {
  app.use((req,res,next)=>{if(req.path.split('/').some(part=>part.startsWith('.')&&part!=='.well-known'))return res.sendStatus(404);res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','strict-origin-when-cross-origin');res.set('X-Frame-Options','DENY');next();});
  app.get('/',(req,res,next)=>{
    const hostname=(req.hostname||'').toLowerCase();
    if(hostname==='yoeo.app'||hostname==='www.yoeo.app')return res.sendFile(path.resolve('dist/landing.html'));
    next();
  });
  app.use(express.static("dist",{dotfiles:'deny'}));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { port: port + 1 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`YOEO ready at http://localhost:${port}`),
);
server.on("error", (e) => {
  console.error(`Unable to start YOEO: ${e.message}`);
  process.exit(1);
});

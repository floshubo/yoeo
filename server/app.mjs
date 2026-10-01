import express from "express";
import { requestSchema } from "./schema.mjs";
import { analyze, getConfig } from "./ai.mjs";
import {authRouter} from './auth.mjs';
import {usageService} from './usage.mjs';
import {isAllowedOrigin} from './origins.mjs';
export function createApp({ analyzeFn = analyze, env = process.env, usageOverride } = {}) {
  const app = express();
  const authRouterInstance = authRouter(env);
  const usage=usageOverride||usageService(env,authRouterInstance);
  app.disable("x-powered-by");
  if(env.TRUST_PROXY_HOPS==='1')app.set('trust proxy',1);
  app.use('/api',(req,res,next)=>{
    const origin=req.get('origin');
    const fallback=`${req.protocol}://${req.get('host')}`;
    if(origin&&isAllowedOrigin(origin,env,fallback)){
      res.set('Access-Control-Allow-Origin',origin);
      res.set('Vary','Origin');
      res.set('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers','Content-Type,Authorization,X-YOEO-Session,X-YOEO-Guest');
      if(req.method==='OPTIONS')return res.sendStatus(204);
    }
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  app.get("/api/health", (_req, res) => {
    const c = getConfig(env);
    res.json({
      configured: !!c.key,
      provider: c.provider,
      model: c.model,
      requiresAccessToken: !!env.APP_ACCESS_TOKEN,
    });
  });
  app.use('/api', (req,res,next) => {
    if(req.path.startsWith('/auth/')||req.path==='/account'||req.path.startsWith('/account/'))return authRouterInstance(req,res,next);
    next();
  });
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    const expectedOrigin = env.APP_URL ? new URL(env.APP_URL).origin : `${req.protocol}://${req.get("host")}`;
    if (!isAllowedOrigin(origin,env,expectedOrigin))
      return res
        .status(403)
        .json({ error: "Cross-origin requests are not allowed." });
    if (
      env.APP_ACCESS_TOKEN &&
      req.get("authorization") !== `Bearer ${env.APP_ACCESS_TOKEN}`
    )
      return res
        .status(401)
        .json({ error: "Enter the app access token in Profile to continue." });
    next();
  });
  app.use("/api", express.json({ limit: "25mb" }));
  const requests = new Map();
  app.get('/api/usage',async(req,res)=>{try{res.json(await usage.status(req,res));}catch(e){res.status(e.status||503).json({error:e.publicMessage||e.message,code:e.code});}});
  app.post("/api/analyze", async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error:
            "Add up to 6 JPEG, PNG or WebP photos (5 MB each), or menu text, with a valid allergen profile.",
        });
    const key = req.ip;
    const now = Date.now();
    for (const [k, v] of requests)
      if (now - v.start > 600000) requests.delete(k);
    const entry = requests.get(key) || { start: now, count: 0, active: 0 };
    if (entry.count >= 20 || entry.active >= 2)
      return res
        .status(429)
        .json({ error: "Too many analyses. Please wait a few minutes." });
    entry.count++;
    entry.active++;
    requests.set(key, entry);
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    let reservation;
    let analyzed=false;
    try {
      reservation=await usage.reserve(req,res);
      const report=await analyzeFn(parsed.data, {
          signal: controller.signal,
          config: getConfig(env),
        });
      analyzed=true;
      const usageResult=await usage.finish(reservation,true);
      res.json({...report,...usageResult});
    } catch (e) {
      if (!res.destroyed)
        res
          .status(e.status || 500)
          .json({
            error: e.publicMessage || (e.status ? e.message : "Analysis failed. Please try again."),
            code:e.code,
          });
    } finally {
      if(reservation&&!analyzed)try{await usage.finish(reservation,false);}catch{console.warn('Could not release scan reservation; it will expire.');}
      entry.active--;
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use((err, _req, res, _next) =>
    res
      .status(err.type === "entity.too.large" ? 413 : 400)
      .json({
        error:
          err.type === "entity.too.large"
            ? "Photos are too large. Upload fewer photos."
            : "Invalid request.",
      }),
  );
  return app;
}

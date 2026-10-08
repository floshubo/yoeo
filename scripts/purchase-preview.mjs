// Local-only demo: real app UI + real usage service, mocked store/AI/account services.
// This file and its fixture are not imported by the production app or native build.
import express from 'express';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {usageService} from '../server/usage.mjs';

const port=Number(process.env.YOEO_PREVIEW_PORT)||5195;
const origin=`http://127.0.0.1:${port}`;
let pro=false;
const env={NODE_ENV:'production',APP_URL:origin,SESSION_SECRET:randomUUID()};
const usage=usageService(env,{accountsEnabled:false},{fetchImpl:async()=>new Response(JSON.stringify({subscriber:{entitlements:pro?{yoeo_pro:{expires_date:null}}:{}}}))});
const api=express();
api.use(express.json());
api.get('/__preview/state',(_req,res)=>res.json({pro}));
api.post('/__preview/state',(req,res)=>{pro=req.body.pro===true;res.json({pro});});
api.get('/__purchase-preview.js',(_req,res)=>res.type('js').send(readFileSync(new URL('./fixtures/purchase-preview.js',import.meta.url),'utf8')));
api.get('/api/health',(_req,res)=>res.json({configured:true,provider:'preview',model:'simulated',requiresAccessToken:false}));
api.get('/api/auth/config',(_req,res)=>res.json({enabled:true,providers:{google:false,apple:false}}));
api.get('/api/auth/session',(req,res)=>req.get('x-yoeo-session')?res.json({user:{id:'preview-account',email:'demo@example.invalid'}}):res.status(401).json({error:'Not signed in'}));
api.post('/api/auth/login',(_req,res)=>res.json({sessionToken:'preview-session'}));
api.post('/api/auth/signup',(_req,res)=>res.json({sessionToken:'preview-session'}));
api.post('/api/auth/logout',(_req,res)=>res.json({ok:true}));
// Optional account sync, held in memory for the demo: scan history and the allergen profile follow the account.
const cloud={reports:new Map(),profiles:new Map()};
const requireSession=(req,res)=>req.get('x-yoeo-session')?true:(res.status(401).json({error:'Not signed in'}),false);
api.get('/api/account/reports',(req,res)=>{if(requireSession(req,res))res.json([...cloud.reports.values()]);});
api.post('/api/account/reports',(req,res)=>{if(!requireSession(req,res))return;cloud.reports.set(req.body.id,req.body);res.json({id:req.body.id});});
api.delete('/api/account/reports/:id',(req,res)=>{if(!requireSession(req,res))return;cloud.reports.delete(req.params.id);res.json({ok:true});});
api.get('/api/account/profiles',(req,res)=>{if(requireSession(req,res))res.json([...cloud.profiles.values()]);});
api.post('/api/account/profiles',(req,res)=>{if(!requireSession(req,res))return;const id=req.body.id||randomUUID();cloud.profiles.set(id,{...req.body,id});res.json({id});});
api.use(createApp({env,usageOverride:usage,analyzeFn:async()=>({id:randomUUID(),createdAt:new Date().toISOString(),title:'Preview menu',model:'simulated',sourceType:'menu',readable:true,summary:'Simulated result for testing the guest purchase flow.',profileSnapshot:[],warnings:['Preview data — not a food safety assessment.'],dishes:[{id:'soup',name:'Tomato soup',description:'Simulated preview dish',ingredients:[],allergens:[],uncertainties:['Ingredients are not verified in this preview.'],questions:['Please confirm ingredients with the restaurant.'],status:'Uncertain'}]})}));

const server=await createServer({
 define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify(origin)},
 server:{host:'127.0.0.1',port,strictPort:true},
 plugins:[{name:'local-purchase-preview',configureServer(server){server.middlewares.use(api);},transformIndexHtml(){return [{tag:'script',attrs:{src:'/__purchase-preview.js'},injectTo:'head-prepend'}];}}],
});
await server.listen();
console.log(`Purchase preview (simulated, no charges): ${origin}`);

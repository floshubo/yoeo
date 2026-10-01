import express from 'express';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(path.resolve(process.env.YOEO_TOOLS_DIR || '.', 'package.json'));
const { chromium } = require('playwright');
const sharp = require('sharp');
const app = express();
app.use(express.json({limit:'5mb'}));
let cancelled = 0, received = 0;
app.post('/api/analyze', (req,res) => {
  received++;
  assert.equal(req.get('X-YOEO-Session'), 'progress-test-session');
  const timer = setTimeout(() => res.json({
    id:'progress-fixture',createdAt:new Date().toISOString(),title:'Progress test',model:'fixture',readable:true,
    sourceType:'menu',menuText:'Milk soup',allergenListText:'',legend:[],summary:'Milk is declared.',warnings:[],profileSnapshot:[],
    dishes:[{id:'1',name:'Milk soup',description:'',ingredients:['milk'],allergenCodes:[],allergens:[{name:'Milk',certainty:'declared',evidence:'milk',severity:'Untracked'}],uncertainties:[],questions:[],status:'Uncertain'}],
  }), 2200);
  res.on('close',()=>{clearTimeout(timer);if(!res.writableEnded)cancelled++;});
});
app.use('/api',(_req,res)=>res.json({configured:true,user:null}));
app.use(express.static('dist'));
const server = app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const browser = await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:393,height:852}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('yoeo-profile',JSON.stringify({name:'Test',completed:true,allergens:[]}));
    localStorage.setItem('yoeo-account-session','progress-test-session');
    sessionStorage.setItem('yoeo-install-guide-seen','1');
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Start Analyzing',exact:true}).click();
  await page.getByRole('button',{name:'Photo',exact:true}).click();
  await page.getByRole('button',{name:'No, take the menu',exact:true}).click();
  const fixture = await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer();
  await page.getByLabel('Upload menu photos').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:fixture});
  await page.getByRole('checkbox',{name:/I agree to send/}).check();
  const analyze=page.getByRole('button',{name:'Analyze 1 photo',exact:true});
  await analyze.click();
  await page.getByRole('heading',{name:'Waiting for analysis…',exact:true}).waitFor();
  await page.getByText('1s elapsed',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Show all results/}).count(),0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await analyze.click();
  await page.getByRole('heading',{name:'Waiting for analysis…',exact:true}).waitFor();
  await page.getByRole('button',{name:/Show all results/}).waitFor();
  assert.equal(received,2);
  assert.equal(cancelled,1);
  assert.deepEqual(errors,[]);
  console.log('Real upload, waiting state, elapsed time, cancellation, retry, account headers and completed results passed.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}

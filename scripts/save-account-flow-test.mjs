import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const {chromium}=createRequire(path.resolve(process.env.YOEO_TOOLS_DIR || '.', 'package.json'))('playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
let authenticated=false;
const report={id:'save-flow-test',createdAt:new Date().toISOString(),title:'Test menu',model:'test',sourceType:'menu',readable:true,summary:'Test',profileSnapshot:[],warnings:[],dishes:[{id:'dish',name:'Soup',description:'Soup',ingredients:[],allergens:[],uncertainties:[],questions:[],status:'Uncertain'}]};

await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url());
 let body={},status=200;
 if(url.pathname==='/api/health')body={configured:true};
 if(url.pathname==='/api/usage')body={enforced:true,plan:'free',remaining:3};
 if(url.pathname==='/api/auth/config')body={enabled:true,providers:{google:false,apple:false}};
 if(url.pathname==='/api/auth/login'){authenticated=true;body={sessionToken:'isolated-session',user:{id:'test-user',email:'test@example.invalid'}};}
 if(url.pathname==='/api/auth/session'){status=authenticated?200:401;body=authenticated?{user:{id:'test-user',email:'test@example.invalid'},sessionToken:'isolated-session'}:{};}
 if(url.pathname==='/api/analyze')body=report;
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
});
await page.addInitScript(()=>{
 if(!localStorage.getItem('yoeo-profile'))localStorage.setItem('yoeo-profile',JSON.stringify({name:'Test',completed:true,allergens:[{name:'Milk',severity:'Critical'}]}));
 sessionStorage.setItem('yoeo-install-guide-seen','1');
});
const savedCount=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('yoeo-reports')||'[]').length);
try{
 await page.goto(process.env.YOEO_TEST_URL||'http://127.0.0.1:5187');
 await page.getByRole('button',{name:'Start Analyzing'}).click();
 await page.getByRole('button',{name:'Photo',exact:true}).click();
 await page.getByRole('button',{name:'No, upload the menu'}).click();
 await page.getByLabel('Upload menu photos').setInputFiles('public/icon-192.png');
 await page.getByRole('checkbox',{name:/I agree to send/}).check();
 await page.getByRole('button',{name:'Analyze 1 photo'}).click();
 await page.getByRole('button',{name:/Show all results/}).first().click();
 // Guests save on the device: no sign-in request and no paywall.
 await page.getByRole('button',{name:'Save results'}).click();
 await page.getByRole('heading',{name:'Saved Results'}).waitFor();
 assert.equal(await page.getByRole('heading',{name:/Sign in|Subscription|Choose a plan/}).count(),0);
 assert.equal(await savedCount(),1);
 assert.equal(await page.getByRole('heading',{name:'Test menu'}).count(),1);
 // A YOEO account stays optional and can be skipped from the account screen.
 await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
 await page.getByRole('button',{name:'Sign in or create account',exact:true}).click();
 await page.getByText(/Signing in is optional/).waitFor();
 await page.getByRole('button',{name:'Continue without signing in',exact:true}).click();
 await page.locator('.screen-profile').waitFor();
 // Signing in still works and keeps the locally saved result.
 await page.getByRole('button',{name:'Sign in or create account',exact:true}).click();
 await page.getByLabel('Email address').fill('test@example.invalid');
 await page.locator('input[type=password]').fill('a-long-test-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByText('Signed in as test@example.invalid').waitFor();
 await page.getByRole('button',{name:'Go back',exact:true}).click();await page.locator('.screen-profile').waitFor();
 assert.equal(await savedCount(),1);
 await page.getByRole('navigation').getByRole('button',{name:'Allergens',exact:true}).click();
 await page.getByRole('tab',{name:'All',exact:true}).click();
 await page.getByRole('searchbox',{name:'Find an allergen'}).fill('Milk');
 assert.equal(await page.getByText('Milk',{exact:true}).count()>0,true);
 await page.getByRole('searchbox',{name:'Find an allergen'}).fill('No-match');
 await page.getByText('No matching allergens.').waitFor();
 assert.deepEqual(errors,[]);
 console.log('Save/account flow passed: guest save stores results on the device without sign-in or a paywall, the YOEO account stays optional, sign-in still works, and All allergen search filters by typed name. All APIs were mocked.');
}finally{await browser.close();}

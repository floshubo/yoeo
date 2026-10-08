import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(path.resolve(process.env.YOEO_TOOLS_DIR || '.', 'package.json'));
const {chromium} = require('playwright');
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
// exhausted: the availability check reports no free scans; blocked: the analysis itself is refused.
let exhausted=false, blocked=false, unavailable=false;
const report={id:'navigation-test',createdAt:new Date().toISOString(),title:'Test menu',model:'test',sourceType:'menu',readable:true,summary:'Test',profileSnapshot:[],warnings:[],dishes:[{id:'dish',name:'Soup',description:'Cream soup',ingredients:['cream'],allergens:[{name:'Milk',evidence:'cream',certainty:'declared',severity:'Critical'}],uncertainties:[],questions:[],status:'Critical'}]};
await page.route('**/api/**', async route=>{
 const url=new URL(route.request().url());
 let body={},status=200;
 if(url.pathname==='/api/health')body={configured:true};
 if(url.pathname==='/api/usage'){body={enforced:true,plan:'free',remaining:exhausted?0:3};if(unavailable)status=503;}
 if(url.pathname==='/api/auth/config')body={enabled:true,providers:{google:false,apple:false}};
 if(url.pathname==='/api/auth/session')status=401;
 if(url.pathname==='/api/analyze'){status=blocked?402:200;body=blocked?{code:'SCAN_LIMIT_REACHED',error:'Your three free scans are used. Upgrade to Pro to keep scanning.'}:report;}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
});
await page.addInitScript(()=>{
 if(!localStorage.getItem('yoeo-profile'))localStorage.setItem('yoeo-profile',JSON.stringify({name:'Test',completed:true,allergens:[{name:'Milk',severity:'Critical'}]}));
 sessionStorage.setItem('yoeo-install-guide-seen','1');
});
const screen=async name=>page.locator(`.screen-${name}`).waitFor();
const button=name=>page.getByRole('button',{name,exact:true});
const offer=()=>page.getByRole('dialog',{name:'Unlock YOEO Pro'});
async function scan(){
 await button('Start Analyzing').click();await button('Photo').click();await button('No, upload the menu').click();
 await page.getByLabel('Upload menu photos').setInputFiles('public/icon-192.png');
 await page.getByRole('checkbox',{name:/I agree to send/}).check();
 await button('Analyze 1 photo').click();
}
try {
 await page.goto(process.env.YOEO_TEST_URL || 'http://127.0.0.1:5187');
 await button('Edit allergens').click();await screen('allergens');
 await button('Go back').click();await screen('home');
 await button('Edit allergens').click();await page.getByRole('tab',{name:'Avoid',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
 await page.goBack();await screen('allergens');
 assert.equal(await page.getByRole('tab',{name:'Avoid',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('button',{name:/Add allergen/}).click();await page.goBack();
 await page.getByRole('dialog').waitFor({state:'hidden'});await screen('allergens');
 await button('Go back').click();await screen('home');
 await scan();await page.getByRole('button',{name:/Show all results/}).first().click();
 // Saving never asks for a YOEO account or a subscription: results stay on the device.
 await button('Save results').click();await screen('saved');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yoeo-reports')||'[]').length),1);
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('tab',{name:'Critical',exact:true}).click();await page.getByRole('heading',{name:'Test menu'}).click();await screen('results');
 await button('Go back').click();await screen('saved');
 assert.equal(await page.getByRole('tab',{name:'Critical',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('navigation').getByRole('button',{name:'Home',exact:true}).click();await screen('home');
 // A failed availability check is reported; the scanner does not open.
 unavailable=true;await button('Start Analyzing').click();await page.getByRole('status').filter({hasText:'Could not check your scan availability'}).waitFor();unavailable=false;
 // An exhausted allowance opens the Pro offer directly, with no sign-in step.
 exhausted=true;await button('Start Analyzing').click();await offer().waitFor();
 assert.equal(await offer().getByRole('button',{name:/sign/i}).count(),0);
 await offer().getByRole('button',{name:'Upgrade to Pro',exact:true}).click();await screen('subscription');
 assert.equal(await page.getByRole('button',{name:/sign in to continue/i}).count(),0);
 await page.getByText('No YOEO account needed').first().waitFor();
 await button('Close subscription').click();await screen('home');exhausted=false;
 // When the server refuses the scan, the same offer appears and the photo is kept.
 blocked=true;await scan();await button('Upgrade to Pro').click();await offer().waitFor();
 await offer().getByRole('button',{name:'Upgrade to Pro',exact:true}).click();await screen('subscription');
 await button('Close subscription').click();await screen('scan');
 assert.equal(await page.getByAltText('Menu or food to analyze').count(),1);
 assert.deepEqual(errors,[]);
 console.log('Passed: back navigation, severity/filter preservation, modal Back, account-free saving, failed availability check, exhausted-allowance offer without sign-in, scan-limit CTA and retained photo.');
} finally {await browser.close();}

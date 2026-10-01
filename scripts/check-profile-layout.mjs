import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(path.resolve(process.env.YOEO_TOOLS_DIR,'package.json'))('playwright');
const browser=await chromium.launch();const page=await browser.newPage();
await page.goto('http://127.0.0.1:5187');
await page.evaluate(()=>localStorage.setItem('yoeo-profile',JSON.stringify({name:'Alex',completed:true,allergens:[]})));
await page.reload();await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Edit Profile',exact:true}).click();
for(const [width,height] of [[360,712],[390,844],[320,640]]){await page.setViewportSize({width,height});assert.ok(await page.locator('.edit-profile-form').evaluate(e=>e.scrollHeight<=e.clientHeight+1),`Profile needs scrolling at ${width}x${height}`);}
const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload profile photo',exact:true}).click();await(await chooser).setFiles('public/assets/183-2448-imgImage42.png');await page.getByRole('button',{name:'Use generic avatar'}).waitFor();assert.ok(await page.locator('.edit-profile-form').evaluate(e=>e.scrollHeight<=e.clientHeight+1));assert.equal(await page.locator('input[type=file]').isVisible(),false);
await page.setViewportSize({width:360,height:712});await page.screenshot({path:'test-results/edit-profile-compact.png'});await browser.close();console.log('Compact profile fits 320×640, 360×712 and 390×844; upload button opens picker and saves photo.');

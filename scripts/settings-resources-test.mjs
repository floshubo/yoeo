import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';

const {chromium}=createRequire(path.resolve(process.env.YOEO_TOOLS_DIR || '.', 'package.json'))('playwright');
const base=process.env.YOEO_TEST_URL || 'http://127.0.0.1:5188';
const browser=await chromium.launch({headless:true});
await mkdir('test-results/settings-resources',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:360,height:760},acceptDownloads:true,serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  let deleted=0;
  let completeDelete;
  const deleteGate=new Promise(resolve=>{completeDelete=resolve;});
  // Every API request is intercepted; no real user or production data is touched.
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    const signedIn=!!route.request().headers()['x-yoeo-session'];
    let json={configured:false};
    if(url.pathname==='/api/auth/session') json=signedIn?{user:{id:'isolated-user',email:'test@example.invalid',avatarUrl:'https://lh3.googleusercontent.com/a/test-avatar'}}:{};
    if(url.pathname==='/api/auth/config') json={configured:false,providers:{}};
    if(url.pathname==='/api/usage') json={enforced:true,plan:'free',remaining:signedIn?2:3};
    if(url.pathname==='/api/account'&&route.request().method()==='DELETE') {
      deleted++;
      assert.equal(route.request().postDataJSON().confirm,'DELETE');
      await deleteGate;
      json={deleted:true};
    }
    await route.fulfill({json});
  });
  await page.goto(base);
  await page.evaluate(()=>{
    localStorage.setItem('yoeo-profile',JSON.stringify({name:'Alex',completed:true,allergens:[]}));
    localStorage.setItem('yoeo-account-session','isolated-test-session');
    localStorage.setItem('yoeo-language','en');
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('heading',{name:'Alex',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Edit Profile',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'App Settings',exact:true}).count(),0);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Email address',{exact:true}).waitFor();
  await page.locator('.settings-profile-form .generic-avatar img').waitFor();
  assert.equal(await page.locator('.settings-profile-form .generic-avatar img').getAttribute('src'),'https://lh3.googleusercontent.com/a/test-avatar');
  await page.locator('.settings-profile-form input[type=file]').setInputFiles('public/icon-192.png');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('yoeo-profile')||'{}').avatar?.startsWith('data:image/jpeg;base64,'));
  assert.ok((await page.locator('.settings-profile-form .generic-avatar img').getAttribute('src')).startsWith('data:image/jpeg;base64,'));
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.settings-profile-form .generic-avatar img').waitFor();
  assert.ok((await page.locator('.settings-profile-form .generic-avatar img').getAttribute('src')).startsWith('data:image/jpeg;base64,'));
  await page.getByRole('button',{name:'Remove photo',exact:true}).click();
  assert.equal(await page.locator('.settings-profile-form .generic-avatar img').getAttribute('src'),'https://lh3.googleusercontent.com/a/test-avatar');
  await page.waitForFunction(()=>document.querySelector('input[type=email]')?.value==='test@example.invalid');
  assert.equal(await page.getByLabel('Email address',{exact:true}).getAttribute('readonly'),'');
  await page.getByLabel('Name',{exact:true}).fill('   ');
  assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);
  await page.getByLabel('Name',{exact:true}).fill('  Annie  ');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yoeo-profile')).name),'Annie');
  if(await page.locator('.toast').count()) await page.locator('.toast button').click();
  await page.getByRole('button',{name:'Reset password',exact:true}).click();
  await page.getByLabel('New password',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Go back',exact:true}).click();
  await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export my data',exact:true}).click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'yoeo-backup.json');
  const backup=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(backup.profile.name,'Annie');
  assert.equal(await page.getByRole('combobox').count(),0);
  assert.equal(await page.getByRole('heading',{name:'Language',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Delete data',exact:true}).count(),1);
  await page.getByRole('button',{name:'Delete data',exact:true}).click();
  await page.getByRole('button',{name:'Keep my data',exact:true}).click();
  assert.equal(deleted,0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yoeo-profile')).name),'Annie');
  await page.locator('.settings-content').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:'test-results/settings-resources/settings.png'});
  await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('button',{name:'Data Resources',exact:true}).click();
  await page.getByRole('heading',{name:'Data Sources',exact:true}).waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.sources-body img')).every(img=>img.complete&&img.naturalWidth>0));
  assert.equal(await page.locator('.classification-card').count(),8);
  assert.equal(await page.locator('.sources-intro').count(),0);
  const references=await page.locator('.source-citations a').evaluateAll(links=>links.map(a=>({href:a.href,target:a.target,rel:a.rel})));
  assert.deepEqual(references.map(a=>new URL(a.href).hostname),['eur-lex.europa.eu','www.fda.gov']);
  assert.ok(references.every(a=>a.target==='_blank'&&a.rel.includes('noreferrer')));
  for(const width of [320,360,390,440,768]) {
    await page.setViewportSize({width,height:760});
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.sources-body').evaluate(el=>{el.scrollTop=0;});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('.sources-body').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    const images=await page.locator('.sources-body img').evaluateAll(imgs=>imgs.map(img=>({
      src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0,
      width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,
    })));
    assert.ok(images.every(img=>img.loaded));
    for(const img of images) {
      const expected=img.src.includes('/final-ui/')?28:img.src.includes('arrow-right')?20:/correct|warning/.test(img.src)?23.5:24;
      assert.equal(img.width,expected,`Incorrect width: ${img.src}`);
      assert.equal(img.height,expected,`Incorrect height: ${img.src}`);
      assert.ok((await readFile(`public${img.src}`)).length>0);
    }
  }
  await page.setViewportSize({width:360,height:760});
  await page.screenshot({path:'test-results/settings-resources/sources-top.png'});
  for(const [name,selector] of [['classification','.sources-classification'],['certainty','.source-certainty'],['notice','.sources-notice']]) {
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({path:`test-results/settings-resources/sources-${name}.png`});
  }
  await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('heading',{name:'Guest',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yoeo-profile')).name),'Annie');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  assert.equal(await page.getByLabel('Email address',{exact:true}).inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'Reset password',exact:true}).count(),0);
  await page.getByRole('button',{name:'Sign in or create account',exact:true}).click();
  await page.locator('.account-page').waitFor();
  await page.getByRole('button',{name:'Go back',exact:true}).click();
  await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
  for(const width of [320,390,440]) {
    await page.setViewportSize({width,height:640});
    assert.equal(await page.locator('.settings-content').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await page.getByRole('button',{name:'Delete data',exact:true}).click();
    await page.getByRole('button',{name:'Keep my data',exact:true}).click();
  }
  // Simulated deletion tests only a synthetic session and intercepted endpoint.
  await page.evaluate(()=>localStorage.setItem('yoeo-account-session','isolated-test-session'));
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Delete data',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Delete data',exact:true}).click();
  await page.getByRole('heading',{name:'Deleting your data…',exact:true}).waitFor();
  completeDelete();
  await page.getByRole('heading',{name:'Your data has been deleted',exact:true}).waitFor();
  assert.equal(deleted,1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('yoeo-profile')),null);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Get started',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Settings/resources passed: profile save, authenticated email, password navigation, export, no language selector, one deletion entry, cancellation, guest identity, simulated progress/completion/restart, eight classifications, source links, asset geometry and mobile widths. No real account was deleted.');
} catch(error) {
  for(const page of browser.contexts().flatMap(context=>context.pages())) {
    console.error('Page state:',page.url(),await page.locator('body').innerText());
    await page.screenshot({path:'test-results/settings-resources/failure.png'});
  }
  throw error;
} finally {await browser.close();}

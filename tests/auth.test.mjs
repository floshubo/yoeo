import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {googleProfilePhoto} from '../server/auth.mjs';
test('Google profile photos are accepted only from Google image hosts',()=>{
 const google={app_metadata:{provider:'google'},user_metadata:{avatar_url:'https://lh3.googleusercontent.com/a/avatar'}};
 assert.equal(googleProfilePhoto(google),'https://lh3.googleusercontent.com/a/avatar');
 assert.equal(googleProfilePhoto({...google,user_metadata:{avatar_url:'https://other.example/avatar'}}),null);
 assert.equal(googleProfilePhoto({...google,app_metadata:{provider:'apple'}}),null);
});
async function withApp(env,fn){const server=createApp({env}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}}
test('unconfigured auth is disclosed and never fabricates a session',()=>withApp({},async base=>{const config=await(await fetch(base+'/api/auth/config')).json();assert.equal(config.enabled,false);assert.equal((await fetch(base+'/api/auth/session')).status,503);}));
const configured={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test-anon',SESSION_SECRET:'test-only-secret-at-least-32-characters',APP_URL:'https://yoeo.example'};
test('cloud profiles require a session before accessing provider',()=>withApp(configured,async base=>{assert.equal((await fetch(base+'/api/account/profiles')).status,401);}));
test('auth blocks cross-origin POST requests',()=>withApp(configured,async base=>{const r=await fetch(base+'/api/auth/email',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com'})});assert.equal(r.status,403);}));
test('disabled OAuth provider and invalid callback are rejected',()=>withApp(configured,async base=>{assert.equal((await fetch(base+'/api/auth/oauth/google')).status,400);assert.equal((await fetch(base+'/api/auth/callback?code=bad')).status,401);}));
test('OAuth browser flow returns an opaque PKCE handoff for static hosting proxies',()=>withApp({...configured,AUTH_GOOGLE_ENABLED:'true'},async base=>{const response=await fetch(base+'/api/auth/oauth/google?mode=json');assert.equal(response.status,200);const data=await response.json();assert.match(data.url,/example\.invalid\/auth\/v1\/authorize/);assert.ok(data.flowToken.length>20);const callback=await fetch(base+'/api/auth/oauth/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'test-code-value',flowToken:'invalid-but-long-enough-token'})});assert.equal(callback.status,401);}));
test('native OAuth uses the API callback and returns only the authorization code to the app',()=>withApp({...configured,API_PUBLIC_URL:'https://api.yoeo.example',AUTH_GOOGLE_ENABLED:'true',AUTH_APPLE_ENABLED:'true'},async base=>{for(const provider of ['google','apple']){const response=await fetch(base+`/api/auth/oauth/${provider}?mode=native`);assert.equal(response.status,200);const data=await response.json();const authorize=new URL(data.url);assert.equal(authorize.searchParams.get('provider'),provider);assert.equal(authorize.searchParams.get('redirect_to'),'https://api.yoeo.example/api/auth/native-callback');assert.equal(authorize.searchParams.get('code_challenge_method'),'s256');assert.ok(data.flowToken.length>20);}const callback=await fetch(base+'/api/auth/native-callback?code=test-code',{redirect:'manual'});assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),'app.yoeo.mobile://auth/callback?code=test-code');assert.equal(callback.headers.get('referrer-policy'),'no-referrer');}));
test('forged session cookies are rejected',()=>withApp(configured,async base=>{const r=await fetch(base+'/api/account/profiles',{headers:{Cookie:'yoeo_session=forged'}});assert.equal(r.status,401);}));
test('password changes and account deletion require an authenticated session',()=>withApp(configured,async base=>{for(const [path,method,body] of [['/api/auth/password','POST',{password:'test-password-123'}],['/api/account','DELETE',{confirm:'DELETE'}]]){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,401);}}));
test('account deletion calls the self-service function with the signed-in token and only reports success afterward',async()=>{
 const networkFetch=globalThis.fetch;const upstream=[];let rpcSucceeds=false;
 globalThis.fetch=async(url,options={})=>{
  if(String(url).startsWith('http://127.0.0.1:'))return networkFetch(url,options);
  const route=new URL(String(url)).pathname;upstream.push({route,method:options.method,authorization:options.headers?.Authorization});
  if(route==='/auth/v1/signup')return new Response(JSON.stringify({access_token:'personal-access',refresh_token:'refresh',expires_in:3600,user:{id:'user-1',email:'alex@example.com'}}));
  if(route==='/auth/v1/user')return new Response(JSON.stringify({id:'user-1',email:'alex@example.com'}));
  if(route==='/rest/v1/rpc/delete_own_account')return rpcSucceeds?new Response(null,{status:204}):new Response(JSON.stringify({message:'Deletion failed'}),{status:403});
  throw Error(`Unexpected upstream request: ${route}`);
 };
 try{await withApp(configured,async base=>{
  const signup=await networkFetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'alex@example.com',password:'a-long-test-password'})});
  const {sessionToken}=await signup.json();const headers={'Content-Type':'application/json','X-YOEO-Session':sessionToken};
  const invalid=await networkFetch(base+'/api/account',{method:'DELETE',headers,body:JSON.stringify({confirm:'no'})});
  assert.equal(invalid.status,400);assert.equal(upstream.some(item=>item.route==='/rest/v1/rpc/delete_own_account'),false);
  const failed=await networkFetch(base+'/api/account',{method:'DELETE',headers,body:JSON.stringify({confirm:'DELETE'})});
  assert.equal(failed.status,400);assert.equal(failed.headers.get('set-cookie'),null);
  rpcSucceeds=true;
  const success=await networkFetch(base+'/api/account',{method:'DELETE',headers,body:JSON.stringify({confirm:'DELETE'})});
  assert.equal(success.status,200);assert.deepEqual(await success.json(),{ok:true});
  assert.match(success.headers.get('set-cookie'),/yoeo_session=;.*Max-Age=0/);
  assert.deepEqual(upstream.filter(item=>item.route==='/rest/v1/rpc/delete_own_account').map(item=>({method:item.method,authorization:item.authorization})),[
   {method:'POST',authorization:'Bearer personal-access'},
   {method:'POST',authorization:'Bearer personal-access'},
  ]);
 });}finally{globalThis.fetch=networkFetch;}
});
test('password signup creates a session with email and password only',async()=>{
 const networkFetch=globalThis.fetch;let upstreamBody;
 globalThis.fetch=async(url,options)=>{if(String(url).startsWith('http://127.0.0.1:'))return networkFetch(url,options);assert.equal(String(url),'https://example.invalid/auth/v1/signup');upstreamBody=JSON.parse(options.body);return new Response(JSON.stringify({access_token:'access',refresh_token:'refresh',expires_in:3600,user:{id:'user-1',email:'alex@example.com'}}));};
 try{await withApp(configured,async base=>{const response=await networkFetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'alex@example.com',password:'a-long-test-password'})});assert.equal(response.status,200);const data=await response.json();assert.equal(data.user.email,'alex@example.com');assert.ok(data.sessionToken.length>20);assert.deepEqual(upstreamBody,{email:'alex@example.com',password:'a-long-test-password'});});}finally{globalThis.fetch=networkFetch;}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {savedReportSchema} from '../server/saved-report.mjs';

function fixture(){
 let session='account-a';
 const code=ts.transpileModule(readFileSync(new URL('../src/accountSync.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',code)(()=>({accountHeaders:()=>({'X-YOEO-Session':session}),apiUrl:path=>path}),exports);
 return {...exports,setSession:value=>{session=value;}};
}

test('sync freezes account credentials and excludes another account history',async()=>{
 const sync=fixture(), requests=[], original=globalThis.fetch;
 globalThis.fetch=async(path,init)=>{requests.push({path,...init});return new Response(JSON.stringify({id:'profile-a'}));};
 try{
  const client=sync.accountSync('a');sync.setSession('account-b');
  await client.pushReport({id:'report-a',syncOwnerId:'a',title:'Menu'});
  await assert.rejects(client.pushReport({id:'report-b',syncOwnerId:'b'}));
  assert.equal(requests.length,1);
  assert.equal(requests[0].headers['X-YOEO-Session'],'account-a');
  assert.equal(JSON.parse(requests[0].body).syncOwnerId,undefined);
  assert.deepEqual(sync.reportsForAccount([{id:1},{id:2,syncOwnerId:'a'},{id:3,syncOwnerId:'b'}],'a').map(r=>r.id),[1,2]);
 }finally{globalThis.fetch=original;}
});

test('profile edits share the created id and report deletion waits for a pending save',async()=>{
 const sync=fixture(),requests=[],original=globalThis.fetch;
 globalThis.fetch=async(path,init)=>{requests.push({path,...init});await new Promise(r=>setTimeout(r,5));return new Response(JSON.stringify({id:'created-profile'}));};
 try{
  const client=sync.accountSync('a'),profile={name:'Alex',completed:true,allergens:[]};
  await Promise.all([client.pushProfile(profile),client.pushProfile({...profile,name:'Alex updated'})]);
  assert.equal(JSON.parse(requests[1].body).id,'created-profile');
  await Promise.all([client.pushReport({id:'report'}),client.removeReport('report')]);
  assert.deepEqual(requests.slice(2).map(r=>r.method),['POST','DELETE']);
 }finally{globalThis.fetch=original;}
});

test('saved report validation rejects malformed dishes and strips photos and ownership metadata',()=>{
 const report={id:'6f1c2f3a-1111-4222-8333-444455556666',createdAt:new Date().toISOString(),title:'Menu',dishes:[],photo:'private image',syncOwnerId:'other-account'};
 const parsed=savedReportSchema.parse(report);
 assert.equal(parsed.photo,undefined);assert.equal(parsed.syncOwnerId,undefined);
 assert.equal(savedReportSchema.safeParse({...report,dishes:[{name:'Broken dish'}]}).success,false);
 assert.deepEqual(parsed.profileSnapshot,[]);
});

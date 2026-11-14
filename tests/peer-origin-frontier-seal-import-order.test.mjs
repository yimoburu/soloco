import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';

const planUrl=new URL('../plugins/soloco/runtime/peers/origin-plan.mjs',import.meta.url).href;
const sealUrl=new URL('../plugins/soloco/runtime/peers/origin-frontier-seal.mjs',import.meta.url).href;
const archiveUrl=new URL('../plugins/soloco/runtime/peers/input-frontier-archive.mjs',import.meta.url).href;

// Each worker has a fresh ESM module map: a previously imported origin-plan
// cannot warm its const binding and conceal the actual cyclic entry order.
// Every project module and import edge is real and unchanged. Only the exact
// archive lstat metadata is controlled; no service, Store, model or Native
// operation is invoked and no project file is rewritten.
const workerSource=String.raw`
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {syncBuiltinESMExports}=require('node:module');
const {parentPort,workerData:d}=require('node:worker_threads');
(async()=>{
 const original=fs.lstatSync,sentinel=Object.assign(Error('Fictional fixed archive lstat failure'),{code:'EACCES'});let calls=0;
 fs.lstatSync=function(entry,options){
  if(!(entry instanceof URL)||entry.href!==d.archiveUrl||options?.throwIfNoEntry!==false)return Reflect.apply(original,fs,arguments);
  calls++;
  if(d.mode==='absent')return undefined;
  if(d.mode==='directory')return original(d.directory);
  if(d.mode==='symlink')return original(d.symlink);
  if(d.mode==='lstat-error')throw sentinel;
  return Reflect.apply(original,fs,arguments);
 };
 syncBuiltinESMExports();
 try{
  let namespace,failure;
  try{
   await import(d.entryUrl);
   namespace=await import(d.sealUrl);
  }catch(error){failure=error;}
  assert.ok(calls>0,'the actual fixed archive entry guard must be reached');
  if(d.mode==='directory'||d.mode==='symlink'){
   assert.ok(failure,'an invalid fixed entry must remain a Hold');
   assert.equal(failure.code,'ORIGIN_FRONTIER_SEAL_OPTIONAL_SOURCE_ENTRY_REQUIRED');
   assert.equal(failure.message,'ORIGIN_FRONTIER_SEAL_OPTIONAL_SOURCE_ENTRY_REQUIRED');
  }else if(d.mode==='lstat-error')assert.strictEqual(failure,sentinel,'preserve the original filesystem failure');
  else{
   if(failure)throw failure;
   assert.equal(typeof namespace.loadPeerOriginFrontierSealCheckpointSupport,'function');
  }
  parentPort.postMessage({ok:true,mode:d.mode,calls});
 }finally{fs.lstatSync=original;syncBuiltinESMExports();}
})().catch(error=>{parentPort.postMessage({ok:false,message:String(error?.stack??error).slice(0,4000)});process.exitCode=1;});
`;

async function importCase(data,directory){
 let worker,timer;
 try{
  worker=new Worker(workerSource,{eval:true,workerData:data,execArgv:['--no-warnings'],env:{PATH:'/usr/bin:/bin',TMPDIR:directory,TMP:directory,TEMP:directory,LANG:'C',LC_ALL:'C',NODE_DISABLE_COLORS:'1',OPENSSL_CONF:'/dev/null',COMPANY_PLUGIN_DATA:path.join(directory,'managed-data')}});
  return await new Promise((resolve,reject)=>{
   let message;
   timer=setTimeout(()=>reject(Error('Fresh import realm exceeded its 10000ms bound')),10000);
   worker.once('message',value=>{message=value;});
   worker.once('error',reject);
   worker.once('exit',code=>{
    clearTimeout(timer);
    if(code!==0||message?.ok!==true)return reject(Error(message?.message??('Fresh import realm exited '+code+' without its completed assertion receipt')));
    resolve(message);
   });
  });
 }finally{clearTimeout(timer);if(worker)await worker.terminate();}
}

test('fresh cyclic frontier imports retain present, absent and invalid fixed-entry behavior',{timeout:90000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-frontier-import-order-'));fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const directory=path.join(root,'invalid-directory'),target=path.join(root,'target.mjs'),symlink=path.join(root,'invalid-link.mjs');
 fs.mkdirSync(directory,{mode:0o700});fs.writeFileSync(target,'// Fictional metadata fixture; never imported.\n',{mode:0o600});fs.symlinkSync(target,symlink);
 for(const [entryUrl,mode]of [[planUrl,'present'],[sealUrl,'present'],[planUrl,'absent'],[planUrl,'directory'],[planUrl,'symlink'],[planUrl,'lstat-error']]){
  const result=await importCase({entryUrl,sealUrl,archiveUrl,mode,directory,symlink},root);
  assert.equal(result.mode,mode);assert.ok(result.calls>0);
 }
});

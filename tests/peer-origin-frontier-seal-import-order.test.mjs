import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';

const planUrl=new URL('../plugins/soloco/runtime/peers/origin-plan.mjs',import.meta.url).href;
const sealUrl=new URL('../plugins/soloco/runtime/peers/origin-frontier-seal.mjs',import.meta.url).href;
const archiveUrl=new URL('../plugins/soloco/runtime/peers/input-frontier-archive.mjs',import.meta.url).href;
const clock=performance.now.bind(performance),WORK_MS=20000,CLEANUP_MS=5000,OUTPUT_BYTES=8192;

// A fresh process preserves the actual ESM graph without sharing its isolate
// with the parent test. A child crash or unsettled import remains a failure;
// no in-process Worker termination can abort the parent during V8 evaluation.
// Only fixed-archive lstat metadata is controlled, never project module text,
// services, Store/model/Native operations or readiness/authority.
const childSource=String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const input=fs.readFileSync(0,'utf8');assert.ok(Buffer.byteLength(input)<=10000);
const d=JSON.parse(input),emit=value=>process.stdout.write(JSON.stringify({mode:d.mode,entry:d.entry,...value})+'\n');
const original=fs.lstatSync,sentinel=Object.assign(Error('Fictional fixed archive lstat failure'),{code:'EACCES'});let calls=0;
fs.lstatSync=function(entry,options){
 if(!(entry instanceof URL)||entry.href!==d.archiveUrl||options?.throwIfNoEntry!==false)return Reflect.apply(original,fs,arguments);
 calls++;emit({event:'fixed_entry_observed'});
 if(d.mode==='absent')return undefined;
 if(d.mode==='directory')return original(d.directory);
 if(d.mode==='symlink')return original(d.symlink);
 if(d.mode==='lstat-error')throw sentinel;
 return Reflect.apply(original,fs,arguments);
};
syncBuiltinESMExports();
try{
 emit({event:'case_started'});let namespace,failure;
 try{
  emit({event:'before_first_import'});await import(d.entryUrl);emit({event:'after_first_import'});
  emit({event:'before_seal_import'});namespace=await import(d.sealUrl);emit({event:'after_seal_import'});
 }catch(error){failure=error;emit({event:'import_rejected',name:error?.name,code:error?.code??null});}
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
 emit({event:'case_assertions_complete',calls,ok:true});
}catch(error){emit({event:'case_failed',name:error?.name,code:error?.code??null,message:String(error?.stack??error).slice(0,4000)});process.exitCode=1;}
finally{fs.lstatSync=original;syncBuiltinESMExports();}
`;

async function importCase(data,directory,script){
 const began=clock(),buffers={stdout:[],stderr:[]},lengths={stdout:0,stderr:0},eof={stdout:false,stderr:false},signals=[],signalErrors=[],streamErrors=[];
 let child,workTimer,killTimer,cleanupTimer,seen=0,reason=null,exit=null,close=null,spawnError=null,settled=false;
 return await new Promise(resolve=>{
  function ownedSignal(signal){
   if(!child||exit!==null||child.exitCode!==null||child.signalCode!==null)return;
   try{if(child.kill(signal))signals.push(signal);}catch(error){signalErrors.push(error.code??error.name);}
  }
  function stop(why){
   if(reason!==null||settled)return;reason=why;ownedSignal('SIGTERM');
   killTimer=setTimeout(()=>ownedSignal('SIGKILL'),2000);
   cleanupTimer=setTimeout(()=>finish('cleanup_deadline'),CLEANUP_MS);
  }
  function finish(trigger){
   if(settled)return;settled=true;clearTimeout(workTimer);clearTimeout(killTimer);clearTimeout(cleanupTimer);
   const elapsed=clock()-began;
   if(close!==null&&close.elapsed_ms>WORK_MS&&reason===null)reason='late_close_observation';
   if(close!==null&&(close.code!==0||close.signal!==null)&&reason===null)reason='child_exit';
   const stdoutBytes=Buffer.concat(buffers.stdout),stderrBytes=Buffer.concat(buffers.stderr);
   let stdout='',stderr='',events=[],decodeError=null;
   try{
    const decoder=new TextDecoder('utf-8',{fatal:true});stdout=decoder.decode(stdoutBytes);stderr=decoder.decode(stderrBytes);
    assert.ok(stdout.endsWith('\n'));events=stdout.slice(0,-1).split('\n').map(line=>JSON.parse(line));
   }catch(error){decodeError=error.name+': '+error.message;}
   const stages=events.filter(event=>event.event!=='fixed_entry_observed').map(event=>event.event),negative=['directory','symlink','lstat-error'].includes(data.mode);
   const expected=negative?[
    ['case_started','before_first_import','import_rejected','case_assertions_complete'],
    ['case_started','before_first_import','after_first_import','before_seal_import','import_rejected','case_assertions_complete']
   ]:[['case_started','before_first_import','after_first_import','before_seal_import','after_seal_import','case_assertions_complete']];
   const completion=events.at(-1),clear=reason===null&&spawnError===null&&streamErrors.length===0&&decodeError===null&&seen<=OUTPUT_BYTES&&stderr===''&&exit?.code===0&&exit.signal===null&&close?.code===0&&close.signal===null&&close.elapsed_ms<=WORK_MS&&eof.stdout&&eof.stderr&&expected.some(sequence=>JSON.stringify(stages)===JSON.stringify(sequence))&&events.every(event=>event.mode===data.mode&&event.entry===data.entry)&&completion?.ok===true&&Number.isSafeInteger(completion.calls)&&completion.calls>0&&events.filter(event=>event.event==='fixed_entry_observed').length===completion.calls;
   const receipt={mode:data.mode,entry:data.entry,clear,reason,trigger,pid:child?.pid??null,spawn_error:spawnError,original_exit:exit,original_close:close,original_exit_wait_observed:exit!==null,stdout_eof:eof.stdout,stderr_eof:eof.stderr,observed_output_bytes:seen,retained_output_bytes:lengths.stdout+lengths.stderr,signals,signal_errors:signalErrors,stream_errors:streamErrors,stages,stdout,stderr,stdout_base64:stdoutBytes.toString('base64'),stderr_base64:stderrBytes.toString('base64'),decode_error:decodeError,total_elapsed_ms:elapsed,work_ms:WORK_MS,cleanup_ms:CLEANUP_MS,output_bytes:OUTPUT_BYTES,descendants:'UNKNOWN',timing_note:'Observed close time; late/missing observation does not establish actual exit time or Source causation.'};
   if(trigger==='cleanup_deadline'){
    // A missing close/EOF cannot become success. Keep the unresolved facts and
    // let the outer selected controller retain its own whole-process Hold.
    child?.stdin.destroy();child?.stdout.destroy();child?.stderr.destroy();child?.unref();
   }
   resolve(receipt);
  }
  try{
   child=spawn(process.execPath,['--no-warnings',script],{cwd:directory,stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin',TMPDIR:directory,TMP:directory,TEMP:directory,LANG:'C',LC_ALL:'C',NODE_DISABLE_COLORS:'1',OPENSSL_CONF:'/dev/null',COMPANY_PLUGIN_DATA:path.join(directory,'managed-data')}});
   child.once('error',error=>{spawnError={name:error.name,code:error.code??null};stop('spawn_error');});
   child.once('exit',(code,signal)=>{exit={code,signal,elapsed_ms:clock()-began};});
   for(const name of ['stdout','stderr']){
    child[name].on('data',chunk=>{
     seen+=chunk.length;const room=Math.max(0,OUTPUT_BYTES-lengths.stdout-lengths.stderr),kept=chunk.subarray(0,room);buffers[name].push(kept);lengths[name]+=kept.length;
     if(seen>OUTPUT_BYTES)stop('output_limit');
    });
    child[name].once('end',()=>{eof[name]=true;});
    child[name].on('error',error=>{streamErrors.push({stream:name,code:error.code??error.name});stop('stream_error');});
   }
   child.once('close',(code,signal)=>{close={code,signal,elapsed_ms:clock()-began};finish('original_close');});
   child.stdin.on('error',error=>{spawnError??={name:error.name,code:error.code??null};stop('stdin_error');});
   workTimer=setTimeout(()=>stop('work_timeout'),Math.max(0,WORK_MS-(clock()-began)));
   child.stdin.end(JSON.stringify(data));
  }catch(error){spawnError={name:error.name,code:error.code??null};if(child)stop('setup_error');else finish('setup_error');}
 });
}

test('fresh cyclic frontier imports retain present, absent and invalid fixed-entry behavior',{timeout:165000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-frontier-import-order-'));fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const directory=path.join(root,'invalid-directory'),target=path.join(root,'target.mjs'),symlink=path.join(root,'invalid-link.mjs'),script=path.join(root,'fresh-import-case.mjs');
 fs.mkdirSync(directory,{mode:0o700});fs.writeFileSync(target,'// Fictional metadata fixture; never imported.\n',{mode:0o600});fs.symlinkSync(target,symlink);fs.writeFileSync(script,childSource,{mode:0o600});
 for(const [entry,entryUrl,mode]of [['plan-first',planUrl,'present'],['seal-first',sealUrl,'present'],['plan-first',planUrl,'absent'],['plan-first',planUrl,'directory'],['plan-first',planUrl,'symlink'],['plan-first',planUrl,'lstat-error']]){
  const result=await importCase({entry,entryUrl,sealUrl,archiveUrl,mode,directory,symlink},root,script);
  t.diagnostic('fresh-import-case '+JSON.stringify(result));
  assert.equal(result.clear,true,'Fresh '+entry+' / '+mode+' failed; see bounded stage/exit/output diagnostic.');
 }
});

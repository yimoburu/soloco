import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash,source,inventory,tapCounts,validateReceipt,requireThat,lanes,laneCoverage,selectedTests} from './evidence.mjs';
export async function execute(root,out,name,command,args,{timeout_ms=name==='tests'?900000:120000,maxOutputBytes=64*1024*1024,onOutput=(stream,bytes)=>process[stream].write(bytes)}={}) {
  const start=new Date().toISOString();
  const env=Object.fromEntries(['PATH','TMPDIR','TMP','TEMP','SystemRoot'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  const streams=Object.fromEntries(['stdout','stderr'].map(stream=>[stream,{file:`${name}.${stream}.log`,length:0}]));
  for(const entry of Object.values(streams))entry.fd=fs.openSync(path.join(out,entry.file),'w');
  const c={name,argv:[command,...args],timeout_ms,start,exit:null,signal:null,error:null,truncated:false};
  let child,timer;
  const stop=message=>{
    c.error??=message;
    if(child?.pid){try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')c.error+=`; termination: ${error.message}`;}}
  };
  const interrupted=signal=>stop(`command interrupted by ${signal}`);
  const signals=new Map(['SIGINT','SIGTERM'].map(signal=>[signal,()=>interrupted(signal)]));
  try {
    await new Promise(resolve=>{
      // A separate process group includes Node's test workers; terminate the group on failure.
      child=spawn(command,args,{cwd:root,env,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
      for(const [signal,handler] of signals)process.once(signal,handler);
      timer=setTimeout(()=>stop(`command exceeded ${timeout_ms}ms deadline`),timeout_ms);
      child.on('error',error=>{c.error??=error.message;});
      for(const stream of ['stdout','stderr'])child[stream].on('data',bytes=>{
        try {
          const entry=streams[stream],allowed=bytes.subarray(0,Math.max(0,maxOutputBytes-entry.length));
          if(allowed.length){fs.writeSync(entry.fd,allowed);entry.length+=allowed.length;onOutput(stream,allowed);}
          if(allowed.length<bytes.length){c.truncated=true;stop(`${stream} exceeded ${maxOutputBytes} byte limit`);}
        } catch(error){stop(`could not retain/stream ${stream}: ${error.message}`);}
      });
      child.on('close',(exit,signal)=>{c.exit=exit;c.signal=signal;resolve();});
    });
  } catch(error){c.error??=error.message;stop(c.error);}
  finally {
    clearTimeout(timer);for(const [signal,handler] of signals)process.removeListener(signal,handler);
    for(const entry of Object.values(streams))fs.closeSync(entry.fd);
  }
  c.end=new Date().toISOString();
  for(const [stream,entry] of Object.entries(streams))c[stream]={file:entry.file,sha256:hash(fs.readFileSync(path.join(out,entry.file)))};
  if(name==='tests') {try {c.tap=tapCounts(fs.readFileSync(path.join(out,c.stdout.file),'utf8'));} catch(error) {c.tapError=error.message;}}
  return c;
}
export async function run(lane,out,root=process.cwd()) {
  requireThat(lanes.includes(lane),'unknown fixed lane');
  root=fs.realpathSync(root);fs.mkdirSync(out,{recursive:true});out=fs.realpathSync(out);
  requireThat(out!==root && !out.startsWith(root+path.sep),'evidence must be outside source');
  const before=source(root),files=inventory(root),testFiles=selectedTests(lane,files);
  const e=process.env;
  const r={schema:2,lane,coverage:laneCoverage(lane),test_inventory:testFiles,mode:e.GITHUB_ACTIONS==='true'&&!before.dirty?'github':'unverified-local',before,inventory:files,node:process.version,platform:process.platform,arch:process.arch,os_release:os.release(),runner_image:{os:e.ImageOS??null,version:e.ImageVersion??null},sandbox:{supported:false,backend:null,blocker:'not probed in build lane'},github:{repository:e.GITHUB_REPOSITORY,run:e.GITHUB_RUN_ID,attempt:e.GITHUB_RUN_ATTEMPT,workflow:e.GITHUB_WORKFLOW_REF?.split('@')[0]?.split('/').slice(2).join('/'),workflowSha:e.GITHUB_WORKFLOW_SHA},checks:[]};
  try {
    if(lane==='build') {
      r.checks.push(await execute(root,out,'build',process.execPath,['tools/build-plugin.mjs','--check']));
      r.checks.push(await execute(root,out,'diff','git',['diff','--check']));
    } else {
      const {sandboxCapability}=await import(path.join(root,'plugins/soloco/runtime/local-sandbox.mjs'));
      r.sandbox=sandboxCapability();
      requireThat(process.platform==='darwin'&&r.sandbox.supported,'actual macOS Seatbelt required');
      r.checks.push(await execute(root,out,'tests',process.execPath,['--no-warnings','--test','--test-concurrency=4','--test-reporter=tap',...testFiles]));
    }
  } catch(e) {r.error=e.message;}
  try {r.after=source(root);}catch(e){r.error=`source after command: ${e.message}`;}
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(r,null,2)+'\n');
  try {requireThat(!r.error,r.error);validateReceipt(r,out,{...r.github,...before,lane,inventory:files});return 0;}catch(e){fs.writeFileSync(path.join(out,'validation-error.log'),e.message+'\n');return 1;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {try {process.exitCode=await run(process.argv[2],process.argv[3]);}catch(e){console.error(e.message);process.exitCode=1;}}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash,source,inventory,tapCounts,validateReceipt,requireThat} from './evidence.mjs';
export function execute(root,out,name,command,args) {
  const start=new Date().toISOString();
  const env=Object.fromEntries(['PATH','TMPDIR','TMP','TEMP','SystemRoot'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  const timeout_ms=name==='tests'?900000:120000;
  const p=spawnSync(command,args,{cwd:root,env,timeout:timeout_ms,maxBuffer:64*1024*1024,killSignal:'SIGKILL'});
  const c={name,argv:[command,...args],timeout_ms,start,end:new Date().toISOString(),exit:p.status,signal:p.signal,error:p.error?.message??null,truncated:!!p.error};
  for(const stream of ['stdout','stderr']) {const bytes=p[stream]??Buffer.alloc(0),file=`${name}.${stream}.log`;fs.writeFileSync(path.join(out,file),bytes);c[stream]={file,sha256:hash(bytes)};}
  if(name==='tests') {try {c.tap=tapCounts(p.stdout.toString('utf8'));} catch(e) {c.tapError=e.message;}}
  return c;
}
export async function run(lane,out,root=process.cwd()) {
  requireThat(['tests-22','tests-25','build'].includes(lane),'unknown fixed lane');
  root=fs.realpathSync(root);fs.mkdirSync(out,{recursive:true});out=fs.realpathSync(out);
  requireThat(out!==root && !out.startsWith(root+path.sep),'evidence must be outside source');
  const before=source(root),files=inventory(root);
  const e=process.env;
  const r={schema:1,lane,mode:e.GITHUB_ACTIONS==='true'&&!before.dirty?'github':'unverified-local',before,inventory:files,node:process.version,platform:process.platform,arch:process.arch,os_release:os.release(),runner_image:{os:e.ImageOS??null,version:e.ImageVersion??null},sandbox:{supported:false,backend:null,blocker:'not probed in build lane'},github:{repository:e.GITHUB_REPOSITORY,run:e.GITHUB_RUN_ID,attempt:e.GITHUB_RUN_ATTEMPT,workflow:e.GITHUB_WORKFLOW_REF?.split('@')[0]?.split('/').slice(2).join('/'),workflowSha:e.GITHUB_WORKFLOW_SHA},checks:[]};
  try {
    if(lane==='build') {
      r.checks.push(execute(root,out,'build',process.execPath,['tools/build-plugin.mjs','--check']));
      r.checks.push(execute(root,out,'diff','git',['diff','--check']));
    } else {
      const {sandboxCapability}=await import(path.join(root,'plugins/soloco/runtime/local-sandbox.mjs'));
      r.sandbox=sandboxCapability();
      requireThat(process.platform==='darwin'&&r.sandbox.supported,'actual macOS Seatbelt required');
      r.checks.push(execute(root,out,'tests',process.execPath,['--no-warnings','--test','--test-concurrency=4','--test-reporter=tap',...files]));
    }
  } catch(e) {r.error=e.message;}
  try {r.after=source(root);}catch(e){r.error=`source after command: ${e.message}`;}
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(r,null,2)+'\n');
  try {requireThat(!r.error,r.error);validateReceipt(r,out,{...r.github,...before,lane,inventory:files});return 0;}catch(e){fs.writeFileSync(path.join(out,'validation-error.log'),e.message+'\n');return 1;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {try {process.exitCode=await run(process.argv[2],process.argv[3]);}catch(e){console.error(e.message);process.exitCode=1;}}

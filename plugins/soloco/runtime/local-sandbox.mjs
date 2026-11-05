import {createHash} from 'node:crypto';
const cryptoHash=v=>createHash('sha256').update(v).digest('hex');
// Supported local execution is deliberately narrow: Node's built-in test runner on macOS.
// Seatbelt is the access boundary; Node permissions provide additional restrictions.
// No unsandboxed fallback. This is not a VM or a hard memory/disk quota mechanism.
// tests_executed means the test harness produced evidence, not that any test is adequate.
// Untrusted test output can lie: independent acceptance must inspect source and evidence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BACKEND='macos-seatbelt-node';
const node=fs.realpathSync(process.execPath);
const quote=value=>JSON.stringify(value);
let runtimePaths, runtimeDependencyFiles, capability, isolationFlag;
function libraries() {
  if(runtimePaths) return runtimePaths;
  const started=Date.now(), seen=new Set(), queue=[node], dirs=new Set(['/System/Library','/usr/lib']);
  while(queue.length) {
    const file=queue.pop();if(seen.has(file))continue;
    if(Date.now()-started>5000)throw new Error('Node runtime dependency discovery timed out');
    if(seen.size>=128)throw new Error('Node runtime dependency allowlist exceeds its bound');
    seen.add(file);
    const real=fs.realpathSync(file);
    if(file!==node){dirs.add(path.dirname(file));dirs.add(path.dirname(real));}
    if(real!==file && !seen.has(real))queue.push(real);
    const result=spawnSync('/usr/bin/otool',['-L',file],{encoding:'utf8',timeout:2000,maxBuffer:100000,env:{PATH:'/usr/bin:/bin'}});
    if(result.status!==0)throw new Error('Cannot establish Node runtime library allowlist');
    for(const line of result.stdout.split('\n').slice(1)) {
      let dependency=line.trim().split(' (')[0];
      if(!dependency)continue;
      if(dependency.startsWith('/usr/lib/') || dependency.startsWith('/System/Library/'))continue;
      if(dependency.startsWith('@loader_path/'))dependency=path.join(path.dirname(file),dependency.slice(13));
      else if(dependency.startsWith('@rpath/') && fs.existsSync(path.join(path.dirname(file),dependency.slice(7))))dependency=path.join(path.dirname(file),dependency.slice(7));
      if(!path.isAbsolute(dependency))throw new Error('Unresolved relative Node library dependency');
      if(!seen.has(dependency))queue.push(dependency);
    }
  }
  if([...dirs].some(dir=>dir==='/' || fs.realpathSync(dir)===fs.realpathSync(os.homedir())))throw new Error('Node library layout cannot be narrowly isolated');
  runtimeDependencyFiles=[...seen].sort();runtimePaths=[...dirs];return runtimePaths;
}
const ancestors=files=>{
  const result=new Set();
  for(const file of files) for(let parent=path.dirname(file);;parent=path.dirname(parent)) {
    result.add(parent);if(parent===path.dirname(parent))break;
  }
  return [...result];
};
// Exported for independent OS-boundary tests, without disabling production Node permissions.
export function sandboxProfile(directory,scratch) {
  const reads=[directory,...libraries()];
  const parents=ancestors([...reads,node,scratch]);
  const links=parents.filter(p=>fs.lstatSync(p).isSymbolicLink());
  // Node's loader needs root traversal; other ancestors expose metadata only.
  links.push('/');
  return `(version 1)
(deny default)
(allow process-exec (literal ${quote(node)}))
(allow sysctl-read)
(allow file-read* ${reads.map(p=>`(subpath ${quote(p)})`).join(' ')} ${links.map(p=>`(literal ${quote(p)})`).join(' ')} (literal ${quote(node)}) (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))
(allow file-read-metadata ${parents.map(p=>`(literal ${quote(p)})`).join(' ')})
(allow file-write* (subpath ${quote(scratch)}) (literal "/dev/null"))
`;
}
function environment(scratch) {
  return {PATH:'/usr/bin:/bin',HOME:scratch,TMPDIR:scratch,TMP:scratch,TEMP:scratch,LANG:'C',LC_ALL:'C',OPENSSL_CONF:'/dev/null',NODE_DISABLE_COLORS:'1'};
}
// Probe only the trusted runtime with fixed code, never a candidate file or cwd.
// Exported for deterministic flag-selection tests; production uses spawnSync.
export function selectTestIsolationFlag(probe=spawnSync) {
  const failures=[];
  for(const flag of ['--test-isolation=none','--experimental-test-isolation=none']) {
    try {
      const result=probe(node,[flag,'--eval',''],{cwd:path.dirname(node),env:environment(os.tmpdir()),encoding:'utf8',timeout:1000,maxBuffer:10000,killSignal:'SIGKILL'});
      if(!result.error && !result.signal && result.status===0)return flag;
      failures.push(`${flag}: ${String(result.error?.message || result.stderr || result.signal || `exit ${result.status}`).trim().slice(0,200)}`);
    } catch(error) {failures.push(`${flag}: ${String(error.message).slice(0,200)}`);}
  }
  throw new Error(`Node test isolation is unavailable (${failures.join('; ')}). No unsandboxed fallback.`);
}
function testArguments(directory,scratch,paths) {
  isolationFlag??=selectTestIsolationFlag();
  return [...permissions(directory,scratch),'--test',isolationFlag,'--test-concurrency=1','--test-reporter=tap','--test-force-exit',...paths];
}
function permissions(directory,scratch) {
  return ['--permission',`--allow-fs-read=${directory}`,`--allow-fs-write=${scratch}`];
}
export function sandboxCapability() {
  if(capability)return {...capability};
  const blocked=reason=>({supported:false,backend:null,blocker:reason});
  if(process.platform!=='darwin')return blocked('Constrained Node tests currently require the verified macOS Seatbelt backend; this platform has no supported executor.');
  if(!fs.existsSync('/usr/bin/sandbox-exec'))return blocked('macOS sandbox-exec is unavailable; tests cannot run safely.');
  let directory;
  try {
    directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-sandbox-check-')));
    const scratch=path.join(directory,'scratch');fs.mkdirSync(scratch,{mode:0o700});
    fs.writeFileSync(path.join(directory,'probe.test.mjs'),"import test from 'node:test';test('sandbox startup',()=>process.stdout.write('SOLOCO_SANDBOX_READY\\n'));\n",{mode:0o600});
    const result=spawnSync('/usr/bin/sandbox-exec',['-p',sandboxProfile(directory,scratch),node,...testArguments(directory,scratch,['./probe.test.mjs'])],{cwd:directory,env:environment(scratch),encoding:'utf8',timeout:5000,maxBuffer:10000});
    capability=result.status===0 && result.stdout.includes('SOLOCO_SANDBOX_READY') && result.stdout.includes('TAP version 13')
      ? {supported:true,backend:BACKEND,blocker:null}
      : blocked(`Constrained Node startup failed: ${(result.error?.message || result.stderr || `exit ${result.status}`).trim().slice(0,500)}. No unsandboxed fallback.`);
  } catch(error) {capability=blocked(`Cannot establish test isolation: ${error.message}`);}
  finally {if(directory)fs.rmSync(directory,{recursive:true,force:true});}
  return {...capability};
}
function checkDirectory(directory) {
  if(!path.isAbsolute(directory??''))throw new Error('Use an absolute candidate directory');
  const real=fs.realpathSync(directory);
  if([path.parse(real).root,fs.realpathSync(os.homedir())].includes(real))throw new Error('Candidate must be an isolated snapshot directory');
  if(!fs.statSync(real).isDirectory())throw new Error('Candidate must be a directory');
  let entries=0;
  const walk=dir=>{
    for(const name of fs.readdirSync(dir)) {
      if(++entries>10000)throw new Error('Candidate contains too many entries');
      const file=path.join(dir,name),s=fs.lstatSync(file);
      if(s.isSymbolicLink() || (s.isFile() && s.nlink!==1) || (!s.isDirectory() && !s.isFile()))throw new Error('Candidate links and special files are not supported');
      if(s.isDirectory())walk(file);
    }
  };walk(real);return real;
}
export async function runLocalTests({directory,test_paths,timeout_ms=30000,max_output_bytes=100000,signal}={}) {
  const root=checkDirectory(directory);
  if(!Array.isArray(test_paths) || !test_paths.length || test_paths.length>64 || new Set(test_paths).size!==test_paths.length)throw new Error('Supply 1 to 64 unique test paths');
  const paths=test_paths.map(file=>{
    if(typeof file!=='string' || file.length>240 || file.split('/').some(p=>!p || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p)) || file.includes('\\'))throw new Error('Tests must be exact portable relative paths');
    const absolute=path.join(root,file);if(!fs.statSync(absolute).isFile())throw new Error('Test path is not a file');return './'+file;
  });
  if(!Number.isInteger(timeout_ms) || timeout_ms<100 || timeout_ms>300000)throw new Error('Test timeout must be 100 to 300000 ms');
  if(!Number.isInteger(max_output_bytes) || max_output_bytes<1024 || max_output_bytes>1000000)throw new Error('Test output limit must be 1024 to 1000000 bytes');
  const available=sandboxCapability();
  if(!available.supported)return {status:'blocked',exit_code:null,signal:null,stdout:'',stderr:'',duration_ms:0,isolation:null,tests_executed:false,blocker:available.blocker};
  if(signal?.aborted)return {status:'aborted',exit_code:null,signal:null,stdout:'',stderr:'',duration_ms:0,isolation:BACKEND,tests_executed:false};
  const scratch=path.join(root,'.scratch');fs.mkdirSync(scratch,{mode:0o700});
  // A detached trusted watchdog outlives this caller and kills the sandbox on IPC loss.
  // Test code cannot fork, signal the watchdog, or access its IPC channel.
  const started=Date.now();
  try {
    return await new Promise(resolve=>{
      let done=false, sandboxPid=null, errorText='';
      const helper=spawn(node,[fileURLToPath(import.meta.url),'--watch-tests',JSON.stringify({root,scratch,paths,timeout_ms,max_output_bytes})],{env:{PATH:'/usr/bin:/bin',OPENSSL_CONF:'/dev/null'},stdio:['ignore','ignore','pipe','ipc'],detached:true});
      const abort=()=>{if(helper.connected)helper.send({type:'abort'},()=>{});};
      const finish=result=>{
        if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        if(helper.connected)helper.disconnect();resolve(result);
      };
      const failed=message=>({status:'error',exit_code:null,signal:null,stdout:'',stderr:errorText,duration_ms:Date.now()-started,isolation:BACKEND,tests_executed:false,error:message});
      const timer=setTimeout(()=>{
        if(sandboxPid)try{process.kill(-sandboxPid,'SIGKILL');}catch{}
        helper.kill('SIGKILL');finish(failed('Test watchdog did not finish within its deadline'));
      },timeout_ms+5000);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      helper.stderr.on('data',chunk=>{if(errorText.length<2000)errorText+=chunk.toString().slice(0,2000-errorText.length);});
      helper.on('message',message=>{
        if(message?.type==='started' && Number.isInteger(message.pid))sandboxPid=message.pid;
        if(message?.type==='result')finish(message.result);
      });
      helper.on('error',error=>finish(failed(error.message)));
      helper.on('exit',()=>{if(!done){if(sandboxPid)try{process.kill(-sandboxPid,'SIGKILL');}catch{}finish(failed('Test watchdog exited without a receipt'));}});
    });
  } finally {fs.rmSync(scratch,{recursive:true,force:true});}
}
async function executeTests({root,scratch,paths,timeout_ms,max_output_bytes,signal,onStart}) {
  const started=Date.now();
  try {
    return await new Promise(resolve=>{
      let reason=null,size=0,out=[],err=[],done=false,spawnError=null;
      const child=spawn('/usr/bin/sandbox-exec',['-p',sandboxProfile(root,scratch),node,...testArguments(root,scratch,paths)],{cwd:root,env:environment(scratch),stdio:['ignore','pipe','pipe'],detached:true});
      const stop=why=>{if(done)return;if(!reason)reason=why;try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
      child.once('spawn',()=>onStart?.(child.pid));
      const timer=setTimeout(()=>stop('timeout'),timeout_ms);
      const abort=()=>stop('aborted');signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
      const capture=(list,chunk)=>{
        const remaining=Math.max(0,max_output_bytes-size);if(remaining)list.push(chunk.subarray(0,remaining));
        size+=chunk.length;if(size>max_output_bytes)stop('output_limit');
      };
      child.stdout.on('data',chunk=>capture(out,chunk));child.stderr.on('data',chunk=>capture(err,chunk));
      const finish=(code,killedBy)=>{
        if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        resolve({status:reason??(spawnError?'error':code===0?'passed':'failed'),exit_code:code,signal:killedBy,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8'),duration_ms:Date.now()-started,isolation:BACKEND,test_execution_attempted:!spawnError,tests_executed:Buffer.concat(out).toString('utf8').includes('TAP version 13'),output_truncated:size>max_output_bytes,...(spawnError?{error:spawnError}:{}),limits:{timeout_ms,max_output_bytes}});
      };
      child.on('error',error=>{spawnError=error.message;finish(null,null);});child.on('close',finish);
    });
  } finally {fs.rmSync(scratch,{recursive:true,force:true});}
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url) && process.argv[2]==='--watch-tests') {
  const controller=new AbortController();
  process.on('disconnect',()=>controller.abort());
  process.on('message',message=>{if(message?.type==='abort')controller.abort();});
  process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
  try {
    const result=await executeTests({...JSON.parse(process.argv[3]),signal:controller.signal,onStart:pid=>{if(process.connected)process.send({type:'started',pid},()=>{});}});
    if(process.connected)process.send({type:'result',result},()=>process.disconnect());
  } catch(error) {
    if(process.connected)process.send({type:'result',result:{status:'error',exit_code:null,signal:null,stdout:'',stderr:'',duration_ms:0,isolation:BACKEND,tests_executed:false,error:error.message}},()=>process.disconnect());
  }
}

// Exact hermetic execution identity for reuse; caller hashes this descriptor and
// must never persist raw environment values. Includes observable absolute paths.
export function validationEnvironment(directory,test_paths) {
  // Re-discover load commands as well as re-hashing bytes: cached directories
  // cannot establish completeness after an in-place dynamic-library update.
  runtimePaths=undefined;runtimeDependencyFiles=undefined;libraries();
  const build=spawnSync('/usr/bin/sw_vers',['-buildVersion'],{encoding:'utf8',timeout:1000,maxBuffer:1000,env:{PATH:'/usr/bin:/bin',LANG:'C'}});
  if(build.status!==0||!build.stdout.trim())throw Error('Cannot fingerprint system build for validation reuse');
  const dependencies=runtimeDependencyFiles.map(file=>({path:file,sha256:cryptoHash(fs.readFileSync(file))}));
  const scratch=path.join(directory,'.scratch');
  return {command:testArguments(directory,scratch,test_paths.map(p=>'./'+p)),
    runtime:{node:process.version,platform:process.platform,arch:process.arch,os_release:os.release(),system_build:build.stdout.trim(),dependencies,
      executable_sha256:cryptoHash(fs.readFileSync(node)),runner_sha256:cryptoHash(fs.readFileSync(fileURLToPath(import.meta.url)))},
    sandbox:{backend:BACKEND,policy_sha256:cryptoHash(sandboxProfile(directory,scratch))},environment:environment(scratch)};
}

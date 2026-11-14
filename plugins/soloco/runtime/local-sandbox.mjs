import {createHash,randomBytes} from 'node:crypto';
const cryptoHash=v=>createHash('sha256').update(v).digest('hex');
// Supported local execution is deliberately narrow: Node's built-in test runner on macOS.
// Seatbelt is the access boundary; Node permissions provide additional restrictions.
// No unsandboxed fallback. This is not a VM or a hard memory/disk quota mechanism.
// tests_executed means the test harness produced evidence, not that any test is adequate.
// Untrusted test output can lie: independent acceptance must inspect source and evidence.
import fs from 'node:fs';
import {readSystemBuildDescriptor} from './system-build.mjs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {assertTestFixtureIdentity,prepareTestFixture,cleanupTestFixture,scratchIdentity,fixtureEnvironmentBindings} from './test-fixtures.mjs';
import {withStore} from './store.mjs';
import {cleanupOriginalWorkerLaunchFailure} from './peers/prospective-local-worker-inventory-producer.mjs';
import {prepareRuntimeWorkerLaunchFrom,spawnRuntimeWorkerLaunch,cleanupLegacyRuntimeLaunchFailure,runtimeExecutionDeadlineFrom} from './runtime-execution.mjs';

export const ordinaryExecutionLifecycleProtocol='owned-scratch-close-v1';
const BACKEND='macos-seatbelt-node';
const node=fs.realpathSync(process.execPath);
// Initialization-time source observation; external loader/source qualification
// remains required. A cached module must never attest newly replaced disk bytes.
const initialRunnerSourceSha256=cryptoHash(fs.readFileSync(fileURLToPath(import.meta.url)));
function runnerSourceSha256(){
  if(cryptoHash(fs.readFileSync(fileURLToPath(import.meta.url)))!==initialRunnerSourceSha256)throw Error('Test runner source changed after initialization; reload the qualified runtime');
  return initialRunnerSourceSha256;
}
const quote=value=>JSON.stringify(value);
let runtimePaths, runtimeDependencyFiles, capability, isolationFlag;
// Inspect only the trusted runtime and its discovered libraries. Cold Xcode
// tool startup can exceed the former two-second probe on hosted macOS runners.
// Retry a timed-out inspection once, never a real tool/library error, and retain
// the underlying diagnostic instead of reporting an unexplained capability Hold.
export function inspectRuntimeLibrary(file,probe=spawnSync,{deadline=Date.now()+15000,now=Date.now}={}) {
  for(let attempt=0;attempt<2;attempt++) {
    const remaining=deadline-now();
    if(remaining<=0)throw Error('Node runtime dependency discovery timed out');
    const result=probe('/usr/bin/otool',['-L',file],{encoding:'utf8',timeout:Math.min(5000,remaining),maxBuffer:100000,killSignal:'SIGKILL',env:{PATH:'/usr/bin:/bin'}});
    if(now()>=deadline)throw Error('Node runtime dependency discovery timed out');
    if(result.status===0&&!result.error&&!result.signal&&typeof result.stdout==='string')return result.stdout;
    if(result.error?.code==='ETIMEDOUT'&&attempt===0)continue;
    const reason=String(result.error?.message||result.stderr||result.signal||`exit ${result.status}`).trim().slice(0,500);
    throw Error(`Cannot establish Node runtime library allowlist: otool -L ${file}: ${reason}`);
  }
}
function libraries() {
  if(runtimePaths) return runtimePaths;
  const deadline=Date.now()+15000, seen=new Set(), queue=[node], dirs=new Set(['/System/Library','/usr/lib']);
  while(queue.length) {
    const file=queue.pop();if(seen.has(file))continue;
    if(Date.now()>=deadline)throw new Error('Node runtime dependency discovery timed out');
    if(seen.size>=128)throw new Error('Node runtime dependency allowlist exceeds its bound');
    seen.add(file);
    const real=fs.realpathSync(file);
    if(file!==node){dirs.add(path.dirname(file));dirs.add(path.dirname(real));}
    if(real!==file && !seen.has(real))queue.push(real);
    const output=inspectRuntimeLibrary(file,spawnSync,{deadline});
    for(const line of output.split('\n').slice(1)) {
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
function environment(scratch,fixtureSetup) {
  // Build a closed environment; inherited fixture variables are never forwarded.
  return {PATH:'/usr/bin:/bin',HOME:scratch,TMPDIR:scratch,TMP:scratch,TEMP:scratch,LANG:'C',LC_ALL:'C',OPENSSL_CONF:'/dev/null',NODE_DISABLE_COLORS:'1',
    ...(fixtureSetup?{SOLOCO_TEST_FIXTURE_MANIFEST:fixtureSetup.manifest_path,SOLOCO_TEST_FIXTURE_MANIFEST_SHA256:fixtureSetup.manifest_sha256}:{})};
}
// Probe only the trusted runtime with fixed code, never a candidate file or cwd.
// Cold Node startup can exceed one second on a loaded host. Each fixed flag
// probe has a five-second startup bound; candidate execution keeps its own limit.
// Exported for deterministic flag-selection tests; production uses spawnSync.
export function selectTestIsolationFlag(probe=spawnSync) {
  const failures=[];
  for(const flag of ['--test-isolation=none','--experimental-test-isolation=none']) {
    try {
      const result=probe(node,[flag,'--eval',''],{cwd:path.dirname(node),env:environment(os.tmpdir()),encoding:'utf8',timeout:5000,maxBuffer:10000,killSignal:'SIGKILL'});
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
  let directory,owned,launchAttempted=false,synchronousReturn=false,probeResult;
  try {
    directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-sandbox-check-')));
    owned=scratchIdentity(directory);
    const scratch=path.join(directory,'scratch');fs.mkdirSync(scratch,{mode:0o700});
    fs.writeFileSync(path.join(directory,'probe.test.mjs'),"import test from 'node:test';test('sandbox startup',()=>process.stdout.write('SOLOCO_SANDBOX_READY\\n'));\n",{mode:0o600});
    // Evaluate all prelaunch work before marking the fixed synchronous invocation.
    const args=['-p',sandboxProfile(directory,scratch),node,...testArguments(directory,scratch,['./probe.test.mjs'])];
    launchAttempted=true;
    probeResult=spawnSync('/usr/bin/sandbox-exec',args,{cwd:directory,env:environment(scratch),encoding:'utf8',timeout:5000,maxBuffer:10000,killSignal:'SIGKILL'});
    synchronousReturn=true;
    capability=!probeResult.error && !probeResult.signal && probeResult.status===0 && probeResult.stdout?.includes('SOLOCO_SANDBOX_READY') && probeResult.stdout.includes('TAP version 13')
      ? {supported:true,backend:BACKEND,blocker:null}
      : blocked(`Constrained Node startup failed: ${String(probeResult.error?.message || probeResult.stderr || `exit ${probeResult.status}`).trim().slice(0,500)}. No unsandboxed fallback.`);
  } catch(error) {capability=blocked(`Cannot establish test isolation: ${error.message}`);}
  finally {
    if(directory){
      // This exception is ONLY the existing trusted fixed-code, no-fork probe:
      // spawnSync waits for its direct child before returning. Do not export this
      // rule to asynchronous candidate/controller/watchdog results. An invocation
      // throw or uninterpretable outcome retains the remaining probe directory.
      const waited=synchronousReturn && (Number.isInteger(probeResult.status) ||
        typeof probeResult.signal==='string' || (!probeResult.pid && ['ENOENT','EACCES'].includes(probeResult.error?.code)));
      if(!launchAttempted || waited){
        const cleanup=removeOwnedScratch(directory,owned);
        if(cleanup.status!=='confirmed')capability=blocked(`Fixed probe cleanup unconfirmed: ${cleanup.error || cleanup.reason}; retained path ${directory}`);
      }else capability=blocked(`Fixed probe closure unconfirmed; remaining probe directory retained: ${directory}`);
    }
  }
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
const sameScratch=(a,b)=>!!a&&!!b&&a.path===b.path&&a.dev===b.dev&&a.ino===b.ino;
const positivePid=value=>Number.isSafeInteger(value)&&value>0;
const hex64=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function closedObject(value,keys) {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const own=Reflect.ownKeys(value);
  return own.length===keys.length&&keys.every(key=>{
    const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')&&d.enumerable;
  });
}
function bindingMatches(actual,expected) {
  return closedObject(actual,['protocol','request_id','runner_sha256','request_sha256','controller_pid','watchdog_pid'])&&
    actual.protocol===ordinaryExecutionLifecycleProtocol&&actual.protocol===expected.protocol&&
    hex64(actual.request_id)&&actual.request_id===expected.request_id&&
    hex64(actual.runner_sha256)&&actual.runner_sha256===expected.runner_sha256&&
    hex64(actual.request_sha256)&&actual.request_sha256===expected.request_sha256&&
    positivePid(actual.controller_pid)&&actual.controller_pid===expected.controller_pid&&
    positivePid(actual.watchdog_pid)&&actual.watchdog_pid===expected.watchdog_pid;
}
const emptyChild=()=>({launch_attempted:false,spawn_observed:false,close_observed:false,pid:null});
const unknownCleanup=reason=>({status:'not_attempted',root_absent:null,reason});
function unknownExecution(scratch,binding,reason) {
  // No parent inference from a PID, kill request, scratch absence or terminal job.
  return {protocol:ordinaryExecutionLifecycleProtocol,scratch,watchdog:binding??null,
    child:{launch_attempted:null,spawn_observed:null,close_observed:false,pid:null},
    termination_confirmed:false,closure_basis:'unconfirmed',cleanup:unknownCleanup(reason)};
}
function neverStartedExecution() {
  return {protocol:ordinaryExecutionLifecycleProtocol,scratch:null,watchdog:null,child:emptyChild(),
    termination_confirmed:true,closure_basis:'never_started',cleanup:{status:'not_needed',root_absent:true}};
}
// Private, called only by the trusted watchdog after its own closure observation,
// or the separate fixed synchronous probe. Supplied receipt data cannot call it.
function removeOwnedScratch(scratch,owned) {
  try {
    if(!sameScratch(scratchIdentity(scratch),owned))throw Error('Owned scratch identity changed; cleanup refused');
  }catch(error){return {...unknownCleanup('Owned scratch identity cannot be established; remaining paths retained'),error:String(error.message)};}
  try {
    fs.rmSync(scratch,{recursive:true,force:false});
    try{fs.lstatSync(scratch);throw Error('Owned scratch path remains after cleanup');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    return {status:'confirmed',root_absent:true};
  }catch(error){
    let root_absent=null;try{fs.lstatSync(scratch);root_absent=false;}catch(e){if(e.code==='ENOENT')root_absent=true;}
    return {status:'failed',root_absent,error:String(error.message)};
  }
}
// Pure supplied-evidence consistency check. Not an authenticator when called on
// arbitrary data, not OS closure observation, and never a cleanup authority.
// Production separately owns the fixed spawned helper and its private IPC pipe.
export function ordinaryExecutionReceiptMatches(message,expected) {
  try {
    if(!closedObject(message,['type','binding','result'])||message.type!=='result'||!bindingMatches(message.binding,expected.binding))return false;
    const result=message.result,value=result?.local_execution,child=value?.child,cleanup=value?.cleanup;
    if(!value||value.protocol!==ordinaryExecutionLifecycleProtocol||!sameScratch(value.scratch,expected.scratch)||!bindingMatches(value.watchdog,expected.binding))return false;
    if(!closedObject(child,['launch_attempted','spawn_observed','close_observed','pid'])||
      !['launch_attempted','spawn_observed','close_observed'].every(key=>typeof child[key]==='boolean')||
      !(child.pid===null||positivePid(child.pid))||child.spawn_observed&&(!child.launch_attempted||!positivePid(child.pid))||
      child.close_observed&&!child.launch_attempted||!child.spawn_observed&&child.pid!==null)return false;
    if(expected.child_pid!==null&&expected.child_pid!==undefined&&(!child.spawn_observed||child.pid!==expected.child_pid))return false;
    const closed=child.close_observed,never=!child.launch_attempted;
    if(typeof value.termination_confirmed!=='boolean'||value.termination_confirmed!==(closed||never)||
      value.closure_basis!==(closed?'child_close':never?'never_started':'unconfirmed'))return false;
    if(!cleanup||!['confirmed','failed','not_attempted'].includes(cleanup.status))return false;
    if(cleanup.status==='confirmed'&&(!value.termination_confirmed||cleanup.root_absent!==true))return false;
    if(cleanup.status==='failed'&&(!value.termination_confirmed||![true,false,null].includes(cleanup.root_absent)))return false;
    if(cleanup.status==='not_attempted'&&(cleanup.root_absent!==null||typeof cleanup.reason!=='string'||!cleanup.reason.length))return false;
    if(!['passed','failed','error','timeout','output_limit','aborted'].includes(result.status)||
      !(result.exit_code===null||Number.isInteger(result.exit_code))||!(result.signal===null||typeof result.signal==='string')||
      typeof result.stdout!=='string'||typeof result.stderr!=='string'||
      typeof result.tests_executed!=='boolean'||typeof result.test_execution_attempted!=='boolean'||
      typeof result.output_truncated!=='boolean'||!Number.isFinite(result.duration_ms)||result.duration_ms<0||result.isolation!==BACKEND)return false;
    const bytes=result.output_bytes;
    // Counters originate at raw capture in the trusted helper. Decoding a cut
    // UTF-8 sequence may add replacement bytes, so decoded bytes are not raw bytes.
    if(!closedObject(bytes,['captured','observed'])||!Number.isSafeInteger(bytes.captured)||!Number.isSafeInteger(bytes.observed)||
      bytes.captured<0||bytes.observed<bytes.captured||bytes.captured!==Math.min(bytes.observed,expected.max_output_bytes)||
      result.stdout.length+result.stderr.length>bytes.captured||result.output_truncated!==(bytes.observed>expected.max_output_bytes))return false;
    if(never&&(bytes.observed!==0||result.test_execution_attempted||result.tests_executed||result.exit_code!==null||result.signal!==null))return false;
    if(result.test_execution_attempted&&!child.launch_attempted||result.tests_executed&&(!child.spawn_observed||!child.close_observed||!result.test_execution_attempted))return false;
    if(result.status==='failed'&&(result.exit_code===0||!child.spawn_observed||!child.close_observed||!result.test_execution_attempted))return false;
    if(result.limits?.timeout_ms!==expected.timeout_ms||result.limits?.max_output_bytes!==expected.max_output_bytes)return false;
    if((!value.termination_confirmed||cleanup.status!=='confirmed')&&result.status!=='error')return false;
    if(result.status==='passed'&&(result.exit_code!==0||result.signal!==null||result.error!==undefined||!result.tests_executed||!result.test_execution_attempted||!child.spawn_observed||!child.close_observed||result.output_truncated))return false;
    return true;
  }catch{return false;}
}
// The descriptor identifies an existing assignment; it is never a launch token
// or a caller assertion of capacity. Each process acquires its own opaque token
// from the actual owning Store transaction at its concrete spawn boundary.
// Only these Source-built loans identify a concrete company test recipe.
// The exported inspector cannot mint a loan or turn caller DATA into a recipe.
const runtimeDevelopmentDescriptors=new WeakMap();
function runtimeDevelopmentDescriptor(originalExecution,{command,args,options,recipe,request_sha256,directory,test_paths,timeout_ms,max_output_bytes,test_fixture,signal,onCutoff}){
  if(originalExecution===undefined)return undefined;
  if(!closedObject(originalExecution,['root','job_id'])||typeof originalExecution.root!=='string'||!path.isAbsolute(originalExecution.root)||typeof originalExecution.job_id!=='string'||!originalExecution.job_id||originalExecution.job_id.length>200)throw Error('Company development assignment identity required');
  const slot=recipe==='watchdog'?'watchdog':recipe==='sandbox_test_child'?'test_child':null;
  if(slot===null)throw Error('Unsupported company development recipe');
  const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
  const data=freeze(JSON.parse(JSON.stringify({command,args,options,recipe,request_sha256,root:fs.realpathSync(originalExecution.root),job_id:originalExecution.job_id,slot,parent_pid:process.pid,directory,test_paths,timeout_ms,max_output_bytes,test_fixture:test_fixture??null})));
  const facts=Object.freeze({...data,signal:signal??null,onCutoff:onCutoff??null});
  const loan=Object.freeze({});runtimeDevelopmentDescriptors.set(loan,facts);return loan;
}
export function inspectRuntimeDevelopmentDescriptorFrom(loan,{root,job_id,slot}={}){
  const facts=runtimeDevelopmentDescriptors.get(loan);
  if(!facts||facts.root!==root||facts.job_id!==job_id||(slot!==undefined&&facts.slot!==slot)||facts.parent_pid!==process.pid)throw Object.assign(Error('Private Source development descriptor required'),{code:'RUNTIME_EXECUTION_DESCRIPTOR_REQUIRED'});
  return facts;
}
function runtimeTimeout(originalExecution,child,maximum){
  if(originalExecution===undefined)return maximum;
  const deadline=runtimeExecutionDeadlineFrom(child),now=Date.now();
  if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(deadline)||deadline<0)throw Error('Actual runtime child cutoff unavailable');
  return Math.max(0,Math.min(maximum,deadline-now));
}
function spawnDevelopmentExecution(originalExecution,command,args,options,descriptor){
  if(originalExecution===undefined)return spawn(command,args,options);
  if(!closedObject(originalExecution,['root','job_id'])||typeof originalExecution.root!=='string'||!path.isAbsolute(originalExecution.root)||typeof originalExecution.job_id!=='string'||!originalExecution.job_id||originalExecution.job_id.length>200)throw Error('Company development assignment identity required');
  try{return withStore(originalExecution.root,store=>{let launch;store.transaction('development.execution_launch_requested',state=>{launch=prepareRuntimeWorkerLaunchFrom(store,state,{job_id:originalExecution.job_id,kind:'development'},descriptor);return state;});return spawnRuntimeWorkerLaunch(launch);});}
  catch(error){cleanupLegacyRuntimeLaunchFailure(error);cleanupOriginalWorkerLaunchFailure(error);throw error;}
}

export async function runLocalTests({directory,test_paths,timeout_ms=30000,max_output_bytes=100000,signal,testFixture,originalExecution}={}) {
  const root=checkDirectory(directory);
  if(!Array.isArray(test_paths) || !test_paths.length || test_paths.length>64 || new Set(test_paths).size!==test_paths.length)throw new Error('Supply 1 to 64 unique test paths');
  const paths=test_paths.map(file=>{
    if(typeof file!=='string' || file.length>240 || file.split('/').some(p=>!p || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p)) || file.includes('\\'))throw new Error('Tests must be exact portable relative paths');
    const absolute=path.join(root,file);if(!fs.statSync(absolute).isFile())throw new Error('Test path is not a file');return './'+file;
  });
  if(!Number.isInteger(timeout_ms) || timeout_ms<100 || timeout_ms>300000)throw new Error('Test timeout must be 100 to 300000 ms');
  if(!Number.isInteger(max_output_bytes) || max_output_bytes<1024 || max_output_bytes>1000000)throw new Error('Test output limit must be 1024 to 1000000 bytes');
  const fixture=testFixture===undefined?undefined:assertTestFixtureIdentity(testFixture);
  const noSetup=fixture?{test_fixture:{identity:fixture,setup:null,termination_confirmed:true,cleanup:{status:'not_needed',reason:'Fixture setup and child execution have not started'}}}:{local_execution:neverStartedExecution()};
  const available=sandboxCapability();
  if(!available.supported)return {status:'blocked',exit_code:null,signal:null,stdout:'',stderr:'',duration_ms:0,isolation:null,tests_executed:false,blocker:available.blocker,...noSetup};
  if(signal?.aborted)return {status:'aborted',exit_code:null,signal:null,stdout:'',stderr:'',duration_ms:0,isolation:BACKEND,tests_executed:false,...noSetup};
  const scratch=path.join(root,'.scratch');fs.mkdirSync(scratch,{mode:0o700});
  const started=Date.now();let owned=null,binding=null;
  const failed=(message,stderr='',setup=null)=>({status:'error',exit_code:null,signal:null,stdout:'',stderr,duration_ms:Date.now()-started,isolation:BACKEND,tests_executed:false,error:message,
    ...(fixture?{test_fixture:{identity:fixture,setup,termination_confirmed:false,cleanup:unknownCleanup('Watchdog/child closure is unconfirmed; remaining scratch is retained')}}:
      {local_execution:unknownExecution(owned,binding,'No matching trusted closure receipt; remaining scratch is retained, but a live watchdog may later clean after close')})});
  try {
    owned=scratchIdentity(scratch);
    const payload={root,scratch,paths,timeout_ms,max_output_bytes,scratch_identity:owned,...(fixture?{testFixture:fixture}:{}),...(originalExecution===undefined?{}:{original_execution:originalExecution})};
    const request={protocol:ordinaryExecutionLifecycleProtocol,request_id:randomBytes(32).toString('hex'),
      runner_sha256:runnerSourceSha256(),request_sha256:cryptoHash(JSON.stringify(payload)),controller_pid:process.pid};
    return await new Promise(resolve=>{
      let done=false,settled=false,helperClosed=false,pendingResult=null,sandboxPid=null,errorText='',fixtureSetup=null,ready=false;
      const helperArgs=[fileURLToPath(import.meta.url),'--watch-tests',JSON.stringify({request,payload})];
      const helperOptions={env:{PATH:'/usr/bin:/bin',OPENSSL_CONF:'/dev/null'},stdio:['ignore','ignore','pipe','ipc'],detached:true};
      const descriptor=runtimeDevelopmentDescriptor(originalExecution,{command:node,args:helperArgs,options:helperOptions,recipe:'watchdog',request_sha256:request.request_sha256,directory:root,test_paths:paths.map(file=>file.slice(2)),timeout_ms,max_output_bytes,test_fixture:fixture,signal});
      const helper=spawnDevelopmentExecution(originalExecution,node,helperArgs,helperOptions,descriptor);
      binding={...request,watchdog_pid:helper.pid??null};
      const abort=()=>{try{if(helper.connected)helper.send({type:'abort',binding},()=>{});}catch{}};
      const settle=result=>{
        if(settled)return;settled=true;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        try{if(helper.connected)helper.disconnect();}catch{}resolve(result);
      };
      const finish=result=>{
        if(done)return;done=true;pendingResult=result;
        // A result message does not close its watchdog. Keep the finite timer
        // until the actual child close; the guarded close observer runs first.
        // The watchdog flushes its result and owns IPC disconnect. Closing the
        // parent channel here can preempt EOF and lose Node's IPC close count.
        if(helperClosed)settle(result);
      };
      const reject=message=>{abort();finish(failed(message,errorText,fixtureSetup));};
      const timer=setTimeout(()=>{
        abort();try{helper.kill('SIGKILL');}catch{}
        // A missing helper close cannot erase an earlier authenticated test
        // result. The guarded helper slot retains its separate UNKNOWN state.
        const result=pendingResult===null?failed('Test watchdog did not close within its deadline',errorText,fixtureSetup):{...pendingResult,status:'error',error:(pendingResult.error?String(pendingResult.error).slice(0,1000)+'; ':'')+'Test watchdog closure is unconfirmed at its deadline; prior test evidence retained'};
        settle(result);
      },runtimeTimeout(originalExecution,helper,timeout_ms+5000));
      helper.once('close',(code,closedSignal)=>{
        helperClosed=true;
        if(pendingResult!==null){
          // Preserve the test evidence while retaining a later negative from
          // the actual watchdog; a prior message cannot override that exit.
          const result=pendingResult.status==='passed'&&(code!==0||closedSignal!==null)?{...pendingResult,status:'error',error:'Test watchdog closed unsuccessfully after returning its result'}:pendingResult;
          settle(result);
        }else if(!done)finish(failed('Test watchdog closed without a matching receipt',errorText,fixtureSetup));
      });
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      helper.stderr.on('data',chunk=>{if(errorText.length<2000)errorText+=chunk.toString().slice(0,2000-errorText.length);});
      helper.on('message',message=>{
        if(done)return;
        if(!bindingMatches(message?.binding,binding))return reject('Test watchdog response binding is malformed or mismatched');
        if(message.type==='ready'&&!ready&&closedObject(message,['type','binding'])){ready=true;return;}
        if(!ready)return reject('Test watchdog response preceded its trusted handshake');
        if(message.type==='prepared'&&fixture&&fixtureSetup===null&&closedObject(message,['type','binding','setup'])&&message.setup&&typeof message.setup==='object'){fixtureSetup=message.setup;return;}
        if(message.type==='started'&&sandboxPid===null&&positivePid(message.pid)&&closedObject(message,['type','binding','pid'])){sandboxPid=message.pid;return;}
        if(message.type==='result'){
          if(fixture){
            const value=message.result;
            if(!closedObject(message,['type','binding','result'])||!value||!value.test_fixture||JSON.stringify(value.test_fixture.identity)!==JSON.stringify(fixture)||
              typeof value.test_fixture.termination_confirmed!=='boolean'||!value.test_fixture.cleanup||
              value.status==='passed'&&(!value.test_fixture.termination_confirmed||value.test_fixture.cleanup.status!=='confirmed'))return reject('Fixture watchdog returned an invalid closure receipt');
          }else if(!ordinaryExecutionReceiptMatches(message,{binding,scratch:owned,child_pid:sandboxPid,timeout_ms,max_output_bytes}))return reject('Ordinary watchdog returned an invalid closure receipt');
          finish(message.result);return;
        }
        reject('Test watchdog returned an unexpected or repeated message');
      });
      helper.on('error',error=>reject(error.message));
      helper.on('exit',()=>{if(!done){finish(failed('Test watchdog exited without a matching receipt',errorText,fixtureSetup));}});
    });
  }catch(error){return failed(String(error.message));}
  // Deliberately no parent cleanup: even an error/timeout/exit is not child close.
}
async function executeTests({root,scratch,paths,timeout_ms,max_output_bytes,signal,onStart,onPrepared,testFixture,scratch_identity,original_execution},binding) {
  const started=Date.now(),childEvidence=emptyChild();
  let fixtureSetup=null,result;
  const baseError=error=>({status:'error',exit_code:null,signal:null,stdout:'',stderr:'',duration_ms:Date.now()-started,isolation:BACKEND,tests_executed:false,test_execution_attempted:childEvidence.launch_attempted,output_truncated:false,output_bytes:{captured:0,observed:0},error:String(error.message),limits:{timeout_ms,max_output_bytes}});
  try {
    if(scratch!==path.join(root,'.scratch')||!sameScratch(scratchIdentity(scratch),scratch_identity))throw Error('Scratch ownership binding changed before launch');
    if(testFixture!==undefined){
      fixtureSetup=prepareTestFixture(scratch,testFixture);
      fixtureSetup.child_environment_sha256=cryptoHash(JSON.stringify(environment(scratch,fixtureSetup)));
      onPrepared?.(fixtureSetup);
    }
    if(signal?.aborted){result={...baseError(Error('Execution aborted before child launch')),status:'aborted'};delete result.error;}
    else {
      // All profile/flag/environment construction is before the launch boundary.
      const args=['-p',sandboxProfile(root,scratch),node,...testArguments(root,scratch,paths)],env=environment(scratch,fixtureSetup);
      result=await new Promise(resolve=>{
        let reason=null,size=0,out=[],err=[],done=false,exited=false,spawnError=null,child=null;
        const stop=(why,ownedChild=child)=>{if(done)return;if(!reason)reason=why;if(exited||!ownedChild)return;
          try{if(positivePid(ownedChild.pid))process.kill(-ownedChild.pid,'SIGKILL');else ownedChild.kill('SIGKILL');}catch{try{ownedChild.kill('SIGKILL');}catch{}}};
        childEvidence.launch_attempted=true;
        const childOptions={cwd:root,env,stdio:['ignore','pipe','pipe'],detached:true};
        const descriptor=runtimeDevelopmentDescriptor(original_execution,{command:'/usr/bin/sandbox-exec',args,options:childOptions,recipe:'sandbox_test_child',request_sha256:binding.request_sha256,directory:root,test_paths:paths.map(file=>file.slice(2)),timeout_ms,max_output_bytes,test_fixture:testFixture,signal,onCutoff:ownedChild=>stop('timeout',ownedChild)});
        child=spawnDevelopmentExecution(original_execution,'/usr/bin/sandbox-exec',args,childOptions,descriptor);
        child.once('exit',()=>{exited=true;});
        child.once('spawn',()=>{childEvidence.spawn_observed=true;childEvidence.pid=child.pid;onStart?.(child.pid);});
        const timer=setTimeout(()=>stop('timeout'),runtimeTimeout(original_execution,child,timeout_ms));
        const abort=()=>stop('aborted');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
        const capture=(list,chunk)=>{
          const remaining=Math.max(0,max_output_bytes-size);if(remaining)list.push(chunk.subarray(0,remaining));
          size+=chunk.length;if(size>max_output_bytes)stop('output_limit');
        };
        child.stdout.on('data',chunk=>capture(out,chunk));child.stderr.on('data',chunk=>capture(err,chunk));
        child.on('error',error=>{spawnError=String(error.message);stop('error');});
        // Neither an error (including after spawn) nor any kill request resolves
        // this Promise. Actual direct-child close is the only completion event.
        child.once('close',(code,killedBy)=>{
          if(done)return;done=true;childEvidence.close_observed=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
          const stdout=Buffer.concat(out).toString('utf8');
          resolve({status:reason??(spawnError?'error':code===0?'passed':'failed'),exit_code:code,signal:killedBy,stdout,stderr:Buffer.concat(err).toString('utf8'),duration_ms:Date.now()-started,isolation:BACKEND,test_execution_attempted:childEvidence.spawn_observed,tests_executed:stdout.includes('TAP version 13'),output_truncated:size>max_output_bytes,output_bytes:{captured:out.reduce((n,b)=>n+b.length,0)+err.reduce((n,b)=>n+b.length,0),observed:size},...(spawnError?{error:spawnError}:{}),limits:{timeout_ms,max_output_bytes}});
        });
      });
    }
  }catch(error){result=baseError(error);}
  // Only this trusted execution frame supplies closure; no request field can.
  const physicalClose=childEvidence.close_observed,neverStarted=!childEvidence.launch_attempted;
  let confirmed=physicalClose||neverStarted,cleanup=unknownCleanup('Child launch/close is unconfirmed; remaining scratch retained');
  if(confirmed){
    if(testFixture!==undefined){
      // First distinguish ownership failure from an attempted deletion failure.
      try{
        if(!sameScratch(scratchIdentity(scratch),scratch_identity))throw Error('Fixture scratch ownership changed');
        cleanup=cleanupTestFixture(scratch,scratch_identity);
      }catch(error){cleanup={...unknownCleanup('Fixture scratch ownership changed; cleanup refused'),error:String(error.message)};}
    }else cleanup=removeOwnedScratch(scratch,scratch_identity);
  }
  if(testFixture!==undefined)result.test_fixture={identity:testFixture,setup:fixtureSetup,termination_confirmed:confirmed,cleanup};
  else result.local_execution={protocol:ordinaryExecutionLifecycleProtocol,scratch:scratch_identity,watchdog:binding,child:childEvidence,
    termination_confirmed:confirmed,closure_basis:confirmed?(physicalClose?'child_close':'never_started'):'unconfirmed',cleanup};
  if(!confirmed||cleanup.status!=='confirmed'){
    result.original_status=result.status;result.status='error';result.error='Child closure or owned scratch cleanup is unconfirmed; no successful validation is established';
  }
  return result;
}
function watchdogRequest(value) {
  if(!closedObject(value,['request','payload']))throw Error('Malformed watchdog request');
  const {request,payload}=value;
  if(!closedObject(request,['protocol','request_id','runner_sha256','request_sha256','controller_pid'])||
    request.protocol!==ordinaryExecutionLifecycleProtocol||!hex64(request.request_id)||!positivePid(request.controller_pid)||request.controller_pid!==process.ppid||
    request.runner_sha256!==runnerSourceSha256()||request.request_sha256!==cryptoHash(JSON.stringify(payload)))throw Error('Watchdog request source or freshness binding mismatch');
  const keys=['root','scratch','paths','timeout_ms','max_output_bytes','scratch_identity',...(Object.hasOwn(payload,'testFixture')?['testFixture']:[]),...(Object.hasOwn(payload,'original_execution')?['original_execution']:[])];
  if(!closedObject(payload,keys)||typeof payload.root!=='string'||!path.isAbsolute(payload.root)||fs.realpathSync(payload.root)!==payload.root||
    payload.scratch!==path.join(payload.root,'.scratch')||!closedObject(payload.scratch_identity,['path','dev','ino'])||
    payload.scratch_identity.path!==payload.scratch||!/^\d+$/.test(payload.scratch_identity.dev)||!/^\d+$/.test(payload.scratch_identity.ino)||
    !Array.isArray(payload.paths)||payload.paths.length<1||payload.paths.length>64||new Set(payload.paths).size!==payload.paths.length||
    !payload.paths.every(file=>typeof file==='string'&&file.startsWith('./')&&file.length<=242&&file.slice(2).split('/').every(p=>/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p)))||
    !Number.isInteger(payload.timeout_ms)||payload.timeout_ms<100||payload.timeout_ms>300000||
    !Number.isInteger(payload.max_output_bytes)||payload.max_output_bytes<1024||payload.max_output_bytes>1000000)throw Error('Malformed bounded watchdog payload');
  if(payload.testFixture!==undefined)assertTestFixtureIdentity(payload.testFixture);
  if(payload.original_execution!==undefined&&(!closedObject(payload.original_execution,['root','job_id'])||typeof payload.original_execution.root!=='string'||!path.isAbsolute(payload.original_execution.root)||typeof payload.original_execution.job_id!=='string'||!payload.original_execution.job_id||payload.original_execution.job_id.length>200))throw Error('Original development assignment identity required');
  return {payload,binding:{...request,watchdog_pid:process.pid}};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url) && process.argv[2]==='--watch-tests') {
  const controller=new AbortController();let activeBinding=null;
  process.on('disconnect',()=>controller.abort());
  process.on('message',message=>{if(message?.type==='abort'&&activeBinding&&bindingMatches(message.binding,activeBinding))controller.abort();else controller.abort();});
  process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
  const send=message=>{
    if(!process.connected){controller.abort();return;}
    try{process.send({...message,binding:activeBinding},error=>{if(error)controller.abort();});}catch{controller.abort();}
  };
  try {
    const {payload,binding}=watchdogRequest(JSON.parse(process.argv[3]));activeBinding=binding;
    if(!process.connected)controller.abort();
    send({type:'ready'});
    const result=await executeTests({...payload,signal:controller.signal,onPrepared:setup=>send({type:'prepared',setup}),onStart:pid=>send({type:'started',pid})},binding);
    if(process.connected)process.send({type:'result',binding,result},()=>{if(process.connected)process.disconnect();});
  }catch(error){
    // Invalid/unbound requests never launch, clean, or invent a closure receipt.
    if(process.connected)process.disconnect();
    process.exitCode=1;
  }
}

// Exact hermetic execution identity for reuse; caller hashes this descriptor and
// must never persist raw environment values. Includes observable absolute paths.
export function validationEnvironment(directory,test_paths,{testFixture}={}) {
  // Re-discover load commands as well as re-hashing bytes: cached directories
  // cannot establish completeness after an in-place dynamic-library update.
  runtimePaths=undefined;runtimeDependencyFiles=undefined;libraries();
  const build=readSystemBuildDescriptor();
  // The trusted fixture module is loaded even in no-fixture mode. Bind this new
  // JavaScript dependency too; runner-only hashing would miss its replacement.
  const dependencies=[...runtimeDependencyFiles,fileURLToPath(new URL('./test-fixtures.mjs',import.meta.url)),fileURLToPath(new URL('./system-build.mjs',import.meta.url))]
    .sort().map(file=>({path:file,sha256:cryptoHash(fs.readFileSync(file))}));
  const scratch=path.join(directory,'.scratch');
  return {command:testArguments(directory,scratch,test_paths.map(p=>'./'+p)),
    runtime:{node:process.version,platform:process.platform,arch:process.arch,os_release:os.release(),system_build:build.system_build,system_descriptor:{protocol:build.protocol,sha256:build.descriptor_sha256},dependencies,
      executable_sha256:cryptoHash(fs.readFileSync(node)),runner_sha256:runnerSourceSha256()},
    sandbox:{backend:BACKEND,policy_sha256:cryptoHash(sandboxProfile(directory,scratch))},environment:environment(scratch),
    ...(testFixture===undefined?{}:{fixture_environment:fixtureEnvironmentBindings(testFixture)})};
}

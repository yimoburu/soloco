import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter,once} from 'node:events';
import {PassThrough} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';

const MODULE=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-codex-domain.mjs',import.meta.url));
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// Every predecessor, process identity and lifecycle event here is SYNTHETIC.
// The original production spawn/lifecycle BODY runs unchanged in a test-owned
// copy. No native child, OS signal/query, source-qualified plan, interpreter,
// deployment, authentication or provider operation is created by these tests.
class SyntheticChild extends EventEmitter {
  constructor(){
    super();this.pid=424242;this.exitCode=null;this.signalCode=null;this.exited=false;this.closed=false;this.signals=[];
    this.stdin=new PassThrough();this.stdout=new PassThrough();this.stderr=new PassThrough();
    this.stdio=[this.stdin,this.stdout,this.stderr,new PassThrough(),new PassThrough()];
    // Consume only fake child input/control bytes, so actual PassThrough end and
    // close events are observable without any OS pipe or subprocess.
    this.stdin.resume();this.stdio[4].resume();
  }
  kill(signal){
    this.signals.push({signal,after_exit:this.exited});
    if(this.exited)throw Error('retained child kill after observed synthetic exit');
    return true;
  }
  exit(code=0,signal=null,{updateProperties=true}={}){
    this.exited=true;
    if(updateProperties){this.exitCode=code;this.signalCode=signal;}
    this.emit('exit',code,signal);
  }
  async closeStreamsAndChild(code=0,signal=null){
    if(this.closed)return;
    for(const stream of [this.stdout,this.stderr,this.stdio[3]])stream.end();
    for(const stream of [this.stdin,this.stdio[4]])if(!stream.writableEnded)stream.end();
    await flush();
    for(const stream of [this.stdin,this.stdio[4]])if(!stream.destroyed)stream.destroy();
    await flush();this.closed=true;this.emit('close',code,signal);
  }
}

async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-domain-lifecycle-test-'));
  let original,child,facade,restoreKill=null,timersEnabled=false;
  const numericCalls=[];
  // Install cleanup before any transform/import, global patch or production
  // launch call can fail. A failing regression must not contaminate the next.
  t.after(async()=>{
    try{
      if(child){if(!child.exited)child.exit(0,null);await child.closeStreamsAndChild();}
      facade?.stdin?.destroy();facade?.stdout?.destroy();
      for(const stream of child?.stdio??[])stream.destroy();
      assert.deepEqual(numericCalls,[],'even failure cleanup must never query or signal numeric PIDs/groups');
      if(original!==undefined)assert.equal(fs.readFileSync(MODULE,'utf8'),original,'the actual production module stays untouched');
    }finally{
      if(restoreKill)process.kill=restoreKill;
      if(timersEnabled)t.mock.timers.reset();
      fs.rmSync(directory,{recursive:true,force:true});
    }
  });
  original=fs.readFileSync(MODULE,'utf8');
  const shimFile=path.join(directory,'synthetic-predecessors.mjs');
  fs.writeFileSync(shimFile,`// TEST-ONLY predecessor DATA; never imported by production modules.
export const ORIGINAL_CONTEXT_SELECTION=Object.freeze({synthetic:true});
export const compiledPlan=Object.freeze({SYNTHETIC_LIFECYCLE_ONLY:true});
export const spawnCalls=[];
let owner,child,claimed=false;
const slot=Object.freeze({slot_id:'synthetic-legacy-lifecycle-only',scope_policy:'SYNTHETIC_LEGACY_LIFECYCLE_ONLY',executable_sha256:'a'.repeat(64),source_manifest_sha256:'b'.repeat(64),native_context_contract:Object.freeze({original_home_sha256:'c'.repeat(64),upstream_url:'https://example.invalid/responses'})});
const plan=Object.freeze({launch_mode:'companion-v2',companion_slot:slot,executable_pin:{sha256:'a'.repeat(64)},sandbox_executable:'/synthetic/sandbox',executable:'/synthetic/companion',argv:['--synthetic-lifecycle-only'],cwd:'/synthetic-project',state_root:'/synthetic-state',scratch_root:'/synthetic-scratch',policy_sha256:'d'.repeat(64),environment:{}});
const check=(actualOwner,handle)=>{if(actualOwner!==owner||handle!==compiledPlan)throw Error('wrong synthetic predecessor');};
export function installSyntheticPredecessors(actualOwner,actualChild){owner=actualOwner;child=actualChild;}
export function inspectOriginalCompiledCodexPlan(actualOwner,handle){check(actualOwner,handle);return {...plan,consumed:claimed};}
export function claimOriginalCompiledCodexPlan(actualOwner,handle){check(actualOwner,handle);if(claimed)throw Error('synthetic plan replay');claimed=true;return {...plan,consumed:true};}
export function originalCompiledPeerContextInterpreter(actualOwner,handle){check(actualOwner,handle);return null;}
export function originalCompanionSlotMatches(value){return value===slot;}
export function spawn(...args){if(!child)throw Error('synthetic child absent');spawnCalls.push(args);return child;}
const unavailable=()=>{throw Error('unused synthetic interpreter predecessor');};
export {unavailable as resolveOriginalPeerContextInterpreter,unavailable as assertOriginalPeerContextInterpreterFinal,unavailable as assertOriginalPeerContextSlot,unavailable as inspectOriginalPeerContextInterpreter};
`);
  const shimURL=pathToFileURL(shimFile).href;
  let predecessorImports=0,spawnImports=0;
  const relocated=original.split('\n').map(line=>{
    const match=line.match(/^(import .* from )'([^']+)';$/);
    if(!match)return line;
    const [,prefix,specifier]=match;
    if(specifier==='node:child_process'){spawnImports++;return prefix+JSON.stringify(shimURL)+';';}
    if(['./protected-source-build-slot.mjs','./policy-supervisor.mjs'].includes(specifier)){
      predecessorImports++;return prefix+JSON.stringify(shimURL)+';';
    }
    return specifier.startsWith('./')?prefix+JSON.stringify(new URL(specifier,pathToFileURL(MODULE)).href)+';':line;
  }).join('\n');
  assert.equal(predecessorImports,3,'exactly the original slot and plan predecessor imports are synthetic');
  assert.equal(spawnImports,1,'only the original child_process spawn import is replaced');
  const body=text=>text.split('\n').filter(line=>!line.startsWith('import ')).join('\n');
  assert.equal(body(relocated),body(original),'all production lifecycle code and timing constants stay exact');
  const copy=path.join(directory,'domain.mjs');fs.writeFileSync(copy,relocated);
  const domain=await import(pathToFileURL(copy).href),shim=await import(shimURL);
  child=new SyntheticChild();const owner=Symbol('synthetic lifecycle owner');
  shim.installSyntheticPredecessors(owner,child);
  restoreKill=process.kill;
  process.kill=(...args)=>{numericCalls.push(args);throw Error('numeric PID/group operation is forbidden in this source regression');};
  t.mock.timers.enable({apis:['setTimeout']});timersEnabled=true;
  const handle=domain.createOriginalProtectedCodexLaunch(owner,shim.compiledPlan);
  facade=domain.spawnOriginalProtectedCodex(owner,handle);
  const errors=[];facade.on('error',error=>errors.push(error));
  assert.equal(shim.spawnCalls.length,1);
  assert.equal(shim.spawnCalls[0][0],'/synthetic/sandbox');
  assert.deepEqual(shim.spawnCalls[0][2].stdio,['pipe','pipe','pipe','pipe','pipe']);
  assert.equal(shim.spawnCalls[0][2].detached,true);
  child.emit('spawn');
  assert.equal(domain.inspectOriginalProtectedCodexLaunch(owner,handle).state,'born');
  return {domain,owner,handle,facade,child,numericCalls,errors};
}

function assertUnqualifiedLocalClose(domain,owner,handle){
  const observed=domain.inspectOriginalProtectedCodexLaunch(owner,handle);
  assert.equal(observed.original_exit_observed,true);
  assert.equal(observed.original_group_absent,null,'local events do not establish process-group absence');
  assert.equal(observed.local_process_and_streams_closed,true);
  assert.deepEqual(observed.local_stdio_closed,{stdout:true,stderr:true,witness:true,stdin:true,control:true});
  assert.equal(observed.local_domain_closed,false);
  assert.equal(observed.whole_domain_qualified,false);
  assert.equal(observed.actual_backend_source_build_qualified,false);
  assert.equal(observed.state,'unknown');
  return observed;
}

test('leader exit before stdio close forbids later numeric PID operations and retained-child signals',{concurrency:false},async t=>{
  const {domain,owner,handle,facade,child,numericCalls,errors}=await fixture(t);
  // Deliberately lag secondary exitCode/signalCode properties: the actual exit
  // event latch alone must stop signals while streams remain open.
  child.exit(0,null,{updateProperties:false});
  const exited=domain.inspectOriginalProtectedCodexLaunch(owner,handle);
  assert.equal(exited.original_exit_observed,true);
  assert.deepEqual(exited.original_exit,{code:0,signal:null});
  assert.equal(exited.local_process_and_streams_closed,false);
  facade.kill('SIGTERM');facade.kill('SIGKILL');domain.requestOriginalProtectedCodexStop(owner,handle);
  t.mock.timers.tick(250);t.mock.timers.tick(500);
  assert.deepEqual(child.signals,[],'no retained-child signal after the original leader exit');
  assert.deepEqual(numericCalls,[]);
  const closed=once(facade,'close');await child.closeStreamsAndChild(0,null);await closed;
  assertUnqualifiedLocalClose(domain,owner,handle);
  t.mock.timers.tick(120000); // Original close must clear escalation and lifetime timers.
  assert.deepEqual(child.signals,[]);assert.deepEqual(numericCalls,[]);assert.deepEqual(errors,[]);
});

test('pre-exit stop signals only the retained child and exit cancels all later escalation and queries',{concurrency:false},async t=>{
  const {domain,owner,handle,facade,child,numericCalls,errors}=await fixture(t);
  facade.kill('SIGTERM');
  assert.deepEqual(child.signals,[{signal:'SIGTERM',after_exit:false}]);
  assert.deepEqual(numericCalls,[],'the initial signal uses only the retained ChildProcess method');
  child.exit(null,'SIGTERM');
  t.mock.timers.tick(250);t.mock.timers.tick(500);
  assert.deepEqual(child.signals,[{signal:'SIGTERM',after_exit:false}],'no delayed escalation after exit');
  const closed=once(facade,'close');await child.closeStreamsAndChild(null,'SIGTERM');await closed;
  const observed=assertUnqualifiedLocalClose(domain,owner,handle);
  assert.deepEqual(observed.original_exit,{code:null,signal:'SIGTERM'});
  assert.deepEqual(observed.close,{code:null,signal:'SIGTERM'});
  t.mock.timers.tick(120000);
  assert.deepEqual(child.signals,[{signal:'SIGTERM',after_exit:false}]);assert.deepEqual(numericCalls,[]);assert.deepEqual(errors,[]);
});

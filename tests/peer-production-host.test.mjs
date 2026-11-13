import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {peerProductionRecipe,createOriginalPeerProductionProvider} from '../plugins/soloco/runtime/peers/production-host.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Real temporary fictional P1 storage; copied provider path tests use explicitly
// SYNTHETIC bridge/domain dependencies. They never produce original launch,
// incarnation or native capabilities, and never spawn or call a provider/model.
const code=expected=>error=>error?.code===expected;
const clone=value=>structuredClone(value);
const bridge={protocol:'SYNTHETIC-NOT-A-NATIVE-BRIDGE',selection:'fictional-only'};
function reviewedControl(){
 const peer_runtime={protocol:'peer-production-host-v1',bridge_sha256:peerDigest(bridge),launch:{profile_id:'reviewed-fixture-profile',instruction_sources:[{id:'fixture-policy',revision:1,sha256:'a'.repeat(64)}],base_instructions:'Synthetic reviewed base instruction.',developer_instructions:'Synthetic reviewed developer instruction.'}};
 const environment={boundary_mode:'enforced',worker_boundary:'broker-only-native',peer_runtime};
 return {protocol:'peer-cos-v1',activation:{review_id:'fictional-review',native_reviewer_id:'fictional-reviewer-not-authenticated',environment,environment_sha256:peerDigest(environment)}};
}
function rehash(control){control.activation.environment_sha256=peerDigest(control.activation.environment);return control;}
function fixture(t){
 const f=peerFixture({principals:{founder:{legacy_owner:{host:'codex',session_id:'fictional-provider-founder',epoch:1}}}});t.after(()=>f.close());
 const owner=Symbol('synthetic fixed host owner');
 f.ledger.write('fixture.reviewed-recipe','founder',tx=>{const c=tx.get('control','company');tx.put('control',c.id,{...c.value,...reviewedControl()},c.revision);tx.put('work_items','membership:fixture',{kind:'membership_enrollment',status:'pending',principal_id:'cos-a'},0);});
 const history=()=>f.ledger.read(tx=>JSON.stringify(tx.events({after:0,limit:100})));
 const input={kind:'membership',input:{enrollment_id:'fixture',phase:'reconstruction',instruction:'Synthetic reconstruction only.'}};
 return {...f,owner,history,input};
}
async function copiedProvider(t,f){
 const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-production-host-source-test-')));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const dependencies=path.join(directory,'SYNTHETIC-dependencies.mjs');
 fs.writeFileSync(dependencies,`
 export {bindPeerProductionScheduler} from ${JSON.stringify(new URL('../plugins/soloco/runtime/peers/model.mjs',import.meta.url).href)};
 export const state={bridge:${JSON.stringify(bridge)},loads:0,inspections:0,policies:[],launches:[],runtimes:[],stops:[],runtimeFailure:null,runtimeHook:null,prepareHook:null,stopFailure:null};
 export function bindPeerTaskEffects(){throw Error('Synthetic marker must never execute');}
 export async function loadOriginalSelectedPackagedPeerBridge(){state.loads++;}
 export function inspectOriginalLoadedPeerBridge(){state.inspections++;return structuredClone(state.bridge);}
 export function createPolicySupervisor(options){state.policies.push(options);return Object.freeze({synthetic:true});}
 export async function prepareOriginalProtectedPeerLaunch(owner,supervisor,input){const handle=Object.freeze({SYNTHETIC_ONLY:true});state.launches.push({owner,supervisor,input,handle});if(state.prepareHook)await state.prepareHook();return handle;}
 export function originalProtectedPeerLaunchConfiguration(owner,handle){const call=state.launches.find(x=>x.owner===owner&&x.handle===handle);if(!call)throw Error('Synthetic launch mismatch');return {cwd:call.input.cwd,environment:{PATH:'/usr/bin:/bin',HOME:'/fictional-home',CODEX_HOME:'/fictional-account',TMPDIR:call.input.scratch_root}};}
 export function createOriginalLoadedProductionTaskRuntime(options){state.runtimes.push(options);if(state.runtimeHook)state.runtimeHook();if(state.runtimeFailure)throw state.runtimeFailure;return Object.freeze({stop(owner){state.stops.push({owner,runtime:true});if(state.stopFailure)throw state.stopFailure;}});}
 export function requestOriginalProtectedCodexStop(owner,handle){state.stops.push({owner,handle,runtime:false});}
 `);
 const production=fileURLToPath(new URL('../plugins/soloco/runtime/peers/production-host.mjs',import.meta.url)),peers=path.dirname(production);
 const substitutes=new Set(['./model.mjs','./context-component-deployment.mjs','./policy-supervisor.mjs','./protected-codex-domain.mjs']);
 const source=fs.readFileSync(production,'utf8').replace(/from '(\.\/[^']+)'/g,(_whole,name)=>'from '+JSON.stringify(pathToFileURL(substitutes.has(name)?dependencies:path.resolve(peers,name)).href));
 const file=path.join(directory,'production-host-under-test.mjs');fs.writeFileSync(file,source);
 const module=await import(pathToFileURL(file).href),{state}=await import(pathToFileURL(dependencies).href);
 // Keep the original scheduler facade and ledger writer genuine. Only native
 // bridge/launch dependencies and the unused effect-availability marker above
 // are synthetic; no original task-effect callback is invoked by these tests.
 return {create:module.createOriginalPeerProductionProvider,state};
}

test('only an exact reviewed environment and fixed closed launch recipe is accepted',()=>{
 const control=reviewedControl(),recipe=peerProductionRecipe(control);assert.deepEqual(recipe,control.activation.environment.peer_runtime);
 for(const change of [c=>{c.protocol='legacy';},c=>{delete c.activation.review_id;},c=>{delete c.activation.native_reviewer_id;},c=>{c.activation.environment.boundary_mode='unconfined';},c=>{c.activation.environment.worker_boundary='shared';},c=>{c.activation.environment_sha256='b'.repeat(64);}]){
  const c=clone(control);change(c);assert.throws(()=>peerProductionRecipe(c),code('PEER_REVIEWED_ADOPTION_REQUIRED'));
 }
 for(const change of [r=>{r.protocol='caller-host';},r=>{r.bridge_sha256='bad';},r=>{r.spawn=()=>{};},r=>{r.launch.environment={};},r=>{r.launch.cwd='/caller';},r=>{r.launch.profile_id=' ';},r=>{r.launch.base_instructions='';},r=>{r.launch.developer_instructions='\ud800';},r=>{r.launch.instruction_sources=Array(33).fill('x');},r=>{r.launch.instruction_sources=['x'.repeat(16001)];}]){
  const c=clone(control);change(c.activation.environment.peer_runtime);
  // A function is rejected as non-DATA before a review hash can be constructed.
  if(typeof c.activation.environment.peer_runtime.spawn==='function')assert.throws(()=>peerProductionRecipe(c));
  else {rehash(c);assert.throws(()=>peerProductionRecipe(c),code('PEER_REVIEWED_LAUNCH_RECIPE_REQUIRED'));}
 }
});

test('reviewed recipe is a detached deeply frozen snapshot',()=>{
 const control=reviewedControl(),recipe=peerProductionRecipe(control);
 for(const value of [recipe,recipe.launch,recipe.launch.instruction_sources,recipe.launch.instruction_sources[0]])assert(Object.isFrozen(value));
 assert.throws(()=>{recipe.launch.profile_id='changed';},TypeError);
 assert.throws(()=>recipe.launch.instruction_sources.push('changed'),TypeError);
 control.activation.environment.peer_runtime.launch.instruction_sources[0].id='caller-mutated';
 assert.equal(recipe.launch.instruction_sources[0].id,'fixture-policy');
});

test('recipe and factory reject hidden selectors, accessors and Proxies without invoking them',t=>{
 const f=fixture(t);let hits=0;
 const getter=reviewedControl();Object.defineProperty(getter.activation,'environment',{enumerable:true,get(){hits++;return {};}});
 const proxy=new Proxy(reviewedControl(),{ownKeys(){hits++;throw Error('unreachable');},getPrototypeOf(){hits++;throw Error('unreachable');}});
 for(const c of [getter,proxy])assert.throws(()=>peerProductionRecipe(c),code('PEER_PRODUCTION_INPUT'));
 for(const extra of [{spawn(){},},{provider:{}},{root:f.root},{operator_principal_id:'founder'}])assert.throws(()=>createOriginalPeerProductionProvider({owner:f.owner,ledger:f.ledger,...extra}),code('PEER_PRODUCTION_DEPENDENCY'));
 const args={owner:f.owner,ledger:f.ledger};Object.defineProperty(args,'launch',{value:{}});
 assert.throws(()=>createOriginalPeerProductionProvider(args),code('PEER_PRODUCTION_DEPENDENCY'));
 const accessor={ledger:f.ledger};Object.defineProperty(accessor,'owner',{enumerable:true,get(){hits++;return f.owner;}});
 assert.throws(()=>createOriginalPeerProductionProvider(accessor),code('PEER_PRODUCTION_DEPENDENCY'));assert.equal(hits,0);
});

test('missing original effect producer denies before source loading, paths or mutation',async t=>{
 const f=fixture(t);f.ledger.guardedWrite=undefined;
 const before=f.history();assert.throws(()=>createOriginalPeerProductionProvider({owner:f.owner,ledger:f.ledger}),code('PEER_TASK_EFFECTS_PRODUCER_HELD'));
 assert.equal(fs.existsSync(path.join(f.ledger.directory,'peer-execution')),false);assert.equal(f.history(),before);
});

test('provider derives the configured canonical founder and accepts no caller actor override',async t=>{
 const f=fixture(t);f.ledger.write('fixture.custom-founder','founder',tx=>{const c=tx.get('control','company');tx.put('principals','actual-founder',{kind:'founder',status:'active',generation:1,native_id:'fictional-founder',host:'codex',legacy_owner:{host:'codex',session_id:'fictional-custom-founder',epoch:1}},0);tx.put('control',c.id,{...c.value,founder_principal_id:'actual-founder'},c.revision);});
 const provider=createOriginalPeerProductionProvider({owner:f.owner,ledger:f.ledger});assert(Object.isFrozen(provider));f.ledger.guardedWrite=undefined;
 await assert.rejects(provider.initialize(),code('PEER_TASK_EFFECTS_PRODUCER_HELD'));
 assert.throws(()=>createOriginalPeerProductionProvider({owner:f.owner,ledger:f.ledger,operator_principal_id:'founder'}),code('PEER_PRODUCTION_DEPENDENCY'));
});

test('closed provider requests reject runtime selectors before any preparation',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger}),before=f.history();let hits=0;
 const accessor={};Object.defineProperty(accessor,'kind',{enumerable:true,get(){hits++;return 'membership';}});
 const proxy=new Proxy(f.input,{ownKeys(){hits++;throw Error('unreachable');},getPrototypeOf(){hits++;throw Error('unreachable');}});
 for(const request of [null,accessor,proxy,{...f.input,launch:{}},{...f.input,provider:{}},{kind:'other',task:{}},{...f.input,input:{...f.input.input,principal_id:'founder'}},{...f.input,input:{...f.input.input,reviewer_principal_id:'reviewer'}},{kind:'task',task:{},context:{}}])await assert.rejects(provider.prepare(request),code('PEER_PRODUCTION_INPUT'));
 await assert.rejects(provider.initialize({root:f.root}),code('PEER_PRODUCTION_INPUT'));
 for(const input of [{host:'codex',spawn(){}},{host:'codex',environment:{}},{host:'claude'}]){const ready=await provider.readiness(input);assert.equal(ready.available,false);assert.equal(ready.authenticated,false);}
 assert.equal(hits,0);assert.equal(state.loads,0);assert.equal(state.policies.length,0);assert.equal(state.launches.length,0);assert.equal(f.history(),before);
});

test('fixed recipe and private paths compose fresh synthetic launches without selecting account or code',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger}),before=f.history();
 await provider.initialize();assert.equal(state.loads,1);assert.equal((await provider.readiness({host:'codex',task:null})).authenticated,true);
 const first=await provider.prepare(f.input),second=await provider.prepare(f.input);assert(Object.isFrozen(first));assert.equal(state.launches.length,2);assert.notEqual(state.launches[0].handle,state.launches[1].handle);
 const own=path.join(f.ledger.directory,'peer-execution',peerDigest('cos-a'));
 for(const directory of [path.dirname(own),own,path.join(own,'state'),path.join(own,'scratch')]){const s=fs.lstatSync(directory);assert(s.isDirectory());assert.equal(s.mode&0o777,0o700);assert.equal(s.isSymbolicLink(),false);}
 for(const launch of state.launches)assert.deepEqual(launch.input,{cwd:f.ledger.root,read_paths:[],state_root:path.join(own,'state'),scratch_root:path.join(own,'scratch')});
 for(const options of state.runtimes){assert.equal(options.ledger,f.ledger);assert.equal(options.owner,f.owner);assert.deepEqual(options.launch.profile_id,'reviewed-fixture-profile');assert.equal(options.launch.environment.CODEX_HOME,'/fictional-account');assert.equal(options.launch.cwd,f.ledger.root);}
 first.stop();second.stop();assert.equal(state.stops.length,2);assert(state.stops.every(x=>x.runtime&&x.owner===f.owner));assert.equal(f.history(),before);
});

test('task preparation binds the actual running attempt/context and pause before creating paths',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger});
 const context={sha256:'c'.repeat(64)},task=f.ledger.write('fixture.synthetic-running-task','founder',tx=>tx.put('tasks','synthetic-task',{status:'running',owner_principal_id:'cos-a',attempt:{id:'synthetic-attempt',context}},0));
 const request={kind:'task',task,context,signal:new AbortController().signal};
 await assert.rejects(provider.prepare({...request,context:{sha256:'d'.repeat(64)}}),code('HOST_LEASE_CHANGED'));
 await assert.rejects(provider.prepare({...request,task:{...task,value:{...task.value,attempt:{id:'other-attempt'}}}}),code('HOST_LEASE_CHANGED'));
 f.ledger.write('fixture.pause','founder',tx=>{const c=tx.get('control','company');tx.put('control',c.id,{...c.value,paused:true},c.revision);});
 await assert.rejects(provider.prepare(request),code('PEER_PAUSED'));assert.equal(fs.existsSync(path.join(f.ledger.directory,'peer-execution')),false);assert.equal(state.launches.length,0);
 f.ledger.write('fixture.unpause','founder',tx=>{const c=tx.get('control','company');tx.put('control',c.id,{...c.value,paused:false},c.revision);});
 const handle=await provider.prepare(request);assert.equal(state.launches.length,1);assert.equal(state.launches[0].input.state_root,path.join(f.ledger.directory,'peer-execution',peerDigest('cos-a'),'state'));handle.stop();
});

test('bridge drift and changed connection fail before any directory or launch',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger});
 state.bridge.selection='changed';await assert.rejects(provider.prepare(f.input),code('PEER_ORIGINAL_BRIDGE_CHANGED'));
 state.bridge=clone(bridge);const root=f.ledger.root;f.ledger.root+='-replaced';
 await assert.rejects(provider.prepare(f.input),code('PEER_PRODUCTION_CONNECTION_CHANGED'));f.ledger.root=root;
 await assert.rejects(provider.prepare(f.input),code('PEER_PRODUCTION_STOPPED'));
 assert.equal(fs.existsSync(path.join(f.ledger.directory,'peer-execution')),false);assert.equal(state.launches.length,0);
 const next=create({owner:f.owner,ledger:f.ledger});
 const read=f.ledger.read;f.ledger.read=function(fn){const value=read.call(this,fn);this.company_id+='-late-change';return value;};
 await assert.rejects(next.prepare(f.input),code('PEER_PRODUCTION_CONNECTION_CHANGED'));assert.equal(state.launches.length,0);
});

test('existing unsafe private directory is preserved and denied',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger});
 const base=path.join(f.ledger.directory,'peer-execution');fs.mkdirSync(base,{mode:0o755});fs.chmodSync(base,0o755);fs.writeFileSync(path.join(base,'retained.txt'),'retain unknown prior artifacts');
 await assert.rejects(provider.prepare(f.input),code('PEER_PRIVATE_RUNTIME_DIRECTORY'));
 assert.equal(fs.readFileSync(path.join(base,'retained.txt'),'utf8'),'retain unknown prior artifacts');assert.equal(state.launches.length,0);assert.equal(fs.statSync(base).mode&0o777,0o755);
});

test('redirected ancestors hold before mkdir can create outside the selected namespace',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f);
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-production-host-alias-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const target=path.join(root,'target'),alias=path.join(root,'alias');fs.mkdirSync(target);fs.mkdirSync(path.join(target,'.company'),{mode:0o700});fs.symlinkSync(target,alias,'dir');
 // Deliberately untrusted TEST ledger namespace with real read-only P1 fixture
 // delegation. Its alias must hold; it never authenticates a production ledger.
 const ledger={root:alias,directory:path.join(alias,'.company'),company_id:f.ledger.company_id,read:f.ledger.read.bind(f.ledger),guardedWrite(){assert.fail('No write');}};
 const provider=create({owner:f.owner,ledger});await assert.rejects(provider.prepare(f.input),code('PEER_PRIVATE_RUNTIME_DIRECTORY'));
 assert.equal(fs.existsSync(path.join(target,'.company','peer-execution')),false);assert.equal(state.policies.length,0);assert.equal(state.launches.length,0);
});

test('runtime construction failure requests original prepared-launch stop and retains paths',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger}),failure=Error('synthetic runtime construction failure');state.runtimeFailure=failure;
 await assert.rejects(provider.prepare(f.input),error=>error===failure);
 assert.equal(state.launches.length,1);assert.deepEqual(state.stops,[{owner:f.owner,handle:state.launches[0].handle,runtime:false}]);
 assert(fs.existsSync(path.join(f.ledger.directory,'peer-execution',peerDigest('cos-a'),'state')));
});

test('every canonical founder revision is bound and drift permanently fences preparation',async t=>{
 for(const update of [value=>({...value,legacy_owner:{host:'codex',session_id:'successor',epoch:2}}),value=>({...value,generation:value.generation+1}),value=>({...value,status:'revoked'})]){
  const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger});
  const before=f.ledger.read(tx=>tx.get('principals','founder'));
  f.ledger.write('fixture.founder-drift','founder',tx=>tx.put('principals','founder',update(before.value),before.revision));
  await assert.rejects(provider.prepare(f.input),code('PEER_PRODUCTION_AUTHORITY_CHANGED'));
  // Even restoring identical old value advances the immutable reference; the
  // retired source cannot re-enroll or start a replacement runtime by itself.
  f.ledger.write('fixture.restore-founder-data','founder',tx=>{const current=tx.get('principals','founder');tx.put('principals','founder',before.value,current.revision);});
  const ready=await provider.readiness({host:'codex'});assert.equal(ready.available,false);assert.equal(ready.error,'PEER_PRODUCTION_STOPPED');
  assert.equal(state.launches.length,0);assert.equal(fs.existsSync(path.join(f.ledger.directory,'peer-execution')),false);
 }
});

test('readiness founder replacement retires only retained runtimes at most once',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger});
 const first=await provider.prepare(f.input),second=await provider.prepare(f.input);first.stop();assert.equal(state.stops.length,1);
 f.ledger.write('fixture.replace-canonical-founder','founder',tx=>{
  tx.put('principals','successor',{kind:'founder',status:'active',generation:1,native_id:'fictional-successor'},0);
  const c=tx.get('control','company');tx.put('control',c.id,{...c.value,founder_principal_id:'successor'},c.revision);
 });
 const before=f.history(),ready=await provider.readiness({host:'codex',task:null});
 assert.equal(ready.available,false);assert.equal(ready.authenticated,false);assert.equal(ready.error,'PEER_PRODUCTION_AUTHORITY_CHANGED');assert.equal(state.stops.length,2);
 first.stop();second.stop();assert.equal(state.stops.length,2);
 assert.equal((await provider.readiness({host:'codex'})).error,'PEER_PRODUCTION_STOPPED');
 await assert.rejects(provider.prepare(f.input),code('PEER_PRODUCTION_STOPPED'));
 assert.equal(state.stops.length,2);assert.equal(state.launches.length,2);assert.equal(f.history(),before);
 assert(fs.existsSync(path.join(f.ledger.directory,'peer-execution',peerDigest('cos-a'),'state')));
});

test('founder change across launch preparation stops the unspawned launch before TaskHost construction',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger}),retained=await provider.prepare(f.input);
 let hits=0;state.prepareHook=async()=>{
  hits++;await Promise.resolve();
  f.ledger.write('fixture.owner-during-prepare-await','founder',tx=>{const p=tx.get('principals','founder');tx.put('principals',p.id,{...p.value,legacy_owner:{host:'codex',session_id:'changed-during-await',epoch:3}},p.revision);});
 };
 await assert.rejects(provider.prepare(f.input),code('PEER_PRODUCTION_AUTHORITY_CHANGED'));
 assert.equal(hits,1);assert.equal(state.launches.length,2);assert.equal(state.runtimes.length,1);
 assert.deepEqual(state.stops,[{owner:f.owner,runtime:true},{owner:f.owner,handle:state.launches[1].handle,runtime:false}]);
 retained.stop();assert.equal(state.stops.length,2);assert.equal((await provider.readiness({host:'codex'})).error,'PEER_PRODUCTION_STOPPED');
});

test('a retained runtime stop failure cannot revive authority or cause a second stop',async t=>{
 const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger}),handle=await provider.prepare(f.input),failure=Error('synthetic original stop failure');
 state.stopFailure=failure;
 f.ledger.write('fixture.changed-founder','founder',tx=>{const p=tx.get('principals','founder');tx.put('principals',p.id,{...p.value,generation:p.value.generation+1},p.revision);});
 const ready=await provider.readiness({host:'codex'});assert.equal(ready.error,'PEER_PRODUCTION_AUTHORITY_CHANGED');assert.equal(ready.original_error.stop_errors[0],failure);
 assert.equal(state.stops.length,1);handle.stop();assert.equal(state.stops.length,1);
 await assert.rejects(provider.prepare(f.input),code('PEER_PRODUCTION_STOPPED'));assert.equal(state.stops.length,1);
});

test('post-construction read failure retires the unreturned runtime and preserves both failures',async t=>{
 for(const failsStop of [false,true]){
  const f=fixture(t),{create,state}=await copiedProvider(t,f),provider=create({owner:f.owner,ledger:f.ledger});
  const readFailure=Error('original ledger read failed after runtime construction'),stopFailure=Error('original runtime stop also failed'),read=f.ledger.read;
  state.runtimeHook=()=>{f.ledger.read=()=>{throw readFailure;};};if(failsStop)state.stopFailure=stopFailure;
  await assert.rejects(provider.prepare(f.input),error=>failsStop?error instanceof AggregateError&&error.cause===readFailure&&error.errors[0]===readFailure&&error.errors[1]===stopFailure:error===readFailure);
  f.ledger.read=read;assert.equal(state.runtimes.length,1);assert.equal(state.launches.length,1);assert.deepEqual(state.stops,[{owner:f.owner,runtime:true}]);
  // The failed, unreturned entry was removed before stop, even if stop threw.
  f.ledger.write('fixture.post-failure-owner-change','founder',tx=>{const p=tx.get('principals','founder');tx.put('principals',p.id,{...p.value,generation:p.value.generation+1},p.revision);});
  assert.equal((await provider.readiness({host:'codex'})).error,'PEER_PRODUCTION_AUTHORITY_CHANGED');assert.equal(state.stops.length,1);
 }
});

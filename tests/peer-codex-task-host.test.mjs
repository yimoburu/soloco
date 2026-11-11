import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createCodexTaskRuntime,STABLE_TOOL_SHA256} from '../plugins/soloco/runtime/peers/codex-task-host.mjs';
import {createCodexMembershipHost,decodeHostFrame} from '../plugins/soloco/runtime/peers/codex-host.mjs';
import {stableTaskHostTools} from '../plugins/soloco/runtime/peers/host-protocol.mjs';
import {peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {restrictFoundationCallbacks} from '../plugins/soloco/runtime/peers/foundation-callback-boundary.mjs';
import {createMembershipLifecycle} from '../plugins/soloco/runtime/peers/membership.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Actual isolated peer ledger, synthetic private dependencies. No spawn,
// provider, original deployment or native acceptance is performed here.
const code=expected=>error=>error?.code===expected;
const launch={cwd:'/synthetic/task-session',profile_id:'unit-restricted',instruction_sources:[],base_instructions:'Synthetic trusted policy.',developer_instructions:'Only current scoped callbacks.',environment:{PATH:'/usr/bin:/bin',HOME:'/synthetic/home',CODEX_HOME:'/synthetic/codex'}};
function fixture(t,options={}){
  const f=peerFixture();t.after(()=>f.close());
  const counts={admit:0,spawn:0,active:0};
  const forbidden=name=>()=>{counts[name]++;assert.fail(name+' must remain unreachable');};
  const membership={operator:{admit:forbidden('admit')},host:{activeClient:forbidden('active'),bind(){},channel(){},finish(){},close(){}}};
  const owner=Symbol('synthetic owner'),spawn_child=forbidden('spawn');
  const args={owner,ledger:f.ledger,membership,launch,spawn_child,...options};
  const history=()=>f.ledger.read(tx=>tx.events({after:0,limit:100}).items);
  return {...f,owner,args,counts,history};
}
const input={enrollment_id:'synthetic-enrollment',phase:'reconstruction',instruction:'Inspect bounded source only.'};

test('missing host qualifiers hold before admission, usage, or process spawn',async t=>{
  const f=fixture(t),before=f.history(),runtime=createCodexTaskRuntime(f.args);
  await assert.rejects(runtime.stage(f.owner,input),code('HOST_QUALIFICATION_HELD'));
  assert.deepEqual(f.counts,{admit:0,spawn:0,active:0});assert.deepEqual(f.history(),before);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')),null);
  assert.equal(runtime.inspect(f.owner).reports.length,0);
});

test('Boolean and asynchronous qualifier results cannot authenticate the host',async t=>{
  for(const result of [true,Promise.resolve(undefined)])await t.test(typeof result,async t=>{
    const qualification=Object.fromEntries(['profile','instructions','external','actor','closure','tools'].map(name=>[name,()=>undefined]));qualification.profile=()=>result;
    const f=fixture(t,{qualification}),before=f.history(),runtime=createCodexTaskRuntime(f.args);
    await assert.rejects(runtime.stage(f.owner,input),code('HOST_GUARD_RESULT'));
    assert.deepEqual(f.counts,{admit:0,spawn:0,active:0});assert.deepEqual(f.history(),before);
  });
});

test('protected launch DATA cannot replace the original private launch capability',t=>{
  const f=fixture(t);
  assert.throws(()=>createCodexTaskRuntime({...f.args,protected_launch:{protocol:'soloco-protected-backend-permit-v2'}}),code('HOST_ORIGINAL_PROTECTED_LAUNCH_REQUIRED'));
  assert.deepEqual(f.counts,{admit:0,spawn:0,active:0});
});

test('the V5 constructor requires the fixed read-only foundation profile before host composition',async t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-v5-foundation-source-test-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const production=fileURLToPath(new URL('../plugins/soloco/runtime/peers/codex-task-host.mjs',import.meta.url)),original=fs.readFileSync(production,'utf8'),peers=path.dirname(production);
  const url=name=>pathToFileURL(path.join(peers,name)).href,domain=path.join(root,'stop-only-v5-domain.mjs'),slot=path.join(root,'synthetic-v5-slot-data.mjs'),interpreter=path.join(root,'synthetic-commitment-data.mjs');
  // These TEST COPY predecessors expose only a synthetic slot selector and
  // stop marker. Every otherwise accepted constructor stops at launch binding,
  // before host composition, ledger reads, admission or native work. No real
  // original handle/factory is created or enrolled in a production WeakMap.
  fs.writeFileSync(domain,'export * from '+JSON.stringify(url('protected-codex-domain.mjs'))+';\nexport function isOriginalProtectedCodexLaunch(){return true;}\nexport function originalProtectedPeerContextInterpreter(){return Object.freeze({synthetic_test_only:true});}\nexport function bindOriginalProtectedCodexLaunch(){throw Object.assign(Error("Synthetic stop after profile restriction"),{code:"SYNTHETIC_AFTER_FOUNDATION_STOP"});}\n');
  fs.writeFileSync(slot,'export * from '+JSON.stringify(url('protected-source-build-slot.mjs'))+';\nexport function inspectOriginalPeerContextSlot(){return Object.freeze({scope_policy:"V5_ORIGINAL_MANAGED_PRIVATE_FD",synthetic_test_only:true});}\n');
  fs.writeFileSync(interpreter,'export * from '+JSON.stringify(url('peer-context-interpreter.mjs'))+';\nexport function originalPeerContextCreationCommitment(){return Object.freeze({synthetic_commitment_data_only:true});}\n');
  const replacements=new Map([['./protected-codex-domain.mjs',domain],['./protected-source-build-slot.mjs',slot],['./peer-context-interpreter.mjs',interpreter]]);
  const text=original.replace(/from '(\.\/[^']+)'/g,(_whole,specifier)=>'from '+JSON.stringify(pathToFileURL(replacements.get(specifier)??path.resolve(peers,specifier)).href));
  const file=path.join(root,'v5-constructor-under-test.mjs');fs.writeFileSync(file,text);
  const {createCodexTaskRuntime:runtime}=await import(pathToFileURL(file).href);let effects=0;
  const forbidden=()=>{effects++;assert.fail('No host composition or execution allowed');};
  const args={owner:Symbol('synthetic constructor owner'),ledger:{read:forbidden,write:forbidden},membership:{host:{activeClient:forbidden}},launch,protected_launch:{synthetic_test_only:true}};
  assert.throws(()=>runtime(args),code('HOST_FOUNDATION_ACTION_HELD'));
  assert.throws(()=>runtime({...args,callback_restriction:undefined}),code('HOST_FOUNDATION_ACTION_HELD'));
  for(const callback_restriction of [null,false,true,'unrestricted','another-profile'])assert.throws(()=>runtime({...args,callback_restriction}),code('HOST_ARGUMENT'));
  assert.throws(()=>runtime({...args,callback_restriction:'local-foundation-qualification'}),code('SYNTHETIC_AFTER_FOUNDATION_STOP'));
  assert.throws(()=>runtime({...args,callback_restriction:'local-foundation-qualification',software_prepare:forbidden}),code('HOST_FOUNDATION_ACTION_HELD'));
  assert.equal(effects,0);
});

test('the task host retains finite budgets and the original instruction owner',async t=>{
  const f=fixture(t),runtime=createCodexTaskRuntime(f.args),other=Symbol('synthetic owner');
  assert.equal(STABLE_TOOL_SHA256,peerDigest(stableTaskHostTools()));
  assert.throws(()=>runtime.inspect(other),code('INSTRUCTION_OWNER'));
  await assert.rejects(runtime.stage(other,input),code('INSTRUCTION_OWNER'));
  for(const limits of [{total_ms:120001},{frame_bytes:4000001},{wire_bytes:Infinity},{grace_ms:0}])
    assert.throws(()=>createCodexTaskRuntime({...f.args,limits}),code('HOST_LIMIT'));
  assert.deepEqual(f.counts,{admit:0,spawn:0,active:0});
});

test('membership staging also holds before admission without complete private qualifiers',async t=>{
  const f=fixture(t),host=createCodexMembershipHost({owner:f.owner,membership:f.args.membership,launch,spawn_child:f.args.spawn_child}),before=f.history();
  const result=await host.run(f.owner,input);
  assert.equal(result.accepted,false);assert.equal(result.code,'HOST_QUALIFICATION_HELD');
  assert.equal(result.physical_close_observed,false);assert.equal(result.termination_qualified,false);
  assert.deepEqual(f.counts,{admit:0,spawn:0,active:0});assert.deepEqual(f.history(),before);
});

test('an active ledger principal without its membership and creation binding cannot pass the task probe',async t=>{
  const f=fixture(t),runtime=createCodexTaskRuntime(f.args),before=f.history();
  const result=await runtime.executor.probe({host:'codex',task:{id:'synthetic-task',value:{owner_principal_id:'cos-a'}}});
  assert.equal(result.available,false);assert.equal(result.authenticated,false);assert.equal(result.error,'HOST_ACTIVE_BINDING_HELD');
  assert.deepEqual(f.counts,{admit:0,spawn:0,active:0});assert.deepEqual(f.history(),before);
});

test('the foundation facade delegates only inspection of its own task and never widens execution',()=>{
  const seen=[],client={execute(){assert.fail('No execution permitted');},inspect:(...args)=>{seen.push(args);return {source:'original bound client'};}};
  const restricted=restrictFoundationCallbacks(client,'task-1');assert.ok(Object.isFrozen(restricted));
  assert.deepEqual(restricted.inspect('task/get',{task_id:'task-1'}),{source:'original bound client'});
  assert.deepEqual(restricted.inspect('task/context',{task_id:'task-1'}),{source:'original bound client'});
  for(const [action,args] of [['runtime/status',{}],['list',{}],['task/get',{task_id:'task-2'}],['task/get',{task_id:'task-1',principal_id:'founder'}]])
    assert.throws(()=>restricted.inspect(action,args),code('HOST_FOUNDATION_INSPECTION_HELD'));
  assert.throws(()=>restricted.execute('notice/create',{}),code('HOST_FOUNDATION_ACTION_HELD'));
  assert.equal(seen.length,2);
});

test('strict app-server framing rejects duplicate selectors, malformed Unicode, and excessive nesting',()=>{
  assert.deepEqual(decodeHostFrame('{"id":1,"result":{"ok":true}}'),{id:1,result:{ok:true}});
  assert.throws(()=>decodeHostFrame('{"id":1,"id":2}'),code('WIRE_DUPLICATE_KEY'));
  assert.throws(()=>decodeHostFrame('{"id":"\\ud800"}'),code('WIRE_UNICODE'));
  assert.throws(()=>decodeHostFrame('{"nested":'+ '['.repeat(33)+'0'+']'.repeat(33)+'}'),code('WIRE_DEPTH'));
});

test('the private TaskHost readiness boundary uses static support while later stages keep domain gates',async t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-task-boundary-test-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const production=fileURLToPath(new URL('../plugins/soloco/runtime/peers/codex-task-host.mjs',import.meta.url)),original=fs.readFileSync(production,'utf8');
  const domain=pathToFileURL(path.join(path.dirname(production),'protected-codex-domain.mjs')).href,stop=path.join(root,'stop-only-domain.mjs');
  // Exact source TEST COPY with two stop-only guard overrides. They always
  // throw; no fake original handle, runtime issuer or successful native path
  // can be constructed through this private dispatch test.
  fs.writeFileSync(stop,'export * from '+JSON.stringify(domain)+';\nexport function assertOriginalProtectedPeerContextStatic(){throw Object.assign(Error("synthetic static stop"),{code:"SYNTHETIC_STATIC_STOP"});}\nexport function assertOriginalProtectedCodexBoundary(){throw Object.assign(Error("synthetic domain stop"),{code:"SYNTHETIC_DOMAIN_STOP"});}\n');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_whole,specifier)=>'from '+JSON.stringify(specifier==='./protected-codex-domain.mjs'?pathToFileURL(stop).href:pathToFileURL(path.resolve(path.dirname(production),specifier)).href));
  const copy=path.join(root,'task-boundary-under-test.mjs');fs.writeFileSync(copy,source+'\nexport {assertProtectedTaskBoundary as __testOnlyProtectedTaskBoundary};\n');
  const {__testOnlyProtectedTaskBoundary:boundary}=await import(pathToFileURL(copy).href),owner=Symbol('synthetic owner');
  assert.throws(()=>boundary(owner,{},true,'before_admission'),code('SYNTHETIC_STATIC_STOP'));
  assert.throws(()=>boundary(owner,{},null,'before_admission'),code('SYNTHETIC_DOMAIN_STOP'));
  for(const stage of ['before_context','before_turn','callback_guard','callback_execute','callback_inspect','physical_close'])
    assert.throws(()=>boundary(owner,{},true,stage),code('SYNTHETIC_DOMAIN_STOP'));
});

test('the protected spawn branch resolves original launch inspection and preserves its birth timestamp',async t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-protected-spawn-source-test-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const production=fileURLToPath(new URL('../plugins/soloco/runtime/peers/codex-task-host.mjs',import.meta.url)),original=fs.readFileSync(production,'utf8');
  const domain=pathToFileURL(path.join(path.dirname(production),'protected-codex-domain.mjs')).href,stub=path.join(root,'synthetic-child-stop.mjs');
  // Test-copy private branch only: an in-process emitter stands for a child.
  // Stop before protocol/provider work, then refuse closure qualification.
  // This cannot issue a genuine original launch or return native success.
  fs.writeFileSync(stub,'export * from '+JSON.stringify(domain)+';\nimport {EventEmitter} from "node:events";\nexport function spawnOriginalProtectedCodex(){const child=new EventEmitter();child.pid=54321;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=()=>true;child.stdin.end=()=>queueMicrotask(()=>{child.stdout.emit("end");child.emit("close",0,null);});child.kill=()=>true;queueMicrotask(()=>child.emit("spawn"));return child;}\nexport function inspectOriginalProtectedCodexLaunch(){return {birth:{pid:54321,at:"2026-11-11T00:01:02.003Z"}};}\n');
  const text=original.replace(/from '(\.\/[^']+)'/g,(_whole,specifier)=>'from '+JSON.stringify(specifier==='./protected-codex-domain.mjs'?pathToFileURL(stub).href:pathToFileURL(path.resolve(path.dirname(production),specifier)).href));
  const file=path.join(root,'protected-spawn-under-test.mjs');fs.writeFileSync(file,text+'\nexport {activeTurn as __testOnlyActiveTurn};\n');
  const {__testOnlyActiveTurn:turn}=await import(pathToFileURL(file).href);let observed=null,clockReads=0;
  const report=await turn({owner:Symbol('synthetic owner'),launch,admitted:{},context:{},protectedLaunch:{synthetic_test_only:true},now:()=>{clockReads++;return 0;},
    limits:{total_ms:100,grace_ms:1,term_ms:1,kill_ms:1,frame_bytes:1000,wire_bytes:2000,transcript_bytes:2000},
    checks:stage=>{if(stage==='child_spawned')throw Object.assign(Error('Synthetic stop at observed spawn.'),{code:'SYNTHETIC_SPAWN_STOP'});if(stage==='physical_close')throw Object.assign(Error('Native closure remains unqualified.'),{code:'SYNTHETIC_CLOSURE_HELD'});},
    current(){},bind(){assert.fail('No protocol binding allowed');},spawn(){assert.fail('Stock spawn must not run');},onSpawn:packet=>{observed=packet;},onQualifiedClose(){assert.fail('No genuine closure qualification');}});
  assert.deepEqual(observed,{pid:54321,started_at:'2026-11-11T00:01:02.003Z'});assert.equal(clockReads,0);
  assert.equal(report.error.code,'SYNTHETIC_SPAWN_STOP');assert.equal(report.qualified_close,false);assert.equal(report.native_id,null);
});

function stagedMembership(t,{on_admission,stop_before_spawn=false}={}){
  const f=peerFixture();t.after(()=>f.close());const actual=createMembershipLifecycle(f.ledger),owner=Symbol('synthetic membership owner'),order=[];let callbackCount=0,spawnCount=0;
  const enrollment=actual.operator.enroll({operation_id:'synthetic-enroll',enrollment_id:'synthetic-enrollment',principal_id:'synthetic-member',role:'cos',host:'codex',scope:'alpha',input_refs:[],expected_generation:0,max_model_calls:2,expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Synthetic bounded operator fixture; no native or human authentication.'});
  const membership={operator:{admit(...args){order.push('admit');return actual.operator.admit(...args);}},host:actual.host};
  const qualification=Object.fromEntries(['profile','instructions','external','actor','closure'].map(name=>[name,packet=>{
    if(name==='profile'&&packet.stage==='before_spawn'){order.push('before_spawn');if(stop_before_spawn)throw Object.assign(Error('Synthetic stop before spawn.'),{code:'SYNTHETIC_BEFORE_SPAWN_STOP'});}
  }]));
  const host=createCodexMembershipHost({owner,membership,launch,qualification,spawn_child(){spawnCount++;assert.fail('Synthetic test must stop before spawn');},on_admission:phase=>{
    callbackCount++;order.push('on_admission');assert.ok(Object.isFrozen(phase));assert.deepEqual(Object.keys(phase).sort(),['family','id','revision','sha256']);
    const actualPhase=f.ledger.read(tx=>tx.get(phase.family,phase.id));assert.deepEqual(phase,{family:'work_items',id:actualPhase.id,revision:actualPhase.revision,sha256:actualPhase.sha256});
    assert.equal(actualPhase.value.status,'reserved');assert.equal(actualPhase.value.native_id,null);
    return on_admission?.(phase);
  }});
  return {...f,owner,host,order,enrollment,get callbackCount(){return callbackCount;},get spawnCount(){return spawnCount;}};
}

test('the source admission notification follows actual reservation exactly once and precedes the spawn gate',async t=>{
  const f=stagedMembership(t,{stop_before_spawn:true}),result=await f.host.run(f.owner,input);
  assert.deepEqual(f.order,['admit','on_admission','before_spawn']);assert.equal(f.callbackCount,1);assert.equal(f.spawnCount,0);
  assert.equal(result.code,'SYNTHETIC_BEFORE_SPAWN_STOP');assert.equal(result.physical_close_observed,false);assert.equal(result.termination_qualified,false);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
  await assert.rejects(f.host.run(f.owner,input),code('HOST_ATTEMPT_CONSUMED'));assert.equal(f.callbackCount,1);
});

test('admission callback data and Promises cannot replace the original receipt or permit a spawn',async t=>{
  for(const result of [true,{admitted:true},Promise.resolve(undefined)])await t.test(typeof result,async t=>{
    const f=stagedMembership(t,{on_admission:()=>result}),outcome=await f.host.run(f.owner,input);
    assert.equal(outcome.code,'HOST_GUARD_RESULT');assert.equal(outcome.accepted,false);
    assert.deepEqual(f.order,['admit','on_admission']);assert.equal(f.callbackCount,1);assert.equal(f.spawnCount,0);
    assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
  });
});

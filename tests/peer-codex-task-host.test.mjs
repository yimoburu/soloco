import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createCodexTaskRuntime,STABLE_TOOL_SHA256} from '../plugins/soloco/runtime/peers/codex-task-host.mjs';
import {createNativeExecutor} from '../plugins/soloco/runtime/peers/scheduler.mjs';
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

test('pre-turn context bootstrap uses foundation inspection while dynamic callbacks retain guards and the actual task binder',async t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-task-context-bootstrap-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const production=fileURLToPath(new URL('../plugins/soloco/runtime/peers/codex-task-host.mjs',import.meta.url)),original=fs.readFileSync(production,'utf8');
  const url=name=>pathToFileURL(path.join(path.dirname(production),name)).href;
  const domain=path.join(root,'synthetic-context-domain.mjs'),protocol=path.join(root,'observed-real-protocol.mjs'),model=path.join(root,'observed-real-model.mjs');
  // Exact source TEST COPY: the real wire protocol still drives all states.
  // The emitter is no child; the plain observer marker is no incarnation.
  // Forward the real model binder so it must reject our untrusted connection.
  fs.writeFileSync(domain,'export * from '+JSON.stringify(url('protected-codex-domain.mjs'))+';\nexport const probe={child:null,observations:[]};\nexport function spawnOriginalProtectedCodex(){queueMicrotask(()=>probe.child.emit("spawn"));return probe.child;}\nexport function inspectOriginalProtectedCodexLaunch(){return {birth:{pid:54322,at:"2026-11-11T00:02:03.004Z"}};}\nexport function observeOriginalProtectedPeerExecutorIncarnation(...args){probe.observations.push(args);return Object.freeze({synthetic_marker_only:true});}\n');
  fs.writeFileSync(protocol,'export * from '+JSON.stringify(url('host-protocol.mjs'))+';\nimport {createPeerHostProtocol as actual} from '+JSON.stringify(url('host-protocol.mjs'))+';\nexport const probe={caps:null};\nexport function createPeerHostProtocol(options){return actual({...options,bindNative(...args){const bound=options.bindNative(...args);probe.caps=bound;return bound;}});}\n');
  fs.writeFileSync(model,'export * from '+JSON.stringify(url('model.mjs'))+';\nimport {bindPeerTaskEffects as actual} from '+JSON.stringify(url('model.mjs'))+';\nexport const calls=[];\nexport function bindPeerTaskEffects(...args){calls.push(args);return actual(...args);}\n');
  const redirects={'./protected-codex-domain.mjs':domain,'./host-protocol.mjs':protocol,'./model.mjs':model};
  const source=original.replace(/from '(\.\/[^']+)'/g,(_whole,specifier)=>'from '+JSON.stringify(pathToFileURL(redirects[specifier]??path.resolve(path.dirname(production),specifier)).href));
  const file=path.join(root,'context-bootstrap-under-test.mjs');fs.writeFileSync(file,source+'\nexport {activeTurn as __testOnlyActiveTurn};\n');
  const [{__testOnlyActiveTurn:turn},{probe:domainProbe},{probe:protocolProbe},{calls:binderCalls}]=await Promise.all([import(pathToFileURL(file).href),import(pathToFileURL(domain).href),import(pathToFileURL(protocol).href),import(pathToFileURL(model).href)]);
  const child=new EventEmitter();child.pid=54322;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>true;domainProbe.child=child;
  const owner=Symbol('synthetic bootstrap owner'),native='11111111-1111-7111-8111-111111111111',stages=[],inspections=[],frames=[];
  const context={sha256:peerDigest('synthetic exact context'),text:'Synthetic exact context.'};
  const task={id:'synthetic-own-task',value:{status:'running',owner_principal_id:'cos-a',attempt:{id:'synthetic-own-attempt'}}};
  const admitted={receipt:{admitted:true,task,context},binding:{native_id:native,principal_id:'cos-a',generation:1,enrollment_id:'synthetic-enrollment'}};
  let turnStarted=false,closed=false,testFailure=null,stops=0;
  const send=frame=>child.stdout.emit('data',JSON.stringify(frame)+'\n');
  const close=()=>{if(closed)return;closed=true;queueMicrotask(()=>{child.stdout.emit('end');child.emit('close',0,null);});};
  child.stdin.end=close;
  child.stdin.write=line=>{
    const frame=JSON.parse(line);frames.push(frame);
    queueMicrotask(()=>{try{
      if(frame.method==='initialize')send({id:frame.id,result:{}});
      else if(frame.method==='thread/resume')send({id:frame.id,result:{thread:{id:native,sessionId:'22222222-2222-7222-8222-222222222222',parentThreadId:null,forkedFromId:null,turns:[],canAcceptDirectInput:true,ephemeral:false},cwd:launch.cwd,runtimeWorkspaceRoots:[launch.cwd],activePermissionProfile:{id:launch.profile_id},approvalPolicy:'never',instructionSources:launch.instruction_sources}});
      else if(frame.method==='turn/start'){
        turnStarted=true;send({id:frame.id,result:{turn:{id:'synthetic-current-turn',status:'inProgress'}}});
        const caps=protocolProbe.caps;caps.guard();
        assert.throws(()=>caps.client.inspect('task/get',{task_id:task.id}),code('AUTHENTICATION_REQUIRED'));
        assert.throws(()=>caps.client.execute('notice/create',{operation_id:'synthetic-dynamic-operation'}),code('AUTHENTICATION_REQUIRED'));
        close();
      }
    }catch(error){testFailure=error;child.emit('error',error);}});
    return true;
  };
  const originalClient={execute(){assert.fail('Dynamic mutation must never fall back to the original client');},inspect(action,args){
    inspections.push([action,args]);assert.equal(turnStarted,false);assert.equal(action,'task/context');assert.deepEqual(args,{task_id:task.id});
    // These are distinct from the internal exact own-task/context read. They
    // must hit dynamic guard stages even during the pre-turn window.
    assert.throws(()=>protocolProbe.caps.client.inspect('runtime/status',{}),code('SYNTHETIC_CALLBACK_INSPECT_HELD'));
    assert.throws(()=>protocolProbe.caps.client.inspect('task/get',{task_id:task.id}),code('SYNTHETIC_CALLBACK_INSPECT_HELD'));
    assert.throws(()=>protocolProbe.caps.client.inspect('task/get',{task_id:'other-task'}),code('SYNTHETIC_CALLBACK_INSPECT_HELD'));
    assert.throws(()=>protocolProbe.caps.client.inspect('task/context',{task_id:'other-task'}),code('SYNTHETIC_CALLBACK_INSPECT_HELD'));
    assert.throws(()=>protocolProbe.caps.client.inspect('task/context',{task_id:task.id,extra:true}),code('SYNTHETIC_CALLBACK_INSPECT_HELD'));
    assert.throws(()=>protocolProbe.caps.client.execute('notice/create',{}),code('SYNTHETIC_CALLBACK_EXECUTE_HELD'));
    return context;
  }};
  const report=await turn({owner,launch,admitted,context,protectedLaunch:{synthetic_test_only:true},effectSource:{stop(){stops++;}},callbackRestriction:'task-bound-effects',now:()=>0,
    limits:{total_ms:500,grace_ms:1,term_ms:1,kill_ms:1,frame_bytes:100000,wire_bytes:200000,transcript_bytes:200000},
    checks(stage){stages.push({stage,turn_started:turnStarted});
      if(stage==='callback_guard'&&!turnStarted)throw Object.assign(Error('Dynamic guard requires turn/start.'),{code:'SYNTHETIC_PRETURN_GUARD_HELD'});
      if(!turnStarted&&stage==='callback_inspect')throw Object.assign(Error('Dynamic inspection held.'),{code:'SYNTHETIC_CALLBACK_INSPECT_HELD'});
      if(!turnStarted&&stage==='callback_execute')throw Object.assign(Error('Dynamic mutation held.'),{code:'SYNTHETIC_CALLBACK_EXECUTE_HELD'});
      if(stage==='physical_close')throw Object.assign(Error('No genuine closure qualification.'),{code:'SYNTHETIC_CLOSURE_HELD'});
    },current(){},bind:()=>originalClient,spawn(){assert.fail('No stock/native child');},onSpawn(){},onQualifiedClose(){assert.fail('No native closure qualification');}});
  if(testFailure)throw testFailure;
  assert.equal(frames.filter(f=>f.method==='turn/start').length,1);assert.match(frames.find(f=>f.method==='turn/start').params.input[0].text,/Synthetic exact context/);
  assert.deepEqual(inspections,[['task/context',{task_id:task.id}]]);
  assert(stages.filter(s=>s.stage==='before_context'&&!s.turn_started).length>=3);
  assert.equal(stages.some(s=>s.stage==='callback_guard'&&!s.turn_started),false);
  assert(stages.some(s=>s.stage==='callback_guard'&&s.turn_started));
  assert.equal(binderCalls.length,2);assert.equal(domainProbe.observations.length,2);
  for(const [connection,selector,marker]of binderCalls){assert.equal(connection,originalClient);assert.deepEqual(selector,{task_id:task.id});assert.deepEqual(marker,{synthetic_marker_only:true});}
  assert.equal(report.error.code,'SYNTHETIC_CLOSURE_HELD');assert.equal(report.qualified_close,false);assert(stops>0);
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

// AUTHORED_UNRUN. These controls use the real executor observer implementation
// and an exact TEST COPY of the private activeTurn body. An in-process emitter
// is not a native child. Every turn stops before protocol/admission/binding;
// no admitted JSON, original issuer or ordinary-ready fixture is supplied.
// The full constructor -> genuine admission -> activeTurn positive remains
// PLANNED until the independently reviewed fresh Source pipeline is available.
async function observerTurnFixture(t,{close_on_end=false,qualify=false,partial_frame=false,emit_spawn=true,missing_protected_birth=false}={}){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-task-observer-SOURCE-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const production=fileURLToPath(new URL('../plugins/soloco/runtime/peers/codex-task-host.mjs',import.meta.url)),original=fs.readFileSync(production,'utf8'),peers=path.dirname(production);
  let domain;
  if(missing_protected_birth){
    domain=path.join(root,'missing-birth-TEST-domain.mjs');
    fs.writeFileSync(domain,'export * from '+JSON.stringify(pathToFileURL(path.join(peers,'protected-codex-domain.mjs')).href)+';\nexport const probe={child:null};\nexport function spawnOriginalProtectedCodex(){queueMicrotask(()=>probe.child.emit("spawn"));return probe.child;}\nexport function inspectOriginalProtectedCodexLaunch(){return {birth:null};}\n');
  }
  const source=original.replace(/from '(\.\/[^']+)'/g,(_whole,specifier)=>'from '+JSON.stringify(pathToFileURL(domain&&specifier==='./protected-codex-domain.mjs'?domain:path.resolve(peers,specifier)).href));
  const file=path.join(root,'task-observer-TEST-copy.mjs');fs.writeFileSync(file,source+'\nexport {activeTurn as __testOnlyActiveTurn};\n');
  const {__testOnlyActiveTurn:turn}=await import(pathToFileURL(file).href);
  const child=new EventEmitter(),births=[],pairs=[],processes=[],closures=[],reports=[],signals=[],stages=[];let spawns=0,qualified=0,writes=0;
  child.pid=54323;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();
  let stdoutEnded=false;
  const end=()=>{if(stdoutEnded)return;stdoutEnded=true;child.stdout.emit('end');};
  const close=()=>{end();child.emit('close',0,null);};
  child.stdin.write=()=>{writes++;assert.fail('Observer component control must stop before wire/protocol work');};
  child.stdin.end=()=>{if(close_on_end)queueMicrotask(close);};child.kill=name=>{signals.push(name);return true;};
  if(domain)(await import(pathToFileURL(domain).href)).probe.child=child;
  const executor=createNativeExecutor({cwd:root,evidence_dir:path.join(root,'evidence'),probe:()=>({available:false,authenticated:false}),
    runner:async(_host,_native,_prompt,_cwd,_timeout,_selection,options)=>{
      const report=await turn({owner:Symbol('SOURCE observer owner'),launch,context:{},now:()=>1000000,
        ...(missing_protected_birth?{protectedLaunch:{TEST_COPY_ONLY:true}}:{}),
        limits:{total_ms:30,grace_ms:1,term_ms:1,kill_ms:1,frame_bytes:1000,wire_bytes:2000,transcript_bytes:2000},
        spawn(){spawns++;queueMicrotask(()=>emit_spawn?child.emit('spawn'):close());return child;},
        checks(stage){
          stages.push(stage);
          if(stage==='child_spawned'){
            // Make decoder rejection the first retained error in this case;
            // the fallback stop still prevents protocol/admission work.
            if(partial_frame){child.stdout.emit('data','{');end();}
            throw Object.assign(Error('SOURCE stop before protocol/admission'),{code:'SOURCE_OBSERVER_STOP'});
          }
          if(stage==='physical_close'&&!qualify)throw Object.assign(Error('SOURCE closure qualification held'),{code:'SOURCE_CLOSURE_HELD'});
        },
        current(){},bind(){assert.fail('No admission/client binding is supplied');},
        onModelProcess:birth=>{births.push(birth);return options.onModelProcess(birth);},
        onModelClosure:(birth,receipt)=>{pairs.push({birth,receipt});return options.onModelClosure(birth,receipt);},
        onSpawn:options.onSpawn,onQualifiedClose(){qualified++;}});
      reports.push(report);assert.ok(report.error,'This component control cannot accept native output');
      throw Object.assign(Error(report.error.message),{code:report.error.code,termination_confirmed:report.qualified_close});
    }});
  const promise=executor.execute({task:{value:{role:'research'}},context:{text:'SOURCE observer plumbing only; no P1 admission.'},onProcess:packet=>processes.push(packet),onClosure:packet=>closures.push(packet)});
  return {child,close,promise,births,pairs,processes,closures,reports,signals,stages,get spawns(){return spawns;},get qualified(){return qualified;},get writes(){return writes;}};
}

test('unqualified actual TaskHost executor holds before spawn or lifecycle callbacks without changing its ledger',async t=>{
  const f=fixture(t),before=f.history(),usage=f.ledger.read(tx=>tx.get('control','usage')),runtime=createCodexTaskRuntime(f.args),processes=[],closures=[];
  const result=await runtime.executor.execute({task:{id:'SOURCE-absent-admission',value:{role:'research'}},context:{text:'Negative Source input; no admission is claimed.'},onProcess:packet=>processes.push(packet),onClosure:packet=>closures.push(packet)});
  assert.equal(result.error.code,'HOST_LEASE_CHANGED');assert.equal(result.observed_process,null);assert.equal(result.termination_confirmed,false);
  assert.deepEqual(processes,[]);assert.deepEqual(closures,[]);assert.deepEqual(f.counts,{admit:0,spawn:0,active:0});assert.deepEqual(f.history(),before);assert.deepEqual(f.ledger.read(tx=>tx.get('control','usage')),usage);
});

test('private TaskHost original emitter observations reach the real leaf before a closure qualifier throws',async t=>{
  const f=await observerTurnFixture(t,{close_on_end:true}),result=await f.promise;
  assert.equal(f.spawns,1);assert.equal(f.writes,0);assert.equal(f.births.length,1);assert.equal(f.pairs.length,1);assert.equal(f.pairs[0].birth,f.births[0]);assert.ok(Object.isFrozen(f.births[0]));assert.ok(Object.isFrozen(f.pairs[0].receipt));
  assert.deepEqual(f.births[0],{pid:54323,spawned_at:new Date(1000000).toISOString()});assert.equal(f.processes[0].pid,54323);assert.equal(f.closures.length,1);assert.equal(f.closures[0].close_observed,true);
  assert.equal(f.stages.filter(stage=>stage==='physical_close').length,1);assert.equal(f.qualified,0);assert.equal(f.reports[0].qualified_close,false);assert.equal(result.error.code,'SOURCE_OBSERVER_STOP');assert.equal(result.output,undefined);
  // The leaf's raw child close is not TaskHost whole-scope qualification.
});

test('private TaskHost raw close survives final decoder failure without claiming qualified closure',async t=>{
  const f=await observerTurnFixture(t,{close_on_end:true,partial_frame:true}),result=await f.promise;
  assert.equal(f.spawns,1);assert.equal(f.writes,0);assert.equal(f.births.length,1);
  assert.equal(f.pairs.length,1);assert.equal(f.pairs[0].birth,f.births[0]);assert.equal(f.closures.length,1);
  assert.equal(f.closures[0].close_observed,true);assert.equal(result.observed_process.close_observed,true);
  assert.equal(f.stages.filter(stage=>stage==='physical_close').length,1);assert.equal(f.qualified,0);
  assert.equal(f.reports[0].error.code,'WIRE_UNTERMINATED_FRAME');assert.equal(f.reports[0].qualified_close,false);
  assert.equal(f.reports[0].native_id,null);assert.equal(f.reports[0].output,null);
  assert.equal(result.error.code,'WIRE_UNTERMINATED_FRAME');assert.equal(result.output,undefined);assert.equal(result.result_evidence,undefined);
  // Raw leaf termination survives; it is neither accepted malformed output
  // nor TaskHost whole-scope qualification, which the private qualifier holds.
  assert.equal(result.termination_confirmed,true);
});

test('private TaskHost retains the original close listener after UNKNOWN without rewriting its first executor result',async t=>{
  const f=await observerTurnFixture(t,{qualify:true});f.child.emit('exit',0,null);const result=await f.promise,first={...result,observed_process:{...result.observed_process}};
  assert.equal(f.spawns,1);assert.equal(f.births.length,1);assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);assert.equal(f.qualified,0);assert.equal(f.pairs.length,0);assert.equal(f.closures.length,0);assert.equal(result.termination_confirmed,false);assert.equal(result.observed_process.close_observed,false);
  f.close();assert.equal(f.pairs.length,1);assert.equal(f.pairs[0].birth,f.births[0]);assert.equal(f.closures.length,1);assert.equal(f.qualified,1);assert.deepEqual(result,first);assert.equal(f.reports[0].qualified_close,false);
  f.close();assert.equal(f.pairs.length,1);assert.equal(f.closures.length,1);assert.equal(f.qualified,1);assert.deepEqual(result,first);
});

test('private TaskHost close without an observed birth cannot manufacture a process or qualification',async t=>{
  const f=await observerTurnFixture(t,{emit_spawn:false,qualify:true});await f.promise;
  assert.equal(f.spawns,1);assert.deepEqual(f.births,[]);assert.deepEqual(f.pairs,[]);assert.deepEqual(f.processes,[]);assert.deepEqual(f.closures,[]);assert.equal(f.qualified,0);assert.equal(f.reports[0].process,undefined);assert.equal(f.reports[0].qualified_close,false);assert.equal(f.writes,0);
});

test('private protected TaskHost missing facade birth remains UNKNOWN without a controlled spawn fallback',async t=>{
  const f=await observerTurnFixture(t,{missing_protected_birth:true,close_on_end:true}),result=await f.promise;
  assert.equal(f.spawns,0);assert.deepEqual(f.births,[]);assert.deepEqual(f.pairs,[]);assert.deepEqual(f.processes,[]);assert.deepEqual(f.closures,[]);assert.equal(f.qualified,0);assert.equal(f.reports[0].qualified_close,false);assert.equal(result.error.code,'HOST_PROCESS_UNOBSERVED');assert.equal(f.writes,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {createMembershipLifecycle} from '../plugins/soloco/runtime/peers/membership.mjs';
import {createPeerProductionRouter} from '../plugins/soloco/runtime/peers/production-router.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Real temporary P1/P2 ledgers, explicitly SYNTHETIC trusted runtime/provider
// handles. No child, CLI, model, original launch or native qualification occurs.
const code=expected=>error=>error?.code===expected;
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function fixture(t,options={}){
  const f=peerFixture({...options,principals:{...options.principals,founder:{
    legacy_owner:{host:'codex',session_id:'synthetic-protected-founder-session',epoch:1},...options.principals?.founder
  }}});t.after(()=>f.close());
  const owner=Symbol('synthetic protected owner'),membership=createMembershipLifecycle(f.ledger);
  let serial=0,pid=8100;
  const counters={readiness:[],prepares:[],stages:[],executions:[],stops:[]};
  const op=prefix=>prefix+'-'+(++serial);
  const run=(who,action,args)=>execute(f.ledger,{principal_id:who},action,{operation_id:op(action),...args});
  const history=()=>f.ledger.read(tx=>canonical(tx.events({after:0,limit:100})));
  const row=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
  const mutateControl=change=>f.ledger.write('synthetic.fixture','founder',tx=>{
    const c=tx.get('control','company');tx.put('control',c.id,{...c.value,...change},c.revision);
  });
  const enrollInput=(extra={})=>({operation_id:op('enroll'),enrollment_id:op('membership'),principal_id:op('incoming'),
    role:'cos',host:'codex',scope:'alpha',input_refs:[],expected_generation:0,max_model_calls:2,
    expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Synthetic protected operator instruction; not human authentication.',...extra});
  function syntheticStage(input){
    counters.stages.push(input);
    const admitted=membership.operator.admit({operation_id:op('admit'),enrollment_id:input.enrollment_id,phase:input.phase,
      ...(input.reviewer_principal_id?{reviewer_principal_id:input.reviewer_principal_id}:{})});
    const binding={enrollment_id:input.enrollment_id,phase:input.phase,attempt_id:admitted.phase.value.attempt_id};
    const observed_process={pid:++pid,started_at:new Date().toISOString()};
    membership.host.bind({operation_id:op('bind'),...binding,native_id:'synthetic-native-'+pid,observed_process});
    const channel=membership.host.channel(binding),header=channel.header();let offset=0;
    while(offset<header.total_characters){const part=channel.read({sha256:header.sha256,offset,length:Math.min(8192,header.total_characters-offset)});assert(part.next_offset>offset);offset=part.next_offset;}
    const output=input.phase==='review'?canonical({review:{subject:header.subject,verdict:'Pass',reason:'Independent synthetic unit-fixture review only.',blockers:[]}}):'Synthetic reconstruction retains exact current scope and uncertainty.';
    channel.submit({operation_id:op('submit'),sha256:header.sha256,content:output});
    return membership.host.finish({operation_id:op('finish'),...binding,output,termination_confirmed:true,observed_process:{...observed_process,close_observed:true}});
  }
  function handle(request,{stage=syntheticStage,execution}={}){
    const id=counters.prepares.length;
    return {runtime:{
      stage(token,input){assert.equal(token,owner);return stage(input);},
      executor:{execute(args){
        counters.executions.push(args);if(execution)return execution(args);
        const observed_process={pid:++pid,started_at:new Date().toISOString()};args.onProcess(observed_process);
        return {native_id:'synthetic-task-'+pid,output:'Synthetic bounded task output.',termination_confirmed:true,observed_process:{...observed_process,close_observed:true}};
      }}
    },stop(){counters.stops.push(id);}};
  }
  const provider={async readiness(args){counters.readiness.push(args);return {host:args.host,available:true,authenticated:true};},
    async prepare(request){counters.prepares.push(request);return handle(request);}};
  const router=(override=provider)=>createPeerProductionRouter({owner,ledger:f.ledger,provider:override});
  function submit(extra={}){
    if(!row('grants','synthetic-task-grant'))run('founder','grant/create',{grant_id:'synthetic-task-grant',to_principal_id:'cos-a',scope:'*',actions:['task/*'],resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Synthetic unit task authority.'});
    const task=run('cos-a','task/submit',{task_id:op('task'),grant_id:'synthetic-task-grant',scope:op('scope'),role:'research',instructions:'Return a bounded unit-fixture result.',acceptance:'Preserve synthetic provenance.',resources:[],...extra});
    run('cos-a','task/claim',{task_id:task.id});return task;
  }
  return {...f,owner,membership,counters,op,run,row,history,mutateControl,enrollInput,provider,router,handle,submit};
}
const stage=enrollment=>({enrollment_id:enrollment.value.enrollment_id,phase:'reconstruction',instruction:'Reconstruct exact bounded source; preserve uncertainty.'});
const activate=(f,enrollment)=>({operation_id:f.op('activate'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Synthetic protected operator activation.'});

test('the fixed provider is required and every route requires the original private owner token',async t=>{
  const f=fixture(t);
  assert.throws(()=>createPeerProductionRouter({owner:f.owner,ledger:f.ledger}),code('ROUTER_DEPENDENCY'));
  const r=f.router(),wrong=Symbol('wrong owner'),before=f.history();
  for(const [name,input]of [['enroll',f.enrollInput()],['stage',{enrollment_id:'absent',phase:'reconstruction',instruction:'Synthetic.'}],['activate',{}],['revoke',{}],['start',undefined],['tick',undefined]])assert.throws(()=>r[name](wrong,input),code('INSTRUCTION_OWNER'));
  for(const name of ['status','stop','drain'])await assert.rejects(r[name](wrong),code('INSTRUCTION_OWNER'));
  assert.equal(f.history(),before);assert.deepEqual(f.counters,{readiness:[],prepares:[],stages:[],executions:[],stops:[]});
  await r.stop(f.owner);
});

test('a legacy protocol cannot construct a router or fall back to a stock executor',t=>{
  const f=fixture(t);f.mutateControl({protocol:'legacy-single-owner'});const before=f.history();
  assert.throws(()=>f.router(),code('PROTOCOL_REQUIRED'));assert.equal(f.history(),before);
  assert.equal(f.counters.prepares.length,0);assert.equal(f.counters.executions.length,0);
});

test('operator routes derive the actual configured founder rather than the literal founder fixture',async t=>{
  const f=fixture(t),founderId='canonical-protected-founder';
  f.ledger.write('synthetic.custom-founder','founder',tx=>{
    const c=tx.get('control','company');tx.put('control',c.id,{...c.value,founder_principal_id:founderId},c.revision);
    tx.put('principals',founderId,{principal_id:founderId,kind:'founder',status:'active',generation:1,host:'codex',native_id:'synthetic-custom-founder',legacy_owner:{host:'codex',session_id:'synthetic-custom-founder-session',epoch:1}},0);
  });
  // The old active founder row still exists, but is no longer the canonical
  // operator. A default-literal implementation fails this actual enrollment.
  assert.equal(f.row('principals','founder').value.status,'active');
  const r=f.router(),enrollment=r.enroll(f.owner,f.enrollInput());
  assert.equal(enrollment.value.operator_ref.id,founderId);
  assert.equal(r.revoke(f.owner,{operation_id:f.op('revoke'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Synthetic canonical-founder revocation.'}).value.status,'revoked');
  assert.equal(f.counters.prepares.length,0);assert.equal(f.row('control','usage'),null);await r.stop(f.owner);
});

test('static unqualified readiness holds membership and tasks before usage or preparation',async t=>{
  const f=fixture(t),r=f.router({...f.provider,async readiness(args){f.counters.readiness.push(args);return {available:true,authenticated:false};}});
  const enrollment=r.enroll(f.owner,f.enrollInput()),task=f.submit(),before=f.history();
  await assert.rejects(r.stage(f.owner,stage(enrollment)),code('ROUTER_READINESS_HELD'));
  assert.equal(f.history(),before);assert.equal(f.row('control','usage'),null);
  await r.tick(f.owner);assert.equal(f.row('tasks',task.id).value.status,'pending');
  assert.equal(f.row('control','usage'),null);assert.equal(f.counters.prepares.length,0);
  await r.stop(f.owner);
});

test('pause holds stage and task scheduling without static probes or model charges',async t=>{
  const f=fixture(t),r=f.router(),enrollment=r.enroll(f.owner,f.enrollInput()),task=f.submit();
  f.run('founder','company/pause',{source_instruction:'Synthetic pause before any execution.'});const before=f.history();
  await assert.rejects(r.stage(f.owner,stage(enrollment)),code('ROUTER_MEMBERSHIP_HELD'));
  await r.tick(f.owner);assert.equal(f.row('tasks',task.id).value.status,'pending');
  assert.equal(f.history(),before);assert.equal(f.row('control','usage'),null);
  assert.equal(f.counters.readiness.length,0);assert.equal(f.counters.prepares.length,0);await r.stop(f.owner);
});

test('closed stage input rejects launch selectors before calling the provider',async t=>{
  const f=fixture(t),r=f.router(),enrollment=r.enroll(f.owner,f.enrollInput()),before=f.history();
  for(const extra of [{provider:{}},{launch:{}},{principal_id:'founder'},{instruction:''},{reviewer_principal_id:'reviewer'}])assert.throws(()=>r.stage(f.owner,{...stage(enrollment),...extra}),code('ROUTER_INPUT'));
  assert.equal(f.history(),before);assert.equal(f.counters.readiness.length,0);assert.equal(f.counters.prepares.length,0);await r.stop(f.owner);
});

test('activation requires real lifecycle reconstruction and independent review, with fresh phase runtimes',async t=>{
  const f=fixture(t),r=f.router(),enrollment=r.enroll(f.owner,f.enrollInput());
  assert.equal(enrollment.value.status,'pending');assert.equal(f.counters.prepares.length,0);
  assert.throws(()=>r.activate(f.owner,activate(f,enrollment)),code('PHASE_MISSING'));
  assert.equal((await r.stage(f.owner,stage(enrollment))).accepted,true);
  assert.throws(()=>r.activate(f.owner,activate(f,enrollment)),code('PHASE_MISSING'));
  await assert.rejects(r.stage(f.owner,{...stage(enrollment),phase:'review',reviewer_principal_id:enrollment.value.principal_id}),code('REVIEW_INDEPENDENCE'));
  assert.equal((await r.stage(f.owner,{...stage(enrollment),phase:'review',reviewer_principal_id:'reviewer'})).accepted,true);
  const accepted=r.activate(f.owner,activate(f,enrollment));assert.equal(accepted.principal.value.status,'active');
  assert.equal(f.counters.prepares.length,3);assert.deepEqual(f.counters.prepares.map(x=>x.kind),['membership','membership','membership']);
  assert.deepEqual(f.counters.stops,[1,2,3]);assert.equal(f.row('control','usage').value.model_calls,2);
  const s=await r.status(f.owner);assert.equal(s.router.prepared,0);assert.equal(s.router.stage_pending,false);
  assert.equal(Object.hasOwn(s.router,'native_accepted'),false);await r.stop(f.owner);
});

test('revocation delegates to the lifecycle and cannot activate the revoked enrollment',async t=>{
  const f=fixture(t),r=f.router(),enrollment=r.enroll(f.owner,f.enrollInput());
  const revoked=r.revoke(f.owner,{operation_id:f.op('revoke'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Synthetic bounded revocation.'});
  assert.equal(revoked.value.status,'revoked');assert.throws(()=>r.activate(f.owner,activate(f,enrollment)),code('ENROLLMENT_CLOSED'));
  assert.equal(f.counters.prepares.length,0);assert.equal(f.row('control','usage'),null);await r.stop(f.owner);
});

test('each admitted task prepares its own runtime and bypasses any stock executor',async t=>{
  const f=fixture(t),r=f.router(),tasks=[f.submit(),f.submit()];
  await r.tick(f.owner);await r.drain(f.owner);
  assert.equal(f.counters.prepares.length,2);assert.equal(f.counters.executions.length,2);
  assert.deepEqual(f.counters.prepares.map(x=>x.kind),['task','task']);
  assert.equal(new Set(f.counters.prepares.map(x=>x.task.value.attempt.id)).size,2);
  const founder=f.row('principals','founder');
  for(const task of tasks){
    const current=f.row('tasks',task.id),authority=current.value.attempt.effect_authority.production_authority;
    assert.equal(current.value.status,'returned');assert.equal(authority.protocol,'peer-production-authority-v1');
    assert.deepEqual(authority.founder,{family:'principals',id:founder.id,revision:founder.revision,sha256:founder.sha256});
    assert.deepEqual(authority.legacy_owner,founder.value.legacy_owner);
  }
  assert.equal(f.row('control','usage').value.model_calls,2);assert.equal(f.counters.stops.length,2);
  assert.equal((await r.status(f.owner)).router.prepared,0);await r.stop(f.owner);
});

function fakeLoop(t){
  const timers=[],cleared=[];
  t.mock.method(globalThis,'setInterval',(callback,ms)=>{
    const timer={callback,ms,unreferenced:false,unref(){this.unreferenced=true;}};timers.push(timer);return timer;
  });
  t.mock.method(globalThis,'clearInterval',timer=>{cleared.push(timer);});
  return {timers,cleared};
}

function changeFounder(f,{revisionOnly=false}={}){
  f.ledger.write('synthetic.founder-change','founder',tx=>{
    const c=tx.get('control','company'),p=tx.get('principals',c.value.founder_principal_id);
    if(revisionOnly){
      tx.put('principals',p.id,{...p.value,synthetic_transient_revision:true},p.revision);
      tx.put('principals',p.id,p.value,p.revision+1);
    }
    else{
      const id='replacement-canonical-founder';
      tx.put('principals',id,{principal_id:id,kind:'founder',status:'active',generation:1,host:'codex',native_id:'synthetic-replacement-founder',legacy_owner:{host:'codex',session_id:'synthetic-replacement-founder-session',epoch:2}},0);
      tx.put('control',c.id,{...c.value,founder_principal_id:id},c.revision);
    }
  });
}

test('the autonomous loop stops on an exact founder revision change before any new probe or charge',async t=>{
  const f=fixture(t),loop=fakeLoop(t),r=f.router();r.start(f.owner);await r.tick(f.owner);
  const task=f.submit(),old=f.row('principals','founder');changeFounder(f,{revisionOnly:true});
  assert.equal(f.row('principals','founder').sha256,old.sha256);assert.equal(f.row('principals','founder').revision,old.revision+2);
  const before=f.history();loop.timers[0].callback();await new Promise(resolve=>setImmediate(resolve));
  const state=await r.status(f.owner);assert.equal(state.router.stopped,true);assert.equal(state.router.authority_held,true);assert.equal(state.router.running,false);
  assert.equal(f.row('tasks',task.id).value.status,'pending');assert.equal(f.row('control','usage'),null);assert.equal(f.history(),before);
  assert.equal(f.counters.readiness.length,0);assert.equal(f.counters.prepares.length,0);assert.equal(loop.cleared.length,1);
  loop.timers[0].callback();await r.stop(f.owner);assert.equal(loop.cleared.length,1);
});

test('a canonical founder change during readiness holds membership and autonomous tasks before admission',async t=>{
  for(const kind of ['membership','task'])await t.test(kind,async t=>{
    const f=fixture(t),loop=fakeLoop(t),pending=deferred(),started=deferred();
    const r=f.router({...f.provider,async readiness(args){f.counters.readiness.push(args);started.resolve();return pending.promise;}});
    let work,task;
    if(kind==='membership')work=r.stage(f.owner,stage(r.enroll(f.owner,f.enrollInput())));
    else{task=f.submit();r.start(f.owner);work=r.tick(f.owner);}
    await started.promise;changeFounder(f);const before=f.history();pending.resolve({available:true,authenticated:true});
    if(kind==='membership')await assert.rejects(work,code('ROUTER_OPERATOR_CHANGED'));else await work;
    await r.drain(f.owner);assert.equal(f.row('control','usage'),null);assert.equal(f.counters.prepares.length,0);assert.equal(f.history(),before);
    const state=await r.status(f.owner);assert.equal(state.router.stopped,true);assert.equal(state.router.authority_held,true);assert.equal(state.router.running,false);
    if(task){assert.equal(f.row('tasks',task.id).value.status,'pending');assert.equal(loop.cleared.length,1);}
    await r.stop(f.owner);
  });
});

test('a founder change during membership preparation stops its eventual handle without staging or charges',async t=>{
  const f=fixture(t),pending=deferred(),started=deferred();
  const r=f.router({...f.provider,async prepare(request){f.counters.prepares.push(request);started.resolve();return pending.promise;}});
  const work=r.stage(f.owner,stage(r.enroll(f.owner,f.enrollInput())));await started.promise;
  changeFounder(f);const before=f.history();pending.resolve(f.handle(f.counters.prepares[0]));
  await assert.rejects(work,code('ROUTER_OPERATOR_CHANGED'));await r.drain(f.owner);
  assert.equal(f.counters.stages.length,0);assert.equal(f.counters.stops.length,1);assert.equal(f.row('control','usage'),null);assert.equal(f.history(),before);
  assert.equal((await r.status(f.owner)).router.authority_held,true);await r.stop(f.owner);assert.equal(f.counters.stops.length,1);
});

test('rejected readiness and preparation still check changed membership authority after their awaits',async t=>{
  for(const boundary of ['readiness','prepare'])await t.test(boundary,async t=>{
    const f=fixture(t),pending=deferred(),started=deferred(),provider={...f.provider};
    provider[boundary]=async()=>{started.resolve();return pending.promise;};
    const r=f.router(provider),work=r.stage(f.owner,stage(r.enroll(f.owner,f.enrollInput())));
    await started.promise;changeFounder(f);pending.reject(Object.assign(Error('Synthetic provider failure.'),{code:'SYNTHETIC_PROVIDER_FAILED'}));
    await assert.rejects(work,code('ROUTER_OPERATOR_CHANGED'));await r.drain(f.owner);
    const state=await r.status(f.owner);assert.equal(state.router.stopped,true);assert.equal(state.router.authority_held,true);
    assert.equal(f.counters.stages.length,0);assert.equal(f.counters.executions.length,0);assert.equal(f.row('control','usage'),null);await r.stop(f.owner);
  });
});

test('a founder change during task preparation stops all handles while preserving observations and charged reservations',async t=>{
  const f=fixture(t),loop=fakeLoop(t),pending=deferred(),started=deferred();let finishKnown;
  const r=f.router({...f.provider,async prepare(request){
    f.counters.prepares.push(request);
    if(f.counters.prepares.length===2){started.resolve();return pending.promise;}
    const handle=f.handle(request,{execution(args){
      const observed_process={pid:9601,started_at:new Date().toISOString(),close_observed:false};args.onProcess(observed_process);
      return new Promise(resolve=>{finishKnown=()=>resolve({native_id:'synthetic-authority-unknown',output:null,error:{code:'SYNTHETIC_STOP_UNKNOWN',message:'Synthetic stop has no close observation.'},termination_confirmed:false,observed_process});});
    }}),stop=handle.stop;handle.stop=()=>{stop();finishKnown();};return handle;
  }});
  f.submit();f.submit();r.start(f.owner);const tick=r.tick(f.owner);await started.promise;
  assert.equal(f.row('control','usage').value.model_calls,2);changeFounder(f);pending.resolve(f.handle(f.counters.prepares[1]));
  await tick;const drained=await r.drain(f.owner);await r.stop(f.owner);
  assert.equal(f.counters.executions.length,1);assert.deepEqual([...f.counters.stops].sort(),[1,2]);
  const observedTask=f.counters.executions[0].task.id,unobservedTask=f.counters.prepares[1].task.id;
  // The former execution can still journal actual process/result observations
  // after the authority fence. The latter has no invented process or closure.
  assert.equal(f.row('slots',observedTask).value.status,'unknown');assert.equal(f.row('tasks',observedTask).value.result.termination_confirmed,false);
  assert.equal(f.row('slots',unobservedTask).value.status,'active');assert.equal(f.row('tasks',unobservedTask).value.result,undefined);
  assert.equal(f.row('control','usage').value.model_calls,2);assert.equal(drained.physical_closure,false);assert.equal(drained.company_active_or_unknown_slots,2);
  const state=await r.status(f.owner);assert.equal(state.router.stopped,true);assert.equal(state.router.authority_held,true);assert.equal(state.router.prepared,0);assert.equal(loop.cleared.length,1);
});

test('repeated start owns one unreferenced loop and overlapping ticks never duplicate a task execution',async t=>{
  const f=fixture(t),loop=fakeLoop(t),jobs=[];
  const r=f.router({...f.provider,async prepare(request){f.counters.prepares.push(request);return f.handle(request,{execution(args){
    const observed_process={pid:9500+jobs.length,started_at:new Date().toISOString()};args.onProcess(observed_process);
    return new Promise(resolve=>jobs.push({args,finish(){resolve({native_id:'synthetic-loop-'+args.task.id,output:'Synthetic loop output.',termination_confirmed:true,observed_process:{...observed_process,close_observed:true}});}}));
  }});}});
  for(let i=0;i<3;i++)f.submit();
  assert.deepEqual(r.start(f.owner),{started:true});assert.deepEqual(r.start(f.owner),{started:true});
  assert.equal(loop.timers.length,1);assert.equal(loop.timers[0].ms,500);assert.equal(loop.timers[0].unreferenced,true);
  await r.tick(f.owner);assert.equal(jobs.length,3);
  for(let i=0;i<5;i++)loop.timers[0].callback();await r.tick(f.owner);
  assert.equal(jobs.length,3);assert.equal(new Set(jobs.map(x=>x.args.task.value.attempt.id)).size,3);
  assert.equal(f.row('control','usage').value.model_calls,3);assert.equal((await r.status(f.owner)).router.running,true);
  await r.stop(f.owner);assert.equal(loop.cleared.length,1);assert.equal(loop.cleared[0],loop.timers[0]);
  assert.throws(()=>r.start(f.owner),code('ROUTER_STOPPED'));assert.equal(loop.timers.length,1);
  loop.timers[0].callback();for(const job of jobs)job.finish();await r.drain(f.owner);
  assert.equal(jobs.length,3);assert.equal((await r.status(f.owner)).router.running,false);
});

test('starting the loop preserves pause and static readiness holds before any admission',async t=>{
  for(const paused of [true,false])await t.test(paused?'paused':'unqualified',async t=>{
    const f=fixture(t),loop=fakeLoop(t);
    const r=f.router({...f.provider,async readiness(args){f.counters.readiness.push(args);return {available:false,authenticated:false};}});
    const task=f.submit();if(paused)f.run('founder','company/pause',{source_instruction:'Synthetic loop pause.'});
    r.start(f.owner);await r.tick(f.owner);loop.timers[0].callback();await r.tick(f.owner);
    assert.equal(f.row('tasks',task.id).value.status,'pending');assert.equal(f.row('control','usage'),null);
    assert.equal(f.counters.prepares.length,0);assert.equal(f.counters.executions.length,0);
    assert.equal(f.counters.readiness.length,paused?0:2);await r.stop(f.owner);
  });
});

test('stop fences a late membership preparation and stage is single-flight',async t=>{
  const f=fixture(t),pending=deferred(),started=deferred();
  const r=f.router({...f.provider,async prepare(request){f.counters.prepares.push(request);started.resolve();return pending.promise;}});
  const enrollment=r.enroll(f.owner,f.enrollInput()),before=f.history(),work=r.stage(f.owner,stage(enrollment));
  await started.promise;assert.throws(()=>r.stage(f.owner,stage(enrollment)),code('ROUTER_STAGE_BUSY'));
  const stop=await r.stop(f.owner);assert.equal(stop.pending_preparations,1);
  pending.resolve(f.handle(f.counters.prepares[0]));await assert.rejects(work,code('ROUTER_STOPPED'));await r.drain(f.owner);
  assert.equal(f.counters.stages.length,0);assert.equal(f.counters.stops.length,1);assert.equal(f.history(),before);
  await r.stop(f.owner);assert.equal(f.counters.stops.length,1);
  assert.throws(()=>r.tick(f.owner),code('ROUTER_STOPPED'));assert.throws(()=>r.enroll(f.owner,f.enrollInput()),code('ROUTER_STOPPED'));
});

test('stop during admitted task preparation prevents execution and retains its unobserved reservation',async t=>{
  const f=fixture(t),pending=deferred(),started=deferred();
  const r=f.router({...f.provider,async prepare(request){f.counters.prepares.push(request);started.resolve();return pending.promise;}}),task=f.submit();
  await r.tick(f.owner);await started.promise;
  assert.equal(f.row('control','usage').value.model_calls,1);assert.equal((await r.stop(f.owner)).pending_preparations,1);
  pending.resolve(f.handle(f.counters.prepares[0]));const drained=await r.drain(f.owner);
  assert.equal(f.counters.executions.length,0);assert.equal(f.counters.stops.length,1);
  assert.equal(drained.physical_closure,false);assert.equal(drained.company_active_or_unknown_slots,1);
  // No process was observed, so the existing scheduler deliberately cannot
  // manufacture a task/process or task/finish observation. Preserve active.
  assert.equal(f.row('slots',task.id).value.status,'active');assert.equal(f.row('tasks',task.id).value.result,undefined);
  assert.equal((await r.status(f.owner)).local_attempts[0].phase,'no_process_held');
  assert.equal(f.row('control','usage').value.model_calls,1);
});

test('uncertain runtime closure is not converted into closure by stopping its retained handle',async t=>{
  const f=fixture(t);
  const r=f.router({...f.provider,async prepare(request){f.counters.prepares.push(request);return f.handle(request,{execution(args){
    const observed_process={pid:9401,started_at:new Date().toISOString(),close_observed:false};args.onProcess(observed_process);
    return {native_id:'synthetic-uncertain',output:null,error:{code:'SYNTHETIC_CLOSURE_UNKNOWN',message:'No synthetic close observed.'},termination_confirmed:false,observed_process};
  }});}}),task=f.submit();
  await r.tick(f.owner);const drained=await r.drain(f.owner);await r.stop(f.owner);
  assert.equal(f.counters.stops.length,1);assert.equal(drained.physical_closure,false);
  assert.equal(f.row('slots',task.id).value.status,'unknown');assert.equal(f.row('control','usage').value.model_calls,1);
  const s=await r.status(f.owner);assert.equal(s.available_slots,2);assert.equal(s.router.stopped,true);
});

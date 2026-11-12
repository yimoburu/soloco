import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {bindPeerProductionScheduler,createRuntimeObserver,digest,execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {createMembershipLifecycle} from '../plugins/soloco/runtime/peers/membership.mjs';
import {PeerScheduler} from '../plugins/soloco/runtime/peers/scheduler.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Actual SQLite and membership state transitions with explicitly SYNTHETIC
// native/process observations. No native sessions, human authentication,
// production enrollment or actual process/domain qualification is established.
const actor=principal_id=>({principal_id});
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const code=expected=>error=>error?.code===expected;

function state(f){
  const tables=f.ledger.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({name})=>[name,f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>JSON.parse(JSON.stringify(row))).sort((a,b)=>canonical(a).localeCompare(canonical(b)))]));
}
function unchanged(f,operation,predicate){const before=state(f);assert.throws(operation,predicate);assert.deepEqual(state(f),before);}
function fixture(t,options={}){
  const f=peerFixture(options);t.after(()=>f.close());
  let n=0,pid=15000;
  f.op=prefix=>`${prefix}-${++n}`;
  f.get=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
  f.rows=(family,filters={})=>f.ledger.read(tx=>{
    const rows=[];let cursor;
    for(;;){const page=tx.list(family,{...filters,limit:100,...(cursor?{cursor}:{})});rows.push(...page.items);if(page.complete)return rows;cursor=page.next_cursor;assert.ok(cursor);}
  });
  f.update=(family,id,change)=>f.ledger.write('synthetic-negative-fixture','founder',tx=>{const row=tx.get(family,id);return tx.put(family,id,change(row.value),row.revision);});
  f.run=(who,action,args)=>execute(f.ledger,actor(who),action,{operation_id:f.op(action),...args});
  f.membership=createMembershipLifecycle(f.ledger);
  f.enrollment=f.membership.operator.enroll({operation_id:f.op('enroll'),enrollment_id:'assignment-enrollment',principal_id:'assignment-peer',role:'cos',host:'codex',scope:'alpha',input_refs:[],expected_generation:0,max_model_calls:2,expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional founder requests bounded source-only peer qualification.'});

  function phase(name){
    const admission=f.membership.operator.admit({operation_id:f.op('admit'),enrollment_id:'assignment-enrollment',phase:name,...(name==='review'?{reviewer_principal_id:'reviewer'}:{})});
    const binding={enrollment_id:'assignment-enrollment',phase:name,attempt_id:admission.phase.value.attempt_id};
    const process={pid:++pid,started_at:new Date().toISOString()},native_id=`SYNTHETIC-assignment-${name}`;
    f.membership.host.bind({operation_id:f.op('bind'),...binding,native_id,observed_process:process});
    const channel=f.membership.host.channel(binding),header=channel.header();let offset=0,text='';
    while(offset<header.total_characters){
      const page=channel.read({sha256:header.sha256,offset,length:Math.min(8192,header.total_characters-offset)});
      assert.equal(page.offset,offset);assert.equal(page.sha256,header.sha256);assert.ok(page.next_offset>offset);
      text+=page.text;offset=page.next_offset;assert.equal(page.complete,offset===header.total_characters);
    }
    assert.equal(digest(text),header.sha256);
    const output=name==='review'?canonical({review:{subject:header.subject,verdict:'Pass',reason:'Independent SYNTHETIC unit qualification; no native authentication or host approval.',blockers:[]}}):'SYNTHETIC reconstruction retains the complete scope, original limits, failures, uncertainty and next permitted action.';
    channel.submit({operation_id:f.op('submit'),sha256:header.sha256,content:output});
    const result=f.membership.host.finish({operation_id:f.op('finish'),...binding,output,termination_confirmed:true,observed_process:{...process,close_observed:true}});
    assert.equal(result.accepted,true);
    return {admission,result,native_id};
  }
  f.reconstruction=phase('reconstruction');f.qualification=phase('review');
  f.activated=f.membership.operator.activate({operation_id:f.op('activate'),enrollment_id:'assignment-enrollment',source_instruction:'Fictional source-only operator accepts the exact synthetic qualification.'});
  f.recipient=f.activated.principal.id;
  f.client=f.membership.host.activeClient({enrollment_id:'assignment-enrollment'});
  f.grant=(args={})=>f.run('founder','grant/create',{grant_id:f.op('grant-id'),to_principal_id:f.recipient,scope:'alpha',actions:['task/submit','task/claim'],resources:[{kind:'home',id:'assignment-home'}],max_model_calls:10,expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional founder permits bounded recipient tasks.',...args});
  f.authority=f.grant();
  f.request=(args={})=>({operation_id:f.op('assign'),task_id:f.op('assigned-task'),to_principal_id:f.recipient,source_instruction:'Fictional actual founder delegates this task without acting as the peer.',grant_id:f.authority.id,scope:'alpha',role:'engineer',stage:'produce',instructions:'Prepare source evidence within the existing task scope.',acceptance:'Return attributable evidence for independent review.',resources:[{kind:'home',id:'assignment-home'}],...args});
  f.assign=args=>execute(f.ledger,actor('founder'),'task/assign',f.request(args));
  return f;
}

test('actual founder assigns a mechanically qualified recipient without impersonation or a model charge',t=>{
  const f=fixture(t),beforeGlobal=f.get('control','usage'),beforePersonal=f.get('control',`usage:${f.recipient}`),beforeGrant=f.get('grants',f.authority.id),beforeSlots=f.rows('slots'),beforeEffects=f.rows('effects');
  const request=f.request(),task=execute(f.ledger,actor('founder'),'task/assign',request);
  assert.equal(task.value.owner_principal_id,f.recipient);assert.equal(task.value.principal_id,f.recipient);
  assert.equal(task.value.definition.owner_principal_id,f.recipient);assert.equal(task.value.grant_id,f.authority.id);
  assert.equal(task.value.status,'pending');assert.equal(task.value.attempt,null);
  assert.deepEqual(task.value.assignment.operator,ref('principals',f.get('principals','founder')));
  assert.equal(task.value.assignment.operation_id,request.operation_id);assert.equal(task.value.assignment.source_instruction,request.source_instruction);
  assert.deepEqual(task.value.assignment,task.value.definition.assignment);
  const command=f.rows('commands').find(row=>row.value.action==='task/assign');
  assert.equal(command.value.principal_id,'founder');assert.equal(command.value.result.id,task.id);
  assert.deepEqual(f.get('control','usage'),beforeGlobal);assert.deepEqual(f.get('control',`usage:${f.recipient}`),beforePersonal);assert.deepEqual(f.get('grants',f.authority.id),beforeGrant);
  assert.deepEqual(f.rows('slots'),beforeSlots);assert.deepEqual(f.rows('effects'),beforeEffects);
  const claims=f.rows('claims',{task_id:task.id,status:'held'});
  assert.equal(claims.length,1);assert.equal(claims[0].value.principal_id,f.recipient);
  assert.deepEqual(claims[0].value.resource,task.value.resources[0]);
  assert.equal(f.rows('commands').some(row=>row.value.action==='task/claim'),false);
  const admitted=f.run('scheduler','task/admit',{task_id:task.id});
  assert.equal(admitted.admitted,true);assert.equal(admitted.task.value.owner_principal_id,f.recipient);
  assert.equal(admitted.context.principal.id,f.recipient);assert.deepEqual(admitted.context.task.definition.assignment,task.value.assignment);
  assert.equal(f.get('control','usage').value.model_calls,beforeGlobal.value.model_calls+1);
  assert.equal(f.get('control',`usage:${f.recipient}`).value.model_calls,beforePersonal.value.model_calls+1);
  assert.equal(f.get('grants',f.authority.id).value.used_model_calls,1);
});

test('founder assignment reaches the bound production scheduler without a recipient claim',async t=>{
  const f=fixture(t,{principals:{founder:{legacy_owner:{host:'codex',session_id:'SYNTHETIC-assignment-founder',epoch:1}}}}),production=bindPeerProductionScheduler(f.ledger);
  const beforeGlobal=f.get('control','usage'),beforePersonal=f.get('control',`usage:${f.recipient}`),beforeGrant=f.get('grants',f.authority.id),beforeSlots=f.rows('slots');
  const request=f.request(),task=production.execute(f.ledger,actor('founder'),'task/assign',request);
  assert.equal(task.value.status,'pending');assert.equal(task.value.attempt,null);
  assert.deepEqual(f.get('control','usage'),beforeGlobal);assert.deepEqual(f.get('control',`usage:${f.recipient}`),beforePersonal);
  assert.deepEqual(f.get('grants',f.authority.id),beforeGrant);assert.deepEqual(f.rows('slots'),beforeSlots);
  assert.equal(f.rows('claims',{task_id:task.id,status:'held'}).length,1);
  const launches=[];let finish;
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'scheduler',observer:createRuntimeObserver(f.ledger),model:production,readiness_ms:0,
    executor:{
      async probe({task:pending}){assert.equal(pending.id,task.id);assert.equal(pending.value.status,'pending');return {available:true,authenticated:true};},
      execute(args){
        launches.push(args);
        const process={pid:15100,started_at:new Date().toISOString()};args.onProcess(process);
        return new Promise(resolve=>{finish=()=>resolve({native_id:'SYNTHETIC-assignment-task',output:'SYNTHETIC scheduler output with exact task attribution.',termination_confirmed:true,observed_process:{...process,close_observed:true}});});
      }
    }});
  try{
    const tick=await scheduler.tick();assert.equal(tick.admitted,1);assert.equal(tick.launched,1);
    assert.equal(launches.length,1);assert.equal(launches[0].task.id,task.id);
    assert.equal(launches[0].context.principal.id,f.recipient);assert.deepEqual(launches[0].context.task.definition.assignment,task.value.assignment);
    assert.equal(launches[0].task.value.attempt.effect_authority.production_authority.founder.id,'founder');
    assert.equal(f.get('control','usage').value.model_calls,beforeGlobal.value.model_calls+1);
    assert.equal(f.get('control',`usage:${f.recipient}`).value.model_calls,beforePersonal.value.model_calls+1);
    assert.equal(f.get('grants',f.authority.id).value.used_model_calls,beforeGrant.value.used_model_calls+1);
    assert.equal(f.rows('commands').some(row=>row.value.action==='task/claim'),false);
    assert.equal(f.rows('claims',{task_id:task.id,status:'held'}).length,1);
  }finally{scheduler.stop({abort_running:false});finish?.();await scheduler.drain();}
  assert.equal(f.get('tasks',task.id).value.status,'returned');
  assert.equal(f.get('slots',task.id).value.status,'released');
});

test('overlapping resources roll back the complete assignment without a model charge',t=>{
  const f=fixture(t),first=f.assign(),request=f.request();
  const beforeGlobal=f.get('control','usage'),beforePersonal=f.get('control',`usage:${f.recipient}`),beforeGrant=f.get('grants',f.authority.id),beforeSlots=f.rows('slots');
  assert.equal(f.rows('claims',{task_id:first.id,status:'held'}).length,1);
  unchanged(f,()=>execute(f.ledger,actor('founder'),'task/assign',request),code('RESOURCE_BUSY'));
  assert.equal(f.get('tasks',request.task_id),null);assert.equal(f.rows('tasks').length,1);
  assert.deepEqual(f.get('control','usage'),beforeGlobal);assert.deepEqual(f.get('control',`usage:${f.recipient}`),beforePersonal);
  assert.deepEqual(f.get('grants',f.authority.id),beforeGrant);assert.deepEqual(f.rows('slots'),beforeSlots);
});

test('ordinary recipient submission remains planned until its explicit resource claim',t=>{
  const f=fixture(t),beforeGlobal=f.get('control','usage'),beforePersonal=f.get('control',`usage:${f.recipient}`);
  const task=f.client.execute('task/submit',{operation_id:f.op('submit'),task_id:f.op('ordinary-task'),grant_id:f.authority.id,scope:'alpha',role:'engineer',stage:'produce',instructions:'SYNTHETIC ordinary recipient task.',acceptance:'Keep explicit submission and claiming separate.',resources:[{kind:'home',id:'assignment-home'}]});
  assert.equal(task.value.status,'planned');assert.equal(task.value.attempt,null);assert.equal(Object.hasOwn(task.value,'assignment'),false);
  assert.equal(f.rows('claims',{task_id:task.id}).length,0);
  const pending=f.client.execute('task/claim',{operation_id:f.op('claim'),task_id:task.id});
  assert.equal(pending.value.status,'pending');assert.equal(f.rows('claims',{task_id:task.id,status:'held'}).length,1);
  assert.deepEqual(f.get('control','usage'),beforeGlobal);assert.deepEqual(f.get('control',`usage:${f.recipient}`),beforePersonal);
});

test('assignment replay is idempotent and mismatched reuse cannot create another task',t=>{
  const f=fixture(t),request=f.request(),task=execute(f.ledger,actor('founder'),'task/assign',request),after=state(f);
  assert.deepEqual(execute(f.ledger,actor('founder'),'task/assign',request),task);assert.deepEqual(state(f),after);
  unchanged(f,()=>execute(f.ledger,actor('founder'),'task/assign',{...request,task_id:'different-task'}),code('REPLAY_MISMATCH'));
  unchanged(f,()=>execute(f.ledger,actor('founder'),'task/assign',{...request,to_principal_id:'cos-b'}),code('REPLAY_MISMATCH'));
  assert.equal(f.rows('tasks').length,1);
});

test('nonfounder principals and the qualified recipient cannot assign work or replay the founder operation',t=>{
  const f=fixture(t),request=f.request();execute(f.ledger,actor('founder'),'task/assign',request);
  for(const who of ['cos-a','scheduler','publisher'])unchanged(f,()=>execute(f.ledger,actor(who),'task/assign',request),code('FOUNDER_REQUIRED'));
  unchanged(f,()=>f.client.execute('task/assign',request),code('FOUNDER_REQUIRED'));
});

test('founder authority is checked before replay after the operator role changes',t=>{
  const f=fixture(t),request=f.request();execute(f.ledger,actor('founder'),'task/assign',request);
  f.update('principals','founder',value=>({...value,kind:'cos'}));
  unchanged(f,()=>execute(f.ledger,actor('founder'),'task/assign',request),code('FOUNDER_REQUIRED'));
});

test('identity injection fields cannot make a founder request execute as the recipient',t=>{
  const f=fixture(t);
  for(const key of ['actor','principal_id','session_id','runtime_observer','observer_capability'])unchanged(f,()=>f.assign({[key]:key==='actor'?actor(f.recipient):'forged'}),code('ACTOR_ARGUMENT'));
});

test('an ordinary active principal without actual membership qualification is not an assignable peer',t=>{
  const f=fixture(t);
  unchanged(f,()=>f.assign({to_principal_id:'cos-a'}),code('QUALIFICATION_REQUIRED'));
});

for(const status of ['pending','revoked'])test(`recipient ${status} state cannot receive an assignment`,t=>{
  const f=fixture(t);f.update('principals',f.recipient,value=>({...value,status}));
  unchanged(f,()=>f.assign(),code('PRINCIPAL_INACTIVE'));
});

for(const field of ['native_id','generation','membership_qualification'])test(`changed recipient ${field} cannot reuse the old activated qualification`,t=>{
  const f=fixture(t);f.update('principals',f.recipient,value=>({...value,[field]:field==='generation'?value.generation+1:field==='membership_qualification'?{...value.membership_qualification,sha256:'0'.repeat(64)}:'different-native'}));
  unchanged(f,()=>f.assign(),error=>['QUALIFICATION_REQUIRED','SOURCE_CHANGED'].includes(error?.code));
});

for(const which of ['qualification','reconstruction','index'])test(`current ${which} drift retains the exact qualification Hold`,t=>{
  const f=fixture(t);
  const id=which==='qualification'?f.activated.qualification.id:which==='reconstruction'?f.activated.enrollment.value.activation.reconstruction.id:`membership-index:${f.recipient}`;
  f.update('work_items',id,value=>({...value,status:which==='index'?'revoked':'failed'}));
  unchanged(f,()=>f.assign(),error=>['QUALIFICATION_REQUIRED','SOURCE_CHANGED'].includes(error?.code));
});

for(const alias of ['connection','enrollment-id','index-kind','index-principal'])test(`membership ${alias} must retain the exact original company and recipient binding`,t=>{
  const f=fixture(t);
  if(alias==='connection')f.update('work_items',f.activated.enrollment.id,value=>({...value,connection_sha256:'0'.repeat(64)}));
  else if(alias==='enrollment-id')f.update('work_items',f.activated.enrollment.id,value=>({...value,enrollment_id:'different-enrollment'}));
  else f.update('work_items',`membership-index:${f.recipient}`,value=>({...value,...(alias==='index-kind'?{kind:'different-kind'}:{principal_id:'different-principal'})}));
  unchanged(f,()=>f.assign(),code('QUALIFICATION_REQUIRED'));
});

test('coherently re-referenced non-Pass qualification remains ineligible',t=>{
  const f=fixture(t),qualification=f.update('work_items',f.activated.qualification.id,value=>({...value,review:{...value.review,verdict:'Fail',blockers:['SYNTHETIC retained failure.']}}));
  const principal=f.update('principals',f.recipient,value=>({...value,membership_qualification:ref('work_items',qualification)}));
  f.update('work_items',f.activated.enrollment.id,value=>({...value,activation:{...value.activation,principal:ref('principals',principal),qualification:ref('work_items',qualification)}}));
  unchanged(f,()=>f.assign(),code('QUALIFICATION_REQUIRED'));
});

test('coherently re-referenced shared-native qualification remains ineligible',t=>{
  const f=fixture(t),native=f.get('principals',f.recipient).value.native_id;
  const qualification=f.update('work_items',f.activated.qualification.id,value=>({...value,native_id:native}));
  const principal=f.update('principals',f.recipient,value=>({...value,membership_qualification:ref('work_items',qualification)}));
  f.update('work_items',f.activated.enrollment.id,value=>({...value,activation:{...value.activation,principal:ref('principals',principal),qualification:ref('work_items',qualification)}}));
  unchanged(f,()=>f.assign(),code('QUALIFICATION_REQUIRED'));
});

test('recipient grant must name the actual recipient and requested scope',t=>{
  const f=fixture(t),wrongOwner=f.grant({to_principal_id:'cos-a'}),wrongScope=f.grant({scope:'beta'});
  for(const grant of [wrongOwner,wrongScope])unchanged(f,()=>f.assign({grant_id:grant.id}),code('GRANT_INVALID'));
  unchanged(f,()=>f.assign({grant_generation:2}),code('GRANT_CHANGED'));
});

test('recipient grant must include task submission and the assigned resource',t=>{
  const f=fixture(t),wrongActions=f.grant({actions:['message/send']}),noResources=f.grant({resources:[]});
  unchanged(f,()=>f.assign({grant_id:wrongActions.id}),code('GRANT_INVALID'));
  unchanged(f,()=>f.assign({grant_id:noResources.id}),code('RESOURCE_AUTHORITY'));
  unchanged(f,()=>f.assign({resources:[{kind:'home',id:'outside-grant'}]}),code('RESOURCE_AUTHORITY'));
});

test('submit-only grant cannot create a pending assignment or acquire resources',t=>{
  const f=fixture(t),submitOnly=f.grant({actions:['task/submit']}),request=f.request({grant_id:submitOnly.id});
  const beforeGlobal=f.get('control','usage'),beforePersonal=f.get('control',`usage:${f.recipient}`);
  unchanged(f,()=>execute(f.ledger,actor('founder'),'task/assign',request),code('GRANT_INVALID'));
  assert.equal(f.get('tasks',request.task_id),null);assert.equal(f.rows('claims',{task_id:request.task_id}).length,0);
  assert.equal(f.rows('commands').some(row=>row.value.operation_id===request.operation_id),false);
  assert.deepEqual(f.get('control','usage'),beforeGlobal);assert.deepEqual(f.get('control',`usage:${f.recipient}`),beforePersonal);
});

test('actual revoked grant and expired grant cannot authorize a new assignment',t=>{
  const f=fixture(t),expiring=f.grant({expires_at:new Date(Date.now()+1000).toISOString()});
  f.run('founder','grant/revoke',{grant_id:f.authority.id});
  unchanged(f,()=>f.assign(),code('GRANT_INVALID'));
  const original=Date.now;
  try{Date.now=()=>Date.parse(expiring.value.expires_at);unchanged(f,()=>f.assign({grant_id:expiring.id}),code('GRANT_INVALID'));}
  finally{Date.now=original;}
});

test('actual recipient grant model-call exhaustion blocks another assignment without resetting usage',t=>{
  const f=fixture(t),limited=f.grant({max_model_calls:1}),task=f.assign({grant_id:limited.id});
  assert.equal(f.run('scheduler','task/admit',{task_id:task.id}).admitted,true);
  assert.equal(f.get('grants',limited.id).value.used_model_calls,1);
  unchanged(f,()=>f.assign({grant_id:limited.id}),code('MODEL_BUDGET'));
});

test('malformed recipient grant accounting cannot imply an unbounded assignment allowance',t=>{
  for(const malformed of [{used_model_calls:-1},{used_model_calls:0.5},{max_model_calls:0},{max_model_calls:1.5},{max_model_calls:undefined}]){
    const f=fixture(t);
    f.update('grants',f.authority.id,value=>{const next={...value,...malformed};if(next.max_model_calls===undefined)delete next.max_model_calls;return next;});
    unchanged(f,()=>f.assign(),code('MODEL_BUDGET'));
  }
});

for(const budget of ['global','personal','invalid-global'])test(`${budget} model allowance is enforced before creating an assigned task`,t=>{
  const f=fixture(t);
  if(budget==='invalid-global')f.update('control','usage',value=>({...value,model_calls:-1}));
  else{const used=f.get('control',budget==='global'?'usage':`usage:${f.recipient}`).value.model_calls;f.update('control','company',value=>({...value,policy:{...value.policy,...(budget==='global'?{max_model_calls:used}:{principal_model_calls:used})}}));}
  unchanged(f,()=>f.assign(),code('MODEL_BUDGET'));
});

for(const capacity of ['global','recipient'])test(`${capacity} pending queue capacity is enforced without consuming a native attempt`,t=>{
  const f=fixture(t);f.assign();
  f.update('control','company',value=>({...value,policy:{...value.policy,queue_limit:capacity==='global'?1:1000,principal_queue_limit:1}}));
  unchanged(f,()=>f.assign(),code('QUEUE_CAPACITY'));
});

test('paused company and held legacy origin cannot acquire a new assigned task',t=>{
  const f=fixture(t);
  f.run('founder','company/pause',{source_instruction:'SYNTHETIC founder pause.'});
  unchanged(f,()=>f.assign(),code('PAUSED'));
  f.run('founder','company/resume',{source_instruction:'SYNTHETIC founder resume.'});
  f.update('control','company',value=>({...value,legacy_ready:true}));
  unchanged(f,()=>f.assign(),code('AUTHORITY_CHANGED'));
});

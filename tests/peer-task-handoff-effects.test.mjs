import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPeerProductionScheduler,createRuntimeObserver,digest,execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {peerTaskEffectsFixture,actor,reference,rows,logicalSQLState} from './peer-task-effects-fixture.mjs';

// Actual temporary P1 transactions and original source-issued task/executor
// capabilities. Native/process observations are explicitly SYNTHETIC; no
// selected native profile, account or physical-domain qualification is claimed.
const code=expected=>error=>error?.code===expected;
const handoffFailure=error=>typeof error?.code==='string'&&(/HANDOFF|RECEIVER|SOURCE|TASK_AUTHORITY/.test(error.code)||error.code==='INVALID_INPUT');
function fixture(t){
  const f=peerTaskEffectsFixture(t,{peerFixtureOptions:{principals:{founder:{legacy_owner:{host:'codex',session_id:'SYNTHETIC-task-handoff-founder',epoch:1}}}}});
  f.facade=bindPeerProductionScheduler(f.ledger);let n=0;
  f.proposal=f.run('cos-b','home/propose',{grant_id:'grant-cos-b',scope:'alpha',home_id:'fact',expected_revision:0,content:'SYNTHETIC attributable handoff subject.'});
  f.receiverGrant=f.run('founder','grant/create',{grant_id:'task-handoff-receiver',to_principal_id:'cos-a',scope:'alpha',actions:['task/*','handoff/*','message/*','home/*'],resources:['home:fact','home:other'],expires_at:new Date(f.clock+3600000).toISOString(),source_instruction:'SYNTHETIC bounded task and receiver-decision authority.'});
  f.send=(extra={})=>f.facade.execute(f.ledger,actor('founder'),'handoff/send',{operation_id:'typed-source-handoff-'+(++n),to_principal_id:'cos-a',scope:'alpha',subject_ref:reference('proposals',f.proposal),governing_refs:[],evidence_refs:[],limitations:'Source mechanics only; receiving this work grants no execution or publication permission.',source_instruction:'SYNTHETIC founder directs this exact handoff.',...extra});
  f.handoff=f.send();
  f.typedStart=(extra={})=>f.start({grant_id:f.receiverGrant.id,handoff_ref:reference('work_items',f.handoff),...extra});
  f.decision=(action='handoff/accept',extra={})=>({operation_id:'typed-receiver-'+(++n),reason:action==='handoff/accept'?'SYNTHETIC receiver accepts this exact handoff.':'SYNTHETIC receiver rejects this exact handoff.',source_instruction:'Explicit SYNTHETIC receiver disposition within the admitted task.',...extra});
  return f;
}
function unchanged(f,fn,predicate){const before=logicalSQLState(f);assert.throws(fn,predicate);assert.deepEqual(logicalSQLState(f),before);}
function workState(f){return Object.fromEntries(['control','principals','grants','tasks','slots','claims','effects','work_items','homes','proposals','reviews','notices','messages','deliveries'].map(family=>[family,rows(f,family)]));}
function heldAdmission(f,expected){
  const receipt=rows(f,'commands').find(row=>row.value.action==='task/admit'&&row.value.result?.code===expected);
  assert(receipt);assert.equal(receipt.value.result.admitted,false);
  const event=f.ledger.events({after:0,limit:100}).items.at(-1);
  assert.equal(event.type,'task/admit');assert.equal(event.payload.changes.length,1);
  assert.equal(event.payload.changes[0].family,'commands');assert.equal(event.payload.changes[0].id,receipt.id);
}

for(const action of ['handoff/accept','handoff/reject'])test('original task-bound producer records only its admitted exact '+action,t=>{
  const f=fixture(t),a=f.typedStart(),definition=a.task.value.definition;
  assert.deepEqual(definition.handoff_ref,reference('work_items',f.handoff));
  assert.deepEqual(definition.handoff_envelope.value,f.handoff.value);
  assert.deepEqual(a.context.task.definition,definition);
  assert.deepEqual(Object.keys(a.context.task).sort(),['definition','definition_revision','definition_sha256','grant_generation','grant_id','id','owner_principal_id']);
  assert(a.context.sources.some(row=>row.family==='proposals'&&row.id===f.proposal.id));
  assert(!definition.input_refs.some(row=>row.family==='work_items'),'the typed seam does not broaden semantic inputs');
  const before={usage:f.get('control','usage'),grant:f.get('grants',f.receiverGrant.id),effect:f.get('effects',a.task.value.attempt.effect_id),slot:f.get('slots',a.task.id),claims:rows(f,'claims',{task_id:a.task.id})};
  const args=f.decision(action),decision=a.client.execute(action,args);
  assert.equal(decision.value.status,action==='handoff/accept'?'accepted':'rejected');
  assert.equal(decision.value.kind,'peer_handoff_disposition_v1');
  assert.deepEqual(decision.value.handoff_ref,reference('work_items',f.handoff));
  assert.equal(decision.value.receiver.id,'cos-a');assert.equal(decision.value.task_id,a.task.id);
  assert.equal(decision.value.attempt_id,a.task.value.attempt.id);assert.equal(decision.value.task_effect.task_id,a.task.id);
  assert.deepEqual(f.get('work_items',f.handoff.id),f.handoff,'a decision preserves the original handoff bytes');
  assert.equal(f.get('homes','fact'),null);assert.equal(rows(f,'notices').length,0);
  for(const [family,id,key] of [['control','usage','usage'],['grants',f.receiverGrant.id,'grant'],['effects',a.task.value.attempt.effect_id,'effect'],['slots',a.task.id,'slot']])assert.deepEqual(f.get(family,id),before[key]);
  assert.deepEqual(rows(f,'claims',{task_id:a.task.id}),before.claims);
  const stable=logicalSQLState(f);assert.deepEqual(a.client.execute(action,args),decision);assert.deepEqual(logicalSQLState(f),stable);
  assert.equal(f.connection.inspect('handoff/pending',{family:'work_items'}).items.length,0,'actual task-scoped command provenance qualifies the immutable receipt');
  const finished=f.finish(a);assert.equal(finished.accepted,true,'own decision preserves the original admitted envelope for final output');
});

test('a normal task cannot use the receiver verbs merely by naming a real handoff',t=>{
  const f=fixture(t),a=f.start({grant_id:f.receiverGrant.id});
  unchanged(f,()=>a.client.execute('handoff/accept',f.decision('handoff/accept',{handoff_ref:reference('work_items',f.handoff)})),handoffFailure);
});

test('task purpose cannot substitute another genuine handoff for the admitted one',t=>{
  const f=fixture(t),other=f.send(),a=f.typedStart();
  unchanged(f,()=>a.client.execute('handoff/accept',f.decision('handoff/accept',{handoff_ref:reference('work_items',other)})),handoffFailure);
  assert.equal(f.connection.inspect('handoff/pending',{family:'work_items'}).items.length,2);
});

test('caller supplied handoff envelopes cannot mint a typed task purpose',t=>{
  const f=fixture(t);
  unchanged(f,()=>f.submit({grant_id:f.receiverGrant.id,handoff_ref:reference('work_items',f.handoff),handoff_envelope:{protocol:'peer-task-handoff-envelope-v1',value:f.handoff.value}}),code('ACTOR_ARGUMENT'));
});

test('arbitrary work_items remain forbidden as ordinary semantic task inputs',t=>{
  const f=fixture(t);
  unchanged(f,()=>f.submit({grant_id:f.receiverGrant.id,input_refs:[reference('work_items',f.handoff)]}),code('SOURCE_INVALID'));
});

test('a different intended receiver cannot be assigned this typed purpose',t=>{
  const f=fixture(t),other=f.send({to_principal_id:'cos-b'});
  unchanged(f,()=>f.submit({grant_id:f.receiverGrant.id,handoff_ref:reference('work_items',other)}),handoffFailure);
});

test('an already decided handoff cannot silently consume a fresh task attempt',t=>{
  const f=fixture(t),decision=f.connection.execute('handoff/accept',f.decision('handoff/accept',{handoff_ref:reference('work_items',f.handoff),grant_id:f.receiverGrant.id}));
  assert.equal(decision.value.status,'accepted');
  unchanged(f,()=>f.submit({grant_id:f.receiverGrant.id,handoff_ref:reference('work_items',f.handoff)}),code('HANDOFF_DECIDED'));
  assert.equal(f.get('control','usage'),null);
});

test('a handoff decision made after submission holds admission without a charge',t=>{
  const f=fixture(t),task=f.submit({grant_id:f.receiverGrant.id,handoff_ref:reference('work_items',f.handoff)});
  f.run('cos-a','task/claim',{task_id:task.id});
  f.connection.execute('handoff/reject',f.decision('handoff/reject',{handoff_ref:reference('work_items',f.handoff),grant_id:f.receiverGrant.id}));
  const before=workState(f);let result,error;
  try{result=f.run('scheduler','task/admit',{task_id:task.id});}catch(caught){error=caught;}
  assert.equal(error?.code??result?.code,'HANDOFF_DECIDED');assert.deepEqual(workState(f),before);heldAdmission(f,'HANDOFF_DECIDED');
  assert.equal(f.get('tasks',task.id).value.attempt,null);assert.equal(f.get('control','usage'),null);
});

test('typed receiver authority does not enlarge the admitted task grant',t=>{
  const f=fixture(t),a=f.typedStart({grant_id:'grant-cos-a'});
  unchanged(f,()=>a.client.execute('handoff/accept',f.decision()),code('GRANT_INVALID'));
  assert.equal(f.get('control','usage').value.model_calls,1);
});

test('task lease expiry fences even the new receiver verbs and their replay',t=>{
  const f=fixture(t),a=f.typedStart(),args=f.decision();a.client.execute('handoff/accept',args);
  f.clock=Date.parse(a.task.value.attempt.effect_authority.expires_at);
  unchanged(f,()=>a.client.execute('handoff/accept',args),code('TASK_EFFECT_EXPIRED'));
  assert.equal(f.get('control','usage').value.model_calls,1);
});

test('task cancellation prevents receiver disposition and retains uncertain reservations',t=>{
  const f=fixture(t),a=f.typedStart();f.run('cos-a','task/cancel',{task_id:a.task.id});
  unchanged(f,()=>a.client.execute('handoff/reject',f.decision('handoff/reject')),code('TASK_INACTIVE'));
  assert.equal(f.get('slots',a.task.id).value.status,'active');assert.equal(rows(f,'claims',{task_id:a.task.id,status:'held'}).length,1);
  assert.equal(rows(f,'work_items').filter(row=>row.value.kind==='peer_handoff_disposition_v1').length,0);
});

test('a revoked original executor cannot decide a handoff',t=>{
  const f=fixture(t),a=f.typedStart();f.source.revoke(a.handle);
  unchanged(f,()=>a.client.execute('handoff/accept',f.decision()),error=>error?.code?.startsWith('EXECUTOR_'));
});

test('referenced own admission accounting cannot create an immediately stale charged task',t=>{
  const f=fixture(t),grant=f.get('grants',f.receiverGrant.id),handoff=f.send({governing_refs:[reference('grants',grant)]});
  const task=f.submit({grant_id:grant.id,handoff_ref:reference('work_items',handoff)});f.run('cos-a','task/claim',{task_id:task.id});
  const before=workState(f);let result,error;
  try{result=f.run('scheduler','task/admit',{task_id:task.id});}catch(caught){error=caught;}
  assert.equal(error?.code??result?.code,'SOURCE_CHANGED');assert.deepEqual(workState(f),before);heldAdmission(f,'SOURCE_CHANGED');
  assert.equal(f.get('tasks',task.id).value.attempt,null);assert.equal(f.get('control','usage'),null);
});

test('source route classification cannot admit a newly selected typed task through the legacy transaction path',t=>{
  const f=fixture(t),legacy=f.submit({resources:[]}),typed=f.submit({grant_id:f.receiverGrant.id,handoff_ref:reference('work_items',f.handoff),resources:[]});
  f.run('cos-a','task/claim',{task_id:legacy.id});f.run('cos-a','task/claim',{task_id:typed.id});
  const original=f.ledger.read;let armed=true,hits=0;
  f.ledger.read=function(callback){const result=original.call(this,callback);if(armed){armed=false;hits++;f.run('cos-a','task/cancel',{task_id:legacy.id},f.other);}return result;};
  try{assert.throws(()=>execute(f.ledger,actor('scheduler'),'task/admit',{operation_id:'typed-route-drift'}),code('SOURCE_CHANGED'));}
  finally{f.ledger.read=original;}
  assert.equal(hits,1);assert.equal(f.get('tasks',typed.id).value.attempt,null);assert.equal(f.get('control','usage'),null);
  const retry=f.run('scheduler','task/admit',{});assert.equal(retry.admitted,true);assert.equal(retry.task.id,typed.id);
  assert.equal(f.get('control','usage').value.model_calls,1);
});

test('the original handoff sender remains a contributor to receiver work while a distinct reviewer can assess it',t=>{
  const f=fixture(t),a=f.typedStart();a.client.execute('handoff/accept',f.decision());
  const produced=f.finish(a).task,subject=reference('tasks',produced);
  function review(who,grant_id){
    const task=f.run(who,'task/submit',{...(grant_id?{grant_id}:{}),scope:'alpha',role:'qa',stage:'review',review_of:subject,instructions:'Review this exact synthetic receiver result independently.',acceptance:'Return exact review JSON.',resources:[]});
    f.run(who,'task/claim',{task_id:task.id});const admitted=f.run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
    return {admitted,args:{task_id:task.id,attempt_id:admitted.task.value.attempt.id,output:canonical({review:{subject,verdict:'Pass',reason:'SYNTHETIC exact-source review.',blockers:[]}}),native_id:f.get('principals',who).value.native_id,termination_confirmed:true,observed_process:{pid:61000+(who==='founder'?1:2),started_at:admitted.task.value.attempt.admitted_at,close_observed:true}}};
  }
  const sender=review('founder');
  unchanged(f,()=>createRuntimeObserver(f.other).record('task/finish',{operation_id:'sender-cannot-review-own-handoff-contribution',...sender.args}),code('REVIEW_INDEPENDENCE'));
  f.run('founder','grant/create',{grant_id:'distinct-handoff-reviewer',to_principal_id:'reviewer',scope:'alpha',actions:['task/*'],resources:[],expires_at:new Date(f.clock+3600000).toISOString(),source_instruction:'SYNTHETIC independent reviewer scope.'});
  const independent=review('reviewer','distinct-handoff-reviewer');
  const result=createRuntimeObserver(f.other).record('task/finish',{operation_id:'distinct-reviewer-assesses-exact-handoff-result',...independent.args});
  assert.equal(result.accepted,true);assert.equal(result.review.value.verdict,'Pass');assert.equal(result.review.value.reviewer_principal_id,'reviewer');
});

test('typed admission uses the emitted lease cutoff even if the clock moved backwards during planning',t=>{
  const f=fixture(t),task=f.submit({grant_id:f.receiverGrant.id,handoff_ref:reference('work_items',f.handoff)});
  f.run('cos-a','task/claim',{task_id:task.id});
  const before=logicalSQLState(f),started=f.clock,actualExpiry=started+60000;
  const guarded=f.ledger.guardedWrite,query=f.ledger.query;let shifted=0,staged=0;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){return guarded.call(this,type,principal,tx=>{
    if(type==='task/admit'){shifted++;f.clock=started-60000;}return callback(tx);
  },terminal);};
  f.ledger.query=function(sql,...params){const statement=query.call(this,sql,...params);
    if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
    return new Proxy(statement,{get(target,key){if(key==='run')return(...args)=>{const result=target.run(...args);staged++;f.clock=actualExpiry;return result;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  };
  try{assert.throws(()=>f.run('scheduler','task/admit',{task_id:task.id}),code('TASK_EFFECT_EXPIRED'));}
  finally{f.ledger.guardedWrite=guarded;f.ledger.query=query;}
  assert.equal(shifted,1);assert.equal(staged,1);assert.deepEqual(logicalSQLState(f),before);
  assert.equal(f.get('tasks',task.id).value.attempt,null);assert.equal(f.get('control','usage'),null);
});

test('a caught late evidence write still rolls back a staged task-bound receiver decision',t=>{
  const f=fixture(t),a=f.typedStart(),before=logicalSQLState(f),guarded=f.ledger.guardedWrite;let hits=0,denied;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){return guarded.call(this,type,principal,tx=>{
    const result=callback(tx);
    if(type==='handoff/accept'){
      hits++;assert.equal(tx.get('work_items',result.id).value.status,'accepted');
      const proposal=tx.get('proposals',f.proposal.id);
      try{tx.put('proposals',proposal.id,{...proposal.value,content:'SYNTHETIC forbidden late replacement.'},proposal.revision);}catch(error){denied=error;}
    }
    return result;
  },terminal);};
  try{assert.throws(()=>a.client.execute('handoff/accept',f.decision()),code('AUTHORITY_CHANGED'));}
  finally{f.ledger.guardedWrite=guarded;}
  assert.equal(hits,1);assert.equal(denied?.code,'AUTHORITY_CHANGED');assert.deepEqual(logicalSQLState(f),before);
  assert.equal(f.get('slots',a.task.id).value.status,'active');assert.equal(f.get('effects',a.task.value.attempt.effect_id).value.status,'reserved');
});

test('the handoff sender cannot independently review a task-produced proposal',t=>{
  const f=fixture(t),a=f.typedStart({resources:['home:fact','home:other']});
  a.client.execute('handoff/accept',f.decision());
  const proposal=a.client.execute('home/propose',{operation_id:'typed-task-proposal',home_id:'other',expected_revision:0,content:'SYNTHETIC proposal produced under the exact handoff instructions.'});
  assert.equal(proposal.value.task_id,a.task.id);assert.equal(f.finish(a).accepted,true);
  const subject=reference('proposals',proposal);
  function review(who,grant_id){
    const task=f.run(who,'task/submit',{...(grant_id?{grant_id}:{}),scope:'alpha',role:'qa',stage:'review',review_of:subject,instructions:'Independently review the exact task-produced proposal.',acceptance:'Return exact review JSON.',resources:[]});
    f.run(who,'task/claim',{task_id:task.id});const admitted=f.run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
    return {task_id:task.id,attempt_id:admitted.task.value.attempt.id,output:canonical({review:{subject,verdict:'Pass',reason:'SYNTHETIC exact task-produced proposal review.',blockers:[]}}),native_id:f.get('principals',who).value.native_id,termination_confirmed:true,observed_process:{pid:62000+(who==='founder'?1:2),started_at:admitted.task.value.attempt.admitted_at,close_observed:true}};
  }
  const sender=review('founder');
  unchanged(f,()=>createRuntimeObserver(f.other).record('task/finish',{operation_id:'handoff-sender-cannot-review-task-proposal',...sender}),code('REVIEW_INDEPENDENCE'));
  f.run('founder','grant/create',{grant_id:'independent-task-proposal-reviewer',to_principal_id:'reviewer',scope:'alpha',actions:['task/*'],resources:[],expires_at:new Date(f.clock+3600000).toISOString(),source_instruction:'SYNTHETIC distinct proposal reviewer.'});
  const independent=review('reviewer','independent-task-proposal-reviewer');
  const result=createRuntimeObserver(f.other).record('task/finish',{operation_id:'independent-reviewer-can-review-task-proposal',...independent});
  assert.equal(result.accepted,true);assert.equal(result.review.value.verdict,'Pass');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {encodePeerOwnerSubject,decodePeerOwnerSubject} from '../plugins/soloco/runtime/peers/owner-context-pool.mjs';
import {logicalSQLState,rows} from './peer-task-effects-fixture.mjs';
import {ownerGateFixture,beginOwnerGate,disposeOwnerGateFixture,core,ref,prepare,qualify,recover} from './peer-owner-operating-gate-fixture.mjs';

// Actual temporary P1/model/owner-core commands with the existing explicitly
// SYNTHETIC native/deployment/origin fixture. No accepted-shaped owner records
// are seeded, no live company is read, and no native qualification is claimed.
// The preserved 0c7 counterexample still requires an explicit refresh; its
// original source and failed TAP are not rewritten by this regression suite.
test.after(disposeOwnerGateFixture);
const code=expected=>error=>error?.code===expected;
const refreshHold={changed:code('OWNER_SUBJECT_REFRESH_CHANGED'),closed:code('OWNER_HANDOVER_CLOSED')};
const epoch=8;
function unchanged(f,operation,predicate){const before=logicalSQLState(f);assert.throws(operation,predicate);assert.deepEqual(logicalSQLState(f),before);}
function handover(f){return f.get('work_items',f.get('control','company').value.owner_handover.id);}
function immutableBytes(f,exact){
  const row=f.ledger.db.prepare('SELECT bytes,sha256 FROM peer_versions WHERE family=? AND id=? AND revision=?').get(exact.family,exact.id,exact.revision);
  assert.equal(row.sha256,exact.sha256);return row.bytes;
}
function newFact(f,content='A new required source fact must be reconstructed explicitly.'){
  return f.client.execute('notice/create',{operation_id:f.op(),scope:'alpha',kind:'must_know',content});
}
function preview(f){return f.incoming.previewSubjectRefresh({epoch});}
function refreshArgs(f,p,extra={}){return {operation_id:f.op(),epoch,source_instruction:'Explicit SYNTHETIC pending-owner subject refresh; preserve every original limit and uncertain attempt.',previous_subject_ref:p.previous_subject_ref,preview_sha256:p.preview_sha256,...extra};}
function refresh(f,p=preview(f),extra={}){const args=refreshArgs(f,p,extra);return {args,result:f.incoming.refreshSubject(args)};}
function readPreview(f,p){
  let text='';for(let offset=0;offset<p.total_characters;offset+=1024){
    const part=f.incoming.readSubjectRefresh({epoch,preview_sha256:p.preview_sha256,offset,length:Math.min(1024,p.total_characters-offset)});
    assert.equal(part.offset,offset);text+=part.text;
  }
  assert.equal(text.length,p.total_characters);assert.equal(Buffer.byteLength(text),p.utf8_bytes);
  const encoded=JSON.parse(text);assert.equal(peerDigest(encoded),p.target_subject_sha256);
  return {text,encoded,body:encoded.protocol==='peer-owner-subject-context-pool-v1'?decodePeerOwnerSubject(encoded):encoded};
}
function readCurrentSubject(f){
  const info=f.incoming.inspect({epoch});let text='';
  for(let offset=0;offset<info.total_characters;offset+=1024){
    const part=f.incoming.read({operation_id:f.op(),epoch,sha256:info.subject_sha256,offset,length:Math.min(1024,info.total_characters-offset)});text+=part.text;
  }
  const encoded=JSON.parse(text);assert.equal(peerDigest(encoded),info.subject_sha256);
  return {info,text,encoded,body:encoded.protocol==='peer-owner-subject-context-pool-v1'?decodePeerOwnerSubject(encoded):encoded};
}
function retainedLimits(f){
  const h=handover(f).value;return {epoch:h.epoch,expires_at_ms:h.expires_at_ms,max_review_calls:h.max_review_calls,used_review_calls:h.used_review_calls,
    review_grant:h.review_grant,reviewer:h.reviewer,grant:f.get('grants','owner-review-grant'),usage:f.get('control','usage'),personal:f.get('control','usage:reviewer'),
    slots:rows(f,'slots'),effects:rows(f,'effects'),claims:rows(f,'claims')};
}
function sourceCounter(t){
  let admitted,uncertain;
  const f=ownerGateFixture(t,{prelude:f=>{
    admitted=f.start();uncertain=f.observe(admitted,'task/finish',{output:'Original uncertain source output.',error:'Original process closure not observed.',native_id:'cos-a-native',termination_confirmed:false});
  }});
  beginOwnerGate(f);assert.equal(f.incoming.inspect({epoch}).held,null);
  const old=handover(f),oldBytes=immutableBytes(f,old.value.subject_ref),resultBytes=canonical(uncertain.task.value.result);
  f.observe(admitted,'task/process');f.observe(admitted,'task/closure',{termination_confirmed:true});
  assert.equal(f.incoming.inspect({epoch}).held,'OWNER_SUBJECT_CHANGED');
  assert.equal(f.get('slots',admitted.task.id).value.status,'released');
  return Object.assign(f,{admitted,uncertain,old,oldBytes,resultBytes});
}
function afterFinalMetadata(f,change){
  const query=f.ledger.query;let hits=0;
  f.ledger.query=function(sql,...parameters){const statement=Reflect.apply(query,this,[sql,...parameters]);
    if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
    return new Proxy(statement,{get(target,key){if(key==='run')return(...values)=>{const result=target.run(...values);hits++;change();return result;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  };
  return {get hits(){return hits;},restore(){f.ledger.query=query;}};
}

test('actual original UNKNOWN then late protected process/closure can explicitly refresh, reconstruct and receive fresh independent QA',async t=>{
  const f=sourceCounter(t),before=retainedLimits(f),p=preview(f),prepared=readPreview(f,p);
  assert.deepEqual(p.previous_subject_ref,f.old.value.subject_ref);assert.equal(p.previous_subject_sha256,f.old.value.subject_sha256);
  assert.equal(p.original_deadline_at_ms,before.expires_at_ms);assert.equal(p.max_review_calls,before.max_review_calls);assert.equal(p.used_review_calls,before.used_review_calls);
  assert.equal(prepared.encoded.protocol,'peer-owner-subject-context-pool-v1');assert(p.utf8_bytes<=65536);assert(Buffer.byteLength(canonical(prepared.body))>65536,'this is the genuine formerly oversized complete source body');
  const current=prepared.body.current.find(row=>row.family==='tasks'&&row.id===f.admitted.task.id);
  assert(current);assert.equal(canonical(current.value.result),f.resultBytes);assert.deepEqual(current.value.attempt.context,f.admitted.context);
  assert.deepEqual(current.value.closure,f.get('tasks',f.admitted.task.id).value.closure);assert.equal(current.value.result.native_id,'cos-a-native');
  const first=refresh(f,p);assert.equal(first.result.status,'pending');assert.equal(first.result.epoch,epoch);
  assert.equal(first.result.authority_extended,false);assert.equal(first.result.old_reservations_released,false);
  assert.equal(first.result.subject_sha256,p.target_subject_sha256);assert.deepEqual(handover(f).value.subject_ref,first.result.subject_ref);
  assert.deepEqual(retainedLimits(f),before);assert.equal(immutableBytes(f,f.old.value.subject_ref),f.oldBytes);
  assert.equal(canonical(f.get('tasks',f.admitted.task.id).value.result),f.resultBytes);
  f.reconstruct('Changed reconstruction retains the original UNKNOWN result, original spend, actual later process and known closure; no refund or new allowance.');
  const q=await qualify(f);assert.equal(q.result.accepted,true);
  const active=f.incoming.activate({operation_id:f.op(),epoch,review_ref:q.result.result_ref,source_instruction:'SYNTHETIC source acceptance of this refreshed exact reconstruction.'});assert.equal(active.status,'activated');
  const resumed=f.incoming.resume({operation_id:f.op(),epoch,source_instruction:'SYNTHETIC dedicated resume after refreshed exact independent QA.'});assert.equal(resumed.paused,false);
  assert.equal(f.get('control','usage').value.model_calls,before.usage.value.model_calls+1,'only fresh independent QA consumes a new call');
  assert.equal(handover(f).value.expires_at_ms,before.expires_at_ms);assert.equal(handover(f).value.max_review_calls,before.max_review_calls);
  unchanged(f,()=>f.incoming.refreshSubject(first.args),refreshHold.closed);
});

test('refresh preview and complete candidate ranges are read-only and a real fact between preview and apply invalidates the CAS',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);newFact(f);const before=logicalSQLState(f),p=preview(f);readPreview(f,p);
  assert.deepEqual(logicalSQLState(f),before,'preview and range reads create neither coverage nor receipts');
  const args=refreshArgs(f,p);newFact(f,'A second actual required fact arrives after the exact preview.');
  unchanged(f,()=>f.incoming.refreshSubject(args),refreshHold.changed);
  assert.equal(f.incoming.inspect({epoch}).held,'OWNER_SUBJECT_CHANGED');
  const next=preview(f);assert.notEqual(next.preview_sha256,p.preview_sha256);assert.notEqual(next.target_subject_sha256,p.target_subject_sha256);
});

test('unchanged source heads cannot be refreshed merely because pooling changes the subject encoding hash',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);const h=handover(f),original=f.ledger.read(tx=>tx.getVersion(h.value.subject_ref)).value.body;
  assert.equal(original.protocol,'peer-owner-subject-v1');
  const before=logicalSQLState(f),pooled=encodePeerOwnerSubject(original);
  assert.notEqual(peerDigest(pooled),h.value.subject_sha256,'an encoding-only hash difference is not a changed source');
  unchanged(f,()=>preview(f),code('OWNER_SUBJECT_UNCHANGED'));assert.deepEqual(logicalSQLState(f),before);
});

test('refresh resets delivery but exact replay preserves subsequent coverage and cannot silently clear a later source change',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);f.reconstruct('Original reconstruction before later source facts.');
  const original=handover(f),oldReconstruction=original.value.reconstruction_ref,oldBytes=immutableBytes(f,oldReconstruction);newFact(f);
  const p=preview(f),first=refresh(f,p),h=handover(f);assert.deepEqual(h.value.reads,[]);assert.deepEqual(h.value.reconstruction_ref,oldReconstruction);
  assert.equal(immutableBytes(f,oldReconstruction),oldBytes);assert.equal(h.value.recovery_ref,null);assert.equal(h.value.recovery_delivery,null);
  unchanged(f,()=>f.incoming.read({operation_id:f.op(),epoch,sha256:p.previous_subject_sha256,offset:0,length:1}),code('OWNER_SOURCE_CHANGED'));
  unchanged(f,()=>f.incoming.submit({operation_id:f.op(),epoch,subject_sha256:first.result.subject_sha256,content:'Incomplete delivery cannot qualify a fresh reconstruction.'}),code('OWNER_DELIVERY_INCOMPLETE'));
  const info=f.incoming.inspect({epoch});f.incoming.read({operation_id:f.op(),epoch,sha256:info.subject_sha256,offset:0,length:Math.min(1024,info.total_characters)});
  const partlyRead=logicalSQLState(f);assert.deepEqual(f.incoming.refreshSubject(first.args),first.result);assert.deepEqual(logicalSQLState(f),partlyRead);
  newFact(f,'Subsequent facts keep the refreshed subject stale even when its historical receipt is replayed.');
  const stale=logicalSQLState(f);assert.deepEqual(f.incoming.refreshSubject(first.args),first.result);assert.deepEqual(logicalSQLState(f),stale);assert.equal(f.incoming.inspect({epoch}).held,'OWNER_SUBJECT_CHANGED');
  const second=refresh(f);assert.notDeepEqual(second.result.subject_ref,first.result.subject_ref);
  unchanged(f,()=>f.incoming.refreshSubject(first.args),code('OWNER_REPLAY_MISMATCH'));
});

test('old and target CAS fields, wrong epoch, expired original deadline and request authority additions cannot refresh',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);newFact(f);const p=preview(f),args=refreshArgs(f,p);
  unchanged(f,()=>f.incoming.refreshSubject({...args,previous_subject_ref:{...args.previous_subject_ref,sha256:'0'.repeat(64)}}),refreshHold.changed);
  unchanged(f,()=>f.incoming.refreshSubject({...args,preview_sha256:'0'.repeat(64)}),refreshHold.changed);
  unchanged(f,()=>f.incoming.refreshSubject({...args,epoch:epoch+1}),code('OWNER_CHANGED'));
  unchanged(f,()=>f.incoming.refreshSubject({...args,expires_at:new Date(p.original_deadline_at_ms+3600000).toISOString()}),code('OWNER_INPUT'));
  unchanged(f,()=>f.incoming.refreshSubject({...args,max_review_calls:p.max_review_calls+1}),code('OWNER_INPUT'));
  t.mock.method(Date,'now',()=>p.original_deadline_at_ms);
  unchanged(f,()=>f.incoming.refreshSubject(args),code('OWNER_HANDOVER_EXPIRED'));
});

test('even exact refresh replay cannot extend the original transition deadline',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);newFact(f);const p=preview(f),first=refresh(f,p);
  t.mock.method(Date,'now',()=>p.original_deadline_at_ms);
  unchanged(f,()=>f.incoming.refreshSubject(first.args),code('OWNER_HANDOVER_EXPIRED'));
});

test('activated-but-paused refresh demotes custody and old acceptance cannot replace new delivery, reconstruction or QA',async t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);f.reconstruct('Original owner reconstruction.');const old=await qualify(f),oldBytes=immutableBytes(f,old.result.result_ref);
  f.incoming.activate({operation_id:f.op(),epoch,review_ref:old.result.result_ref,source_instruction:'SYNTHETIC old exact acceptance remains paused.'});
  newFact(f);const before=retainedLimits(f),fresh=refresh(f);
  assert.equal(f.get('principals','founder').value.status,'pending');assert.equal(handover(f).value.status,'pending');assert.deepEqual(retainedLimits(f),before);
  unchanged(f,()=>f.incoming.activate({operation_id:f.op(),epoch,review_ref:old.result.result_ref,source_instruction:'Old Pass must not qualify changed source.'}),code('OWNER_ACCEPTANCE_REQUIRED'));
  f.reconstruct('A different reconstruction addresses the newly delivered source while retaining old judgments and original limits.');
  const next=await qualify(f);assert.equal(next.result.accepted,true);assert.equal(immutableBytes(f,old.result.result_ref),oldBytes);
  const active=f.incoming.activate({operation_id:f.op(),epoch,review_ref:next.result.result_ref,source_instruction:'SYNTHETIC new exact acceptance.'});assert.equal(active.status,'activated');
  assert.equal(handover(f).value.subject_sha256,fresh.result.subject_sha256);
});

test('UNKNOWN original owner review remains charged and reserved through refresh and explicit existing recovery',async t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);f.reconstruct('Original reconstruction whose review has uncertain closure.');
  const old=prepare(f);core.holdOriginalPeerOwnerMaintenance(old.cap,{error:'SYNTHETIC original review closure remains UNKNOWN.'});
  const oldReconstruction=handover(f).value.reconstruction_ref;newFact(f);const before=retainedLimits(f),first=refresh(f);
  assert.deepEqual(retainedLimits(f),before);assert.deepEqual(handover(f).value.reconstruction_ref,oldReconstruction);
  assert.throws(()=>core.assertOriginalPeerOwnerMaintenance(old.cap),code('OWNER_MAINTENANCE_CHANGED'));
  readCurrentSubject(f);const recovery=recover(f,{content:'Changed recovery retains the original UNKNOWN review, complete fresh source, original charges, deadline and remaining allowance.'});
  assert.equal(recovery.result.old_reservations_released,false);assert.equal(recovery.result.authority_extended,false);
  const q=await qualify(f);assert.equal(q.result.accepted,true);assert.equal(handover(f).value.used_review_calls,before.used_review_calls+1);
  assert.equal(handover(f).value.max_review_calls,before.max_review_calls);assert.equal(handover(f).value.expires_at_ms,before.expires_at_ms);
  for(const row of before.slots)if(row.value.status==='unknown')assert.deepEqual(f.get('slots',row.id),row);
  for(const row of before.effects)if(['unknown','reserved','sent'].includes(row.value.status))assert.deepEqual(f.get('effects',row.id),row);
  assert.equal(first.result.authority_extended,false);assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,before.grant.value.used_model_calls+1);
});

for(const state of ['reserved','running'])test(`a ${state} original owner review must not be released or replaced by refresh`,t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);f.reconstruct('Original reconstruction with an unclosed review.');
  const a=state==='reserved'?{cap:core.prepareOriginalPeerOwnerMaintenance(f.incoming,{operation_id:f.op(),epoch})}:prepare(f);
  if(state==='running')a.channel.submit({sha256:a.header.sha256,content:canonical({review:{subject:a.header.review_subject,context_sha256:a.header.sha256,verdict:'Pass',reason:'SYNTHETIC in-flight output is not a termination observation.',blockers:[],permitted_action:'activate_owner_handover'}})});
  const phase=f.get('work_items',handover(f).value.review_history.at(-1).phase_id);assert.equal(phase.value.status,state);
  newFact(f);const limits=retainedLimits(f);
  unchanged(f,()=>{const p=preview(f);return f.incoming.refreshSubject(refreshArgs(f,p));},code('OWNER_REVIEW_UNCLOSED'));
  assert.deepEqual(retainedLimits(f),limits);assert.deepEqual(f.get('work_items',phase.id),phase);
});

test('a fresh candidate Fail remains a veto after refresh and exhausts the original cap without renewal',async t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);newFact(f);const before=handover(f).value;refresh(f);f.reconstruct('Fresh exact reconstruction after explicit subject refresh.');
  const negative=await qualify(f,prepare(f),{verdict:'Fail'}),bytes=immutableBytes(f,negative.result.result_ref),positive=await qualify(f);
  assert.equal(positive.result.accepted,true);
  unchanged(f,()=>f.incoming.activate({operation_id:f.op(),epoch,review_ref:positive.result.result_ref,source_instruction:'A later Pass cannot erase a retained Fail on this same reconstruction.'}),code('OWNER_NEGATIVE_REVIEW'));
  assert.equal(immutableBytes(f,negative.result.result_ref),bytes);assert.equal(handover(f).value.max_review_calls,before.max_review_calls);assert.equal(handover(f).value.used_review_calls,before.max_review_calls);
  newFact(f,'Additional evidence does not renew exhausted original review capacity.');
  unchanged(f,()=>f.incoming.previewSubjectRefresh({epoch}),code('OWNER_REVIEW_BUDGET'));
});

test('revoked original review grant cannot be renewed by a subject refresh',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);newFact(f);const p=preview(f),args=refreshArgs(f,p),grant=f.get('grants','owner-review-grant');
  // Negative current-policy INPUT only; no permission or acceptance is minted.
  f.seed('grants',grant.id,{...grant.value,status:'revoked'});
  unchanged(f,()=>f.incoming.refreshSubject(args),code('OWNER_REVIEW_GRANT_REQUIRED'));
});

for(const kind of ['Error','AggregateError'])test(`refresh preview retains original provider ${kind} identity and performs no write`,t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);newFact(f);const before=logicalSQLState(f),query=f.ledger.query,cause=Error('Original refresh backend cause.'),member=Error('Original grouped refresh backend member.');
  const failure=Object.assign(kind==='Error'?new Error('Original refresh provider error.',{cause}):new AggregateError([member],'Original refresh provider errors.',{cause}),{code:'OWNER_SUBJECT_CHANGED'});
  f.ledger.query=function(sql,...parameters){const statement=Reflect.apply(query,this,[sql,...parameters]);if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){if(key==='get')return(...values)=>{if(values[0]==='control'&&values[1]==='company')throw failure;return target.get(...values);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  };
  try{assert.throws(()=>preview(f),error=>{assert.equal(error,failure);assert.equal(error.cause,cause);if(kind==='AggregateError')assert.equal(error.errors[0],member);return true;});}finally{f.ledger.query=query;}
  assert.deepEqual(logicalSQLState(f),before);
});

test('original deadline reached after actual final metadata SQL rolls back every refresh row, reset and receipt',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);newFact(f);const p=preview(f),args=refreshArgs(f,p),before=logicalSQLState(f);let clock=Date.now();t.mock.method(Date,'now',()=>clock);
  const hook=afterFinalMetadata(f,()=>{clock=p.original_deadline_at_ms;});
  try{assert.throws(()=>f.incoming.refreshSubject(args),code('TASK_EFFECT_EXPIRED'));}finally{hook.restore();}
  assert.equal(hook.hits,1);assert.deepEqual(logicalSQLState(f),before);
});

test('a caught public late write poisons and rolls back the explicit refresh transaction',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);newFact(f);const p=preview(f),args=refreshArgs(f,p),before=logicalSQLState(f),guarded=f.ledger.guardedWrite;let hits=0,caught;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){return Reflect.apply(guarded,this,[type,principal,tx=>{const result=callback(tx);
    if(result?.refresh_ref){hits++;const c=tx.get('control','company');try{tx.put('control',c.id,{...c.value,paused:false},c.revision);}catch(error){caught=error;}}return result;
  },terminal]);};
  try{assert.throws(()=>f.incoming.refreshSubject(args),code('AUTHORITY_CHANGED'));}finally{f.ledger.guardedWrite=guarded;}
  assert.equal(hits,1);assert.equal(caught?.code,'AUTHORITY_CHANGED');assert.deepEqual(logicalSQLState(f),before);
});

// SOURCE tests only. No actual company, native process, model or provider call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {qaRecordRef,qaRawHash} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-contract.mjs';
import {Store,withStore} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {readStorageIntake,captureStorageBaseline} from '../plugins/soloco/runtime/record-storage.mjs';
import * as actualPolicy from '../plugins/soloco/runtime/peers/origin-mechanical-qa-policy.mjs';
import {ORIGIN_MECHANICAL_QA_WIRE as WIRE,ORIGIN_MECHANICAL_QA_RAW_CONTEXT as RAW,ORIGIN_MECHANICAL_REVIEW_INSTRUCTION,createOriginMechanicalQaWire,assertOriginMechanicalQaWire,originMechanicalQaPrompt,assertOriginMechanicalQaPromptFits} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-wire-contract.mjs';
import {wireFixture,actor} from './peer-origin-mechanical-qa-wire-fixture.mjs';
import {syntheticMechanicalModel} from './origin-mechanical-qa-dispatch-fixture.mjs';
import {stageOriginalWorker} from './original-adapter-process-fixture.mjs';
import {inspectOriginalLocalExecutionInventoryFrom,recordOriginalWorkerAssignmentFrom,bindOriginalHistoricalWorkerAssignmentBookkeepingFrom,inspectOriginalWorkerAssignmentBookkeepingFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
function purePack(extra=''){
 const plan={protocol:'peer-origin-quarantine-plan-v1',plan_id:'plan-one',cut_sha256:'a'.repeat(64),owner:{host:'codex',session_id:'SOURCE-owner'},cut:{governance:'Original governance 🌍',roles_json:'{"qa":{"instructions":"Original full QA."}}',cos_instructions:'Original CoS instructions.',unknown:'Retain original UNKNOWN.'},source_instruction:'SOURCE only',execution_resumed:false};
 const row={id:plan.plan_id,kind:'plan',revision:1,status:'Draft',content:canonical(plan),origin_quarantine_plan:plan};
 const pack={company_id:'SOURCE-fiction',governance:'Original governance 🌍',records:[{id:'other',kind:'decision',content:'Unique original decision.'},row],notices:[{summary:'UNKNOWN 🌍',resolution:null}],extensions:{spent:2,expires_at:'2020-01-01T00:00:00.000Z'},extra};
 return {raw:JSON.stringify(pack),pack,row,ref:qaRecordRef(row)};
}
function alterWire(context,fn){const c=copy(context),wire=JSON.parse(c.text);fn(wire);c.text=JSON.stringify(wire);c.characters=c.text.length;c.utf8_bytes=Buffer.byteLength(c.text);c.sha256=qaRawHash(c.text);return c;}
const code=expected=>e=>e.code===expected;
function loseOriginalHistory(f){
 const db=new DatabaseSync(f.file);let original;
 try{original=db.prepare('SELECT seq,value FROM events ORDER BY seq LIMIT 1').get();const payload=JSON.parse(original.value);delete payload.original_execution;db.prepare('UPDATE events SET value=? WHERE seq=?').run(JSON.stringify(payload),original.seq);}finally{db.close();}
 return ()=>{const restored=new DatabaseSync(f.file);try{restored.prepare('UPDATE events SET value=? WHERE seq=?').run(original.value,original.seq);}finally{restored.close();}};
}
const cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-wire-SYNTHETIC-cache-')),prior=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=cache;
test.after(()=>{if(prior===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=prior;fs.rmSync(cache,{recursive:true,force:true});});

test('fixed wire reconstructs every original byte, hash and property position with one alias only',()=>{
 const p=purePack(),c=createOriginMechanicalQaWire(p.raw,p.ref),wire=JSON.parse(c.text),raw=assertOriginMechanicalQaWire(c,p.ref);
 assert.equal(raw,p.raw);assert.equal(c.raw_assignment.sha256,qaRawHash(p.raw));assert.notEqual(c.sha256,c.raw_assignment.sha256);assert.equal(c.target_plan.plan_sha256,peerDigest(p.row.origin_quarantine_plan));
 assert.equal(Buffer.byteLength(JSON.stringify(wire.body.records[1].content)),69);assert.deepEqual(Object.keys(wire.body.records[1]),Object.keys(p.row));
 const expected=copy(p.pack);expected.records[1].content=wire.body.records[1].content;assert.equal(JSON.stringify(wire.body),JSON.stringify(expected));
});
test('unknown semantic fields, unique records, Unicode and old UNKNOWN/grant evidence remain literal',()=>{
 const p=purePack();p.pack.unknown_future_semantics={scope:'🌍',conditions:['Never infer closure.',{original:42}]};p.pack.records[1].future_record_field={retained:true};p.ref=qaRecordRef(p.pack.records[1]);p.raw=JSON.stringify(p.pack);
 const c=createOriginMechanicalQaWire(p.raw,p.ref);assert.equal(assertOriginMechanicalQaWire(c,p.ref),p.raw);const body=JSON.parse(c.text).body;assert.deepEqual(body.unknown_future_semantics,p.pack.unknown_future_semantics);assert.deepEqual(body.records[1].future_record_field,p.pack.records[1].future_record_field);
});
test('wrong original record/plan/cut, noncanonical content and ambiguous target Hold',()=>{
 const p=purePack(),c=createOriginMechanicalQaWire(p.raw,p.ref);
 assert.throws(()=>createOriginMechanicalQaWire(p.raw,{...p.ref,sha256:'0'.repeat(64)}));
 const mismatched=copy(p.pack);mismatched.records[1].content+=' ';assert.throws(()=>createOriginMechanicalQaWire(JSON.stringify(mismatched),qaRecordRef(mismatched.records[1])));
 for(const change of [w=>{w.body.records[1].origin_quarantine_plan.execution_resumed=true;},w=>{w.body.records[1].origin_quarantine_plan.cut_sha256='0'.repeat(64);},w=>{w.body.records.push(copy(w.body.records[1]));},w=>{w.body.records[1].content.path='arbitrary';},w=>{w.aliases=['governance'];}])assert.throws(()=>assertOriginMechanicalQaWire(alterWire(c,change),p.ref));
});
test('reordered JSON and changed unique fields cannot keep the original raw commitment',()=>{
 const p=purePack(),c=createOriginMechanicalQaWire(p.raw,p.ref);
 for(const change of [w=>{w.body=Object.fromEntries(Object.entries(w.body).reverse());},w=>{w.body.notices[0].resolution='resolved';},w=>{w.body.extensions.spent=0;},w=>{w.body.records[0].content='Changed decision';}])assert.throws(()=>assertOriginMechanicalQaWire(alterWire(c,change),p.ref),code('ORIGIN_MECHANICAL_QA_WIRE_INVERSE'));
 const unknown=copy(c);unknown.ready=true;assert.throws(()=>assertOriginMechanicalQaWire(unknown,p.ref));
});
test('unchanged character, UTF8 and exact whole-prompt limits reject one over, without guessing overhead',()=>{
 const task='SOURCE fixed task',overhead=originMechanicalQaPrompt(task,'',RAW).length;
 assert.equal(assertOriginMechanicalQaPromptFits(task,'x'.repeat(200000-overhead),RAW,200000).length,200000);
 assert.throws(()=>assertOriginMechanicalQaPromptFits(task,'x'.repeat(200001-overhead),RAW,200000),code('ORIGIN_MECHANICAL_QA_PROMPT_CAPACITY'));
 assert.throws(()=>assertOriginMechanicalQaPromptFits(task,'x'.repeat(200001),RAW,200000),code('ORIGIN_MECHANICAL_QA_CONTEXT_CAPACITY'));
 const c=createOriginMechanicalQaWire(purePack('é'.repeat(2000)).raw,purePack('é'.repeat(2000)).ref),prompt=originMechanicalQaPrompt(task,c.text,WIRE),bytes=Buffer.byteLength(prompt);
 assert.equal(assertOriginMechanicalQaPromptFits(task,c.text,WIRE,bytes),prompt);assert.throws(()=>assertOriginMechanicalQaPromptFits(task,c.text,WIRE,bytes-1),code('ORIGIN_MECHANICAL_QA_PROMPT_CAPACITY'));
 assert.throws(()=>assertOriginMechanicalQaPromptFits(task,c.text,WIRE,c.utf8_bytes-1),code('ORIGIN_MECHANICAL_QA_CONTEXT_CAPACITY'));assert.throws(()=>originMechanicalQaPrompt(task,c.text,'unknown'));
 assert.throws(()=>createOriginMechanicalQaWire(' '.repeat(64*1024*1024+1),purePack().ref),code('ORIGIN_MECHANICAL_QA_CONTEXT_SOURCE_CAPACITY'));
});
test('ordinary assignment text/hash/order and its existing overflow remain unchanged',()=>{
 const state={id:'SOURCE',name:'Original',idea:'Keep evidence',records:{},roles:{qa:{instructions:'Review'}},governance:'Original governance',notices:[{summary:'UNKNOWN',deliveries:[],seen_at:{}}],messages:[]},job={role:'qa',inputs:[],task:'SOURCE task',context_format:2};
 const expected=JSON.stringify({company_id:'SOURCE',name:'Original',idea:'Keep evidence',governance:'Original governance',charter:state.roles.qa,records:[],notices:[{summary:'UNKNOWN'}],messages:[],assignment:{task:job.task,task_summary:null,next_handoff:null,model_selection:{mode:'default'},model_catalog:null}});
 assert.deepEqual(assignmentContext(state,job),{text:expected,hash:qaRawHash(expected),inputs:[]});
 state.idea='x'.repeat(200001);assert.throws(()=>assignmentContext(state,job),/Assignment context exceeds 200000 characters/);
});

test('NEW complete installed-team oversize fixture produces packet-v2, exact inverse, bounded readback and one original queue/worker',async t=>{
 const f=await wireFixture(t,{fullTeam:true}),before=f.state();f.prepare();const c=f.context(),packet=f.state().records[f.packet.packet_ref.id].origin_mechanical_qa,raw=assertOriginMechanicalQaWire(c,f.plan_ref),body=JSON.parse(raw);
 assert.equal(packet.protocol,'peer-origin-mechanical-qa-packet-v2');assert.equal(c.protocol,WIRE);assert(raw.length>200000);assert(c.characters<=200000);assert(c.utf8_bytes<=200000);
 assert.throws(()=>assignmentContext(before,packet.job),/Assignment context exceeds 200000 characters/);
 const pins=body.records.find(r=>r.id===f.plan_ref.id).origin_quarantine_plan.cut.pinned_team;assert.equal(pins.governance,before.governance);assert.equal(pins.cos_instructions,before.cos_instructions);assert.deepEqual(JSON.parse(pins.roles_json),before.roles);
 const handle=f.plan.inspectPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:f.packet.packet_ref});assert.equal(handle.protocol,'peer-origin-mechanical-qa-packet-handle-v2');assert.deepEqual(handle.raw_assignment,c.raw_assignment);
 f.grant();await f.loadWorker();const id=f.queue();withStore(f.root,store=>store.readSnapshot(()=>{const read=f.policy.prepareOriginalPeerOriginMechanicalQaContextFrom(store.db,store.read(),{job_id:id});assert.equal(read.protocol,'peer-origin-mechanical-qa-context-readback-v2');assert.equal(read.text,c.text);assert.equal(read.context_protocol,WIRE);}));
 let sent;const script=syntheticMechanicalModel(f,{beforeBirth:({prompt})=>{sent=prompt;assert(prompt.includes(c.text));assert(!prompt.includes(raw));assert(Buffer.byteLength(prompt)<=200000);}}),result=await f.worker.work(f.root,id,script.model);
 assert.equal(result.verdict,'Pass');assert.equal(script.calls,1);assert.equal(f.launches,1);const after=f.state();assert.equal(after.records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.deepEqual(after.jobs.old,before.jobs.old);assert.deepEqual(after.original_grant,before.original_grant);assert.equal(after.paused,true);
 t.diagnostic(JSON.stringify({scope:'NEW fictional installed-team SOURCE fixture; genuine Original journal with standard Node child mocks; no Native qualification',raw_characters:raw.length,raw_utf8_bytes:Buffer.byteLength(raw),wire_characters:c.characters,wire_utf8_bytes:c.utf8_bytes,prompt_utf8_bytes:Buffer.byteLength(sent),real_company_fit:'UNMEASURED'}));
});
test('legacy packet-v1 replay/grant/job/readback and exact old frame preserve original identity',async t=>{
 const f=await wireFixture(t,{legacyV1:true});f.prepare();const packet=copy(f.state().records[f.packet.packet_ref.id]),beforeRef=qaRecordRef(packet),context=packet.origin_mechanical_qa.context;
 assert.equal(packet.origin_mechanical_qa.protocol,'peer-origin-mechanical-qa-packet-v1');assert.deepEqual(Object.keys(context).sort(),['sha256','text','utf8_bytes']);
 const replay=withStore(f.root,store=>actualPolicy.preparePeerOriginMechanicalQaPacketFrom(store,actor,9,f.packetRequest));assert.deepEqual(replay.packet_ref,beforeRef);assert.deepEqual(f.state().records[beforeRef.id],packet);
 f.grant();await f.loadWorker();const id=f.queue();const script=syntheticMechanicalModel(f,{beforeBirth:({prompt})=>assert.equal(prompt,ORIGIN_MECHANICAL_REVIEW_INSTRUCTION+'\n\nEXACT ORIGINAL TASK (DATA):\n'+packet.origin_mechanical_qa.job.task+'\n\nCOMPLETE ORIGINAL CONTEXT (DATA):\n'+context.text)});
 assert.equal((await f.worker.work(f.root,id,script.model)).verdict,'Pass');const handle=withStore(f.root,store=>actualPolicy.inspectPeerOriginMechanicalQaPacketFrom(store,actor,9,{packet_ref:beforeRef}));assert.equal(handle.protocol,'peer-origin-mechanical-qa-packet-handle-v1');assert.equal(handle.context_sha256,context.sha256);assert.equal(handle.raw_assignment,undefined);
 f.write('SYNTHETIC mixed v1 extension',s=>{s.records[beforeRef.id].origin_mechanical_qa.context.protocol=WIRE;return s;});assert.throws(()=>withStore(f.root,store=>actualPolicy.inspectPeerOriginMechanicalQaPacketFrom(store,actor,9,{packet_ref:qaRecordRef(f.state().records[beforeRef.id])})));
});
test('packet-v2 replay keeps immutable context/ref/expiry without new selection or counter reset',async t=>{
 const f=await wireFixture(t);f.prepare();const old=f.state().records[f.packet.packet_ref.id],before=qaRecordRef(old);f.prepare();assert.deepEqual(f.packet.packet_ref,before);assert.deepEqual(f.state().records[before.id],old);f.grant();await f.loadWorker();f.queue();const raw=f.raw();assert.throws(()=>f.queue());assert.equal(f.raw(),raw);assert.equal(f.state().records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,1);
});
test('v1/v2 frozen packet replay uses past assignment stamps after a later original close without current grant authority',async t=>{
 for(const legacyV1 of [false,true]){
  const id='SYNTHETIC-late-close';let carrier;
  const f=await wireFixture(t,{legacyV1,beforePlan:source=>{
   source.write('job.queued',(s,store)=>{
    const job={id,instance_id:'SYNTHETIC-late-close-instance',role:'qa',host:'codex',status:'queued',native_id:null,created_at:new Date().toISOString(),timeout_policy_version:1,timeout_ms:180000,timeout_reason:'SOURCE historical cut only'};
    recordOriginalWorkerAssignmentFrom(store,s,job);s.jobs[job.id]=job;return s;
   });
   carrier=stageOriginalWorker(source.root,id);
   source.write('job.failed',s=>{s.jobs[id].status='failed';s.jobs[id].coordination_release={termination_confirmed:false};return s;});
  }}),frozen=copy(f.state());f.prepare();const packet=copy(f.state().records[f.packet.packet_ref.id]),v=packet.origin_mechanical_qa;
  // The existing standard Node child mock delivers an actual late close to
  // the Original observer. No fabricated journal/closure or Native result.
  carrier.child.emit('close',0,null);
  const current=f.state(),before=f.raw();assert.equal(frozen.jobs[id].original_execution_assignment.launches.length,1);assert.equal(current.jobs[id].original_execution_assignment.launches.length,1);assert.ok(frozen.jobs[id].original_execution_assignment.launches[0].birth);assert.equal(frozen.jobs[id].original_execution_assignment.launches[0].closure,null);assert.equal(current.jobs[id].original_execution_assignment.launches[0].closure.never_started,false);
  withStore(f.root,store=>store.readSnapshot(()=>{
   const historical=copy(frozen);assert.equal(bindOriginalHistoricalWorkerAssignmentBookkeepingFrom(store.db,historical,v.context_basis),true);
   const proof=inspectOriginalWorkerAssignmentBookkeepingFrom(historical,historical.jobs[id]);assert.equal(proof.historical_original,true);assert.equal(proof.active_original_snapshot,false);
   assert.equal(inspectOriginalWorkerAssignmentBookkeepingFrom(historical,current.jobs[id]),null);
   const wrong=copy(frozen);wrong.jobs[id]=copy(current.jobs[id]);assert.throws(()=>bindOriginalHistoricalWorkerAssignmentBookkeepingFrom(store.db,wrong,v.context_basis),code('ORIGINAL_EXECUTION_HISTORICAL_STATE_CHANGED'));
  }));
  const handle=f.plan.inspectPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:f.packet.packet_ref});assert.equal(handle.context_sha256,v.context.sha256);assert.equal(handle.historical_original,true);assert.equal(handle.execution_authority,false);assert.equal(handle.current_eligibility,'not asserted');
  const read=f.plan.readPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:f.packet.packet_ref,sha256:v.context.sha256,offset:0,length:4096});assert.equal(read.text,v.context.text.slice(0,read.length));assert.equal(read.execution_authority,false);
  assert.throws(()=>f.grant(),code('ORIGIN_MECHANICAL_QA_JOURNAL_CHANGED'));assert.equal(f.raw(),before);assert.deepEqual(f.state().records[packet.id],packet);assert.deepEqual(f.state().jobs.old,frozen.jobs.old);assert.deepEqual(f.state().original_grant,frozen.original_grant);assert.equal(f.state().paused,true);
 }
});
test('historical bookkeeping rejects raw databases, foreign Stores, changed company and wrong cut/hash',async t=>{
 const f=await wireFixture(t),frozen=copy(f.state());f.prepare();const basis=f.state().records[f.packet.packet_ref.id].origin_mechanical_qa.context_basis,foreign=await wireFixture(t),before=f.raw();
 const raw=new DatabaseSync(f.file,{readOnly:true});try{assert.throws(()=>bindOriginalHistoricalWorkerAssignmentBookkeepingFrom(raw,copy(frozen),basis),code('ORIGINAL_EXECUTION_STORE_REQUIRED'));}finally{raw.close();}
 withStore(foreign.root,store=>store.readSnapshot(()=>assert.throws(()=>bindOriginalHistoricalWorkerAssignmentBookkeepingFrom(store.db,copy(frozen),basis))));
 withStore(f.root,store=>store.readSnapshot(()=>{
  for(const mutate of [s=>{s.id='SYNTHETIC-other-company';},s=>{delete s.original_execution_origin;},s=>{s.original_execution_origin=null;}]){
   const wrong=copy(frozen);mutate(wrong);assert.throws(()=>bindOriginalHistoricalWorkerAssignmentBookkeepingFrom(store.db,wrong,basis),code('ORIGINAL_EXECUTION_HISTORICAL_STATE_CHANGED'));
  }
  for(const mutate of [b=>{b.seq++;},b=>{b.event_sha256='0'.repeat(64);}]){
   const wrong=copy(basis);mutate(wrong);const {sha256,...body}=wrong;wrong.sha256=qaRawHash(JSON.stringify(body));
   assert.throws(()=>bindOriginalHistoricalWorkerAssignmentBookkeepingFrom(store.db,copy(frozen),wrong));
  }
 }));assert.equal(f.raw(),before);
});
test('historical packet replay authenticates later Original history even when storage intake still validates',async t=>{
 const f=await wireFixture(t);f.prepare();const basis=f.state().records[f.packet.packet_ref.id].origin_mechanical_qa.context_basis;
 f.write('SYNTHETIC later journal',s=>s);const db=new DatabaseSync(f.file);let tail;
 try{
  tail=db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq DESC LIMIT 1').get();assert(tail.seq>basis.seq);
  const payload=JSON.parse(tail.value);delete payload.original_execution;
  const {sha256,...body}=payload.storage_delta;payload.storage_delta={...body,sha256:qaRawHash(JSON.stringify([tail.seq,tail.at,tail.type,{...payload,storage_delta:body}]))};
  db.prepare('UPDATE events SET value=? WHERE seq=?').run(JSON.stringify(payload),tail.seq);
 }finally{db.close();}
 try{
  withStore(f.root,store=>store.readSnapshot(()=>assert.doesNotThrow(()=>readStorageIntake(store.db,basis))));
  const before=f.raw();assert.throws(()=>f.plan.inspectPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:f.packet.packet_ref}),code('ORIGINAL_EXECUTION_HISTORY_REQUIRED'));assert.equal(f.raw(),before);
 }finally{const restore=new DatabaseSync(f.file);try{restore.prepare('UPDATE events SET value=? WHERE seq=?').run(tail.value,tail.seq);}finally{restore.close();}}
 assert.equal(f.plan.inspectPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:f.packet.packet_ref}).execution_authority,false);
});
test('an uncommitted baseline cannot mint historical bookkeeping that survives rollback',async t=>{
 const f=await wireFixture(t),before=f.raw(),rollback=Error('SYNTHETIC rollback');let attempted;
 withStore(f.root,store=>assert.throws(()=>store.transaction('SYNTHETIC uncommitted historical cut',s=>s,{beforeCommit:db=>{
  const basis=captureStorageBaseline(db);attempted=copy(store.read());
  assert.throws(()=>bindOriginalHistoricalWorkerAssignmentBookkeepingFrom(db,attempted,basis),code('ORIGINAL_EXECUTION_HISTORICAL_CUT_UNCOMMITTED'));
  throw rollback;
 }}),e=>e===rollback));
 assert.equal(f.raw(),before);assert.equal(inspectOriginalWorkerAssignmentBookkeepingFrom(attempted,attempted.jobs.old),null);
});
test('a same-sequence replacement cannot substitute for the private pre-write history anchor',async t=>{
 const f=await wireFixture(t),before=f.raw(),rollback=Error('SYNTHETIC anchor rollback');let attempted;
 withStore(f.root,store=>assert.throws(()=>store.transaction('SYNTHETIC replaced historical anchor',s=>{
  const tail=store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq DESC LIMIT 1').get(),payload=JSON.parse(tail.value);payload.synthetic_replacement=true;
  const {sha256,...body}=payload.storage_delta;payload.storage_delta={...body,sha256:qaRawHash(JSON.stringify([tail.seq,tail.at,tail.type,{...payload,storage_delta:body}]))};
  store.db.prepare('UPDATE events SET value=? WHERE seq=?').run(JSON.stringify(payload),tail.seq);
  const basis=captureStorageBaseline(store.db);attempted=copy(s);assert.equal(basis.seq,tail.seq);assert.doesNotThrow(()=>readStorageIntake(store.db,basis));
  assert.throws(()=>bindOriginalHistoricalWorkerAssignmentBookkeepingFrom(store.db,attempted,basis),code('ORIGINAL_EXECUTION_HISTORICAL_CUT_CHANGED'));
  throw rollback;
 }),e=>e===rollback));
 assert.equal(f.raw(),before);assert.equal(inspectOriginalWorkerAssignmentBookkeepingFrom(attempted,attempted.jobs.old),null);
});
test('complete unique oversize and selected UTF8 Hold before packet, grant, queue or spend',async t=>{
 for(const options of [{utf8Limit:512},{changes:{mandatory_unique_semantics:'retain every UNKNOWN '.repeat(12000)}}]){
  const f=await wireFixture(t,options),before=f.raw();assert.throws(()=>f.prepare(),e=>['ORIGIN_MECHANICAL_QA_CONTEXT_CAPACITY','ORIGIN_MECHANICAL_QA_PROMPT_CAPACITY'].includes(e.code));assert.equal(f.raw(),before);const s=f.state();assert.equal(Object.values(s.records).filter(r=>/packet|grant|admission/.test(r.origin_mechanical_qa?.protocol??'')).length,0);assert.equal(Object.keys(s.jobs).length,1);assert.equal(s.original_grant.used_attempts,2);
 }
});
test('v2 packet/grant/queue owner and source tamper Hold with full SQL rollback',async t=>{
 for(const mutation of [s=>{s.owner.epoch=10;},s=>{s.records[fakePlanId(s)].origin_quarantine_plan.cut_sha256='0'.repeat(64);},s=>{s.notices[0].resolution='resolved';},s=>{s.records.original.content+=' changed';},s=>{Object.values(s.records).find(r=>r.origin_mechanical_qa?.protocol==='peer-origin-mechanical-qa-decision-v1').content+=' changed';}]){
  const f=await wireFixture(t);f.prepare();f.grant();await f.loadWorker();f.write('SYNTHETIC source tamper',s=>{mutation(s);return s;});const before=f.raw();assert.throws(()=>f.queue());assert.equal(f.raw(),before);assert.equal(f.state().records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,0);assert.equal(f.launches,undefined);
 }
 function fakePlanId(s){return Object.keys(s.records).find(id=>s.records[id].origin_quarantine_plan);}
});
test('bounded v2 range reads are exact and Unicode-safe, stale hashes and mixed protocol forms Hold',async t=>{
 const f=await wireFixture(t);f.prepare();const c=f.context(),ref=f.packet.packet_ref;let value='';for(let offset=0;offset<c.characters;){const part=f.plan.readPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:ref,sha256:c.sha256,offset,length:4096});value+=part.text;offset+=part.length;assert.equal(part.protocol,'peer-origin-mechanical-qa-packet-range-v2');}assert.equal(value,c.text);
 const index=c.text.indexOf('🌍');assert(index>=0);assert.throws(()=>f.plan.readPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:ref,sha256:c.sha256,offset:index+1,length:1}),code('ORIGIN_MECHANICAL_QA_RANGE'));
 for(const input of [{sha256:'0'.repeat(64),offset:0,length:1},{sha256:c.sha256,offset:0,length:4097}])assert.throws(()=>f.plan.readPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:ref,...input}),code('ORIGIN_MECHANICAL_QA_RANGE'));
 const raw=f.raw();f.write('SYNTHETIC mixed packet shape',s=>{s.records[ref.id].origin_mechanical_qa.context.unrecognized_semantics=true;return s;});assert.throws(()=>f.plan.inspectPeerOriginMechanicalQaPacketAtEpoch(f.root,actor,9,{packet_ref:qaRecordRef(f.state().records[ref.id])}));assert.notEqual(f.raw(),raw);
});
test('missing genuine Original history Holds globally before v2 queue charge or worker launch',async t=>{
 const f=await wireFixture(t);f.prepare();f.grant();await f.loadWorker();const restore=loseOriginalHistory(f),before=f.raw();
 try{withStore(f.root,store=>store.readSnapshot(()=>assert.throws(()=>inspectOriginalLocalExecutionInventoryFrom(store.db),code('ORIGINAL_EXECUTION_HISTORY_REQUIRED'))));assert.throws(()=>f.queue(),code('ORIGINAL_EXECUTION_HISTORY_REQUIRED'));assert.equal(f.raw(),before);assert.equal(f.state().records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,0);assert.equal(f.launches,undefined);}finally{restore();}
});
test('packet terminal provider errors preserve original Error/TypeError/AggregateError and rollback',async t=>{
 const f=await wireFixture(t),before=f.raw(),transaction=Store.prototype.transaction,cause=Error('SOURCE provider original cause');
 for(const failure of [Error('source provider',{cause}),new TypeError('source provider type',{cause}),new AggregateError([cause],'source provider aggregate',{cause})]){
  let hit=0;Store.prototype.transaction=function(type,body,options){if(type!=='origin.mechanical_qa.packet_prepared')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,body,{...options,beforeCommit:(db,next)=>{const read=this.read;this.read=()=>{hit++;throw failure;};try{return options.beforeCommit(db,next);}finally{this.read=read;}}}]);};
  try{assert.throws(()=>f.prepare(),e=>e===failure&&e.cause===cause);}finally{Store.prototype.transaction=transaction;}assert.equal(hit,1);assert.equal(f.raw(),before);
 }
});
test('expiry after the last successful packet provider read rolls back every new row',async t=>{
 const f=await wireFixture(t),before=f.raw(),transaction=Store.prototype.transaction,now=Date.now;let hit=0;
 Store.prototype.transaction=function(type,body,options){if(type!=='origin.mechanical_qa.packet_prepared')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,body,{...options,beforeCommit:(db,next)=>{const read=this.read;this.read=function(...args){const value=Reflect.apply(read,this,args);hit++;Date.now=()=>Date.parse(f.input.expires_at);return value;};try{return options.beforeCommit(db,next);}finally{this.read=read;}}}]);};
 try{assert.throws(()=>f.prepare(),code('ORIGIN_MECHANICAL_QA_EXPIRED'));}finally{Store.prototype.transaction=transaction;Date.now=now;}assert.equal(hit,1);assert.equal(f.raw(),before);
});
test('v2 worker authority loss retains original rejected output and spent UNKNOWN without new work',async t=>{
 const f=await wireFixture(t);f.prepare();f.grant();await f.loadWorker();const id=f.queue(),old=f.state().jobs.old,readSnapshot=Store.prototype.readSnapshot;let restore=null,originalFailure=null,abortReason=null;
 // Restore only after the real failed Source read has ended. Its exact error
 // remains the signal reason; the adapter reports its own ROLE_ABORTED error.
 Store.prototype.readSnapshot=function(...args){try{return Reflect.apply(readSnapshot,this,args);}catch(error){if(restore&&this.inTransaction===false&&error.code==='ORIGINAL_EXECUTION_HISTORY_REQUIRED'){originalFailure??=error;const undo=restore;restore=null;undo();}throw error;}};
 const script=syntheticMechanicalModel(f,{beforeReturn:async({options})=>{restore=loseOriginalHistory(f);await new Promise(resolve=>{if(options.signal.aborted)resolve();else options.signal.addEventListener('abort',resolve,{once:true});});abortReason=options.signal.reason;}});
 try{await assert.rejects(()=>f.worker.work(f.root,id,script.model),code('ROLE_ABORTED'));}finally{Store.prototype.readSnapshot=readSnapshot;restore?.();}assert.ok(originalFailure);assert.strictEqual(abortReason,originalFailure);assert.equal(abortReason.code,'ORIGINAL_EXECUTION_HISTORY_REQUIRED');const s=f.state();assert.equal(script.calls,1);assert.equal(s.jobs[id].status,'failed');assert.equal(s.jobs[id].rejected_output.accepted,false);assert.equal(JSON.parse(s.jobs[id].rejected_output.text).review.verdict,'Pass');assert.deepEqual(s.jobs.old,old);assert.equal(s.records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,1);
});
test('exact full prompt can Hold while its wire alone fits, before any packet or grant row',async t=>{
 const probe=await wireFixture(t);probe.prepare();const context=probe.context(),task=probe.state().records[probe.packet.packet_ref.id].origin_mechanical_qa.job.task,promptBytes=Buffer.byteLength(originMechanicalQaPrompt(task,context.text,WIRE));assert(promptBytes>context.utf8_bytes);const selectedBytes=Math.floor((context.utf8_bytes+promptBytes)/2);
 // The complete Source-generated wire fits this selected limit; its full
 // original prompt does not. No fixture-size snapshot substitutes for bytes.
 const f=await wireFixture(t,{utf8Limit:selectedBytes}),before=f.raw();assert.throws(()=>f.prepare(),code('ORIGIN_MECHANICAL_QA_PROMPT_CAPACITY'));assert.equal(f.raw(),before);assert.equal(Object.values(f.state().records).filter(r=>r.origin_mechanical_qa?.protocol==='peer-origin-mechanical-qa-packet-v2').length,0);assert.equal(f.state().original_grant.used_attempts,2);
});
test('last-read publication expiry keeps exact rejected raw custody without review, refund or old UNKNOWN release',async t=>{
 const f=await wireFixture(t);f.prepare();f.grant();await f.loadWorker();const id=f.queue(),old=f.state().jobs.old,transaction=Store.prototype.transaction,read=Store.prototype.read,now=Date.now,deadline=Date.parse(f.input.expires_at);let terminal=null,cutoff=null,hit=0;
 Date.now=()=>cutoff??now();Store.prototype.read=function(...args){const value=Reflect.apply(read,this,args);if(this===terminal){hit++;cutoff=deadline;}return value;};
 Store.prototype.transaction=function(type,body,options){if(type!=='job.completed')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,body,{...options,beforeCommit:(db,next)=>{terminal=this;try{return options.beforeCommit(db,next);}finally{terminal=null;}}}]);};
 const script=syntheticMechanicalModel(f);try{await assert.rejects(()=>f.worker.work(f.root,id,script.model),code('ORIGIN_MECHANICAL_QA_EXPIRED'));}finally{Store.prototype.transaction=transaction;Store.prototype.read=read;Date.now=now;}
 const s=f.state();assert.equal(hit,1);assert.equal(script.calls,1);assert.equal(s.jobs[id].status,'failed');assert.equal(s.jobs[id].artifact_id,undefined);assert.equal(s.jobs[id].rejected_output.accepted,false);assert.equal(JSON.parse(s.jobs[id].rejected_output.text).review.verdict,'Pass');assert.ok(s.jobs[id].model_process_tracking.invocations[0].closure);assert.equal(s.sessions[s.jobs[id].session_key].native_id,null);assert.equal(Object.values(s.records).filter(r=>r.kind==='review'&&r.job_id===id).length,0);assert.equal(s.records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.deepEqual(s.jobs.old,old);
});

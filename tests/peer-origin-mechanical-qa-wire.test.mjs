// SOURCE tests only. No actual company, native process, model or provider call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {qaRecordRef,qaRawHash} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-contract.mjs';
import {Store,withStore} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import * as actualPolicy from '../plugins/soloco/runtime/peers/origin-mechanical-qa-policy.mjs';
import {ORIGIN_MECHANICAL_QA_WIRE as WIRE,ORIGIN_MECHANICAL_QA_RAW_CONTEXT as RAW,ORIGIN_MECHANICAL_REVIEW_INSTRUCTION,createOriginMechanicalQaWire,assertOriginMechanicalQaWire,originMechanicalQaPrompt,assertOriginMechanicalQaPromptFits} from '../plugins/soloco/runtime/peers/origin-mechanical-qa-wire-contract.mjs';
import {wireFixture,actor} from './peer-origin-mechanical-qa-wire-fixture.mjs';
import {syntheticMechanicalModel} from './origin-mechanical-qa-dispatch-fixture.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
function purePack(extra=''){
 const plan={protocol:'peer-origin-quarantine-plan-v1',plan_id:'plan-one',cut_sha256:'a'.repeat(64),owner:{host:'codex',session_id:'SOURCE-owner'},cut:{governance:'Original governance 🌍',roles_json:'{"qa":{"instructions":"Original full QA."}}',cos_instructions:'Original CoS instructions.',unknown:'Retain original UNKNOWN.'},source_instruction:'SOURCE only',execution_resumed:false};
 const row={id:plan.plan_id,kind:'plan',revision:1,status:'Draft',content:canonical(plan),origin_quarantine_plan:plan};
 const pack={company_id:'SOURCE-fiction',governance:'Original governance 🌍',records:[{id:'other',kind:'decision',content:'Unique original decision.'},row],notices:[{summary:'UNKNOWN 🌍',resolution:null}],extensions:{spent:2,expires_at:'2020-01-01T00:00:00.000Z'},extra};
 return {raw:JSON.stringify(pack),pack,row,ref:qaRecordRef(row)};
}
function alterWire(context,fn){const c=copy(context),wire=JSON.parse(c.text);fn(wire);c.text=JSON.stringify(wire);c.characters=c.text.length;c.utf8_bytes=Buffer.byteLength(c.text);c.sha256=qaRawHash(c.text);return c;}
const code=expected=>e=>e.code===expected;
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
 t.diagnostic(JSON.stringify({scope:'NEW fictional installed-team SOURCE fixture only; native observations/inventory SYNTHETIC',raw_characters:raw.length,raw_utf8_bytes:Buffer.byteLength(raw),wire_characters:c.characters,wire_utf8_bytes:c.utf8_bytes,prompt_utf8_bytes:Buffer.byteLength(sent),real_company_fit:'UNMEASURED'}));
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
test('actual missing inventory still Holds before queue charge or worker launch for v2',async t=>{
 const f=await wireFixture(t);f.prepare();f.grant();const before=f.raw();assert.throws(()=>withStore(f.root,store=>store.transaction('job.queued',s=>{const job={...s.records[f.packet.packet_ref.id].origin_mechanical_qa.job,created_at:new Date().toISOString()};actualPolicy.reservePeerOriginMechanicalQaFrom(store,s,job,{expected_epoch:9,grant_ref:f.grantReceipt.grant_ref});return s;})),code('ORIGIN_MECHANICAL_QA_EXECUTION_INVENTORY_SOURCE_REQUIRED'));assert.equal(f.raw(),before);assert.equal(f.state().records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,0);
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
 const f=await wireFixture(t);f.prepare();f.grant();await f.loadWorker();const id=f.queue(),old=f.state().jobs.old,script=syntheticMechanicalModel(f,{beforeReturn:()=>{f.inventory.setKnown(false);}});
 try{await assert.rejects(()=>f.worker.work(f.root,id,script.model),code('ORIGIN_MECHANICAL_QA_EXECUTION_CARDINALITY_UNKNOWN'));}finally{f.inventory.setKnown(true);}const s=f.state();assert.equal(script.calls,1);assert.equal(s.jobs[id].status,'failed');assert.equal(s.jobs[id].rejected_output.accepted,false);assert.equal(JSON.parse(s.jobs[id].rejected_output.text).review.verdict,'Pass');assert.deepEqual(s.jobs.old,old);assert.equal(s.records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,1);
});
test('exact full prompt can Hold while its wire alone fits, before any packet or grant row',async t=>{
 // Measured compact fixture wire is about30k and its complete prompt about33k.
 // The asserted error specifically distinguishes the actual full-frame check.
 const f=await wireFixture(t,{utf8Limit:31500}),before=f.raw();assert.throws(()=>f.prepare(),code('ORIGIN_MECHANICAL_QA_PROMPT_CAPACITY'));assert.equal(f.raw(),before);assert.equal(Object.values(f.state().records).filter(r=>r.origin_mechanical_qa?.protocol==='peer-origin-mechanical-qa-packet-v2').length,0);assert.equal(f.state().original_grant.used_attempts,2);
});
test('last-read publication expiry keeps exact rejected raw custody without review, refund or old UNKNOWN release',async t=>{
 const f=await wireFixture(t);f.prepare();f.grant();await f.loadWorker();const id=f.queue(),old=f.state().jobs.old,transaction=Store.prototype.transaction,read=Store.prototype.read,now=Date.now,deadline=Date.parse(f.input.expires_at);let terminal=null,cutoff=null,hit=0;
 Date.now=()=>cutoff??now();Store.prototype.read=function(...args){const value=Reflect.apply(read,this,args);if(this===terminal){hit++;cutoff=deadline;}return value;};
 Store.prototype.transaction=function(type,body,options){if(type!=='job.completed')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,body,{...options,beforeCommit:(db,next)=>{terminal=this;try{return options.beforeCommit(db,next);}finally{terminal=null;}}}]);};
 const script=syntheticMechanicalModel(f);try{await assert.rejects(()=>f.worker.work(f.root,id,script.model),code('ORIGIN_MECHANICAL_QA_EXPIRED'));}finally{Store.prototype.transaction=transaction;Store.prototype.read=read;Date.now=now;}
 const s=f.state();assert.equal(hit,1);assert.equal(script.calls,1);assert.equal(s.jobs[id].status,'failed');assert.equal(s.jobs[id].artifact_id,undefined);assert.equal(s.jobs[id].rejected_output.accepted,false);assert.equal(JSON.parse(s.jobs[id].rejected_output.text).review.verdict,'Pass');assert.ok(s.jobs[id].model_process_tracking.invocations[0].closure);assert.equal(s.sessions[s.jobs[id].session_key].native_id,null);assert.equal(Object.values(s.records).filter(r=>r.kind==='review'&&r.job_id===id).length,0);assert.equal(s.records[f.grantReceipt.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.deepEqual(s.jobs.old,old);
});

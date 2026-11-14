// FICTIONAL contract doubles only: real public APIs, storage and worker receipts;
// no company exports, external execution, native semantic acceptance or fit claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import net from 'node:net';
import {syncBuiltinESMExports} from 'node:module';
import {fixture,read,context,review,home,extraction,domainArgs,aggregate,sha} from './support/scoped-home-fixture.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
import {inspectHandover,verifyHandoverAcceptance,admitHandover,beginHandover} from '../plugins/soloco/runtime/handover.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {reviewedContext} from '../plugins/soloco/runtime/current-state.mjs';
import {readEvidence} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import {operatingContext,operatingFrontier,validateOperatingIndex} from '../plugins/soloco/runtime/operating-state.mjs';
import {inheritSnapshots,resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';

function forbidExternal(t){
 const attempts=[];
 // Capability presentation is irrelevant to this fixture; model the local
 // sandbox executable as absent so company_open cannot launch its OS probe.
 const exists=fs.existsSync;t.mock.method(fs,'existsSync',file=>file==='/usr/bin/sandbox-exec'?false:exists(file));
 const deny=(object,key)=>t.mock.method(object,key,()=>{attempts.push(key);throw Error('Unexpected external execution: '+key);});
 for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(cp,key);
 for(const key of ['connect','createConnection','createServer'])deny(net,key);
 deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(globalThis,'fetch');
 syncBuiltinESMExports();
 t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();assert.deepEqual(attempts,[]);});
}
const operating=(f,args)=>context(f,{protocol:'operating-state-v1',...args});
const clone=s=>inheritSnapshots(s,structuredClone(s));
function jobDiagnostic(job,details={}){
 const short=value=>value==null?null:String(value).slice(0,800),failure=job.execution_failure;
 return JSON.stringify({status:job.status,error:short(job.error),execution_failure:failure?{code:failure.code,message:short(failure.message),outcome:failure.outcome,at:failure.at}:null,timeout_ms:job.timeout_ms,execution_started_at:job.execution_started_at,execution_deadline_at:job.execution_deadline_at,finished_at:job.finished_at,termination_confirmed:job.coordination_release?.termination_confirmed,...details});
}
async function preserve(f){
 const es=await extraction(f);await home(f);
 const d=await review(f,domainArgs(es));assert.equal(d.job.status,'completed',d.job.error);
 await aggregate(f,es,d);
}
async function publish(f,t,label){
 const p=await operating(f,{action:'plan',maintenance:true});assert.equal(p.held,false,JSON.stringify(p.frontier));
 const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'FICTIONAL scripted publication after exact frozen-parent preservation.'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
 const s=read(f),assignment=assignmentContext(s,s.jobs[q.id]),evidence=assignment.operating_evidence??assignment.qualification_evidence,planHash=sha(s.records[p.id].operating_plan);
 // Use the existing bounded range capacity and consume only actually delivered
 // ranges. Deferred ranges stay queued; no evidence or deadline is omitted.
 const stream=evidence?.sources[evidence.pages[0].source_id],reads=[];
 if(label==='incoming'){assert.ok(assignment.operating_evidence,'Incoming publication must use the actual frozen operating protocol');assert.ok(stream.length>200000,'The deliberate pending proposal must exercise frozen publication delivery');}
 if(stream)for(let offset=0;offset<stream.length;){
  let length=Math.min(32768,stream.length-offset);
  const request=()=>({source_id:stream.source_id,sha256:stream.sha256,offset,length});
  for(;;){const last=stream.raw.charCodeAt(offset+length-1);if(last>=0xd800&&last<=0xdbff)length--;if(JSON.stringify(readEvidence(evidence,request())).length<=180000)break;length=Math.floor(length/2);}
  reads.push(request());offset+=length;
 }
 else {const required=JSON.parse(assignment.text).required_evidence;for(const ref of required.sources.filter(ref=>!required.inline.some(x=>x.source.id===ref.id)))for(let offset=0;offset<ref.total_characters;offset+=16000)reads.push({id:ref.id,sha256:ref.sha256,offset,length:Math.min(16000,ref.total_characters-offset)});}
 const rangeCount=reads.length;let first=true,deliveredRanges=0;
 await work(f.root,q.id,async(_host,_session,_prompt,_dir,timeout,_selection,options)=>{
  if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}
  const native_id='fictional-publication-'+q.id;
  if(stream){
   const delivered=JSON.parse(_prompt);
   if(delivered.protocol==='handover-frozen-reads-v1'){
    for(const range of delivered.reads){const expected=reads.shift();assert.ok(expected,'No unsolicited range');for(const key of ['source_id','sha256','offset','length'])assert.equal(range[key],expected[key]);assert.equal(range.text,stream.raw.slice(expected.offset,expected.offset+expected.length),'Complete UTF-16 range reached the adapter');deliveredRanges++;}
    assert.deepEqual(delivered.deferred,reads.slice(0,delivered.deferred.length),'Deferred ranges must remain queued');
   }
   if(reads.length)return {native_id,text:JSON.stringify({reads:reads.slice(0,4)})};
  }else if(reads.length)return {native_id,text:JSON.stringify({reads:reads.splice(0,1)})};
  return {native_id,text:JSON.stringify({content:'FICTIONAL scripted contract judgment; no native semantic QA.',messages:[],notices:[],review:{verdict:'Pass',reason:'FICTIONAL mechanics only; UNKNOWN, ZERO allowance and no execution retained.',permitted_action:'publish_operating_state',plan_sha256:planHash,preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
 });
 const job=read(f).jobs[q.id],diagnostic=jobDiagnostic(job,{phase:label,stream_characters:stream?.length??0,requested_ranges:rangeCount,delivered_ranges:deliveredRanges});
 t.diagnostic(diagnostic);assert.equal(job.status,'completed',diagnostic);assert.equal(job.coordination_release.termination_confirmed,true,diagnostic);
 if(stream){assert.equal(reads.length,0);assert.equal(deliveredRanges,rangeCount);if(label==='incoming')assert.ok(deliveredRanges>1,'Successor publication must consume multiple actual ranges');}
 assert.equal((await operating(f,{action:'apply',plan_id:p.id,review_id:job.artifact_id})).published,true);
}

const launch={check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})};
const reconstruct=f=>engine.handover({...f,action:'submit',protocol:'operating-handover-v4',content:'FICTIONAL reconstruction preserves complete accepted obligations, failed history and uncertainty. Remaining allowance ZERO. No execution or exposure authority. Independent exact review is required before preparation resumes.'},'codex');
async function handoverPass(f,r,t,label){
 const q=engine.dispatch({...f,role:'qa',review_of:r.id,task:'FICTIONAL independent exact frozen-intake handover judgment.'},'codex',launch);
 const state=read(f),packet=assignmentContext(state,state.jobs[q.id]),stream=packet.handover_evidence.sources[packet.handover_evidence.pages[0].source_id],subjectHash=state.records[r.id].handover.subject_sha256,reads=[];
 if(label==='incoming')assert.ok(stream.length>200000,'Successor handover must retain the complete oversized semantic stream');
 // Use the protocol's bounded range capacity, as publication above does. These
 // planning reads are not delivery; only exact adapter packets drain the queue.
 for(let offset=0;offset<stream.length;){
  let length=Math.min(32768,stream.length-offset);
  const request=()=>({source_id:stream.source_id,sha256:stream.sha256,offset,length});
  for(;;){
   assert.ok(length>0,'A complete range must fit without truncation');
   const last=stream.raw.charCodeAt(offset+length-1),next=stream.raw.charCodeAt(offset+length);
   if(last>=0xd800&&last<=0xdbff&&next>=0xdc00&&next<=0xdfff)length--;
   assert.ok(length>0,'A complete surrogate pair must fit without splitting');
   if(JSON.stringify(readEvidence(packet.handover_evidence,request())).length<=180000)break;
   length=Math.floor(length/2);
  }
  reads.push(request());offset+=length;
 }
 const rangeCount=reads.length;let first=true,pending=null,requestedCharacters=0,deliveredCharacters=0,deliveredRanges=0,deliveryRounds=0,adapterCalls=0,maximumRequestedRanges=0,maximumDeliveredRanges=0;
 await work(f.root,q.id,async(_host,_session,_prompt,_dir,timeout,_selection,options)=>{
  adapterCalls++;
  if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}
  if(pending){
   const delivered=JSON.parse(_prompt);assert.equal(delivered.protocol,'handover-frozen-reads-v1');assert.ok(delivered.reads.length>0&&delivered.reads.length<=pending.length);
   for(const [index,range] of delivered.reads.entries()){
    const expected=reads.shift();assert.deepEqual(expected,pending[index]);
    for(const key of ['source_id','sha256','offset','length'])assert.equal(range[key],expected[key]);
    assert.equal(expected.offset,deliveredCharacters,'Delivery must be contiguous and never duplicated');
    assert.equal(range.text,stream.raw.slice(expected.offset,expected.offset+expected.length),'Complete UTF-16 range reached the adapter');
    deliveredCharacters+=range.length;deliveredRanges++;
   }
   assert.deepEqual(delivered.deferred,pending.slice(delivered.reads.length),'Deferred ranges must stay queued');
   maximumDeliveredRanges=Math.max(maximumDeliveredRanges,delivered.reads.length);deliveryRounds++;pending=null;
  }
  if(reads.length){pending=reads.slice(0,4);maximumRequestedRanges=Math.max(maximumRequestedRanges,pending.length);requestedCharacters=Math.max(requestedCharacters,...pending.map(range=>range.offset+range.length));return {native_id:'fictional-handover-'+q.id,text:JSON.stringify({reads:pending})};}
  return {native_id:'fictional-handover-'+q.id,text:JSON.stringify({content:'FICTIONAL exact subject judgment; no native semantic acceptance.',messages:[],notices:[],citations:JSON.parse(packet.text).evidence_protocol.citations.slice(0,1),review:{verdict:'Pass',reason:'FICTIONAL complete conditions retained.',permitted_action:'resume_handover',subject_sha256:subjectHash,blockers:[]}})};
 });
 const done=read(f),job=done.jobs[q.id],diagnostic=jobDiagnostic(job,{phase:'handover-'+label,stream_characters:stream.length,requested_characters:requestedCharacters,delivered_characters:deliveredCharacters,planned_ranges:rangeCount,delivered_ranges:deliveredRanges,delivery_rounds:deliveryRounds,adapter_calls:adapterCalls,maximum_requested_ranges:maximumRequestedRanges,maximum_delivered_ranges:maximumDeliveredRanges});
 t.diagnostic(diagnostic);assert.equal(job.status,'completed',diagnostic);assert.equal(requestedCharacters,stream.length);assert.equal(deliveredCharacters,stream.length);assert.equal(deliveredRanges,rangeCount);assert.equal(reads.length,0);assert.equal(pending,null);
 if(label==='incoming'){assert.ok(maximumDeliveredRanges>1,'Large handover must consume actual batched ranges');assert.ok(deliveryRounds>1,'Large handover must consume multiple actual adapter packets');}
 assert.equal(job.coordination_release.termination_confirmed,true);assert.equal(done.records[job.artifact_id].handover_evidence.semantic_delivery_complete,true);return {job:q.id,review:job.artifact_id};
}

async function proposal(f,label,whileQueued=()=>{},content='FICTIONAL unaccepted proposal. UNKNOWN; ZERO allowance; no execution.'){
 const task=engine.dispatch({...f,role:'engineer',task:'FICTIONAL '+label+' proposal retaining UNKNOWN, ZERO allowance and no execution.',output_contract:'operating-proposal-v1',input_ids:['home']},'codex',launch);
 assert.equal(read(f).jobs[task.id].context_format,6);whileQueued();
 await work(f.root,task.id,async(_h,_n,_p,_d,timeout,_s,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));return {native_id:'fictional-proposal-'+task.id,text:JSON.stringify({content,messages:[],notices:[]})};});
 const s=read(f),job=s.jobs[task.id];assert.equal(job.status,'completed',jobDiagnostic(job));assert.equal(s.records[job.artifact_id].content,content);return {job,record:s.records[job.artifact_id]};
}

test('frozen-intake accepted checkpoint admits public v4 evidence and a successor transfer',async t=>{
 forbidExternal(t);
 const f=await fixture({frozenIntake:true,handoverBeforeFreeze:true,fictionalTeam:true});
 await preserve(f);await publish(f,t,'outgoing');
 const r=reconstruct(f);assert.equal(read(f).records[r.id].handover.evidence_protocol,4);
 await t.test('public inspect and exact read after v4 submission',()=>{
  const inspection=engine.handover({...f,action:'inspect'},'codex'),source=inspection.required_semantics;
  const range=engine.handover({...f,action:'read',subject_sha256:inspection.subject_sha256,source_id:source.source_id,sha256:source.sha256,offset:0,length:Math.min(16000,source.length)},'codex');
  assert.ok(range.text.length);assert.equal(range.subject_sha256,inspection.subject_sha256);
 });
 await t.test('independent complete v4 QA and resume',async()=>{
  assert.throws(()=>engine.control({root:f.root,session_id:f.session_id,expected_epoch:f.epoch,action:'resume',source_instruction:'resume'},'codex'),/QA/);
  const proof=await handoverPass(f,r,t,'outgoing'),accepted=read(f);
  for(const [label,change] of [
   ['closure',s=>{s.jobs[proof.job].coordination_release.termination_confirmed=false;}],
   ['identity',s=>{s.jobs[proof.job].native_id=f.session_id;}],
   ['delivery',s=>{s.records[proof.review].handover_evidence.semantic_delivery_complete=false;}],
   ['subject',s=>{s.records[proof.review].review.subject_sha256='wrong';}]
  ]){const bad=clone(accepted);change(bad);assert.throws(()=>verifyHandoverAcceptance(bad),/Held|QA|changed|stale/,label);}
  engine.control({root:f.root,session_id:f.session_id,expected_epoch:f.epoch,action:'resume',source_instruction:'resume'},'codex');
  assert.equal(read(f).paused,false);assert.equal(read(f).handover.status,'completed');
 });
 await t.test('changed current meaning and forged v4 bookkeeping remain held',()=>{
  const accepted=read(f);
  for(const [label,change] of [
   ['source',s=>{s.records.home.content+=' Changed condition';}],
   ['notice',s=>{s.notices.push({id:'unaccepted',summary:'New restriction'});}],
   ['unknown record',s=>{s.records.unaccepted={id:'unaccepted',content:'New restriction'};}],
   ['owner',s=>{s.owner.epoch++;}],
   ['receipt',s=>{s.operating_state.plan.sha256='0'.repeat(64);}],
   ['forged target',s=>{s.records[r.id].content+=' Forged replacement';}],
   ['negative',s=>{s.records.negative={id:'negative',kind:'review',status:'Submitted',review_of:{id:r.id},review:{verdict:'Blocked',reason:'Unresolved contradiction'}};}]
  ]){const bad=clone(accepted);change(bad);assert.throws(()=>inspectHandover(bad),/Operating state Held|missing|changed|corrupt/,label);
   const prospective=inheritSnapshots(bad,{...bad,owner:{host:'codex',session_id:'fictional-successor',epoch:bad.owner.epoch+1},paused:true,records:{...bad.records}});beginHandover(prospective,bad.owner);
   assert.throws(()=>admitHandover(prospective,bad),/Held|missing|changed|corrupt/,label+' transfer');
  }
 });
 await t.test('next bound owner transfer and independent successor continuation',async()=>{
  const next={...f,session_id:'fictional-successor',epoch:f.epoch+1};engine.bind(next.root,next.session_id,'codex');
  const transfer=instruction=>engine.control({root:next.root,session_id:next.session_id,expected_epoch:f.epoch,action:'handover',source_instruction:instruction},'codex');
  // A legal <100000-character result deliberately exceeds the 200000-character
  // JSON publication boundary. Escapes are inert fictional range/packet data;
  // the complete original must still survive publication and successor review.
  const pendingContent='FICTIONAL unaccepted proposal: UNKNOWN failed outcome; allowance ZERO; no execution or retry. The following JSON escapes are inert fixture data.\n'+'\u0001'.repeat(34000);
  assert.ok(pendingContent.length<100000);assert.ok(JSON.stringify(pendingContent).length>200000);
  const pending=await proposal(f,'founder task',()=>assert.throws(()=>transfer('handover'),/Assignments are active/),pendingContent),before=read(f);
  assert.throws(()=>engine.control({root:next.root,session_id:next.session_id,expected_epoch:f.epoch-1,action:'handover',source_instruction:'handover'},'codex'),/Stale/);
  assert.throws(()=>transfer('handover only after QA approves the outstanding restriction'),/DIRTY/);
  assert.equal(sha(read(f)),sha(before),'failed admission retains outgoing ownership and all state');
  const receipt=engine.control({root:next.root,session_id:next.session_id,expected_epoch:f.epoch,action:'handover',source_instruction:'handover'},'codex');
  assert.equal(receipt.paused,true);assert.equal(read(next).owner.epoch,next.epoch);assert.equal(read(next).handover.previous_owner.epoch,before.owner.epoch);
  assert.equal(receipt.status,'Held');assert.equal(receipt.reconstruction_ready,false);
  assert.throws(()=>engine.handover({...next,action:'read',source_id:'unaccepted',subject_sha256:'unaccepted'},'codex'),/publication required/);
  assert.throws(()=>reconstruct(next),/Held/);
  assert.throws(()=>engine.handover({...next,action:'submit',content:r.content},'codex'),/Held/);
  assert.throws(()=>engine.control({root:next.root,session_id:next.session_id,expected_epoch:next.epoch,action:'resume',source_instruction:'resume'},'codex'),/Held/);
  assert.throws(()=>engine.dispatch({...next,role:'engineer',task:'Premature incoming assignment'},'codex',launch),/paused/);
  assert.throws(()=>engine.save({...f,id:'old-owner-write',kind:'artifact',content:'Stale outgoing write'},'codex'),/does not own/);
  await publish(next,t,'incoming');
  const successor=engine.handover({...next,action:'submit',content:r.content},'codex'),subject=read(next).records[successor.id].handover;assert.equal(subject.evidence_protocol,4);
  assert.deepEqual(subject.subject.records[pending.record.id],pending.record);assert.deepEqual(subject.subject.jobs[pending.job.id],pending.job);
  const inspection=engine.handover({...next,action:'inspect'},'codex'),source=inspection.required_semantics;
  assert.ok(engine.handover({...next,action:'read',subject_sha256:inspection.subject_sha256,source_id:source.source_id,sha256:source.sha256,offset:0,length:Math.min(16000,source.length)},'codex').text.length);
  await handoverPass(next,successor,t,'incoming');
  engine.control({root:next.root,session_id:next.session_id,expected_epoch:next.epoch,action:'resume',source_instruction:'resume'},'codex');
  const task=await proposal(next,'successor');
  const completed=read(next);assert.equal(completed.jobs[task.job.id].status,'completed',completed.jobs[task.job.id].error);assert.equal(completed.paused,false);assert.equal(operatingContext(completed).owner.epoch,next.epoch);
 });
});

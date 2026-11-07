import { exactStatus, exactSource } from './helpers/public-exact.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id,digest,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {handoverHash,handoverReviewEligible,handoverSubject} from '../plugins/soloco/runtime/handover.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {DEFAULT_EXECUTION_TIMEOUT_MS,jobTimeoutState} from '../plugins/soloco/runtime/timeout.mjs';
import {readEvidence,buildEvidence} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {resolveSnapshotEntry} from '../plugins/soloco/runtime/snapshot.mjs';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-handover-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const content='Objectives: preserve the project. Rules: preparation only. Authority: no external execution. Pending work: inspect evidence and notices. Uncertainty: no business outcomes proven. Next action: independent review before resuming.';
function setup(host='codex') {const root=fs.mkdtempSync(path.join(base,'fixture-')),a={root,session_id:id('old'),epoch:1,idea:'Fictional handover fixture'};engine.bind(root,a.session_id,host);engine.open(a,host);withStore(root,db=>db.migrate());return a;}
function replace(a,host='codex') {const b={...a,session_id:id('new'),epoch:2};engine.bind(a.root,b.session_id,host);engine.control({...b,action:'handover',expected_epoch:1,source_instruction:'Continue here'},host);return b;}
function submit(b,host='codex'){const receipt=engine.handover({...b,action:'submit',content},host);return withStore(b.root,db=>db.read().records[receipt.id]);}
function queue(b,r,role='qa') {let key=id('job');withStore(b.root,db=>db.transaction('fixture.queue',s=>{
 const instance=id(role);s.sessions[instance]={instance_id:instance,role,native_id:null,host:s.owner.host};
 const j={id:key,role,instance_id:instance,session_key:instance,host:s.owner.host,epoch:s.owner.epoch,status:'queued',task:'Independently check all handover understanding and unresolved outcomes.',inputs:[{id:r.id,revision:r.revision},...r.handover.input_refs.map(i=>({id:i.id,revision:i.revision}))],review_of:{id:r.id,revision:r.revision},created_at:new Date().toISOString()};
 j.context_sha256=assignmentContext(s,j).hash;s.jobs[key]=j;return s;}));return key;}
// Injected fictional reviewer: read every compulsory range on the same native
// session before emitting its final artifact. No external model is invoked.
async function completeReview(b,j,model) {
 const ctx=frozenContext(b,j),e=ctx.handover_evidence;
 if(!e)return work(b.root,j,model);
 const stream=e.sources[e.pages[0].source_id];let offset=0,final;
 return work(b.root,j,async(host,session,request,...rest)=>{
  const result=final??await model(host,session,request,...rest);
  if(!final&&JSON.parse(result.text).reads)return result;
  final=result;
  if(offset>=stream.length)return final;
  const reads=[];
  for(let i=0;i<4&&offset<stream.length;i++){
   let length=Math.min(16000,stream.length-offset);
   const code=stream.raw.charCodeAt(offset+length-1);if(code>=0xd800&&code<=0xdbff)length--;
   reads.push({source_id:stream.source_id,sha256:stream.sha256,offset,length});offset+=length;
  }
  if(session)assert.equal(session,result.native_id);
  return {native_id:result.native_id,text:JSON.stringify({reads})};
 });
}
async function review(b,r,{verdict='Pass',blockers=[],native=id('native'),role='qa',wrongHash=false}={}) {
 const j=queue(b,r,role);const citations=withStore(b.root,db=>{const s=db.read();return JSON.parse(assignmentContext(s,s.jobs[j]).text).evidence_protocol?.citations.slice(0,1);});await completeReview(b,j,async()=>({native_id:native,text:JSON.stringify({citations,content:'Independently checked current objectives, authority, pending notices, failed work, uncertainty and next steps.',messages:[],notices:[],review:{verdict,reason:'Fictional exact evidence review',permitted_action:verdict==='Pass'?'resume_handover':'hold',subject_sha256:wrongHash?'wrong':r.handover.subject_sha256,blockers}})}));return j;
}
test('same-owner pause/resume stays proportionate; fresh and cross-host replacements require reconstruction',()=>{
 for(const host of ['codex','claude']) {
 const a=setup();engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'pause'},'codex');engine.control({...a,action:'resume',expected_epoch:1,source_instruction:'resume'},'codex');
 const b=replace(a,host);assert.equal(engine.status(b,host).paused,true);
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},host),/reconstruction/);
 assert.throws(()=>engine.save({...a,kind:'plan',content:'stale write'},'codex'),/does not own/);
 }
});
test('exact independent QA allows preparation resume, preserves records/notices and durable acceptance',async()=>{
 for(const host of ['codex','claude']) {
 const a=setup();engine.notify({...a,kind:'must_know',summary:'Fictional unknown outcome'},'codex');
 const b=replace(a,host),r=submit(b,host);await review(b,r);
 const s=engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Resume after checked reconstruction'},host);
 assert.equal(s.paused,false);assert.equal(s.handover.status,'completed');assert.equal(exactSource(b,host,s.handover.source).acceptance.subject_sha256,r.handover.subject_sha256);assert.equal(s.notices.total,1);assert.equal(s.capabilities.external_execution,false);
 engine.control({...b,action:'pause',expected_epoch:2,source_instruction:'pause'},host);engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'same owner resume'},host);
 }
});
test('incomplete, non-independent, wrong-hash and blocked review cannot resume',async()=>{
 for(const options of [{role:'pm'},{native:'incoming'},{wrongHash:true},{verdict:'Blocked',blockers:['Unknown outcome']},{blockers:['Unresolved condition']}]) {
 const a=setup(),b=replace(a);const r=submit(b);if(options.native)options.native=b.session_id;
 if(options.role==='pm')await assert.rejects(()=>review(b,r,options),/subject changed/);else await review(b,r,options);assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/review|QA|reconstruction/);
 }
});
test('state changes invalidate acceptance; hook delivery does not; failed review remains and revised reconstruction needs new review',async()=>{
 const a=setup(),b=replace(a),r=submit(b);await review(b,r,{verdict:'Fail',blockers:['Missing constraint']});
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/negative review/);
 const revised=submit(b);assert.notEqual(revised.id,r.id);await review(b,revised);
 const before=engine.handover({...b,action:'inspect'},'codex');
 withStore(b.root,db=>db.transaction('fixture.delivery',s=>{s.notices.push({id:'n',kind:'must_know',summary:'new unknown',resolution:null,deliveries:[]});return s;}));
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/stale/);
 const fresh=submit(b),hash=fresh.handover.subject_sha256;withStore(b.root,db=>db.transaction('fixture.delivery',s=>{s.notices[0].deliveries.push({at:'now'});s.notices[0].seen_at='now';assert.equal(handoverHash(s),hash);return s;}));await review(b,fresh);
 engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex');assert.ok(before.required_semantics.source_id);
});
test('ordinary work cannot run during pending handover; pause cancels a check and late output quarantines',async()=>{
 const a=setup(),b=replace(a),r=submit(b);assert.equal(handoverReviewEligible(withStore(b.root,db=>db.read()),{role:'engineer',review_of:r.id}),false);
 const j=queue(b,r),ctx=withStore(b.root,db=>{const s=db.read();return assignmentContext(s,s.jobs[j]);}),page=ctx.initial_delivery[0];await work(b.root,j,async()=>{engine.control({...b,action:'pause',expected_epoch:2,source_instruction:'pause'},'codex');return {native_id:id('native'),text:JSON.stringify({content:'Late check',citations:[{source_id:page.source_id,sha256:page.sha256,offset:page.offset,length:page.length,range_sha256:page.range_sha256}],messages:[],notices:[],review:{verdict:'Pass',reason:'late'}})};});
 assert.equal(exactStatus(b,'codex').jobs.find(v=>v.id===j).status,'quarantined');assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/reconstruction|QA/);
});


test('distinct mandatory semantics over 200k page without embedding the stream',()=>{
 for(const size of [110000,210000]){
  const a=setup();for(let i=0;i<size;i+=90000)engine.save({...a,kind:'artifact',content:'x'.repeat(Math.min(90000,size-i)),source_reference:'Fictional archive'},'codex');
  const b=replace(a),r=submit(b),s=withStore(a.root,db=>db.read()),job={role:'qa',task:'Review exact frozen evidence',inputs:[],review_of:{id:r.id,revision:r.revision}};
  const ctx=assignmentContext(s,job),pack=JSON.parse(ctx.text);
  assert.ok(ctx.text.length<200000);assert.ok(!ctx.text.includes('x'.repeat(90000)));
  assert.ok(pack.frozen_subject.required_semantics.length>size);
 }
});

test('integration binds coordination metadata without duplicating frozen handover evidence',()=>{
 const a=setup(),b=replace(a),r=submit(b),s=withStore(a.root,db=>db.read());
 const job={role:'qa',task:'Review frozen handover',inputs:[],review_of:{id:r.id,revision:r.revision},coordination:{version:1,dependencies:[],resources:['handover-review']}};
 const before=assignmentContext(s,job),pack=JSON.parse(before.text);
 assert.deepEqual(before.handover_evidence.handover.review_context.value.assignment.coordination,job.coordination);
 job.coordination.resources=['changed-resource'];assert.notEqual(assignmentContext(s,job).hash,before.hash);
 assert.equal(Object.keys(pack).filter(k=>k==='frozen_subject').length,1);
});


test('orphan classification provenance holds handover without revoking outgoing ownership',()=>{
 const a=setup();
 withStore(a.root,db=>db.transaction('fixture.classification',s=>{s.context_classifications={historical:{source:{id:'historical',revision:1,sha256:'source-hash'},plan:{id:'plan',sha256:'plan-hash'},review:{id:'review',sha256:'review-hash'},disposition:'resolved',roles:['research'],scopes:[]}};return s;}));
 assert.throws(()=>replace(a),/classification source is missing/);
 const current=withStore(a.root,db=>db.read());assert.equal(current.owner.session_id,a.session_id);assert.equal(current.owner.epoch,1);
 assert.equal(current.context_classifications.historical.source.sha256,'source-hash');
});

function semanticText(ctx){const e=ctx.handover_evidence;return e.sources[e.pages[0].source_id].raw;}
function frozenContext(b,j){return withStore(b.root,db=>{const s=db.read();return assignmentContext(s,s.jobs[j]);});}
function pass(r,citations){return {content:'Independently checked compulsory semantics, legacy restrictions, unknown outcomes and exact frozen evidence; preparation only.',messages:[],notices:[],citations,review:{verdict:'Pass',reason:'Compared reconstruction against the supplied semantic sources and independently retrieved archive.',permitted_action:'resume_handover',subject_sha256:r.handover.subject_sha256,blockers:[]}};}

test('founder inspection, exact reads and submission receipts remain bounded while the full subject is retained',()=>{
 const a=setup();for(let n=0;n<4;n++)engine.save({...a,kind:'artifact',content:('Unknown obligation '+n+'; ').repeat(4000)},'codex');
 const b=replace(a),packet=engine.handover({...b,action:'inspect'},'codex');
 assert.ok(JSON.stringify(packet).length<200000);assert.equal(packet.subject,undefined);
 const source=packet.required_semantics;
 const read=engine.handover({...b,action:'read',subject_sha256:packet.subject_sha256,source_id:source.source_id,sha256:source.sha256,offset:0,length:32768},'codex');
 assert.equal(read.text.length,32768);assert.ok(JSON.stringify(read).length<200000);
 const receipt=engine.handover({...b,action:'submit',content},'codex');
 assert.ok(JSON.stringify(receipt).length<200000);assert.equal(receipt.handover.subject,undefined);
 const frozen=withStore(b.root,db=>db.read()),target=frozen.records[receipt.id];
 assert.ok(JSON.stringify(target.handover.subject).length<200000);
 assert.ok(JSON.stringify(Object.fromEntries(Object.entries(target.handover.subject.records).map(([key,value])=>[key,resolveSnapshotEntry(frozen,value)]))).length>200000);
 assert.equal(receipt.handover.retained_subject.sha256,target.handover.subject_sha256);
 withStore(b.root,db=>db.transaction('fixture.source-change',s=>{s.records.extra={id:'extra',kind:'intent',content:'Another binding obligation'};return s;}));
 assert.throws(()=>engine.handover({...b,action:'read',subject_sha256:packet.subject_sha256,source_id:source.source_id,sha256:source.sha256,offset:0,length:1},'codex'),/subject changed/);
});

test('changed prior negative-review evidence invalidates a later Pass at resume',async()=>{
 const b=replace(setup()),first=submit(b);await review(b,first,{verdict:'Fail',blockers:['Preserve old obligation']});
 const revised=submit(b);await review(b,revised);
 withStore(b.root,db=>db.transaction('fixture.prior-finding-change',s=>{const old=Object.values(s.records).find(r=>r.review_of?.id===first.id&&r.review?.verdict==='Fail');old.content+=' A newly observed unresolved condition.';return s;}));
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/QA|review/);
});

test('invalid retained evidence fails admission before owner, epoch, sessions or pause change',()=>{
 const a=setup();withStore(a.root,db=>db.transaction('fixture.corrupt-source',s=>{s.records.invalid=null;return s;}));
 const before=withStore(a.root,db=>db.read()),b={...a,session_id:id('incoming')};engine.bind(a.root,b.session_id,'codex');
 assert.throws(()=>engine.control({...b,action:'handover',expected_epoch:1,source_instruction:'Continue here'},'codex'));
 assert.deepEqual(withStore(a.root,db=>db.read()),before);
});

test('all previous reconstruction and review execution evidence remains current and retrievable',async()=>{
 for(const field of ['reconstruction','review','execution']) {
  const b=replace(setup()),first=submit(b);await review(b,first,{verdict:'Fail',blockers:['Unique old finding']});
  const before=engine.handover({...b,action:'inspect'},'codex');
  const next=submit(b);await review(b,next);
  const snapshot=withStore(b.root,db=>db.read());
  assert.ok(snapshot.records[next.id].handover.subject.records[first.id]);
  assert.equal(before.subject_sha256,next.handover.subject_sha256);
  withStore(b.root,db=>db.transaction('fixture.prior-evidence-change',s=>{
   const old=Object.values(s.records).find(r=>r.review_of?.id===first.id&&r.review?.verdict==='Fail');
   if(field==='reconstruction')s.records[first.id].content+=' New unresolved obligation.';
   if(field==='review')old.review.new_uncertainty='Previously omitted substantive evidence.';
   if(field==='execution')s.jobs[old.job_id].error='Changed prior execution outcome.';
   return s;
  }));
  assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/stale|QA|review/);
 }
});

test('founder read response bounds include escaped payload and long source metadata',()=>{
 const a=setup(),key='k'.repeat(5000)+'.mjs',payload='\u0000'.repeat(40000);
 withStore(a.root,db=>db.transaction('fixture.escaped-range',s=>{s.records.long={id:'long',kind:'artifact',content:JSON.stringify({basis:'Fictional',files:{[key]:payload}})};return s;}));
 const packet=engine.handover({...a,action:'inspect'},'codex');
 const evidence=withStore(a.root,db=>{const s=db.read(),{upgrade_history,upgrade,...current}=handoverSubject(s);return buildEvidence(current,[...upgrade_history,...(upgrade?[upgrade]:[])],{wholeBodyAliases:false,checkpointContinuity:true,snapshotState:s});});
 const source=Object.values(evidence.sources).find(s=>s.kind==='payload'&&s.raw===payload);
 assert.ok(source);
 const args={...a,action:'read',subject_sha256:packet.subject_sha256,source_id:source.source_id,sha256:source.sha256,offset:0,length:32768};
 assert.throws(()=>engine.handover(args,'codex'),/response bound/);
 const smaller=engine.handover({...args,length:16000},'codex');assert.equal(smaller.text,payload.slice(0,16000));assert.ok(JSON.stringify(smaller).length<=200000);
});

test('repaired reconstructions retain exact originals without recursively copying old snapshots',async()=>{
 const a=setup();for(let n=0;n<7;n++)engine.save({...a,kind:'artifact',content:JSON.stringify({basis:'Fictional source evidence',files:[{path:n+'.mjs',content:'x'.repeat(80000)}]})},'codex');
 const b=replace(a),sizes=[],targets=[];
 for(let n=0;n<3;n++){const r=submit(b);targets.push(r);sizes.push(JSON.stringify(r.handover.subject).length);await review(b,r,{verdict:'Fail',blockers:['Fictional still-open finding '+n]});}
 assert.ok(Math.max(...sizes)<2*Math.min(...sizes),'Old full snapshots must not double on every repaired reconstruction');
 const first=targets[0],current=targets.at(-1);
 assert.throws(()=>engine.save({...b,id:first.id,expected_revision:first.revision,kind:'artifact',content:'Overwrite prior reconstruction'},'codex'),/immutable/);
 const job=queue(b,current),ctx=withStore(b.root,db=>{const s=db.read();return assignmentContext(s,s.jobs[job]);});
 const original=Object.values(ctx.handover_evidence.sources).find(s=>s.kind==='original-handover-record'&&s.path==='/records/'+first.id);
 assert.ok(original);
 const raw=JSON.stringify(withStore(b.root,db=>db.read().records[first.id]));
 assert.equal(readEvidence(ctx.handover_evidence,{source_id:original.source_id,sha256:original.sha256,offset:0,length:Math.min(32768,original.length)}).text,raw.slice(0,32768));
});
function archiveFixture(a,size=500){
 withStore(a.root,db=>db.transaction('fixture.public-archive',s=>{
  const cp={id:s.id,records:{legacy:{id:'legacy',kind:'decision',revision:1,status:'Resolved',content:'Legacy restriction: never contact fictional customers without founder approval.'},body:{id:'body',kind:'artifact',revision:1,content:JSON.stringify({kind:'source-evidence',source:'🧪'.repeat(size/2),claim:'Archival source only, no proof of success.'})}},jobs:{},notices:[],messages:[],unknown_legacy_limit:'Fictional unknown restriction remains binding.'};
  s.upgrade_history=Array.from({length:8},(_,i)=>({id:'fictional-upgrade-'+i,status:'recovered',checkpoint:structuredClone(cp),error:'Unresolved fictional historical failure'}));
  return s;
 }));
}
test('failed handover with upgrade history reuses typed history semantics instead of reembedding checkpoints',t=>{
 const a=setup();archiveFixture(a,80000);const b=replace(a),lengths=[];
 withStore(b.root,db=>db.transaction('fixture.distinct-history',s=>{
  s.upgrade={id:'fictional-current-upgrade',status:'recovered',checkpoint:structuredClone(s.upgrade_history[0].checkpoint),unknown_current_condition:'Never revive the exhausted fictional scope.'};
  s.upgrade_history[3].distinct_finding='Historical dissent must remain compulsory.';return s;
 }));
 for(let n=0;n<3;n++){
  const r=submit(b),s=withStore(b.root,db=>db.read()),job={role:'qa',task:'Review fixed fictional reconstruction',inputs:[],review_of:{id:r.id,revision:r.revision}};
  const ctx=assignmentContext(s,job),e=ctx.handover_evidence,stream=e.sources[e.pages[0].source_id];lengths.push(stream.length);
  assert.match(stream.raw,/Historical dissent must remain compulsory/);assert.match(stream.raw,/Never revive the exhausted fictional scope/);
  assert.match(stream.raw,/Fictional unknown restriction remains binding/);
  if(n>0)assert.match(stream.raw,/Unresolved fictional finding/);
  for(const original of Object.values(e.sources).filter(x=>x.kind==='original-handover-record')){
   const raw=JSON.stringify(s.records[original.path.slice('/records/'.length)]);let returned='';
   for(let offset=0;offset<original.length;){let length=Math.min(32768,original.length-offset);const c=raw.charCodeAt(offset+length-1);if(c>=0xd800&&c<=0xdbff)length--;returned+=readEvidence(e,{source_id:original.source_id,sha256:original.sha256,offset,length}).text;offset+=length;}
   assert.equal(returned,raw,'Every retained original remains exactly retrievable');
  }
  withStore(b.root,db=>db.transaction('fixture.negative-review',v=>{const key=id('negative-review');v.records[key]={id:key,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:'fictional-independent-'+n,review_of:{id:r.id,revision:1},content:'Unresolved fictional finding '+n,review:{verdict:'Blocked',permitted_action:'hold',subject_sha256:r.handover.subject_sha256,blockers:['Still open '+n]}};return v;}));
  assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Do not bypass Blocked'},'codex'),/negative review|stale/);
 }
 t.diagnostic('Required semantic characters across repaired submissions: '+lengths.join(', '));
 assert.ok(Math.max(...lengths)<2*Math.min(...lengths),`Typed history must not cause semantic amplification: ${lengths}`);
});
test('25.7M fictional archive fits 200k; exact originals, mandatory legacy obligations and retrieval complete a full handover',async t=>{
 // This injected reviewer has no native process/onSpawn callback and therefore
 // uses legacy started_at timing. Test evidence correctness independently of CPU
 // speed; only Date is mocked, scoped to this test and restored by node:test.
 // The boundary regression below separately advances this same legacy clock.
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const a=setup();archiveFixture(a,3212500);
 const archive=withStore(a.root,db=>JSON.stringify(db.read().upgrade_history));
 assert.ok(archive.length>25700000);
 const b=replace(a),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j),pack=JSON.parse(ctx.text);
 assert.ok(ctx.text.length<200000,ctx.text.length);
 assert.equal(pack.preservation.upgrade_history_sha256,digest(JSON.stringify(r.handover.subject.upgrade_history)));
 assert.equal(digest(JSON.stringify(r.handover.subject)),r.handover.subject_sha256);
 const retained=withStore(b.root,db=>{const s=db.read();return r.handover.subject.upgrade_history.map(u=>resolveSnapshotEntry(s,u));});
 assert.equal(JSON.stringify(retained),archive);
 assert.match(semanticText(ctx),/Legacy restriction: never contact fictional customers/);
 assert.match(semanticText(ctx),/Fictional unknown restriction remains binding/);
 assert.match(semanticText(ctx),/Unresolved fictional historical failure/);
 const source=ctx.handover_evidence.inventory.entries.find(x=>x.reason==='prior-full-checkpoint-snapshot');
 const original=JSON.stringify(retained[0].checkpoint),unicodeOffset=original.indexOf('🧪');
 assert.equal(source.sha256,digest(original));
 let calls=0;const native=id('independent-native'),registry=pack.frozen_subject.registry;
 await completeReview(b,j,async(host,session,request)=>{
  if(calls++===0){assert.equal(session,undefined);return {native_id:native,text:JSON.stringify({reads:[{source_id:registry.source.source_id,sha256:registry.source.sha256,offset:0,length:Math.min(registry.length,32768)}]})};}
  assert.equal(session,native);const response=JSON.parse(request),read=response.reads[0];
  if(calls===2){assert.match(read.text,/prior-full-checkpoint-snapshot/);return {native_id:native,text:JSON.stringify({reads:[{source_id:source.source_id,sha256:source.sha256,offset:unicodeOffset,length:4}]})};}
  assert.equal(read.text,original.slice(unicodeOffset,unicodeOffset+4));assert.equal(response.subject_sha256,r.handover.subject_sha256);
  const {source_id,sha256,offset,length,range_sha256}=read;
  return {native_id:native,text:JSON.stringify(pass(r,[{source_id,sha256,offset,length,range_sha256}]))};
 });
 const state=withStore(b.root,db=>db.read());assert.equal(state.jobs[j].status,'completed',reviewDiagnostics(state,j));
 assert.equal(state.jobs[j].handover_reads.at(-1).session_id,native);
 assert.equal(JSON.stringify(state.upgrade_history),archive);
 assert.equal(handoverHash(state),r.handover.subject_sha256);
 engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Resume fictional preparation after independent check'},'codex');
});

// Keep failure output bounded: full archive records and read ledgers are huge.
// Re-evaluate as running because terminal job status otherwise hides its timing.
function reviewDiagnostics(state,key) {
 const job=state.jobs[key],at=job.finished_at??new Date().toISOString();
 return JSON.stringify({id:key,status:job.status,error:job.error,execution_failure:job.execution_failure,
  started_at:job.started_at,finished_at:job.finished_at,execution_started_at:job.execution_started_at,
  execution_deadline_at:job.execution_deadline_at,timing:jobTimeoutState({...job,status:'running'},Date.parse(at)),
  artifact_status:state.records[job.artifact_id]?.status,read_count:job.handover_reads?.length});
}

test('legacy injected handover reviewer rejects output at and after its execution deadline',async t=>{
 const start=Date.now();t.mock.timers.enable({apis:['Date'],now:start});
 for(const elapsed of [DEFAULT_EXECUTION_TIMEOUT_MS-1,DEFAULT_EXECUTION_TIMEOUT_MS,DEFAULT_EXECUTION_TIMEOUT_MS+1]){
  const b=replace(setup()),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j);
  const citation=JSON.parse(ctx.text).evidence_protocol.citations[0];
  await work(b.root,j,async()=>{
   const running=withStore(b.root,db=>db.read().jobs[j]);
   assert.equal(running.timeout_policy_version,undefined);
   assert.equal(running.execution_started_at,undefined);
   t.mock.timers.setTime(Date.parse(running.started_at)+elapsed);
   // An honest incomplete judgment avoids claiming semantic delivery or Pass.
   return {native_id:'fictional-deadline-native',text:JSON.stringify({...pass(r,[citation]),review:{verdict:'Blocked',reason:'Compulsory evidence remains unread',permitted_action:'hold',subject_sha256:r.handover.subject_sha256,blockers:['Read remaining obligations']}})};
  });
  const s=withStore(b.root,db=>db.read()),job=s.jobs[j],late=elapsed>=DEFAULT_EXECUTION_TIMEOUT_MS;
  const diagnostic=reviewDiagnostics(s,j);
  assert.equal(job.status,late?'quarantined':'completed',diagnostic);
  assert.equal(s.records[job.artifact_id].status,late?'Quarantined':'Submitted',diagnostic);
  assert.equal(job.execution_started_at,undefined,diagnostic);
  if(late){
   assert.equal(job.execution_failure.code,'ROLE_TIMEOUT',diagnostic);
   assert.equal(s.sessions[job.session_key].native_id,null,diagnostic);
  }
  assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Try incomplete fictional review'},'codex'),/QA|review|negative/);
 }
});

test('frozen reads enforce exact Unicode ranges, hashes, scope, and delivery-bound citations',async()=>{
 const {readEvidence,createDeliveryLedger,recordDelivery,validateCitations}=await import('../plugins/soloco/runtime/upgrade-evidence.mjs');
 const a=setup();archiveFixture(a);const b=replace(a),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j),e=ctx.handover_evidence;
 const source=e.inventory.entries.find(x=>x.reason==='typed-source-evidence-payload'),request={source_id:source.source_id,sha256:source.sha256,offset:0,length:4};
 const read=readEvidence(e,request);assert.equal(read.text,'🧪🧪');
 for(const change of [{source_id:'forged'},{sha256:'forged'},{offset:1},{length:32769},{offset:source.length,length:2},{offset:-1},{extra:true}])assert.throws(()=>readEvidence(e,{...request,...change}),/Evidence hold/);
 const citation={...request,revision:read.revision,range_sha256:read.range_sha256},ledger=createDeliveryLedger(e,'fictional-native');
 assert.throws(()=>validateCitations(e,[citation],ledger),/not completely delivered/);
 assert.throws(()=>recordDelivery(e,ledger,{...read}),/authentic/);
 recordDelivery(e,ledger,read);assert.equal(validateCitations(e,[citation],ledger),true);
 const other=createDeliveryLedger(e,'other-fictional-native');assert.throws(()=>validateCitations(e,[citation],other),/not completely delivered/);
});

test('worker rejects forged reads, stale canonical evidence, forged citations and native identity changes',async()=>{
 for(const scenario of ['forged','stale','citation','identity']){
  const a=setup();archiveFixture(a);const b=replace(a),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j),source=ctx.handover_evidence.inventory.entries.find(x=>x.reason==='prior-full-checkpoint-snapshot');let round=0;
  await work(b.root,j,async(host,session,request)=>{
   if(round++===0){
    if(scenario==='citation')return {native_id:'native-qa',text:JSON.stringify(pass(r,[{source_id:source.source_id,sha256:source.sha256}]))};
    if(scenario==='stale')withStore(b.root,db=>db.transaction('fixture.canonical-change',s=>{s.upgrade_history[0].error='Changed canonical failure';return s;}));
    return {native_id:'native-qa',text:JSON.stringify({reads:[{source_id:scenario==='forged'?'unknown':source.source_id,sha256:source.sha256,offset:0,length:20}]})};
   }
   const read=JSON.parse(request).reads[0],{source_id,sha256,offset,length,range_sha256}=read;
   return {native_id:scenario==='identity'?'different-native':'native-qa',text:JSON.stringify(pass(r,[{source_id,sha256,offset,length,range_sha256}]))};
  });
  const s=withStore(b.root,db=>db.read());assert.notEqual(s.jobs[j].status,'completed',scenario);assert.match(s.jobs[j].error,/source|eligible|delivered|identity/,scenario);
  assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/stale|QA|review/);
 }
});

test('handover reads can exceed sixteen rounds without changing native session or invalidating their own snapshot',async()=>{
 const a=setup();archiveFixture(a);const b=replace(a),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j),source=ctx.handover_evidence.inventory.entries.find(x=>x.reason==='prior-full-checkpoint-snapshot');let calls=0;
 await completeReview(b,j,async(host,session,request)=>{
  if(calls++)assert.equal(session,'native-many-reads');
  if(calls<=18)return {native_id:'native-many-reads',text:JSON.stringify({reads:[{source_id:source.source_id,sha256:source.sha256,offset:0,length:10}]})};
  const {source_id,sha256,offset,length,range_sha256}=JSON.parse(request).reads[0];
  return {native_id:'native-many-reads',text:JSON.stringify(pass(r,[{source_id,sha256,offset,length,range_sha256}]))};
 });
 const s=withStore(b.root,db=>db.read());assert.equal(s.jobs[j].status,'completed',s.jobs[j].error);assert.equal(calls,19);assert.equal(handoverHash(s),r.handover.subject_sha256);
});

test('current obligations and distinct legacy team rules stay compulsory regardless of resolved status or classification',()=>{
 const a=setup();archiveFixture(a);
 withStore(a.root,db=>db.transaction('fixture.obligations',s=>{
  s.records.unknown={id:'unknown',revision:1,kind:'legacy-unknown',status:'Resolved',content:'Unknown current obligation: retain fictional approval restriction.'};
  s.records.negative={id:'negative',revision:1,kind:'review',status:'Resolved',content:'Dissent: fictional outcome unverified',review:{verdict:'Fail',reason:'Unresolved failure'}};
  s.jobs.uncertain={id:'uncertain',status:'failed',error:'Unknown execution result remains pending'};
  s.messages.push({id:'dissent',to:'pm',content:'Pending dissent for a different role must remain visible'});
  s.notices.push({id:'notice',kind:'decision_required',resolution:'old status',summary:'Founder notice remains review evidence'});
  s.upgrade_history[0].previous={plugin_version:'fictional',governance:'Legacy governance restriction',governance_sha256:'fictional-hash',roles:{qa:{name:'Legacy QA'}},cos_instructions:'Legacy pinned instruction: do not spend fictional funds.'};
  return s;
 }));
 const b=replace(a),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j),text=semanticText(ctx);
 for(const phrase of ['Unknown current obligation','Dissent: fictional outcome unverified','Unknown execution result remains pending','Pending dissent for a different role','Founder notice remains review evidence','Legacy pinned instruction: do not spend fictional funds.','Legacy governance restriction'])assert.ok(text.includes(phrase),phrase);
 assert.ok(ctx.handover_evidence.handover.checkpoint.some(f=>f.key==='governance'));
});

test('retained legacy v1 reconstruction and review still resume under their original contract',async()=>{
 const a=setup(),b=replace(a),r=submit(b);
 withStore(b.root,db=>db.transaction('fixture.retained-v1',s=>{const h=s.records[r.id].handover;delete h.evidence_protocol;h.subject=handoverSubject(s);h.subject_sha256=digest(JSON.stringify(h.subject));return s;}));
 const legacy=withStore(b.root,db=>db.read().records[r.id]);await review(b,legacy);
 const s=engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Resume retained fictional legacy handover'},'codex');assert.equal(s.paused,false);
});

test('supplemental allowlist mutation cannot alter a running frozen handover assignment',async()=>{
 const a=setup();archiveFixture(a);const b=replace(a),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j),citation=JSON.parse(ctx.text).evidence_protocol.citations[0];
 await work(b.root,j,async()=>{
  withStore(b.root,db=>db.transaction('fixture.mutate-allowlist',s=>{const source=Object.values(s.records).find(v=>v.id!==r.id);s.jobs[j].supplemental_sources=[{id:source.id,sha256:digest(JSON.stringify(source))}];return s;}));
  return {native_id:'native-mutated',text:JSON.stringify(pass(r,[citation]))};
 });
 const s=withStore(b.root,db=>db.read());assert.notEqual(s.jobs[j].status,'completed');assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/QA|review/);
});

test('a reconstruction edited after QA cannot reuse its earlier Pass',async()=>{
 const a=setup(),b=replace(a),r=submit(b);await review(b,r);
 withStore(b.root,db=>db.transaction('fixture.changed-reconstruction',s=>{s.records[r.id].content+=' Changed understanding after review.';return s;}));
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/QA/);
});

test('archival occurrence indexes and distinct current semantics stay retrievable outside the initial budget',()=>{
 const a=setup();
 withStore(a.root,db=>db.transaction('fixture.many-checkpoint-occurrences',s=>{
  for(let i=0;i<180;i++)s.records['r'+i]={id:'r'+i,kind:'decision',revision:1,content:'Fictional binding restriction '+i+': '+'x'.repeat(80)};
  const checkpoint={id:s.id,records:structuredClone(s.records),jobs:{},notices:[],messages:[]};
  s.upgrade_history=Array.from({length:8},(_,i)=>({id:'many-'+i,checkpoint:structuredClone(checkpoint)}));return s;
 }));
 const b=replace(a),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j),pack=JSON.parse(ctx.text);
 assert.ok(ctx.text.length<200000,ctx.text.length);assert.ok(pack.frozen_subject.registry.length>0);
 assert.match(semanticText(ctx),/Fictional binding restriction 179/);
 assert.ok(ctx.handover_evidence.inventory.entries.some(e=>e.kind==='checkpoint-equality-index'));
});

test('227 varied fictional obligations and large pinned rules require complete same-native delivery before Pass',async()=>{
 const a=setup();
 withStore(a.root,db=>db.transaction('fixture.varied-semantic-company',s=>{
  const prose=i=>Array.from({length:24},(_,k)=>`Clause ${i}.${k}: retain approval for fictional route ${i*31+k}; uncertain outcome ${k} requires evidence 🧪.`).join('\n');
  for(let i=0;i<227;i++)s.records['varied-'+i]={id:'varied-'+i,kind:['decision','note','artifact'][i%3],revision:1,status:i%2?'Resolved':'Submitted',content:prose(i),source_reference:`fictional://obligations/${i}`};
  s.governance=Array.from({length:2800},(_,i)=>`Pinned rule ${i}: founder approval is required for fictional operation ${i}; never infer success from inventory.\n`).join('');
  s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);
  s.notices.push({id:'unresolved-fiction',kind:'decision_required',summary:'Fictional launch approval remains unresolved',resolution:null});
  const cp={id:s.id,records:structuredClone(s.records),jobs:{},notices:structuredClone(s.notices),messages:[]};
  s.upgrade_history=Array.from({length:3},(_,i)=>{const checkpoint=structuredClone(cp);checkpoint.records['distinct-'+i]={id:'distinct-'+i,revision:1,kind:'decision',content:prose(300+i),source_reference:`fictional://snapshot/${i}`};return {id:'varied-upgrade-'+i,checkpoint,error:`Unresolved historical uncertainty ${i}`};});
  return s;
 }));
 const b=replace(a),r=submit(b),early=queue(b,r),ctx=frozenContext(b,early),pack=JSON.parse(ctx.text),citation=pack.evidence_protocol.citations[0];
 assert.ok(ctx.text.length<200000);assert.ok(!ctx.text.includes('Clause 226.23'));
 assert.ok(pack.frozen_subject.required_semantics.length>200000);assert.ok(pack.frozen_subject.registry.length>200000);
 assert.ok(pack.frozen_subject.entry_points.find(x=>x.path==='/governance').total>200000);
 const semantics=JSON.parse(semanticText(ctx));
 for(let i=0;i<3;i++){
  const original=withStore(b.root,db=>{const s=db.read();return JSON.stringify(resolveSnapshotEntry(s,r.handover.subject.upgrade_history[i]).checkpoint);});
  const source=ctx.handover_evidence.inventory.entries.find(x=>x.reason==='prior-full-checkpoint-snapshot'&&x.scope==='history'&&x.path===`/${i}/checkpoint`);
  assert.ok(source);let restored='';
  while(restored.length<source.length){
   let length=Math.min(32768,source.length-restored.length);const raw=ctx.handover_evidence.sources[source.source_id].raw,code=raw.charCodeAt(restored.length+length-1);if(code>=0xd800&&code<=0xdbff)length--;
   restored+=readEvidence(ctx.handover_evidence,{source_id:source.source_id,sha256:source.sha256,offset:restored.length,length}).text;
  }
  assert.equal(restored,original);assert.equal(source.sha256,digest(original));
 }
 for(let i=0;i<227;i++){
  const entry=semantics.handover.checkpoint.find(f=>f.key==='records').entries.find(e=>e.key==='varied-'+i);
  assert.equal(entry.value.source_reference,`fictional://obligations/${i}`);
  assert.equal(ctx.handover_evidence.sources[entry.source.source_id].path,`/records/varied-${i}`);
 }
 await work(b.root,early,async()=>({native_id:'fictional-early',text:JSON.stringify(pass(r,[citation]))}));
 let s=withStore(b.root,db=>db.read());assert.notEqual(s.jobs[early].status,'completed');assert.match(s.jobs[early].error,/required semantic stream not completely delivered/);
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'early'},'codex'),/QA/);
 const blockedReconstruction=submit(b),blocked=queue(b,blockedReconstruction);
 const blockedCitation=JSON.parse(frozenContext(b,blocked).text).evidence_protocol.citations[0];
 await work(b.root,blocked,async()=>({native_id:'fictional-incomplete',text:JSON.stringify({...pass(blockedReconstruction,[blockedCitation]),review:{verdict:'Blocked',reason:'Required semantic delivery is incomplete',blockers:['Read remaining obligations'],permitted_action:'hold',subject_sha256:blockedReconstruction.handover.subject_sha256}})}));
 s=withStore(b.root,db=>db.read());assert.equal(s.jobs[blocked].status,'completed');
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'blocked'},'codex'),/negative/);
 const fresh=submit(b),j=queue(b,fresh),freshCtx=frozenContext(b,j),stream=freshCtx.handover_evidence.sources[freshCtx.handover_evidence.pages[0].source_id];
 let offset=0,calls=0,received='',lastCitation;
 await work(b.root,j,async(host,session,request)=>{
  assert.ok(request.length<=200000,request.length);
  if(calls++){
   assert.equal(session,'fictional-complete-native');
   const packet=JSON.parse(request);assert.equal(packet.subject_sha256,fresh.handover.subject_sha256);
   assert.deepEqual(packet.deferred,[]);
   for(const read of packet.reads){assert.equal(read.offset,received.length);received+=read.text;const {source_id,sha256,offset,length,range_sha256}=read;lastCitation={source_id,sha256,offset,length,range_sha256};}
  }else assert.equal(session,undefined);
  if(offset===stream.length)return {native_id:'fictional-complete-native',text:JSON.stringify(pass(fresh,[lastCitation]))};
  const reads=[];
  for(let k=0;k<4&&offset<stream.length;k++){
   let length=Math.min(32768,stream.length-offset);const code=stream.raw.charCodeAt(offset+length-1);if(code>=0xd800&&code<=0xdbff)length--;
   reads.push({source_id:stream.source_id,sha256:stream.sha256,offset,length});offset+=length;
  }
  return {native_id:'fictional-complete-native',text:JSON.stringify({reads})};
 });
 s=withStore(b.root,db=>db.read());assert.equal(s.jobs[j].status,'completed',s.jobs[j].error);assert.equal(received,stream.raw);assert.ok(calls>4);
 assert.match(received,/Clause 226.23/);assert.match(received,/Pinned rule 2799/);
 assert.equal(handoverHash(s),fresh.handover.subject_sha256);
 engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Resume fully reviewed fictional subject'},'codex');
});

test('escaped frozen read packets defer whole ranges within 200k without losing source bytes',async()=>{
 const a=setup();withStore(a.root,db=>db.transaction('fixture.escaped-source',s=>{s.records.escaped={id:'escaped',kind:'artifact',revision:1,content:JSON.stringify({kind:'source-evidence',source:'\u0000'.repeat(4*32768),claim:'Fictional source, not success'})};return s;}));
 const b=replace(a),r=submit(b),j=queue(b,r),ctx=frozenContext(b,j),source=ctx.handover_evidence.inventory.entries.find(x=>x.reason==='typed-source-evidence-payload');
 let calls=0,received='',citation,deferred;
 await work(b.root,j,async(host,session,request)=>{
  assert.ok(request.length<=200000);
  if(calls++){
   assert.equal(session,'escaped-native');const packet=JSON.parse(request);deferred=packet.deferred;
   assert.equal(packet.reads.length,1);
   for(const read of packet.reads){received+=read.text;const {source_id,sha256,offset,length,range_sha256}=read;citation={source_id,sha256,...(read.revision!==undefined?{revision:read.revision}:{}),offset,length,range_sha256};}
   if(!deferred.length)return {native_id:'escaped-native',text:JSON.stringify({...pass(r,[citation]),review:{verdict:'Blocked',reason:'Source retrieved; semantic understanding incomplete',permitted_action:'hold',subject_sha256:r.handover.subject_sha256,blockers:['Compulsory stream not yet read']}})};
  }else deferred=Array.from({length:4},(_,i)=>({source_id:source.source_id,sha256:source.sha256,offset:i*32768,length:32768}));
  return {native_id:'escaped-native',text:JSON.stringify({reads:deferred})};
 });
 const s=withStore(b.root,db=>db.read());assert.equal(s.jobs[j].status,'completed',s.jobs[j].error);assert.equal(received,'\u0000'.repeat(4*32768));assert.equal(calls,5);
});

test('compulsory delivery rejects a final gap, overlapping duplicates and another native ledger',async()=>{
 const {createDeliveryLedger,recordDelivery,validateSemanticDelivery}=await import('../plugins/soloco/runtime/upgrade-evidence.mjs');
 const a=setup(),b=replace(a),r=submit(b),j=queue(b,r),e=frozenContext(b,j).handover_evidence,source=e.sources[e.pages[0].source_id];
 const ledger=createDeliveryLedger(e,'gap-native');
 for(let offset=0;offset<source.length-1;){
  let length=Math.min(32768,source.length-1-offset);const code=source.raw.charCodeAt(offset+length-1);if(code>=0xd800&&code<=0xdbff)length--;
  const read=readEvidence(e,{source_id:source.source_id,sha256:source.sha256,offset,length});
  recordDelivery(e,ledger,read);recordDelivery(e,ledger,read);offset+=length;
 }
 assert.throws(()=>validateSemanticDelivery(e,ledger),/not completely delivered/);
 assert.throws(()=>recordDelivery(e,ledger,{...readEvidence(e,{source_id:source.source_id,sha256:source.sha256,offset:source.length-1,length:1}),text:'forged'}),/authentic/);
 recordDelivery(e,ledger,readEvidence(e,{source_id:source.source_id,sha256:source.sha256,offset:source.length-1,length:1}));
 assert.equal(validateSemanticDelivery(e,ledger),true);
 assert.throws(()=>validateSemanticDelivery(e,createDeliveryLedger(e,'unread-native')),/not completely delivered/);
 assert.throws(()=>{source.raw='mutated';},TypeError);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {recordReference,currentExtensions} from '../plugins/soloco/runtime/current-state.mjs';
import {operatingContext,operatingFrontier} from '../plugins/soloco/runtime/operating-state.mjs';
const protocol='operating-state-v1',sha=v=>digest(JSON.stringify(v));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'operating-contract-'));process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'data');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const read=f=>withStore(f.root,db=>db.read());
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.contract.fixture',s=>{fn(s);return s;}));
function fixture(){const f={root:fs.mkdtempSync(path.join(tmp,'company-')),session_id:'founder-fixture',epoch:1,source_instruction:'Fictional fixture authorizes prospective read-only qualification; grants no external action.'};engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'Fictional operating protocol contract tests'},'codex');mutate(f,s=>{s.roles={qa:{name:'QA'},engineer:{name:'Engineer'}};s.governance='No external execution.';s.cos_instructions='Preserve all exceptions.';s.team_sha256=teamHash(s);});return f;}
const ctx=(f,args)=>publicCall('company_context',{...f,protocol,...args},'codex');
function home(f,id='home',scope='*',extra={}){return engine.save({...f,id,...(read(f).records[id]?{expected_revision:read(f).records[id].revision}:{}),kind:'artifact',content:'Complete fictional condition: no export or retry without canonical authority.',operating_record:{version:1,kind:'obligation',scope,owner:'runner',conditions:'Always while unresolved',exceptions:'None',clearing:'Exact independent closure',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:[id],...extra}},'codex');}
// The native adapter below is an explicitly fictional CONTRACT DOUBLE. Worker
// publication/closure, public APIs, hashes and SQLite transactions are real.
async function review(f,plan,{native='fictional-independent-'+plan,verdict='Pass',hook,action='publish_operating_state'}={}){
 const queued=engine.dispatch({...f,role:'qa',review_of:plan,task:'Review complete fictional operating meaning, preservation, authority and interactions.'},'codex',{check:()=>({available:true,authenticated:true,version:'contract-double'}),launch:()=>({on(){},unref(){}})});
 await work(f.root,queued.id,async(_host,_session,prompt,_dir,timeout,_selection,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));const target=read(f).records[plan];if(hook)hook();return {native_id:native,text:JSON.stringify({content:'FICTIONAL CONTRACT DOUBLE: complete fixture conditions checked; no native semantic acceptance claimed.',messages:[],notices:[],review:{verdict,reason:'Fictional contract judgment',permitted_action:action,plan_sha256:sha(target.operating_plan??target.context_classification_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:verdict==='Pass'?[]:['fixture unresolved']}})};});
 const s=read(f),j=s.jobs[queued.id];assert.equal(j.status,'completed',j.error);return {id:j.artifact_id,job:queued.id};
}
async function publish(f){const p=await ctx(f,{action:'plan'}),r=await review(f,p.id);const result=await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id});assert.equal(result.published,true);return {p,r};}

test('public API publishes atomically, keeps authority separate, and dispatch uses accepted current meaning',async()=>{const f=fixture();home(f);const {p,r}=await publish(f);assert.equal((await ctx(f,{action:'inspect'})).status,'Accepted');const j=engine.dispatch({...f,role:'engineer',task:'Read accepted fictional current meaning'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});const s=read(f),job=s.jobs[j.id];assert.equal(job.context_format,6);const pack=JSON.parse(assignmentContext(s,job).text);assert.equal(pack.checkpoint.homes.length,1);assert.match(pack.checkpoint.controls.governance,/No external/);assert.equal(s.operating_state.review.id,r.id);assert.equal(s.operating_state.plan.id,p.id);});

test('missing legacy bootstrap is visibly DIRTY and apply rolls back without acceptance',async()=>{const f=fixture();engine.save({...f,id:'unknown',kind:'artifact',content:'An unknown distant exception prohibits retry.'},'codex');const p=await ctx(f,{action:'plan'});assert.equal(p.frontier.length,1);const before=read(f);await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:'absent'}),/frontier coverage incomplete/);assert.deepEqual(read(f),before);const view=await ctx(f,{action:'inspect'});assert.equal(view.status,'Held');assert.equal(view.frontier[0].status,'DIRTY');assert.equal(view.frontier[0].scope,'*');});

test('new membership, changed exact source, wrong independent identity and absent closure cannot publish',async()=>{for(const mode of ['membership','source','native','closure','negative']){const f=fixture();home(f);const p=await ctx(f,{action:'plan'});const r=await review(f,p.id,{native:mode==='native'?f.session_id:undefined});if(mode==='membership')home(f,'global-prohibition');if(mode==='source')home(f,'home','*',{conditions:'Changed prohibition'});if(mode==='closure')mutate(f,s=>{s.jobs[r.job].coordination_release.termination_confirmed=false;});if(mode==='negative')mutate(f,s=>{s.records.negative={id:'negative',kind:'review',status:'Submitted',review_of:{id:p.id,revision:1},review:{verdict:'Blocked'}};});const before=read(f);await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.id}),/Operating state Held/);assert.deepEqual(read(f),before);assert.equal(read(f).operating_state,undefined);}});

test('scope closure, global membership, expiry, receipt changes, revocation and missed communication hold',async()=>{const f=fixture();home(f,'a','billing');home(f,'b','shipping');await publish(f);const baseline=read(f);assert.equal(operatingContext(baseline,{scope:'billing'}).homes.length,1);for(const mode of ['scope','global','expiry','receipt','revocation','communication','unknown']){mutate(f,s=>{Object.assign(s,structuredClone(baseline));if(mode==='scope')s.records.b.content+=' scoped change';if(mode==='global')s.records.a.operating_record.scope='*';if(mode==='expiry')s.operating_state.valid_until='2000-01-01T00:00:00Z';if(mode==='receipt')s.records[s.operating_state.review.id].content+=' altered';if(mode==='revocation')s.governance+=' Grant revoked; allowance spent.';if(mode==='communication')s.messages.push({id:'missed',to:'runner',content:'Must communicate restriction'});if(mode==='unknown')s.records.u={id:'u',kind:'artifact',content:'inert',inert:true};});assert.throws(()=>operatingContext(read(f),{scope:'billing'}),/Held/);} });

test('pause fences publication reviewer and prospective handover cannot hide unknown legacy',async()=>{const f=fixture();home(f);const p=await ctx(f,{action:'plan'});engine.control({...f,action:'pause',expected_epoch:1},'codex');assert.throws(()=>engine.dispatch({...f,role:'qa',review_of:p.id,task:'Old proposal'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})}),/paused/);await assert.rejects(publicCall('company_handover',{root:f.root,session_id:f.session_id,epoch:f.epoch,action:'submit',protocol:'operating-handover-v4',content:'Complete fictional reconstruction '.repeat(10)},'codex'),/pending paused/);});

async function archive(f,count,start=0){
 const ids=[];for(let i=start;i<start+count;i++){const id='archive-'+i;ids.push(id);engine.save({...f,id,kind:'artifact',content:'FICTIONAL INERT AUDIT ONLY '+String(i)+' '+'.'.repeat(4000)},'codex');}
 const p=engine.contextControl({...f,action:'plan',record_ids:ids,disposition:'resolved'},'codex');
 const r=await review(f,p.id,{action:'apply_context_classification'});
 engine.contextControl({...f,action:'apply',plan_id:p.id,review_id:r.id},'codex');return ids;
}
test('10x independently classified inert archive keeps actual mandatory operating assignment bytes and semantic work constant',async()=>{const f=fixture();home(f);await archive(f,1);await publish(f);const job={id:'prospective-task',role:'engineer',context_format:6,task:'Compare accepted context',inputs:[]};const before=assignmentContext(read(f),job),first=operatingContext(read(f));await archive(f,9,1);const after=assignmentContext(read(f),job),last=operatingContext(read(f));assert.equal(after.text,before.text);assert.equal(last.homes.length,first.homes.length);assert.equal(Buffer.byteLength(after.text),Buffer.byteLength(before.text));assert.equal(read(f).records['archive-9'].content.length,4029);engine.save({...f,id:'unqualified',kind:'artifact',content:'Writer says inert; no independent judgment.'},'codex');assert.throws(()=>assignmentContext(read(f),job),/DIRTY/);});

test('deleted applicable home and changed exact provenance cannot disappear from accepted meaning',async()=>{const f=fixture();home(f);await publish(f);const baseline=read(f);mutate(f,s=>{delete s.records.home;});assert.throws(()=>operatingContext(read(f)),/membership/);mutate(f,s=>{Object.assign(s,structuredClone(baseline));s.records.home.operating_record.conditions='new condition';});assert.throws(()=>operatingContext(read(f)),/source\/receipt changed|unaccepted|DIRTY/);});

test('typed outcome requires complete historical uncertainty; text cannot manufacture permission',async()=>{const f=fixture();assert.throws(()=>home(f,'bad','*',{kind:'outcome'}),/attempted action/);assert.throws(()=>home(f,'bad','*',{kind:'permission',remaining:10,revoked:false,grant_refs:[]}),/permission/);home(f,'outcome','*',{kind:'outcome',attempted_action:'Attempted fictional write',resources:['fictional resource'],possible_effects:'May have written once',uncertainty:'Remote completion unknown',retry_clearing:'Inspect remote effects and obtain canonical retry grant',historical_receipts:['outcome']});await publish(f);const checkpoint=operatingContext(read(f));assert.equal(checkpoint.homes[0].value.operating_record.uncertainty,'Remote completion unknown');assert.equal(checkpoint.homes[0].value.operating_record.retry_clearing,'Inspect remote effects and obtain canonical retry grant');});

test('public prospective v4 reconstruction requires accepted coverage and exact independent resume QA plus closure',async()=>{
 const f=fixture();home(f);mutate(f,s=>{s.paused=true;s.handover={id:'fictional-transfer',status:'pending',incoming_owner:{...s.owner},previous_owner:{host:'codex',session_id:'prior-fixture',epoch:0}};});
 let p=await ctx(f,{action:'plan',maintenance:true});let pr=await review(f,p.id);await ctx(f,{action:'apply',plan_id:p.id,review_id:pr.id});
 const target=engine.handover({...f,action:'submit',protocol:'operating-handover-v4',content:'Objectives: preserve current conditions. Restrictions: no export or retry without canonical grants. Communication: preserve complete notices. Uncertainty: maintain all unresolved effects. Next: review only.'},'codex');
 assert.equal(read(f).records[target.id].handover.evidence_protocol,4);
 assert.throws(()=>engine.control({...f,action:'resume',expected_epoch:1},'codex'),/QA|DIRTY/);
 const q=engine.dispatch({...f,role:'qa',review_of:target.id,task:'Independently check exact prospective handover'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
 const context=assignmentContext(read(f),read(f).jobs[q.id]),stream=context.handover_evidence.sources[context.handover_evidence.pages[0].source_id];let offset=0;
 await work(f.root,q.id,async(_host,_session,_prompt,_dir,timeout,_selection,options)=>{options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));if(offset<stream.length){const length=Math.min(16000,stream.length-offset),start=offset;offset+=length;return {native_id:'fictional-v4-native',text:JSON.stringify({reads:[{source_id:stream.source_id,sha256:stream.sha256,offset:start,length}]})};}return {native_id:'fictional-v4-native',text:JSON.stringify({content:'FICTIONAL CONTRACT DOUBLE: complete prospective fixture semantics reconstructed.',messages:[],notices:[],citations:JSON.parse(context.text).evidence_protocol.citations.slice(0,1),review:{verdict:'Pass',reason:'Exact fictional checkpoint checked',permitted_action:'resume_handover',subject_sha256:read(f).records[target.id].handover.subject_sha256,blockers:[]}})};});
 const completed=read(f).jobs[q.id];assert.equal(completed.status,'completed',completed.error);
 mutate(f,s=>{s.jobs[q.id].coordination_release.termination_confirmed=false;});assert.throws(()=>engine.control({...f,action:'resume',expected_epoch:1},'codex'),/QA|DIRTY/);
 mutate(f,s=>{s.jobs[q.id].coordination_release.termination_confirmed=true;});const accepted=read(f);engine.control({...f,action:'resume',expected_epoch:1},'codex');assert.equal(read(f).handover.status,'completed');assert.equal(read(f).paused,false);
 assert.equal(operatingContext(accepted).homes.length,1);
 for(const mode of ['failed','quarantined','unknown-extension']){
  const s=structuredClone(accepted),j=structuredClone(s.jobs[q.id]),r=structuredClone(s.records[j.artifact_id]);
  j.id='handover-sibling';j.artifact_id='handover-sibling-review';r.id=j.artifact_id;r.job_id=j.id;
  if(mode==='failed')j.status='failed';if(mode==='quarantined'){j.status='quarantined';r.status='Quarantined';}if(mode==='unknown-extension')j.unknown_effect={retry:'Forbidden'};
  s.jobs[j.id]=j;s.records[r.id]=r;
  const frontier=operatingFrontier(s);assert.ok(frontier.entries.some(e=>e.source.id==='job:'+j.id));assert.ok(frontier.entries.some(e=>e.source.id===r.id));assert.throws(()=>operatingContext(s),/DIRTY/);
 }

});


test('late new and changed falsely scoped prohibitions stay globally DIRTY, but fresh proposals include them',async()=>{
 for(const changed of [false,true]){
  const f=fixture();home(f,'accepted','shipping');home(f,'rule','billing');await publish(f);
  const accepted=read(f);assert.equal(operatingContext(accepted,{scope:'shipping'}).homes.length,1);
  home(f,changed?'rule':'late-rule','billing',{kind:'rule',conditions:'Global prohibition: never export customer data, regardless of task scope.'});
  assert.throws(()=>operatingContext(read(f),{scope:'shipping'}),/DIRTY/);
  const dirty=operatingFrontier(read(f),{consuming:true}).entries.find(e=>e.source.id===(changed?'rule':'late-rule'));
  assert.equal(dirty.scope,'*');assert.equal(dirty.status,'DIRTY');
  const p=await ctx(f,{action:'plan'});assert.equal(p.held,false);
  const r=await review(f,p.id);await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id});
  assert.equal(operatingContext(read(f),{scope:'shipping'}).homes.length,1);
 }
});

test('publication proof stays current; failed, quarantined, uncertain and unknown-extension siblings stay DIRTY',async()=>{
 const f=fixture();home(f);const {p,r}=await publish(f),base=read(f);
 assert.equal(operatingContext(base).homes.length,1);
 for(const mode of ['failed','quarantined','uncertain','extension','queued','running','pass-sibling']){
  const s=structuredClone(base),j=structuredClone(s.jobs[r.job]),record=structuredClone(s.records[r.id]);
  j.id='sibling';j.artifact_id='sibling-review';record.id='sibling-review';record.job_id=j.id;
  if(['failed','queued','running'].includes(mode))j.status=mode;
  if(mode==='quarantined'){j.status='quarantined';record.status='Quarantined';}
  if(mode==='uncertain'){j.status='running';j.execution_failure={outcome:'unknown'};j.coordination_release={termination_confirmed:false};}
  if(mode==='extension')j.unreviewed_effect='May have sent a write';
  s.jobs[j.id]=j;s.records[record.id]=record;
  const frontier=operatingFrontier(s,{consuming:true});
  assert.ok(frontier.entries.some(e=>e.source.id==='job:sibling'),mode);
  assert.ok(frontier.entries.some(e=>e.source.id===record.id),mode);
  assert.throws(()=>operatingContext(s),/DIRTY/,mode);
  assert.deepEqual(s.operating_state,base.operating_state);
 }
 assert.equal(base.operating_state.plan.id,p.id);
});

test('mechanical publication index rejects tampering and retains unknown state extensions',async()=>{
 const f=fixture();home(f);await publish(f);const base=read(f);
 assert.deepEqual(currentExtensions(base),{});
 for(const alter of [s=>{s.operating_state.version=2;},s=>{s.operating_state.unreviewed='No retry';},s=>{s.operating_state.accepted_snapshot.homes=[];},s=>{s.operating_state.receipts.pop();},s=>{s.operating_state={protocol};}]){
  const s=structuredClone(base);alter(s);assert.throws(()=>currentExtensions(s),/Held|changed/);assert.throws(()=>operatingContext(s));
 }
 const s=structuredClone(base);s.new_extension={prohibition:'No export'};
 assert.deepEqual(currentExtensions(s),{new_extension:s.new_extension});assert.throws(()=>operatingContext(s),/Held/);
});

test('format6 explicit non-home evidence survives dispatch, discovery and bounded same-native reads',async()=>{
 for(const mode of ['valid','unlisted','changed','allowlist','wrong-native']){
  const f=fixture();home(f);await archive(f,1);await publish(f);
  const source=read(f).records['archive-0'],ref=recordReference(source);
  const q=engine.dispatch({...f,role:'engineer',task:'Read the exact attached archive evidence',evidence_ids:[ref.id]},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
  const s=read(f),j=s.jobs[q.id],pack=JSON.parse(assignmentContext(s,j).text);
  assert.equal(j.context_format,6);assert.deepEqual(pack.supplemental_evidence.sources,[ref]);assert.equal(pack.supplemental_evidence.available,true);
  assert.ok(!pack.checkpoint.homes.some(h=>h.source.id===ref.id));
  let calls=0;
  await work(f.root,q.id,async(_host,session,prompt,_dir,timeout,_selection,options)=>{
   calls++;if(calls===1){options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));assert.match(prompt,/Supplemental evidence protocol/);if(mode==='changed')mutate(f,s=>{s.records[ref.id].content+=' changed';});if(mode==='allowlist')mutate(f,s=>{s.jobs[q.id].supplemental_sources=[];});return {native_id:'fictional-reader',text:JSON.stringify({reads:[{id:mode==='unlisted'?'home':ref.id,sha256:mode==='unlisted'?recordReference(read(f).records.home).sha256:ref.sha256,offset:0,length:32}]})};}
   assert.equal(session,'fictional-reader');const delivery=JSON.parse(prompt);assert.equal(delivery.protocol,'record-reads-v1');assert.equal(delivery.reads[0].text,JSON.stringify(source).slice(0,32));
   return {native_id:mode==='wrong-native'?'different-reader':'fictional-reader',text:JSON.stringify({content:'Exact attached evidence checked',messages:[],notices:[]})};
  });
  const result=read(f).jobs[q.id];assert.equal(result.status,mode==='valid'?'completed':'failed',result.error);
  if(mode==='valid'){assert.equal(calls,2);assert.equal(result.retrieved_inputs[0].sha256,ref.sha256);}
  if(mode==='unlisted')assert.match(result.error,/allowlist/);
  if(mode==='wrong-native')assert.match(result.error,/native identity/);
 }
});

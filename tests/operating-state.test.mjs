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
import {recordReference,currentExtensions,applyContextQualification} from '../plugins/soloco/runtime/current-state.mjs';
import {operatingContext,operatingFrontier,proposeOperatingState} from '../plugins/soloco/runtime/operating-state.mjs';
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
async function review(f,plan,{native='fictional-independent-'+plan,verdict='Pass',hook,action='publish_operating_state',readSources=[]}={}){
 const queued=engine.dispatch({...f,role:'qa',review_of:plan,task:'Review complete fictional operating meaning, preservation, authority and interactions.'},'codex',{check:()=>({available:true,authenticated:true,version:'contract-double'}),launch:()=>({on(){},unref(){}})});
 let first=true;const pendingReads=[...readSources];
 await work(f.root,queued.id,async(_host,_session,prompt,_dir,timeout,_selection,options)=>{if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}if(pendingReads.length)return {native_id:native,text:JSON.stringify({reads:pendingReads.splice(0,4).map(id=>({id,sha256:sha(readStateSource(read(f),id)),offset:0,length:JSON.stringify(readStateSource(read(f),id)).length}))})};const target=read(f).records[plan];if(hook)hook();return {native_id:native,text:JSON.stringify({content:'FICTIONAL CONTRACT DOUBLE: complete fixture conditions checked; no native semantic acceptance claimed.',messages:[],notices:[],review:{verdict,reason:'Fictional contract judgment',permitted_action:action,plan_sha256:sha(target.operating_plan??target.context_classification_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,...(action==='apply_context_classification'?{coverage_complete:true,obligations_preserved:true,unique_findings:[]}:{}),blockers:verdict==='Pass'?[]:['fixture unresolved']}})};});
 const s=read(f),j=s.jobs[queued.id];assert.equal(j.status,'completed',j.error);return {id:j.artifact_id,job:queued.id};
}
async function publish(f){const p=await ctx(f,{action:'plan'}),r=await review(f,p.id);const result=await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id});assert.equal(result.published,true);return {p,r};}

test('accepted historical publication proof survives an owner epoch change without admitting old in-flight work',async()=>{
 const f=fixture();home(f);const {r}=await publish(f);const before=read(f),receipts=structuredClone(before.operating_state.receipts);
 // Contract fixture for the immutable-proof seam. Public transfer/resume is
 // separately exercised end-to-end; this is not an actual company mutation.
 mutate(f,s=>{s.owner={host:'codex',session_id:'incoming-owner-fixture',epoch:s.owner.epoch+1};});
 const checkpoint=operatingContext(read(f));assert.equal(checkpoint.owner.epoch,2);assert.deepEqual(read(f).operating_state.receipts,receipts);
 mutate(f,s=>{s.jobs[r.job].coordination_release.termination_confirmed=false;});assert.throws(()=>operatingContext(read(f)),/Held/);
});

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
 assert.throws(()=>engine.control({...f,action:'resume',source_instruction:'resume',expected_epoch:1},'codex'),/QA|DIRTY/);
 const q=engine.dispatch({...f,role:'qa',review_of:target.id,task:'Independently check exact prospective handover'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
 const context=assignmentContext(read(f),read(f).jobs[q.id]),stream=context.handover_evidence.sources[context.handover_evidence.pages[0].source_id];let offset=0;
 await work(f.root,q.id,async(_host,_session,_prompt,_dir,timeout,_selection,options)=>{options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));if(offset<stream.length){const length=Math.min(16000,stream.length-offset),start=offset;offset+=length;return {native_id:'fictional-v4-native',text:JSON.stringify({reads:[{source_id:stream.source_id,sha256:stream.sha256,offset:start,length}]})};}return {native_id:'fictional-v4-native',text:JSON.stringify({content:'FICTIONAL CONTRACT DOUBLE: complete prospective fixture semantics reconstructed.',messages:[],notices:[],citations:JSON.parse(context.text).evidence_protocol.citations.slice(0,1),review:{verdict:'Pass',reason:'Exact fictional checkpoint checked',permitted_action:'resume_handover',subject_sha256:read(f).records[target.id].handover.subject_sha256,blockers:[]}})};});
 const completed=read(f).jobs[q.id];assert.equal(completed.status,'completed',completed.error);
 mutate(f,s=>{s.jobs[q.id].coordination_release.termination_confirmed=false;});assert.throws(()=>engine.control({...f,action:'resume',source_instruction:'resume',expected_epoch:1},'codex'),/QA|DIRTY/);
 mutate(f,s=>{s.jobs[q.id].coordination_release.termination_confirmed=true;});const accepted=read(f);engine.control({...f,action:'resume',source_instruction:'resume',expected_epoch:1},'codex');assert.equal(read(f).handover.status,'completed');assert.equal(read(f).paused,false);
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

// Fictional semantic evidence, intentionally absent from the current home text.
const revokedRestriction='VIOLET-RETRY-739: prior grant REVOKED; uncertain remote write may have spent the last allowance. Never retry until remote effects are reconciled and a fresh canonical grant is recorded.';
async function restrictedArchive({large=false,metadata}={}){
 const f=fixture();
 engine.save({...f,id:'historical-restriction',kind:'artifact',content:(large?'fictional audit padding '.repeat(2000):'')+revokedRestriction},'codex');
 home(f,'permission','*',{kind:'permission',grant_refs:['historical-restriction'],remaining:0,revoked:true,evidence_refs:['historical-restriction']});
 home(f,'outcome','*',{kind:'outcome',attempted_action:'Fictional remote write',resources:['fictional resource'],possible_effects:'Possibly written',uncertainty:'Unknown completion',retry_clearing:'Retain canonical archived retry conditions',historical_receipts:['historical-restriction'],evidence_refs:['historical-restriction']});
 if(metadata)mutate(f,s=>{s.records.permission.external_catalog=metadata;});
 const p=engine.contextControl({...f,action:'plan',record_ids:['historical-restriction'],disposition:'represented',counterpart_ids:['permission','outcome'],coverage:[{source_id:'historical-restriction',counterpart_ids:['permission','outcome'],findings:'Preserve revoked grant',failures:'Retry blocked',uncertain_effects:'Write unknown',exhausted_allowances:'Zero remaining'}]},'codex');
 const r=await review(f,p.id,{action:'apply_context_classification'});
 // Use the canonical v2 apply helper: legacy contextControl does not retain its
 // qualification receipt. Repairing that public bootstrap route is parent scope.
 mutate(f,s=>{s.context_classifications={...s.context_classifications,...applyContextQualification(s,s.records[p.id],s.records[r.id],{source_instruction:f.source_instruction,contextMatches})};});
 return f;
}
async function evidenceReview(f,plan,mode='complete'){
 const queued=engine.dispatch({...f,role:'qa',review_of:plan,task:'Independently review all required publication evidence'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
 const packet=JSON.parse(assignmentContext(read(f),read(f).jobs[queued.id]).text),required=packet.required_evidence;
 const pending=required.sources.filter(ref=>!required.inline.some(x=>x.source.id===ref.id));
 const received=new Map(required.inline.map(x=>[x.source.id,JSON.stringify(x.value)]));let offset=0,round=0;
 await work(f.root,queued.id,async(_host,session,prompt,_dir,timeout,_selection,options)=>{
   if(round++===0)options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
   else {assert.equal(session,'fictional-evidence-native');const pack=JSON.parse(prompt);assert.equal(pack.protocol,'record-reads-v1');for(const r of pack.reads){assert.equal(r.offset,(received.get(r.id)??'').length);received.set(r.id,(received.get(r.id)??'')+r.text);}}
   const ref=pending[0];
   if(ref&&mode!=='undelivered'&&!(mode==='partial'&&offset>0)){
     const length=Math.min(16000,ref.total_characters-offset),read={id:ref.id,sha256:ref.sha256,offset,length};offset+=length;if(offset===ref.total_characters){pending.shift();offset=0;}
     if(mode==='outside')read.id='not-allowed';if(mode==='stale')read.sha256='0'.repeat(64);
     return {native_id:'fictional-evidence-native',text:JSON.stringify({reads:[read]})};
   }
   if(mode==='complete'){
     assert.equal(pending.length,0);for(const ref of required.sources)assert.equal(received.get(ref.id),JSON.stringify(readStateSource(read(f),ref.id)));
     if(received.has('historical-restriction'))assert.match(JSON.parse(received.get('historical-restriction')).content,/VIOLET-RETRY-739.*REVOKED/);
   }
   if(mode==='changed')mutate(f,s=>{s.records['historical-restriction'].content+=' Further restriction: retry remains revoked.';});
   return {native_id:'fictional-evidence-native',text:JSON.stringify({content:'FICTIONAL CONTRACT DOUBLE: exact complete supplied evidence examined.',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional judgment only',permitted_action:'publish_operating_state',plan_sha256:sha(read(f).records[plan].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
 });
 return {job:read(f).jobs[queued.id],required,received};
}
const readStateSource=(s,id)=>id.startsWith('job:')?s.jobs[id.slice(4)]:s.records[id];

test('referenced archived revoked/retry restriction and canonical parent receipts are supplied completely inline',async()=>{
 const f=await restrictedArchive(),p=await ctx(f,{action:'plan'}),r=await evidenceReview(f,p.id);
 assert.equal(r.job.status,'completed',r.job.error);
 const c=read(f).context_classifications['historical-restriction'];
 for(const id of ['historical-restriction',c.plan.id,c.review.id,'job:'+read(f).records[c.review.id].job_id])assert.ok(r.required.inline.some(x=>x.source.id===id),id);
 assert.equal(r.required.preservation_classifications[0].value.disposition,'represented');
 assert.equal((await ctx(f,{action:'apply',plan_id:p.id,review_id:r.job.artifact_id})).published,true);
 const baseline=read(f);
 for(const mode of ['source','parent','receipt','missing']){
   mutate(f,s=>{Object.assign(s,structuredClone(baseline));if(mode==='source')s.records['historical-restriction'].content+=' revoked again';if(mode==='parent')s.records[c.plan.id].content+=' changed';if(mode==='receipt')s.jobs[s.records[c.review.id].job_id].native_id='different-native';if(mode==='missing')delete s.records[c.review.id];});
   assert.throws(()=>operatingContext(read(f)),/changed|missing|invalid|Held/);
 }
});

test('large non-home provenance uses exact same-native ranges; undelivered, partial, denied, stale or changed evidence cannot publish',async()=>{
 for(const mode of ['complete','undelivered','partial','outside','stale','changed']){
   const f=await restrictedArchive({large:true}),p=await ctx(f,{action:'plan'}),r=await evidenceReview(f,p.id,mode);
   assert.ok(!r.required.inline.some(x=>x.source.id==='historical-restriction'));
   if(mode==='complete'){
     assert.equal(r.job.status,'completed',r.job.error);assert.ok(r.job.retrieved_inputs.length>=3);
     const baseline=read(f);mutate(f,s=>{s.jobs[r.job.id].retrieved_inputs.pop();});
     await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.job.artifact_id}),/not completely delivered/);
     mutate(f,s=>{Object.assign(s,structuredClone(baseline));});
     assert.equal((await ctx(f,{action:'apply',plan_id:p.id,review_id:r.job.artifact_id})).published,true);
   }else{
     assert.notEqual(r.job.status,'completed',r.job.error);
     if(mode==='outside'||mode==='stale')assert.match(r.job.error,/allowlist/);
     if(mode==='undelivered'||mode==='partial')assert.match(r.job.error,/not completely delivered/);
     await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.job.artifact_id??'absent'}));assert.equal(read(f).operating_state,undefined);
   }
 }
});

test('canonical preservation parent revisions cannot be borrowed from matching hashes',async()=>{
 for(const key of ['plan','review']){
   const f=await restrictedArchive();
   mutate(f,s=>{s.context_classifications['historical-restriction'][key].revision++;});
   await assert.rejects(ctx(f,{action:'plan'}),/source\/receipt changed/);
   assert.equal(read(f).operating_state,undefined);
 }
});

test('missing provenance and snapshot-only evidence hold rather than count pointers as delivered bodies',async()=>{
 for(const mode of ['missing','snapshot']){
   const f=fixture();home(f,'permission','*',{kind:'permission',remaining:0,revoked:true,grant_refs:['permission']});
   mutate(f,s=>{if(mode==='missing')s.records.permission.operating_record.grant_refs=['missing-grant'];else s.records.permission.hidden_receipt={immutable_snapshot:{version:1,sha256:'0'.repeat(64),characters:5,shape:'object'}};});
   await assert.rejects(ctx(f,{action:'plan'}),mode==='missing'?/provenance source missing/:/canonical snapshot delivery/);
   assert.equal(read(f).operating_state,undefined);
 }
});

// Exact runtime receipt shape from executeDevelopmentTest (develop.mjs), with
// deterministic reuse and generated candidate attribution. No native execution.
async function runtimeArchive({large=false}={}){
 const f=fixture();home(f,'permission','*',{evidence_refs:['test-reused'],authority_refs:['test-original']});
 mutate(f,s=>{
   for(const suffix of ['original','reused']){
     const plan='development-'+suffix,candidate='candidate-'+suffix,receipt='test-'+suffix,generation='generate-'+suffix,job='run-'+suffix;
     s.records[plan]={id:plan,revision:1,kind:'plan',author_instance:'fictional-development-owner',content:'Fictional bounded development plan'};
     s.records[candidate]={id:candidate,revision:1,kind:'artifact',author_instance:'generator-instance-'+suffix,job_id:generation,content:'Fictional generated source',development:{type:'candidate',candidate_sha256:'same-source',run:{job_id:job,status:'completed',receipt_id:receipt}}};
     s.jobs[generation]={id:generation,status:'completed',instance_id:'generator-instance-'+suffix,native_id:'generator-native-'+suffix,artifact_id:candidate};
     s.jobs[job]={id:job,kind:'development_test',status:'completed',candidate_id:candidate,development_id:plan,artifact_id:receipt};
     const result={status:'passed',tests_executed:suffix==='original',...(suffix==='reused'?{reused:true,reused_from:'test-original',original_tests_executed:true}:{}),candidate_sha256:'same-source',test_paths:['fictional.test.mjs'],timeout_ms:1000,max_output_bytes:1000,directory:'/fictional/candidate',finished_at:'2026-11-06T00:00:00Z',output:large?'fictional output '.repeat(1500):'passed'};
     s.records[receipt]={id:receipt,kind:'artifact',author_role:'runtime',author_instance:job,revision:1,status:'Submitted',content:JSON.stringify(result),development:{type:'test',plan_id:plan,candidate_id:candidate,candidate_sha256:'same-source',result,receipt_sha256:sha(result)}};
   }
   s.jobs['reuse-qa-job']={id:'reuse-qa-job',instance_id:'reuse-qa-instance',native_id:'reuse-qa-native',status:'completed',artifact_id:'reuse-qa'};
   s.records['reuse-qa']={id:'reuse-qa',revision:1,kind:'review',author_role:'qa',author_instance:'reuse-qa-instance',job_id:'reuse-qa-job',status:'Submitted',review_of:{id:'test-original',revision:1},content:'Fictional deterministic reuse qualification',review:{verdict:'Pass',deterministic_validation:{permitted_action:'reuse_exact_validation'}}};
   Object.assign(s.records['test-reused'].development,{reused_from:'test-original',reuse_qualification:{id:'reuse-qa',revision:1,sha256:sha(s.records['reuse-qa'])}});
 });
 const state=read(f),ids=[...Object.keys(state.records).filter(id=>id!=='permission'),...Object.keys(state.jobs).map(id=>'job:'+id)];
 const p=engine.contextControl({...f,action:'plan',record_ids:ids,disposition:'represented',counterpart_ids:['permission'],coverage:ids.map(source_id=>({source_id,counterpart_ids:['permission'],findings:'Retain exact runtime evidence',failures:'Retain failed evidence',uncertain_effects:'No authority inferred',exhausted_allowances:'No renewed allowance'}))},'codex');
 const r=await review(f,p.id,{action:'apply_context_classification',readSources:ids.filter(id=>id.startsWith('job:'))});
 mutate(f,s=>{s.context_classifications={...s.context_classifications,...applyContextQualification(s,s.records[p.id],s.records[r.id],{source_instruction:f.source_instruction,contextMatches})};});
 return f;
}

test('real runtime receipt attribution and deterministic reuse deliver the validated producer closure before Pass',async()=>{
 const f=await runtimeArchive(),p=await ctx(f,{action:'plan'});
 const expected=['test-reused','job:run-reused','candidate-reused','development-reused','job:generate-reused','test-original','job:run-original','candidate-original','development-original','job:generate-original','reuse-qa','job:reuse-qa-job'];
 const r=await review(f,p.id,{hook:()=>{
   const state=read(f),job=Object.values(state.jobs).find(j=>j.status==='running'&&j.review_of?.id===p.id);
   const packet=JSON.parse(assignmentContext(state,job).text);
   for(const id of expected)assert.ok(packet.required_evidence.inline.some(x=>x.source.id===id),id);
   assert.equal(state.operating_state,undefined);
 }});
 assert.equal((await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id})).published,true);
 const baseline=read(f);
 for(const id of ['test-reused','test-original']){
   mutate(f,s=>{Object.assign(s,structuredClone(baseline));const receipt=s.records[id];receipt.development.result.output+=' valid changed result';receipt.content=JSON.stringify(receipt.development.result);receipt.development.receipt_sha256=sha(receipt.development.result);});
   assert.throws(()=>operatingContext(read(f)),/changed|Held|hold/);
 }
});

test('runtime receipt missing or mismatched producer, candidate, plan, reuse or generation holds',async()=>{
 const f=await runtimeArchive(),baseline=read(f);
 for(const change of [s=>delete s.jobs['run-reused'],s=>s.jobs['run-reused'].artifact_id='other',s=>s.records['test-reused'].author_instance='missing',s=>s.jobs['run-reused'].candidate_id='candidate-original',s=>s.jobs['run-reused'].development_id='development-original',s=>s.jobs['generate-reused'].artifact_id='other',s=>delete s.records['test-original'],s=>delete s.jobs['reuse-qa-job']]){
   const s=structuredClone(baseline);s.context_classifications={};change(s);
   // Direct proposal exercises the producer validator even when a changed
   // classification has made the broken source mandatory again.
   assert.throws(()=>proposeOperatingState(s,{source_instruction:f.source_instruction}),/missing|changed|broken|invalid|hold|Held/);
 }
});

test('external catalog reference-shaped metadata is verbatim evidence without a company lookup',async()=>{
 const metadata={id:'external-catalog-only',revision:42,sha256:'external-digest',nested:[{id:'another-external-item',revision:7,sha256:'opaque'}],restriction:'Revoked authority and failed attempts remain evidence'};
 const f=await restrictedArchive({metadata}),c=read(f).context_classifications['historical-restriction'];
 const proposal=await ctx(f,{action:'plan'}),evidence=await evidenceReview(f,proposal.id);
 assert.equal(evidence.job.status,'completed',evidence.job.error);
 assert.deepEqual(JSON.parse(evidence.received.get('permission')).external_catalog,metadata);
 for(const id of [metadata.id,metadata.nested[0].id])assert.ok(!evidence.required.sources.some(x=>x.id===id));
 assert.ok(evidence.required.sources.some(x=>x.id===c.plan.id));assert.ok(evidence.required.sources.some(x=>x.id===c.review.id));
 assert.equal((await ctx(f,{action:'apply',plan_id:proposal.id,review_id:evidence.job.artifact_id})).published,true);
});


test('runtime closure requires complete delivery and independent source and proof sessions',async()=>{
 for(const mode of ['undelivered','complete','generator-native-reused','generator-instance-reused','reuse-qa-native','reuse-qa-instance']){
   const f=await runtimeArchive({large:mode==='undelivered'||mode==='complete'}),p=await ctx(f,{action:'plan'});
   if(mode==='undelivered'||mode==='complete'){
     const r=await evidenceReview(f,p.id,mode);
     assert.ok(!r.required.inline.some(x=>x.source.id==='test-reused'));
     if(mode==='undelivered'){
       assert.equal(r.job.status,'failed');assert.match(r.job.error,/not completely delivered/);
       await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.job.artifact_id??'absent'}));
     }else{
       assert.equal(r.job.status,'completed',r.job.error);
       assert.equal((await ctx(f,{action:'apply',plan_id:p.id,review_id:r.job.artifact_id})).published,true);
     }
   }else{
     const r=await review(f,p.id,{native:mode});
     await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.id}),/reviewer owns current home/);
     assert.equal(read(f).operating_state,undefined);
   }
 }
});

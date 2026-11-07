import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {retainSnapshot,retainSnapshotEntry,resolveSnapshotEntry,snapshotBytes,inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {recordReference,currentExtensions,applyContextQualification} from '../plugins/soloco/runtime/current-state.mjs';
import {operatingContext,operatingFrontier,proposeOperatingState} from '../plugins/soloco/runtime/operating-state.mjs';
const cloneState=s=>inheritSnapshots(s,structuredClone(s));
const protocol='operating-state-v1',sha=v=>digest(JSON.stringify(v));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'operating-contract-'));process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'data');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const read=f=>withStore(f.root,db=>db.read());
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.contract.fixture',s=>{fn(s);return s;}));
function fixture(){const f={root:fs.mkdtempSync(path.join(tmp,'company-')),session_id:'founder-fixture',epoch:1,source_instruction:'Fictional fixture authorizes prospective read-only qualification; grants no external action.'};engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'Fictional operating protocol contract tests'},'codex');withStore(f.root,db=>{if(db.storageInfo().format!=='normalized-v4')db.migrate();});mutate(f,s=>{s.roles={qa:{name:'QA'},engineer:{name:'Engineer'}};s.governance='No external execution.';s.cos_instructions='Preserve all exceptions.';s.team_sha256=teamHash(s);});return f;}
const ctx=(f,args)=>publicCall('company_context',{...f,protocol,...args},'codex');
function home(f,id='home',scope='*',extra={}){return engine.save({...f,id,...(read(f).records[id]?{expected_revision:read(f).records[id].revision}:{}),kind:'artifact',content:'Complete fictional condition: no export or retry without canonical authority.',operating_record:{version:1,kind:'obligation',scope,owner:'runner',conditions:'Always while unresolved',exceptions:'None',clearing:'Exact independent closure',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:[id],...extra}},'codex');}
// The native adapter below is an explicitly fictional CONTRACT DOUBLE. Worker
// publication/closure, public APIs, hashes and SQLite transactions are real.
async function review(f,plan,{native='fictional-independent-'+plan,verdict='Pass',hook,action='publish_operating_state',readSources=[],onPrompt,expectedStatus='completed'}={}){
 const queued=engine.dispatch({...f,role:'qa',review_of:plan,task:'Review complete fictional operating meaning, preservation, authority and interactions.'},'codex',{check:()=>({available:true,authenticated:true,version:'contract-double'}),launch:()=>({on(){},unref(){}})});
 let first=true;const evidence=(()=>{const c=assignmentContext(read(f),read(f).jobs[queued.id]);return c.qualification_evidence??c.operating_evidence;})();
 const pendingReads=[...readSources],frozenReads=evidence?Object.values(evidence.sources).flatMap(v=>{const ranges=[];for(let offset=0;offset<v.length;){let length=Math.min(16000,v.length-offset);if(/[\uD800-\uDBFF]/.test(v.raw[offset+length-1]))length--;ranges.push({source_id:v.source_id,sha256:v.sha256,offset,length});offset+=length;}return ranges;}):[];
 await work(f.root,queued.id,async(_host,_session,prompt,_dir,timeout,_selection,options)=>{onPrompt?.(prompt);if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}if(frozenReads.length)return {native_id:native,text:JSON.stringify({reads:frozenReads.splice(0,evidence.handover.review_context?4:1)})};if(!evidence&&pendingReads.length)return {native_id:native,text:JSON.stringify({reads:pendingReads.splice(0,4).map(id=>({id,sha256:sha(readStateSource(read(f),id)),offset:0,length:JSON.stringify(readStateSource(read(f),id)).length}))})};const target=read(f).records[plan];if(hook)hook();return {native_id:native,text:JSON.stringify({content:'FICTIONAL CONTRACT DOUBLE: complete fixture conditions checked; no native semantic acceptance claimed.',messages:[],notices:[],review:{verdict,reason:'Fictional contract judgment',permitted_action:action,plan_sha256:sha(target.operating_plan??target.context_classification_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,...(action==='apply_context_classification'?{coverage_complete:true,obligations_preserved:true,unique_findings:[]}:{}),blockers:verdict==='Pass'?[]:['fixture unresolved']}})};});
 const s=read(f),j=s.jobs[queued.id];assert.equal(j.status,expectedStatus,j.error);return {id:j.artifact_id,job:queued.id};
}
async function publish(f){const p=await ctx(f,{action:'plan'}),r=await review(f,p.id);const result=await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id});assert.equal(result.published,true);return {p,r};}

test('accepted historical publication proof survives an owner epoch change without admitting old in-flight work',async()=>{
 const f=fixture();home(f);const {r}=await publish(f);const before=read(f),receipts=structuredClone(before.operating_state.receipts);
 // Contract fixture for the immutable-proof seam. Public transfer/resume is
 // separately exercised end-to-end; this is not an actual company mutation.
 mutate(f,s=>{s.owner={host:'codex',session_id:'incoming-owner-fixture',epoch:s.owner.epoch+1};});
 assert.throws(()=>operatingContext(read(f)),/Held/,'owner transfer changes current meaning and requires delta QA');assert.deepEqual(read(f).operating_state.receipts,receipts);
 const incoming={...f,session_id:'incoming-owner-fixture',epoch:2};engine.bind(f.root,incoming.session_id,'codex');await publish(incoming);assert.equal(operatingContext(read(f)).owner.epoch,2);
 mutate(f,s=>{s.jobs[r.job].coordination_release.termination_confirmed=false;});assert.throws(()=>operatingContext(read(f)),/Held/);
});

test('public API publishes atomically, keeps authority separate, and dispatch uses accepted current meaning',async()=>{const f=fixture();home(f);const {p,r}=await publish(f);assert.equal((await ctx(f,{action:'inspect'})).status,'Accepted');const j=engine.dispatch({...f,role:'engineer',task:'Read accepted fictional current meaning'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});const s=read(f),job=s.jobs[j.id];assert.equal(job.context_format,6);const pack=JSON.parse(assignmentContext(s,job).text);assert.equal(pack.checkpoint.homes.length,1);assert.match(pack.checkpoint.controls.governance,/No external/);assert.equal(s.operating_state.review.id,r.id);assert.equal(s.operating_state.plan.id,p.id);});

test('missing legacy bootstrap is visibly DIRTY and apply rolls back without acceptance',async()=>{const f=fixture();engine.save({...f,id:'unknown',kind:'artifact',content:'An unknown distant exception prohibits retry.'},'codex');const p=await ctx(f,{action:'plan'});assert.equal(p.frontier.length,1);const before=read(f);await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:'absent'}),/frontier coverage incomplete/);assert.deepEqual(read(f),before);const view=await ctx(f,{action:'inspect'});assert.equal(view.status,'Held');assert.equal(view.frontier[0].status,'DIRTY');assert.equal(view.frontier[0].scope,'*');});

test('host catalog default service tier does not invalidate explicit operating reviewer startup',async()=>{
 const f=fixture();home(f);const p=await ctx(f,{action:'plan'});
 const catalog={supported:true,source:'host_catalog',models:[{id:'fixture-model',name:'Fixture',supported_efforts:['high'],defaultServiceTier:'priority'}],speed_support:{host_default:true,fast_disabled:false,default_speed:'unverified',paid_tiers_enabled:false}};
 const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'Read complete operating proposal',model_selection:{mode:'explicit',model:'fixture-model',effort:'high',speed:'host_default',reason:'Fictional explicit-model startup regression'}},'codex',{catalog:()=>catalog,check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
 const s=read(f),j=s.jobs[q.id];assert.equal(j.model_catalog.model.defaultServiceTier,'priority');
 assert.ok(assignmentContext(s,j).text.includes('publish_operating_state'));
 const changed=cloneState(s);changed.jobs[q.id].model_catalog.model.extra_authority='Do not hide this instruction';
 assert.throws(()=>assignmentContext(changed,changed.jobs[q.id]),/Held|changed|DIRTY/);
});

test('new membership, changed exact source, wrong independent identity and absent closure cannot publish',async()=>{for(const mode of ['membership','source','native','closure','negative']){const f=fixture();home(f);const p=await ctx(f,{action:'plan'});const r=await review(f,p.id,{native:mode==='native'?f.session_id:undefined,expectedStatus:mode==='native'?'failed':'completed'});if(mode==='native'){const s=read(f),j=s.jobs[r.job];assert.match(j.error,/independent native identity/);assert.equal(j.artifact_id,undefined);assert.match(j.rejected_output.text,/Fictional contract judgment/);assert.equal(s.operating_state,undefined);continue;}if(mode==='membership')home(f,'global-prohibition');if(mode==='source')home(f,'home','*',{conditions:'Changed prohibition'});if(mode==='closure')mutate(f,s=>{s.jobs[r.job].coordination_release.termination_confirmed=false;});if(mode==='negative')mutate(f,s=>{s.records.negative={id:'negative',kind:'review',status:'Submitted',review_of:{id:p.id,revision:1},review:{verdict:'Blocked'}};});const before=read(f);await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.id}),/Operating state Held/);assert.deepEqual(read(f),before);assert.equal(read(f).operating_state,undefined);}});

test('scope closure, global membership, expiry, receipt changes, revocation and missed communication hold',async()=>{const f=fixture();home(f,'a','billing');home(f,'b','shipping');await publish(f);const baseline=read(f);assert.equal(operatingContext(baseline,{scope:'billing'}).homes.length,1);for(const mode of ['scope','global','expiry','receipt','revocation','communication','unknown']){mutate(f,s=>{Object.assign(s,structuredClone(baseline));if(mode==='scope')s.records.b.content+=' scoped change';if(mode==='global')s.records.a.operating_record.scope='*';if(mode==='expiry')s.operating_state.valid_until='2000-01-01T00:00:00Z';if(mode==='receipt')s.records[s.operating_state.review.id].content+=' altered';if(mode==='revocation')s.governance+=' Grant revoked; allowance spent.';if(mode==='communication')s.messages.push({id:'missed',to:'runner',content:'Must communicate restriction'});if(mode==='unknown')s.records.u={id:'u',kind:'artifact',content:'inert',inert:true};});assert.throws(()=>operatingContext(read(f),{scope:'billing'}),/Held/);} });

test('pause fences publication reviewer and prospective handover cannot hide unknown legacy',async()=>{const f=fixture();home(f);const p=await ctx(f,{action:'plan'});engine.control({...f,action:'pause',expected_epoch:1},'codex');assert.throws(()=>engine.dispatch({...f,role:'qa',review_of:p.id,task:'Old proposal'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})}),/paused/);await assert.rejects(publicCall('company_handover',{root:f.root,session_id:f.session_id,epoch:f.epoch,action:'submit',protocol:'operating-handover-v4',content:'Complete fictional reconstruction '.repeat(10)},'codex'),/pending paused/);});

async function archive(f,count,start=0,{bodySize=4000}={}){
 const ids=[];for(let i=start;i<start+count;i++){const id='archive-'+i;ids.push(id);engine.save({...f,id,kind:'artifact',content:'FICTIONAL INERT AUDIT ONLY '+String(i)+' '+'.'.repeat(bodySize)},'codex');}
 const p=engine.contextControl({...f,action:'plan',record_ids:ids,disposition:'resolved'},'codex');
 const r=await review(f,p.id,{action:'apply_context_classification'});
 engine.contextControl({...f,action:'apply',plan_id:p.id,review_id:r.id},'codex');return ids;
}
test('10x independently classified inert archive keeps actual mandatory operating assignment bytes and semantic work constant',async()=>{const f=fixture();home(f);await archive(f,1);await publish(f);const job={id:'prospective-task',role:'engineer',context_format:6,task:'Compare accepted context',inputs:[]};const before=assignmentContext(read(f),job),first=operatingContext(read(f));await archive(f,9,1);assert.throws(()=>operatingContext(read(f)),/Held/);await publish(f);const after=assignmentContext(read(f),job),last=operatingContext(read(f));assert.deepEqual(JSON.parse(after.text).checkpoint.homes,JSON.parse(before.text).checkpoint.homes);assert.equal(last.homes.length,first.homes.length);assert.ok(Buffer.byteLength(after.text)<=Buffer.byteLength(before.text)+100,'only current acceptance receipt size may differ');assert.equal(read(f).records['archive-9'].content.length,4029);engine.save({...f,id:'unqualified',kind:'artifact',content:'Writer says inert; no independent judgment.'},'codex');assert.throws(()=>assignmentContext(read(f),job),/DIRTY/);});

test('deleted applicable home and changed exact provenance cannot disappear from accepted meaning',async()=>{const f=fixture();home(f);await publish(f);const baseline=read(f);mutate(f,s=>{delete s.records.home;});assert.throws(()=>operatingContext(read(f)),/deleted|membership/);mutate(f,s=>{Object.assign(s,structuredClone(baseline));s.records.home.operating_record.conditions='new condition';});assert.throws(()=>operatingContext(read(f)),/source\/receipt changed|unaccepted|DIRTY/);});

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
 const unclosed=read(f);unclosed.jobs[q.id].coordination_release.termination_confirmed=false;assert.throws(()=>operatingContext(unclosed),/Held/);
 const accepted=read(f);engine.control({...f,action:'resume',source_instruction:'resume',expected_epoch:1},'codex');assert.equal(read(f).handover.status,'completed');assert.equal(read(f).paused,false);
 assert.throws(()=>operatingContext(accepted),/Held/,'a stale read cannot consume a newer intake cut');
 assert.equal(operatingContext(read(f)).homes.length,1);
 const historical=read(f);historical.owner.epoch++;
 assert.throws(()=>operatingContext(historical),/Held/,'historical receipt does not renew authority across an owner change');
 for(const change of ['reconstruction','review','job','acceptance']){
  const altered=cloneState(historical),h=altered.handover,r=altered.records[h.acceptance.review_id],j=altered.jobs[r.job_id];
  if(change==='reconstruction')altered.records[h.reconstruction_id].content+=' Changed condition';
  if(change==='review')r.review.reason+=' Changed finding';
  if(change==='job')j.native_id='different-native';
  if(change==='acceptance')h.acceptance.subject_sha256='0'.repeat(64);
  assert.throws(()=>operatingContext(altered),/Held|DIRTY|changed|receipt/,change+' mutation must not become historical proof');
 }
 const ordinary=engine.dispatch({...f,role:'engineer',task:'First ordinary assignment after accepted resume'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
 assert.equal(read(f).jobs[ordinary.id].context_format,6);assert.equal(JSON.parse(assignmentContext(read(f),read(f).jobs[ordinary.id]).text).checkpoint.homes.length,1);
 for(const mode of ['failed','quarantined','unknown-extension']){
  const s=cloneState(accepted),j=structuredClone(s.jobs[q.id]),r=structuredClone(s.records[j.artifact_id]);
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
  const s=cloneState(base),j=structuredClone(s.jobs[r.job]),record=structuredClone(s.records[r.id]);
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
  const s=cloneState(base);alter(s);assert.throws(()=>currentExtensions(s),/Held|changed/);assert.throws(()=>operatingContext(s));
 }
 const s=cloneState(base);s.new_extension={prohibition:'No export'};
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
 if(metadata)mutate(f,s=>{s.records.permission.external_catalog=typeof metadata==='function'?metadata(s):metadata;});
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
     await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.job.artifact_id}),/not completely delivered|Held/);
     mutate(f,s=>{Object.assign(s,structuredClone(baseline));});
     await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.job.artifact_id}),/Held/,'reverted read receipts remain unreviewed intake');
     // The failed/mutated proposal remains evidence in its original company.
     // Demonstrate the positive complete-delivery path in a separate fixture,
     // rather than treating restored bytes as erasure of retained intake.
     const clean=await restrictedArchive({large:true}),fresh=await ctx(clean,{action:'plan'}),qa=await evidenceReview(clean,fresh.id,'complete');assert.equal((await ctx(clean,{action:'apply',plan_id:fresh.id,review_id:qa.job.artifact_id})).published,true);
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
async function runtimeArchive({large=false,accepted=false}={}){
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
 if(accepted){withStore(f.root,db=>{if(db.storageInfo().format!=='normalized-v4')db.migrate();});mutate(f,s=>{s.records['test-reused'].retained_archive=retainSnapshot(s,{content:'FICTIONAL immutable original: failed evidence and no retry remain.'});if(accepted==='entry')s.records['test-reused']=retainSnapshotEntry(s,s.records['test-reused']);});}
 const state=read(f),ids=[...Object.keys(state.records).filter(id=>id!=='permission'),...Object.keys(state.jobs).map(id=>'job:'+id)];
 const args={...f,action:'plan',record_ids:ids,disposition:'represented',counterpart_ids:['permission'],coverage:ids.map(source_id=>({source_id,counterpart_ids:['permission'],findings:'Retain exact runtime evidence',failures:'Retain failed evidence',uncertain_effects:'No authority inferred',exhausted_allowances:'No renewed allowance'}))};
 const p=accepted?await publicCall('company_context',args,'codex'):engine.contextControl(args,'codex');
 if(accepted)assert.deepEqual(read(f).records[p.id].context_classification_plan.sources.map(r=>r.id),ids,'qualification must use the persisted complete source list');
 const r=await review(f,p.id,{action:'apply_context_classification',readSources:ids.filter(id=>id.startsWith('job:'))});
 if(accepted){assert.equal(read(f).jobs[r.job].context_format,4);assert.equal((await publicCall('company_context',{...f,action:'apply',plan_id:p.id,review_id:r.id},'codex')).applied,true);assert.deepEqual(read(f).context_classifications['test-reused'].qualification.producer_dependencies??[],[]);}
 else mutate(f,s=>{s.context_classifications={...s.context_classifications,...applyContextQualification(s,s.records[p.id],s.records[r.id],{source_instruction:f.source_instruction,contextMatches})};});
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
   const s=cloneState(baseline);s.context_classifications={};change(s);
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

// The canonical first pass uses PUBLIC represented-v2 plan/worker/apply, not a
// complete flag injected by this fixture. All semantic judgments remain fictional.
async function qualifiedRecovered({checkpointBody,small=false}={}){
 const f=fixture();withStore(f.root,db=>{if(db.storageInfo().format!=='normalized-v4')db.migrate();});
 mutate(f,s=>{const body=checkpointBody?checkpointBody(s):{raw:'FICTIONAL original failed attempt; unknown effects and zero retries. '+'.'.repeat(small?0:260000)};s.upgrade={id:'fictional-recovered',status:'recovered',epoch:1,host:'codex',candidate_hash:'fictional-candidate',recovered_at:'2026-11-06T00:00:00Z',probe_status:'failed',review_status:'failed',error:'Prior continuity QA failed; never retry on old allowance',probe_native_id:'fictional-original-upgrade-producer',probe:{content:'FICTIONAL retained full failed report '+'.'.repeat(small?0:240000)},checkpoint:retainSnapshot(s,body),checkpoint_sha256:sha(body)};});
 home(f,'outcome','*',{kind:'outcome',attempted_action:'Failed fictional upgrade rehearsal',resources:['fictional candidate'],possible_effects:'Preparation may have produced uncertain evidence',uncertainty:'Original failure remains failed; effects unknown',retry_clearing:'Independent reconciliation plus fresh canonical authority; current independent resume_handover gate remains',historical_receipts:['upgrade:fictional-recovered'],evidence_refs:['upgrade:fictional-recovered']});
 home(f,'permission','*',{kind:'permission',grant_refs:['upgrade:fictional-recovered'],remaining:0,revoked:true,evidence_refs:['upgrade:fictional-recovered']});
 const p=await publicCall('company_context',{...f,action:'plan',record_ids:['upgrade:fictional-recovered'],disposition:'represented',counterpart_ids:['outcome','permission'],coverage:[{source_id:'upgrade:fictional-recovered',counterpart_ids:['outcome','permission'],findings:'Complete fictional original retained; current independent resume_handover remains required',failures:'Prior QA remains failed; old failure is not resolved',uncertain_effects:'All effects remain unknown pending independent reconciliation',exhausted_allowances:'Zero retries; revoked; fresh canonical authority required'}]},'codex');
 const r=await review(f,p.id,{action:'apply_context_classification'});
 assert.equal((await publicCall('company_context',{...f,action:'apply',plan_id:p.id,review_id:r.id},'codex')).applied,true);
 return f;
}
test('public qualified recovered snapshot publishes current typed outcomes without replaying the paid raw archive',async()=>{
 const f=await qualifiedRecovered(),raw=snapshotBytes(read(f),read(f).upgrade.checkpoint),before=read(f),p=await ctx(f,{action:'plan'});
 assert.equal(p.held,false);
 const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'Inspect full current homes and accepted judgments'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
 const pack=JSON.parse(assignmentContext(read(f),read(f).jobs[q.id]).text);
 assert.ok(pack.required_evidence.accepted_semantics.some(x=>x.source.id==='upgrade:fictional-recovered'));
 assert.ok(!pack.required_evidence.sources.some(x=>x.id==='upgrade:fictional-recovered'));
 assert.equal(pack.controls.upgrade.consumed.qa_final,0);assert.equal(pack.controls.upgrade.status,'recovered');
 assert.ok(JSON.stringify(pack).length<100000);assert.ok(!JSON.stringify(pack).includes('.'.repeat(1000)));
 await work(f.root,q.id,async(_h,_n,_p,_d,timeout,_s,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));return {native_id:'fictional-current-publication',text:JSON.stringify({content:'FICTIONAL complete current semantics judgment',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional complete supplied outcomes and paid preservation judgment',permitted_action:'publish_operating_state',plan_sha256:sha(read(f).records[p.id].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};});
 const completed=read(f).jobs[q.id];assert.equal(completed.status,'completed',completed.error);
 assert.equal((await ctx(f,{action:'apply',plan_id:p.id,review_id:completed.artifact_id})).published,true);
 const job={id:'prospective',role:'engineer',context_format:6,task:'Current only',inputs:[]},body=assignmentContext(read(f),job).text;
 assert.match(body,/effects unknown/);assert.match(body,/"remaining":0/);assert.match(body,/resume_handover/);
 assert.equal(snapshotBytes(read(f),read(f).upgrade.checkpoint),raw);
 await archive(f,1);assert.throws(()=>assignmentContext(read(f),job),/Held/,'new archive census requires independently reviewed delta');
 await publish(f);assert.deepEqual(JSON.parse(assignmentContext(read(f),job).text).checkpoint.homes,JSON.parse(body).checkpoint.homes);
 const accepted=read(f);
 for(const change of [s=>{s.upgrade.error+=' new prohibition';},s=>{s.upgrade.status='checking';},s=>{s.records.outcome.operating_record.uncertainty='changed';},s=>{s.jobs[before.records[before.context_classifications['upgrade:fictional-recovered'].review.id].job_id].native_id='changed';},s=>{s.records.new={id:'new',kind:'artifact',content:'New prohibition'};}]){const s=cloneState(accepted);change(s);assert.throws(()=>assignmentContext(s,job),/Held|changed|qualification|missing/);}
});
test('large prospective publication uses bounded frozen worker delivery and rejects a manufactured complete flag',async()=>{
 const f=fixture(),raw='FICTIONAL required provenance '+'.'.repeat(21000)+' RAW-TAIL-MUST-ARRIVE';
 engine.save({...f,id:'raw',kind:'artifact',content:raw},'codex');
 const archived=engine.contextControl({...f,action:'plan',record_ids:['raw'],disposition:'resolved'},'codex'),archiveReview=await review(f,archived.id,{action:'apply_context_classification'});
 engine.contextControl({...f,action:'apply',plan_id:archived.id,review_id:archiveReview.id},'codex');
 home(f,'large','*',{conditions:'Complete indivisible fictional current restriction. '.repeat(6500),evidence_refs:['large','raw']});
 const prompts=[],p=await ctx(f,{action:'plan'}),r=await review(f,p.id,{onPrompt:value=>prompts.push(value)});
 const s=read(f),j=s.jobs[r.job],c=assignmentContext(s,j);
 assert.ok(c.operating_evidence);assert.ok(c.text.length<200000);assert.equal(j.operating_delivery.protocol,'operating-publication-frozen-v1');assert.ok(j.operating_delivery.reads.length>16);
 assert.equal(c.frozen_packet.required_evidence.inline.find(x=>x.source.id==='raw').value.content,raw);
 assert.ok(prompts.some(text=>text.includes('RAW-TAIL-MUST-ARRIVE')),'authentic stream must actually deliver the required non-inline body');
 const baseline=read(f);
 for(const change of [s=>{s.jobs[r.job].operating_delivery.reads.pop();},s=>{s.jobs[r.job].operating_delivery.native_id='other';},s=>{s.jobs[r.job].operating_delivery.complete=true;},s=>{s.jobs[r.job].operating_delivery.reads[0].range_sha256='0'.repeat(64);},s=>{s.jobs[r.job].coordination_release.termination_confirmed=false;}]){mutate(f,change);await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.id}));mutate(f,s=>Object.assign(s,structuredClone(baseline)));}
 await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.id}),/Held/,'reverted metadata remains complete unreviewed intake');
});

test('frozen publication worker rejects unread semantics, changed native and changed current membership',async()=>{
 for(const mode of ['unread','native','membership']){
  const f=fixture();home(f,'large','*',{conditions:'Fictional complete current operative rule. '.repeat(5200)});
  const p=await ctx(f,{action:'plan'}),q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'Fictional large current review'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
  const c=assignmentContext(read(f),read(f).jobs[q.id]),e=c.operating_evidence,v=e.sources[e.pages[0].source_id];let call=0;
  assert.ok(c.text.length<200000);
  await work(f.root,q.id,async(_h,native,prompt,_d,timeout,_s,options)=>{
   call++;options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));assert.ok(prompt.length<=200000);
   if(call===1&&mode!=='unread')return {native_id:'fictional-frozen-reader',text:JSON.stringify({reads:[{source_id:v.source_id,sha256:v.sha256,offset:0,length:16000}]})};
   if(mode==='membership')home(f,'new-prohibition');
   return {native_id:mode==='native'?'different-native':'fictional-frozen-reader',text:JSON.stringify({content:'FICTIONAL unsupported complete claim',messages:[],notices:[],semantic_delivery_complete:true,review:{verdict:'Pass',reason:'Fictional claim must not pass delivery',permitted_action:'publish_operating_state',plan_sha256:sha(read(f).records[p.id].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
  });
  assert.notEqual(read(f).jobs[q.id].status,'completed');
  await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:read(f).jobs[q.id].artifact_id??'missing'}));
  assert.equal(read(f).operating_state,undefined);
 }
});

test('paid snapshot archive still requires publication QA independent of nested original producers',async()=>{
 const f=await qualifiedRecovered(),p=await ctx(f,{action:'plan'}),r=await review(f,p.id,{native:'fictional-original-upgrade-producer'});
 await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.id}),/reviewer owns current home/);assert.equal(read(f).operating_state,undefined);
});

test('historical artifact producers use the frozen checkpoint map and retain separate current bindings',async()=>{
 for(const mode of ['absent','different','broken']){
  const f=await qualifiedRecovered({small:true,checkpointBody:s=>{
   const producer={id:'archived-producer',role:'engineer',status:'completed',artifact_id:mode==='broken'?'wrong-artifact':'archived-artifact',instance_id:'archived-instance',native_id:'archived-native'};
   if(mode==='different')s.jobs[producer.id]={...producer,instance_id:'newer-instance',native_id:'newer-native',artifact_id:'newer-artifact'};
   return {id:s.id,governance:s.governance,roles:s.roles,records:{'archived-artifact':{id:'archived-artifact',kind:'artifact',revision:1,job_id:producer.id,author_instance:'archived-instance',content:'Historical condition; failure remains OPEN.'}},jobs:{[producer.id]:retainSnapshotEntry(s,producer)}};
  }});
  if(mode==='broken'){await assert.rejects(ctx(f,{action:'plan'}),/broken canonical producer edge/);continue;}
  // A different current row is independent new intake and needs its own proof.
  if(mode==='different'){
   const p=await publicCall('company_context',{...f,action:'plan',record_ids:['job:archived-producer'],disposition:'represented',counterpart_ids:['outcome'],coverage:[{source_id:'job:archived-producer',counterpart_ids:['outcome'],findings:'Separate newer producer outcome.',failures:'Historical failure remains open.',uncertain_effects:'No effects reconciled.',exhausted_allowances:'No retry.'}]},'codex');
   const r=await review(f,p.id,{action:'apply_context_classification'});await publicCall('company_context',{...f,action:'apply',plan_id:p.id,review_id:r.id},'codex');
  }
  const p=await ctx(f,{action:'plan'}),preservation=read(f).records[p.id].operating_plan.snapshot.preservation;
  const frozen=resolveSnapshotEntry(read(f),read(f).upgrade);assert.ok(frozen.checkpoint_sha256);
  const evidence=JSON.parse(snapshotBytes(read(f),preservation)).evidence.accepted_semantics.find(x=>x.source.id==='upgrade:fictional-recovered');
  const old=evidence.historical_producers.find(x=>x.source.id==='job:archived-producer');assert.ok(old);assert.equal(old.company_sha256,frozen.checkpoint_sha256);
  assert.equal(JSON.parse(snapshotBytes(read(f),old.envelope)).native_id,'archived-native');
  assert.ok(!evidence.producer_refs.some(x=>x.id==='job:archived-producer'));
  const r=await review(f,p.id);assert.equal((await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id})).published,true);
 }
});


test('FICTIONAL PUBLIC v2 explicit complete sources preserve accepted runtime producer independence and freshness',async()=>{
 for(const native of ['generator-native-reused','generator-instance-reused','generator-native-original','reuse-qa-native','fictional-distinct-accepted-publisher','fictional-entry-publisher']){
  const f=await runtimeArchive({accepted:native==='fictional-entry-publisher'?'entry':true}),p=await ctx(f,{action:'plan'});
  assert.equal(p.held,false);
  const r=await review(f,p.id,{native,hook:()=>{
   const state=read(f),job=Object.values(state.jobs).find(j=>j.status==='running'&&j.review_of?.id===p.id),packet=JSON.parse(assignmentContext(state,job).text);
   const accepted=packet.required_evidence.accepted_semantics.find(x=>x.source.id==='test-reused');
   assert.ok(accepted);assert.ok(accepted.author_identities.includes('generator-native-reused'));assert.ok(accepted.author_identities.includes('reuse-qa-native'));for(const id of ['job:run-reused','candidate-reused','development-reused','job:generate-reused','test-original','job:generate-original','reuse-qa','job:reuse-qa-job'])assert.ok(accepted.producer_refs.some(r=>r.id===id),id);
  }});
  if(!['fictional-distinct-accepted-publisher','fictional-entry-publisher'].includes(native)){
   await assert.rejects(ctx(f,{action:'apply',plan_id:p.id,review_id:r.id}),/reviewer owns current home/);assert.equal(read(f).operating_state,undefined);
  }else{
   assert.equal((await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id})).published,true);
   const baseline=read(f);
   for(const change of [s=>{s.jobs['generate-reused'].native_id='changed';},s=>{s.records['candidate-original'].content+=' stale';},s=>{s.records['reuse-qa'].content+=' stale';},s=>{s.jobs['run-original'].artifact_id='changed';}]){
    mutate(f,s=>{Object.assign(s,structuredClone(baseline));change(s);});assert.throws(()=>operatingContext(read(f)),/Held|changed|broken|qualification|closure/i);
   }
  }
 }
});


test('publication cannot reuse provenance-bound rejected native identities from a preserved failed job',async()=>{
 for(const [field,reused] of [['rejected_native_id',true],['rejected_native_ids',true],['rejected_native_ids',false]]){
  const f=fixture(),original='fictional-rejected-'+field,native=reused?original:'fictional-distinct-publication-native';
  home(f,'home','*',{evidence_refs:['job:failed-scoped'],conditions:'The scoped attempt failed; uncertain effects remain, and no retry grant is renewed.'});
  mutate(f,s=>{s.jobs['failed-scoped']={id:'failed-scoped',role:'qa',status:'failed',instance_id:'fictional-failed-instance',native_id:null,context_format:8,review_of:null,task:'Fictional failed scoped extraction; preserve every negative.',[field]:field==='rejected_native_ids'?[original,'another-fictional-rejected']:original,rejected_output:{text:JSON.stringify({review:{verdict:'Blocked',reason:'Unresolved historical finding; no retry remains.'}}),author_instance:'fictional-failed-instance',reason:'Invalid fictional scoped result'}};});
  const p=await publicCall('company_context',{...f,action:'plan',record_ids:['job:failed-scoped'],disposition:'represented',counterpart_ids:['home'],coverage:[{source_id:'job:failed-scoped',counterpart_ids:['home'],findings:'All negative findings remain open.',failures:'The scoped attempt remains failed.',uncertain_effects:'Effects unknown.',exhausted_allowances:'No retries remain.'}]},'codex');
  const prior=await review(f,p.id,{action:'apply_context_classification'});
  assert.equal((await publicCall('company_context',{...f,action:'apply',plan_id:p.id,review_id:prior.id},'codex')).applied,true);
  const publication=await ctx(f,{action:'plan'});assert.equal(publication.held,false);
  const returned=await review(f,publication.id,{native});
  if(reused){await assert.rejects(ctx(f,{action:'apply',plan_id:publication.id,review_id:returned.id}),/reviewer owns current home/);assert.equal(read(f).operating_state,undefined);}
  else assert.equal((await ctx(f,{action:'apply',plan_id:publication.id,review_id:returned.id})).published,true);
 }
});


test('v2 qualification also excludes the native of its retained rejected job contribution',async()=>{
 for(const [field,wrapped] of [['rejected_native_id',false],['rejected_native_ids',false],['rejected_native_ids',true]]){
  const f=fixture(),native='fictional-original-rejected-native';home(f,'home','*',{evidence_refs:['job:failed']});
  mutate(f,s=>{s.jobs.failed={id:'failed',role:'qa',status:'failed',instance_id:'fictional-original-instance',native_id:null,[field]:field==='rejected_native_ids'?[native]:native,rejected_output:{text:'Fictional rejected contribution: no retry remains.'}};});
  if(wrapped){withStore(f.root,db=>{if(db.storageInfo().format!=='normalized-v4')db.migrate();});mutate(f,s=>{s.jobs.failed=retainSnapshotEntry(s,s.jobs.failed);});}
  const p=await publicCall('company_context',{...f,action:'plan',record_ids:['job:failed'],disposition:'represented',counterpart_ids:['home'],coverage:[{source_id:'job:failed',counterpart_ids:['home'],findings:'Finding remains open.',failures:'Attempt remains failed.',uncertain_effects:'Effects unknown.',exhausted_allowances:'No retries.'}]},'codex');
  const r=await review(f,p.id,{native,action:'apply_context_classification'});
  await assert.rejects(publicCall('company_context',{...f,action:'apply',plan_id:p.id,review_id:r.id},'codex'),/reviewer owns source/);
  assert.equal(read(f).context_classifications?.['job:failed'],undefined);
 }
});

// Actual runtime-owned upgrade checkpoints retain historical authorship even
// after the live row disappears. An arbitrary artifact.snapshot is not one.
test('archived rejected job attribution survives snapshot-only retention without promoting external metadata',async()=>{
 for(const lane of ['qualification','qualification-different','publication','external']){
  const f=fixture(),native='fictional-archived-rejected-native';withStore(f.root,db=>{if(db.storageInfo().format!=='normalized-v4')db.migrate();});
  home(f,'home','*',{evidence_refs:['upgrade:history'],conditions:'Historical failure and uncertain effects remain; no retry authority.'});
  mutate(f,s=>{const rejected={id:'retired-job',role:'qa',status:'failed',native_id:null,rejected_native_ids:[native],rejected_output:{text:'Failed contribution remains unaccepted.'}};
   const body={id:s.id,governance:'No external action',roles:{qa:{}},records:{},jobs:lane==='external'?{}:{'retired-job':rejected},...(lane==='external'?{external_metadata:rejected}:{})};
   if(lane==='qualification-different')s.jobs['retired-job']={...rejected,native_id:'fictional-newer-native',rejected_native_ids:[],instance_id:'fictional-newer-instance'};
   s.upgrade={id:'history',status:'recovered',checkpoint:retainSnapshot(s,body),checkpoint_sha256:sha(body),error:'Historical failure remains; no fresh authority.'};
  });
  const plan=await publicCall('company_context',{...f,action:'plan',record_ids:['upgrade:history'],disposition:'represented',counterpart_ids:['home'],coverage:[{source_id:'upgrade:history',counterpart_ids:['home'],findings:'All findings remain open.',failures:'Historical failed contribution remains unaccepted.',uncertain_effects:'Effects remain unknown.',exhausted_allowances:'No retries.'}]},'codex');
  const prior=await review(f,plan.id,{native:lane.startsWith('qualification')?native:'fictional-independent-history-qa',action:'apply_context_classification'});
  if(lane.startsWith('qualification')){
   await assert.rejects(publicCall('company_context',{...f,action:'apply',plan_id:plan.id,review_id:prior.id},'codex'),/reviewer owns source/);continue;
  }
  assert.equal((await publicCall('company_context',{...f,action:'apply',plan_id:plan.id,review_id:prior.id},'codex')).applied,true);
  const proposal=await ctx(f,{action:'plan'}),r=await review(f,proposal.id,{native});
  if(lane==='publication')await assert.rejects(ctx(f,{action:'apply',plan_id:proposal.id,review_id:r.id}),/reviewer owns current home/);
  else assert.equal((await ctx(f,{action:'apply',plan_id:proposal.id,review_id:r.id})).published,true);
 }
});

// Real storage/worker/public review mechanics, with scripted fictional semantic
// judgments. Accepted negative history stays exact without native body replay.
test('successor review retains accepted negative meaning and exact references without replaying paid raw negatives',async()=>{
 const f=fixture(),marker='PAID-UNCHANGED-NEGATIVE-'+'.'.repeat(180000);
 home(f,'home','*',{evidence_refs:['job:old-failed'],conditions:'Old failure remains failed; uncertain effects and exhausted allowance remain; no export.'});
 mutate(f,s=>{s.jobs['old-failed']={id:'old-failed',role:'qa',status:'failed',native_id:null,instance_id:'old-failed-instance',rejected_native_id:'old-failed-native',rejected_output:{text:marker,author_instance:'old-failed-instance',reason:'Retained failed evidence'}};s.jobs['old-failed']=retainSnapshotEntry(s,s.jobs['old-failed']);});
 const p=await publicCall('company_context',{...f,action:'plan',record_ids:['job:old-failed'],disposition:'represented',counterpart_ids:['home'],coverage:[{source_id:'job:old-failed',counterpart_ids:['home'],findings:'Failure remains open.',failures:'Old rejected output stays failed.',uncertain_effects:'Effects unknown.',exhausted_allowances:'Zero retries.'}]},'codex');
 const prior=await review(f,p.id,{action:'apply_context_classification'});await publicCall('company_context',{...f,action:'apply',plan_id:p.id,review_id:prior.id},'codex');
 const initial=await ctx(f,{action:'plan'}),initialQA=await evidenceReview(f,initial.id,'complete');
 assert.equal(initialQA.job.status,'completed',initialQA.job.error);await ctx(f,{action:'apply',plan_id:initial.id,review_id:initialQA.job.artifact_id});
 const original=read(f).jobs['old-failed'];
 mutate(f,s=>{s.records.home.revision++;s.records.home.operating_record.conditions+=' NEW_LIMIT: review only.';});
 const next=await ctx(f,{action:'plan'}),qa=await review(f,next.id,{onPrompt:wire=>assert.ok(!wire.includes(marker))});
 assert.equal((await ctx(f,{action:'apply',plan_id:next.id,review_id:qa.id})).published,true);
 assert.deepEqual(read(f).jobs['old-failed'],original);
 assert.equal(read(f).operating_state.accepted_snapshot.negative_findings.rejected[0].id,'job:old-failed');
 mutate(f,s=>{const changed=resolveSnapshotEntry(s,s.jobs['old-failed']);changed.rejected_output.reason+=' NEW_NEGATIVE against preserved source';s.jobs['old-failed']=retainSnapshotEntry(s,changed);});
 assert.throws(()=>operatingContext(read(f)),/Held|DIRTY/);
 const delivered=[];const repair=await ctx(f,{action:'plan'}),r=await review(f,repair.id,{onPrompt:wire=>delivered.push(wire)});assert.ok(delivered.join('\n').includes('NEW_NEGATIVE'));
 assert.ok(r.id); // No live semantic acceptance is claimed by this fixture.
});

test('company-shaped application metadata, including the actual company ID, is not a canonical snapshot',async()=>{
 for(const sameCompany of [false,true]){
  const f=await restrictedArchive({metadata:s=>({id:sameCompany?s.id:'external-company-metadata',governance:'Application example only',roles:{qa:{}},records:{permission:{id:'permission',job_id:'external-provider-job'}},jobs:{retired:{id:'retired',rejected_native_ids:['fictional-metadata-reviewer']}}})});
  const p=await ctx(f,{action:'plan'}),r=await review(f,p.id,{native:'fictional-metadata-reviewer'});
  assert.equal((await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id})).published,true);
 }
});

// Complete compulsory semantics, not the small streamed header, is measured.
test('accepted archive growth does not replay paid history in a one-obligation delta',async t=>{
 const measurements=[];
 for(const count of [1,10,100]){
  const f=fixture();home(f);await archive(f,count,0,{bodySize:200});await publish(f);
  home(f,'home','*',{conditions:'Same changed current obligation at every accepted archive size.'});
  const p=await ctx(f,{action:'plan'}),q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'Review exactly one changed current obligation.'},'codex',{check:()=>({available:true}),launch:()=>({on(){},unref(){}})});
  const packet=assignmentContext(read(f),read(f).jobs[q.id]),stream=packet.operating_evidence?.sources[packet.operating_evidence.pages[0].source_id];
  measurements.push({archive_records:count,compulsory_semantics:stream?.length??packet.text.length});
 }
 t.diagnostic(JSON.stringify({fictional_only:true,measurements,native_acceptance:false}));
 assert.ok(measurements[2].compulsory_semantics<=measurements[0].compulsory_semantics+2000,'unchanged independently accepted archive must not expand semantic review');
});

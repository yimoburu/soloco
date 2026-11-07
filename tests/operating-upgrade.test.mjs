import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {retainSnapshot,retainSnapshotEntry,snapshotBytes,inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {recordReference,currentExtensions,applyContextQualification} from '../plugins/soloco/runtime/current-state.mjs';
import {operatingContext,operatingFrontier,proposeOperatingState} from '../plugins/soloco/runtime/operating-state.mjs';
const cloneState=s=>inheritSnapshots(s,structuredClone(s));
const protocol='operating-state-v1',sha=v=>digest(JSON.stringify(v));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'operating-upgrade-contract-'));process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'data');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const read=f=>withStore(f.root,db=>db.read());
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.contract.fixture',s=>{fn(s);return s;}));
function fixture(){const f={root:fs.mkdtempSync(path.join(tmp,'company-')),session_id:'founder-fixture',epoch:1,source_instruction:'Fictional fixture authorizes prospective read-only qualification; grants no external action.'};engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'Fictional operating protocol contract tests'},'codex');withStore(f.root,db=>{if(db.storageInfo().format!=='normalized-v4')db.migrate();});mutate(f,s=>{s.roles={qa:{name:'QA'},engineer:{name:'Engineer'}};s.governance='No external execution.';s.governance_sha256=digest(s.governance);s.cos_instructions='Preserve all exceptions.';s.team_sha256=teamHash(s);});return f;}
const ctx=(f,args)=>publicCall('company_context',{...f,protocol,...args},'codex');
function home(f,id='home',scope='*',extra={}){return engine.save({...f,id,...(read(f).records[id]?{expected_revision:read(f).records[id].revision}:{}),kind:'artifact',content:'Complete fictional condition: no export or retry without canonical authority.',operating_record:{version:1,kind:'obligation',scope,owner:'runner',conditions:'Always while unresolved',exceptions:'None',clearing:'Exact independent closure',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:[id],...extra}},'codex');}
// The native adapter below is an explicitly fictional CONTRACT DOUBLE. Worker
// publication/closure, public APIs, hashes and SQLite transactions are real.
async function review(f,plan,{native='fictional-independent-'+plan,verdict='Pass',hook,action='publish_operating_state',readSources=[],onPrompt}={}){
 const queued=engine.dispatch({...f,role:'qa',review_of:plan,task:'Review complete fictional operating meaning, preservation, authority and interactions.'},'codex',{check:()=>({available:true,authenticated:true,version:'contract-double'}),launch:()=>({on(){},unref(){}})});
 let first=true;const evidence=(()=>{const c=assignmentContext(read(f),read(f).jobs[queued.id]);return c.qualification_evidence??c.operating_evidence;})();
 const pendingReads=[...readSources],frozenReads=evidence?Object.values(evidence.sources).flatMap(v=>{const ranges=[];for(let offset=0;offset<v.length;){let length=Math.min(16000,v.length-offset);if(/[\uD800-\uDBFF]/.test(v.raw[offset+length-1]))length--;ranges.push({source_id:v.source_id,sha256:v.sha256,offset,length});offset+=length;}return ranges;}):[];
 await work(f.root,queued.id,async(_host,_session,prompt,_dir,timeout,_selection,options)=>{onPrompt?.(prompt);if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}if(frozenReads.length)return {native_id:native,text:JSON.stringify({reads:frozenReads.splice(0,evidence.handover.review_context?4:1)})};if(!evidence&&pendingReads.length)return {native_id:native,text:JSON.stringify({reads:pendingReads.splice(0,4).map(id=>({id,sha256:sha(readStateSource(read(f),id)),offset:0,length:JSON.stringify(readStateSource(read(f),id)).length}))})};const target=read(f).records[plan];if(hook)hook();return {native_id:native,text:JSON.stringify({content:'FICTIONAL CONTRACT DOUBLE: complete fixture conditions checked; no native semantic acceptance claimed.',messages:[],notices:[],review:{verdict,reason:'Fictional contract judgment',permitted_action:action,plan_sha256:sha(target.operating_plan??target.context_classification_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,...(action==='apply_context_classification'?{coverage_complete:true,obligations_preserved:true,unique_findings:[]}:{}),blockers:verdict==='Pass'?[]:['fixture unresolved']}})};});
 const s=read(f),j=s.jobs[queued.id];assert.equal(j.status,'completed',j.error);return {id:j.artifact_id,job:queued.id};
}
async function publish(f){const p=await ctx(f,{action:'plan'}),r=await review(f,p.id);const result=await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id});assert.equal(result.published,true);return {p,r};}


import {upgrade,rehearse,checkpoint} from '../plugins/soloco/runtime/upgrade.mjs';
import {buildEvidence,readEvidence} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import {contractModel} from './helpers/upgrade-incremental-model.mjs';
async function qualifiedRecovered(){
 const f=fixture();withStore(f.root,db=>{if(db.storageInfo().format!=='normalized-v4')db.migrate();});
 mutate(f,s=>{s.upgrade={id:'fictional-recovered',status:'recovered',epoch:1,host:'codex',candidate_hash:'fictional-candidate',recovered_at:'2026-11-06T00:00:00Z',probe_status:'failed',review_status:'failed',error:'Prior continuity QA failed; never retry on old allowance',probe_native_id:'fictional-original-upgrade-producer',probe:{content:'FICTIONAL retained full failed report '+'.'.repeat(240000)},checkpoint:retainSnapshot(s,{raw:'FICTIONAL original failed attempt; unknown effects and zero retries. '+'.'.repeat(260000)})};});
 home(f,'outcome','*',{kind:'outcome',attempted_action:'Failed fictional upgrade rehearsal',resources:['fictional candidate'],possible_effects:'Preparation may have produced uncertain evidence',uncertainty:'Original failure remains failed; effects unknown',retry_clearing:'Independent reconciliation plus fresh canonical authority; current independent resume_handover gate remains',historical_receipts:['upgrade:fictional-recovered'],evidence_refs:['upgrade:fictional-recovered']});
 home(f,'permission','*',{kind:'permission',grant_refs:['upgrade:fictional-recovered'],remaining:0,revoked:true,evidence_refs:['upgrade:fictional-recovered']});
 const p=await publicCall('company_context',{...f,action:'plan',record_ids:['upgrade:fictional-recovered'],disposition:'represented',counterpart_ids:['outcome','permission'],coverage:[{source_id:'upgrade:fictional-recovered',counterpart_ids:['outcome','permission'],findings:'Complete fictional original retained; current independent resume_handover remains required',failures:'Prior QA remains failed; old failure is not resolved',uncertain_effects:'All effects remain unknown pending independent reconciliation',exhausted_allowances:'Zero retries; revoked; fresh canonical authority required'}]},'codex');
 const r=await review(f,p.id,{action:'apply_context_classification'});
 assert.equal((await publicCall('company_context',{...f,action:'apply',plan_id:p.id,review_id:r.id},'codex')).applied,true);
 return f;
}

const opts={check:()=>({available:true,authenticated:true}),launch:()=>{}};
async function accepted(){const f=await qualifiedRecovered();mutate(f,s=>{s.notices.push({id:'old-failed-notice',content:'FICTIONAL prior QA failure remains unresolved; zero retry allowance',created_at:'2026-01-01T00:00:00Z'});});await publish(f);return f;}
function prepare(f,extra={}){const inspection=upgrade({...f,action:'inspect',context_mode:'current'},'codex');const p=upgrade({...f,action:'prepare',expected_epoch:read(f).owner.epoch,candidate_hash:inspection.candidate_hash,workflow:'incremental-v1',context_mode:'current',...extra},'codex',opts);return {...f,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch,candidate_hash:inspection.candidate_hash};}
function subject(f){const s=read(f),u=s.upgrade;return buildEvidence(u.checkpoint,[],{snapshotState:s,currentState:true,checkpointContinuity:true,operatingInput:JSON.parse(snapshotBytes(s,u.operating_input))});}

test('PUBLIC fictional worker bootstrap -> fresh accepted operating incremental/current rehearsal -> apply/readback preserves raw history and keeps ordinary operation Held',async()=>{
 const f=await accepted(),before=read(f),acceptedS=operatingContext(before),old=structuredClone(before.upgrade),raw=snapshotBytes(before,before.upgrade.checkpoint);
 const preview=upgrade({...f,action:'inspect',context_mode:'current'},'codex').projection_preview;
 assert.equal(preview.kind,'accepted-operating-upgrade-preview');assert.ok(preview.raw_archive_retrieval.bytes>500000);assert.ok(preview.meaning.stream_bytes<preview.raw_archive_retrieval.bytes);assert.equal(preview.acceptance,false);
 const a=prepare(f),captured=read(a),u=captured.upgrade,input=JSON.parse(snapshotBytes(captured,u.operating_input));
 assert.deepEqual(input.context,acceptedS);assert.equal(input.attempt_id,u.id);assert.equal(u.call_timeout_minutes,10);assert.equal(u.review_window_minutes,45);
 assert.deepEqual(captured.upgrade_history.at(-1),old);assert.throws(()=>operatingContext(captured),/Held/);
 const seen=[];await rehearse(a.root,a.upgrade_id,contractModel({observe:(task,prompt)=>seen.push({task,prompt})}));
 const ready=read(a).upgrade;assert.equal(ready.status,'ready',ready.error);assert.notEqual(ready.probe.native_id,ready.review.native_id);
 assert.ok(ready.steps.every(step=>step.operating_input_sha256===u.operating_input.immutable_snapshot.sha256));
 const mandatory=seen.filter(x=>x.task.phase==='page'&&x.task.role==='cos').map(x=>x.task.page.text).join('');
 assert.match(mandatory,/accepted_operating_context/);assert.match(mandatory,/effects unknown/);assert.match(mandatory,/remaining/);assert.ok(!mandatory.includes('.'.repeat(1000)));
 const final=seen.find(x=>x.task.role==='qa'&&x.task.phase==='synthesis').task;assert.deepEqual(final.proposed_handover,ready.probe.artifact);
 const pendingPreview=upgrade({...a,action:'inspect'},'codex').projection_preview;assert.equal(pendingPreview.kind,'accepted-operating-upgrade-preview');
 const evidence=subject(a),original=Object.values(evidence.sources).find(x=>x.source_id==='vault-'+old.checkpoint.immutable_snapshot.sha256);
 assert.ok(original);let recovered='';for(let offset=0;offset<original.length;offset+=32768)recovered+=readEvidence(evidence,{source_id:original.source_id,sha256:original.sha256,offset,length:Math.min(32768,original.length-offset)}).text;assert.equal(recovered,raw);
 upgrade({...a,action:'apply'},'codex');upgrade({...a,action:'verify',expected_epoch:read(a).owner.epoch},'codex');
 const after=read(a);assert.equal(after.upgrade.status,'completed');assert.equal(after.id,before.id);assert.equal(after.governance,before.governance);assert.deepEqual(after.operating_state,before.operating_state);assert.deepEqual(after.notices,before.notices);assert.deepEqual(after.upgrade_history.at(-1),old);assert.equal(snapshotBytes(after,old.checkpoint),raw);
 for(const [id,r]of Object.entries(before.records))assert.deepEqual(after.records[id],r);for(const [id,j]of Object.entries(before.jobs))assert.deepEqual(after.jobs[id],j);
 assert.throws(()=>operatingContext(after),/Held/,'changed definitions/owner require NEW independent delta QA; upgrade Pass never republishes operating meaning');
 console.log('PUBLIC FICTIONAL measured preview',JSON.stringify(preview));
});

test('fresh frozen reader holds raw business, proof, input, vault, expiry, candidate and owner mutations before any native call',async()=>{
 const f=await accepted(),a=prepare(f),base=read(a);
 const mutations={journal:s=>{s.upgrade.unreviewed_business='new restriction';},business:s=>{s.idea+=' changed';},proof:s=>{s.jobs[s.records[s.operating_state.review.id].job_id].native_id='changed-proof';},envelope:s=>{s.operating_state.accepted_snapshot.home_envelopes=[];},input:s=>{s.upgrade.operating_input=retainSnapshot(s,{protocol:'forged'});},vault:s=>{s.upgrade.operating_input.immutable_snapshot.sha256='0'.repeat(64);},candidate:s=>{s.upgrade.candidate.cos_instructions+=' changed';},owner:s=>{s.owner.epoch++;},intake:s=>{s.records.unrelated={id:'unrelated',content:'new prohibition'};}};
 for(const [name,change]of Object.entries(mutations)){mutate(a,s=>{Object.assign(s,structuredClone(base));change(s);});let calls=0;await rehearse(a.root,a.upgrade_id,async()=>{calls++;});assert.equal(calls,0,name);assert.equal(read(a).upgrade.status,'failed',name);}
 mutate(a,s=>Object.assign(s,structuredClone(base)));const originalNow=Date.now;try{Date.now=()=>base.upgrade.deadline_ms+1;let calls=0;await rehearse(a.root,a.upgrade_id,async()=>{calls++;});assert.equal(calls,0);}finally{Date.now=originalNow;}
});

test('operating authority expiry is checked independently of upgrade deadline',async()=>{
 const f=await qualifiedRecovered(),until=new Date(Date.now()+120000).toISOString();const p=await ctx(f,{action:'plan',valid_until:until}),r=await review(f,p.id);await ctx(f,{action:'apply',plan_id:p.id,review_id:r.id});
 const a=prepare(f),now=Date.now;try{Date.now=()=>Date.parse(until)+1;let calls=0;await rehearse(a.root,a.upgrade_id,async()=>{calls++;});assert.equal(calls,0);assert.match(read(a).upgrade.error,/authority expired/);}finally{Date.now=now;}
});

test('old recovered/failed attempts cannot gain operating mode; explicit selection and original ceilings are required',async()=>{
 const f=await accepted(),old=read(f).upgrade;assert.equal(old.operating_input,undefined);
 assert.throws(()=>upgrade({...f,action:'resume',expected_epoch:1,upgrade_id:old.id,candidate_hash:old.candidate_hash,context_mode:'current'},'codex',opts),/context_mode/);
 for(const extra of [{call_timeout_minutes:30},{review_window_minutes:90},{review_window_minutes:null}]){assert.throws(()=>prepare(f,extra),/ceiling/);assert.deepEqual(read(f).upgrade,old);}
 const a=prepare(f);await rehearse(a.root,a.upgrade_id,contractModel({verdict:'Fail'}));const failed=read(a).upgrade;assert.equal(failed.status,'failed');assert.throws(()=>upgrade({...a,action:'resume'},'codex',opts),/nonfailed/);assert.deepEqual(read(a).upgrade,failed);assert.deepEqual(read(a).upgrade_history.at(-1),old);
});

test('actual immutable vault byte corruption fails closed and a changed step binding cannot apply',async()=>{
 const f=await accepted(),a=prepare(f),u=read(a).upgrade,hash=u.operating_input.immutable_snapshot.sha256;
 const raw=withStore(a.root,db=>db.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(hash).bytes);
 try{withStore(a.root,db=>db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run(raw+' ',hash));assert.throws(()=>upgrade({...a,action:'inspect'},'codex'),/corrupt|changed|hash|mismatch/i);}
 finally{withStore(a.root,db=>db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run(raw,hash));}
 await rehearse(a.root,a.upgrade_id,contractModel());assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
 mutate(a,s=>{s.upgrade.steps[0].operating_input_sha256='0'.repeat(64);});assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/proof|receipt|tampered/);
});

test('prospective verify rejects extra business intake after apply without changing historical validators',async()=>{
 const a=prepare(await accepted());await rehearse(a.root,a.upgrade_id,contractModel());assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);upgrade({...a,action:'apply'},'codex');
 mutate(a,s=>{s.records.late={id:'late',content:'Unrelated changed business restriction'};});assert.throws(()=>upgrade({...a,action:'verify',expected_epoch:read(a).owner.epoch},'codex'),/exact readback/);
});

test('omitted explicit current request retains the existing attempt path even with an accepted operating state',async()=>{
 const f=await accepted(),candidate_hash=upgrade({...f,action:'inspect',context_mode:'current'},'codex').candidate_hash;
 const p=upgrade({...f,action:'prepare',expected_epoch:1,candidate_hash,workflow:'incremental-v1'},'codex',opts);assert.equal(read(f).upgrade.operating_input,undefined);assert.equal(p.upgrade.status,'queued');
});

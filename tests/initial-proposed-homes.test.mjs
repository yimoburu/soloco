import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {buildLegacyCoherentPlan} from '../plugins/soloco/runtime/legacy-operating.mjs';
import {governingRecords} from '../plugins/soloco/runtime/current-state.mjs';
import {resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
const sha=x=>digest(JSON.stringify(x));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fictional-initial-homes-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const read=f=>withStore(f.root,db=>db.read());
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.fixture',s=>{fn(s);return s;}));
const save=(f,args)=>call('company_save',{root:f.root,session_id:f.session_id,epoch:f.epoch,...args},'codex');
const context=(f,args)=>call('company_context',{...f,protocol:scoped.SCOPED_PROTOCOL,...args},'codex');
async function fixture(){
 const f={root:fs.mkdtempSync(path.join(tmp,'company-')),session_id:'fictional-owner',epoch:1,source_instruction:'FICTIONAL existing authorization: prepare proposed homes and read-only QA while paused; no execution.'};
 engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'FICTIONAL mechanics only'},'codex');withStore(f.root,db=>db.migrate());
 mutate(f,s=>{s.paused=true;s.records.archive={id:'archive',kind:'artifact',revision:1,author_instance:'fictional-source-author',content:'UNKNOWN failed attempt. Remaining allowance ZERO. No execution; retain all negative outcomes.'};});
 const m=buildLegacyCoherentPlan(read(f));
 const partition={plan_sha256:m.plan_sha256,context_policy:scoped.CORPUS_PHYSICAL_CONTEXT,shared_selection_ids:['all'],selections:[{id:'all',scope:'*',occurrence_ids:m.occurrences.map(o=>o.id),incident_ids:[]}]};
 const p=await context(f,{action:'plan',source_id:'archive',selected_source_ids:['archive'],partitioner:scoped.CORPUS_PARTITIONER,semantic_partition:partition,batching_policy:scoped.CORPUS_INTRINSIC_BATCHING,home_intake_policy:scoped.INITIAL_PROPOSED_HOMES,maintenance:true});
 f.plan_id=p.id;return f;
}
function judgment(p){
 const r={...p.response_shape,verdict:'Pass',reason:'FICTIONAL SCRIPT: mechanics only; no native semantic QA.',permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
 if(p.phase==='extract'){
  const b=p.reviewed_unit_bundle;r.unit_id=b.primary.id;r.unit_sha256=sha(b.primary);r.reviewed_unit_bundle_sha256=sha(b);
  r.items=[{id:'coherent-occurrence',kind:'boundary',text:'UNKNOWN; failed outcome; ZERO allowance; no execution.',scope:'*',provenance:b.provenance_sha256,interfaces:[b.primary.required_interface]}];
 }else if(p.phase==='applicability'){
  r.summary='FICTIONAL: full unknown and exhausted conditions retained; no permission.';
  r.mappings=p.item_keys.map(item=>({item,selection_ids:p.mapping_selection_ids,source_set:p.mapping_sets.source_set,occurrence_set:p.mapping_sets.occurrence_set,context_sha256:p.mapping_context_sha256,typed_homes:p.typed_homes,conditions:'No execution; allowance ZERO.',unresolved_outcomes:'UNKNOWN failed outcome remains OPEN.',status:'represented',homes:p.homes.map(h=>h.source.id),reason:'FICTIONAL preservation judgment.'}));
  r.interfaces=p.interface_keys.length?[]:p.extractions.flatMap(e=>e.result.items.map(i=>({key:e.review.id+'/'+i.id,item:i}))).filter(i=>p.item_keys.includes(i.key)).flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));
  r.reviewed_interfaces=p.interface_keys;
 }else{r.summary='FICTIONAL independent aggregate; no execution.';r.unreviewed_interfaces=[];}
 return {content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r};
}
async function review(f,args,change,native){
 const target=await context(f,{action:'target',plan_id:f.plan_id,...args});if(target.reused)return target;
 const q=engine.dispatch({...f,role:'qa',review_of:target.id,task:'FICTIONAL scripted contract review'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
 const chunks=[];let packet;
 await work(f.root,q.id,async(host,session,prompt,dir,timeout,selection,options)=>{
  const now=Date.now();options.onSpawn(executionTiming(now,{timeout_ms:Math.min(timeout,options.executionDeadlineAt?options.executionDeadlineAt-now:timeout),timeout_reason:options.timeoutReason}));
  let p=JSON.parse(prompt);const n=native??'fictional-independent-'+q.id;
  if(p.protocol===scoped.SCOPED_STREAM){chunks.push(p.text);if(!p.final)return {native_id:n,text:JSON.stringify({scoped_stream_ack:{body_sha256:p.body_sha256,sequence:p.sequence,range_sha256:p.range_sha256}})};p=JSON.parse(chunks.join(''));}
  if(p.protocol==='corpus-readable-structure-v1')p=scoped.expandCorpusStructure(p);packet=p;
  const e=judgment(p);if(change)change(e,p);return {native_id:n,text:JSON.stringify(e)};
 });
 const s=read(f),job=s.jobs[q.id];return {target,job,record:s.records[job.artifact_id],packet};
}
const typed=()=>({version:1,kind:'permission',scope:'*',owner:'fictional-owner',conditions:'Proposed representation only; existing allowance ZERO.',exceptions:'Never authorizes execution.',clearing:'Independent review and existing authority required.',expires_at:null,dependencies:[],authority_refs:['archive'],evidence_refs:[],grant_refs:['archive'],remaining:0,revoked:true});
async function home(f,id='home',expected_revision){const s=read(f),op=typed();op.evidence_refs=['archive'];return save(f,{id,...(expected_revision===undefined?{}:{expected_revision}),kind:'artifact',content:'UNKNOWN failed outcome; allowance ZERO; no execution.',operating_record:op,bootstrap_plan_id:f.plan_id});}
async function extraction(f){const v=read(f).records[f.plan_id].scoped_context_plan;const es=[];for(const u of v.units){const e=await review(f,{phase:'extract',unit_id:u.id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(e.job.status,'completed',e.job.error);es.push(e);}return es;}
const domainArgs=es=>({phase:'applicability',delivery_schema:scoped.CORPUS_PHASED_DELIVERY,delivery_protocol:scoped.SCOPED_STREAM,selection_ids:['all'],extraction_review_ids:es.map(e=>e.record.id),context_scope:'*'});
async function aggregate(f,es,d){const a=domainArgs(es),i=await review(f,{...a,domain_review_ids:[d.record.id],interface_keys:d.record.qualification_result.interfaces.map(i=>i.key)});assert.equal(i.job.status,'completed',i.job.error);const final=await review(f,{phase:'integration',delivery_schema:scoped.CORPUS_PHASED_DELIVERY,delivery_protocol:scoped.SCOPED_STREAM,domain_review_ids:[d.record.id],interface_review_ids:[i.record.id]});assert.equal(final.job.status,'completed',final.job.error);await context(f,{action:'apply',integration_review_id:final.record.id});return final;}

test('FICTIONAL zero-home bootstrap uses real normalized-v4 intake and unchanged canonical extraction',async()=>{
 const f=await fixture(),s0=read(f),v=s0.records[f.plan_id].scoped_context_plan;assert.equal(Object.values(s0.records).filter(r=>r.operating_record).length,0);
 const es=await extraction(f),bundle=es.map(e=>e.record.reviewed_unit_bundle);await home(f);const s=read(f);assert.equal(s.records[f.plan_id].scoped_context_plan.extraction_identity,v.extraction_identity);assert.deepEqual(es.map(e=>s.records[e.record.id].reviewed_unit_bundle),bundle);
 assert.ok(governingRecords(s).some(r=>r.id==='home'));assert.equal(s.records.home.operating_record.remaining,0);assert.equal(s.governance,s0.governance);
 const d=await review(f,domainArgs(es));assert.equal(d.job.status,'completed',d.job.error);assert.deepEqual(d.packet.current_home_inventory,[scoped.scopedReference(s.records.home)]);assert.equal(d.packet.homes[0].value.content,s.records.home.content);
 const final=await aggregate(f,es,d);assert.deepEqual(final.packet.current_home_inventory,d.packet.current_home_inventory);assert.ok(read(f).paused);
 const reused=await review(f,{phase:'extract',unit_id:v.units[0].id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(reused.reused,true);assert.equal(reused.review_id,es[0].record.id);
});

test('FICTIONAL runtime provenance, complete inventory, immutable home revisions and controls fail closed',async()=>{
 const f=await fixture(),es=await extraction(f);await home(f);const a=domainArgs(es),d=await review(f,a);assert.equal(d.job.status,'completed',d.job.error);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...a,current_home_inventory:[]}),/inventory/);
 await assert.rejects(save(f,{id:'home',expected_revision:1,kind:'artifact',content:'remove typed body'}),/same bootstrap plan/);
 await assert.rejects(save(f,{id:'home',expected_revision:1,bootstrap_plan_id:f.plan_id,kind:'decision',content:'retype',operating_record:typed()}),/typed artifact|complete typed/);
 await assert.rejects(save(f,{id:'forged',kind:'artifact',content:'forged',bootstrap_home_provenance:{}}),/Unknown argument/);
 const op=typed();op.evidence_refs=['missing'];await assert.rejects(save(f,{id:'bad-ref',bootstrap_plan_id:f.plan_id,kind:'artifact',content:'bad',operating_record:op}),/source missing missing/);
 await home(f,'home',1);assert.equal(read(f).records.home.previous.length,1);
 await assert.rejects(aggregate(f,es,d),/changed/);
 const reuse=await review(f,{phase:'extract',unit_id:es[0].target.target.unit_id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(reuse.reused,true);
 const next=await review(f,a);assert.equal(next.job.status,'completed',next.job.error);await home(f,'second');await assert.rejects(aggregate(f,es,next),/changed/);
 mutate(f,s=>{delete s.records.second;});assert.throws(()=>scoped.scopedPlanView(read(f),{plan_id:f.plan_id}),/removed|disappeared/);
});


test('FICTIONAL Blocked home correction requires fresh independent exact negative disposition without re-extraction',async()=>{
 const f=await fixture(),es=await extraction(f);await home(f);const a=domainArgs(es);
 const blocked=await review(f,a,e=>{const r=e.qualification_result;r.verdict='Blocked';r.reason='FICTIONAL missing explicit clearing condition';r.permitted_action='hold';r.blockers=[r.reason];e.content=r.reason;e.review={verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action};});
 assert.equal(blocked.job.status,'completed',blocked.job.error);assert.equal(blocked.record.review.verdict,'Blocked');
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...a,repair_of:[blocked.record.id]}),/unchanged repair candidate/);
 const original=read(f).records.home;const op=structuredClone(original.operating_record);op.clearing='Explicit independent reconciliation of UNKNOWN effects; no allowance renewal.';
 await save(f,{id:'home',expected_revision:1,kind:'artifact',content:original.content+' Corrected explicit clearing condition.',operating_record:op,bootstrap_plan_id:f.plan_id});
 const repaired=await review(f,{...a,repair_of:[blocked.record.id]},e=>{for(const d of e.qualification_result.repair_dispositions){d.reason='FICTIONAL corrected explicit reconciliation now retains original UNKNOWN and ZERO allowance.';d.clearing_conditions='Explicit independent reconciliation condition is present; execution remains blocked.';}});
 assert.equal(repaired.job.status,'completed',repaired.job.error);
 assert.throws(()=>scoped.validateScopedNativeAdmission(read(f),repaired.job,blocked.job.native_id),/independent|reused/);
 assert.equal(repaired.packet.repair_counterevidence[0].value.review.verdict,'Blocked');assert.equal(repaired.packet.repair_counterevidence[0].prior_packet.homes[0].value.content,original.content);
 const final=await aggregate(f,es,repaired);assert.equal(final.job.status,'completed');const s=read(f);assert.deepEqual(s.records[blocked.record.id],blocked.record);assert.equal(s.records.home.previous[0].content,original.content);
 const reused=await review(f,{phase:'extract',unit_id:es[0].target.target.unit_id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(reused.review_id,es[0].record.id);
 // A second real worker result, journaled through the public pipeline, cannot
 // be cleared by naming only the first negative in another repair target.
 const second=await review(f,{...a,repair_of:[blocked.record.id]},e=>{const r=e.qualification_result;r.verdict='Blocked';r.reason='FICTIONAL separate unresolved distant condition';r.permitted_action='hold';r.blockers=[r.reason];e.content=r.reason;e.review={verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action};});
 assert.equal(second.job.status,'completed',second.job.error);assert.equal(second.record.review.verdict,'Blocked');
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...a,repair_of:[blocked.record.id]}),/negative/);
 // Revalidation can encounter the new governing negative before its explicit negative gate.
 assert.throws(()=>scoped.validateCorpusPreservation(read(f),{integration_review_id:final.record.id}),/negative|global governing identity changed/);
});

test('FICTIONAL late authority, notices, unknown outcomes, sources and ordinary membership remain holds',async()=>{
 const f=await fixture(),es=await extraction(f);await home(f);const a=domainArgs(es),base=read(f);
 const {inheritSnapshots}=await import('../plugins/soloco/runtime/snapshot.mjs');
 for(const edit of [s=>s.paused=false,s=>s.owner.epoch++,s=>s.governance+=' changed',s=>s.notices.push({id:'fictional-notice',summary:'new restriction'}),s=>s.jobs.unknown={id:'unknown',status:'failed'},s=>s.jobs.ordinary={id:'ordinary',status:'completed'},s=>s.upgrade={id:'late-upgrade'},s=>s.records.archive.content+=' changed',s=>s.records[f.plan_id].context_maintenance.revoked_at=new Date().toISOString(),s=>s.records.extra={id:'extra',kind:'artifact',content:'unknown'},s=>s.records.home.operating_record.kind='rule']){
  const changed=inheritSnapshots(base,structuredClone(base));edit(changed);assert.throws(()=>scoped.createScopedTarget(changed,{plan_id:f.plan_id,...a}),/hold/i);
 }
 const d=await review(f,a);assert.equal(d.job.status,'completed',d.job.error);
 for(const identity of [f.session_id,'fictional-source-author'])assert.throws(()=>scoped.validateScopedNativeAdmission(read(f),d.job,identity),/independent|reused/);
 const capsule=resolveSnapshot(base,base.records[f.plan_id].scoped_context_plan.capsule);
 assert.deepEqual(capsule.selected_sources,['archive']);assert.ok(!capsule.selected_sources.includes('home'));
});


test('FICTIONAL canonical extraction evidence remains inspectable outside review evaluation',async()=>{
 const f=await fixture(),es=await extraction(f),op=typed();
 op.evidence_refs=[es[0].record.id];
 await save(f,{id:'home',kind:'artifact',content:'Canonical extraction preserves UNKNOWN, failed outcome and ZERO allowance.',operating_record:op,bootstrap_plan_id:f.plan_id});
 const state=read(f);
 assert.ok(scoped.scopedPlanView(state,{plan_id:f.plan_id}).extraction_identity);
 assert.ok(scoped.inspectCorpusIncidence(state,{plan_id:f.plan_id}).sources.length);
 assert.ok(scoped.inspectCorpusWorkload(state,{plan_id:f.plan_id}).extraction.length);
 await context(f,{action:'inspect',plan_id:f.plan_id});
 await context(f,{action:'inspect',plan_id:f.plan_id,section:'workload'});
 const reused=await review(f,{phase:'extract',unit_id:es[0].target.target.unit_id,delivery_protocol:scoped.SCOPED_STREAM});
 assert.equal(reused.reused,true);assert.equal(reused.review_id,es[0].record.id);
});

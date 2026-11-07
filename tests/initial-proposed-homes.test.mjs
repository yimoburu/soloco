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
import {resolveSnapshot,retainSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
import {parseOutput} from '../plugins/soloco/runtime/adapters.mjs';
import {sha,fixture,read,mutate,save,context,review,home,extraction,domainArgs,aggregate,typed,groupMarker,splitArgs,blockedJudgment,dispositions} from './support/scoped-home-fixture.mjs';

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
 const blocked=await review(f,a,e=>{const r=e.qualification_result;r.verdict='Blocked';r.reason='FICTIONAL missing explicit clearing condition';r.permitted_action='hold';r.blockers=[r.reason];if(r.items)r.items[0].text='FICTIONAL unresolved intrinsic extraction; no complete result claimed.';e.content=r.reason;e.review={verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action};});
 assert.equal(blocked.job.status,'completed',blocked.job.error);assert.equal(blocked.record.review.verdict,'Blocked');
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...a,repair_of:[blocked.record.id]}),/unchanged repair candidate/);
 const original=read(f).records.home;const op=structuredClone(original.operating_record);op.clearing='Explicit independent reconciliation of UNKNOWN effects; no allowance renewal.';
 await save(f,{id:'home',expected_revision:1,kind:'artifact',content:original.content+' Corrected explicit clearing condition.',operating_record:op,bootstrap_plan_id:f.plan_id});
 const repaired=await review(f,{...a,repair_of:[blocked.record.id]},e=>{for(const d of e.qualification_result.repair_dispositions){d.reason='FICTIONAL corrected explicit reconciliation now retains original UNKNOWN and ZERO allowance.';d.clearing_conditions='Explicit independent reconciliation condition is present; execution remains blocked.';}});
 assert.equal(repaired.job.status,'completed',repaired.job.error);
 assert.throws(()=>scoped.validateScopedNativeAdmission(read(f),repaired.job,blocked.job.native_id),/independent|reused/);
 assert.equal(repaired.packet.repair_counterevidence[0].value.review.verdict,'Blocked');assert.equal(repaired.packet.repair_counterevidence[0].prior_packet.homes[0].value.content,original.content);
 const final=await aggregate(f,es,repaired);assert.equal(final.job.status,'completed');const s=read(f);assert.deepEqual(s.records[blocked.record.id],blocked.record);assert.equal(s.records.home.previous[0].content,original.content);
 // Reusing work within one synchronous validation must never approve another
 // call on the same now-mutated state object. Restore each field and require
 // the complete canonical result again, including the historical negative.
 const accepted=scoped.validateCorpusPreservation(s,{integration_review_id:final.record.id});
 for(const [object,key,value] of [[s.records.home,'content',s.records.home.content+' changed'],[s.jobs[blocked.job.id],'native_id','changed-negative-native'],[s.records[blocked.record.id].qualification_result,'reason','changed-negative-reason']]){
  const before=object[key];object[key]=value;assert.throws(()=>scoped.validateCorpusPreservation(s,{integration_review_id:final.record.id}),/hold|changed/i);object[key]=before;
  assert.deepEqual(scoped.validateCorpusPreservation(s,{integration_review_id:final.record.id}),accepted);
 }
 const reused=await review(f,{phase:'extract',unit_id:es[0].target.target.unit_id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(reused.review_id,es[0].record.id);
 // A second real worker result, journaled through the public pipeline, cannot
 // be cleared by naming only the first negative in another repair target.
 const second=await review(f,{...a,repair_of:[blocked.record.id]},e=>{const r=e.qualification_result;r.verdict='Blocked';r.reason='FICTIONAL separate unresolved distant condition';r.permitted_action='hold';r.blockers=[r.reason];if(r.items)r.items[0].text='FICTIONAL unresolved intrinsic extraction; no complete result claimed.';e.content=r.reason;e.review={verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action};});
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

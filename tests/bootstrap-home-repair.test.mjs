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

test('FICTIONAL marked initial-home correction retains mixed negatives through independent whole-vector apply',async t=>{
 // This scripted reviewer measures evidence/repair correctness, not native fit.
 // Isolate CPU-heavy history reconstruction from Date-based fixture deadlines;
 // dedicated timeout/stream tests still check real deadline enforcement.
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const f=await fixture({dense:true,groups:7}),initial=read(f),v=initial.records[f.plan_id].scoped_context_plan;
 assert.equal(Object.values(initial.records).filter(r=>r.operating_record).length,0);
 const n=v.units[0].group_ids.length;assert.equal(n,7);
 const parent=await review(f,{phase:'extract',unit_id:'body-batch-0',delivery_protocol:scoped.SCOPED_STREAM},blockedJudgment);
 assert.equal(parent.job.status,'completed',parent.job.error);console.error('FICTIONAL marked home: parent retained');
 const mid=3,childArgs=id=>splitArgs(id,{repair_of:[parent.record.id]});
 const left=await review(f,childArgs(`body-batch-0/g0-${mid}`),dispositions),right=await review(f,childArgs(`body-batch-0/g${mid}-${n}`),dispositions),es=[left,right];
 for(const e of es)assert.equal(e.job.status,'completed',e.job.error);
 console.error('FICTIONAL marked home: complete children');await home(f);await home(f,'other-home');
 const a={...domainArgs(es),...groupMarker,repair_of:[parent.record.id]};
 const blocked=await review(f,a,(e,p)=>{dispositions(e);blockedJudgment(e);e.qualification_result.reason='FICTIONAL home missing explicit reconciliation of distant/opposite conditions';e.qualification_result.blockers=[e.qualification_result.reason];e.content=e.qualification_result.reason;e.review.reason=e.content;});
 assert.equal(blocked.job.status,'completed',blocked.job.error);assert.equal(blocked.record.review.verdict,'Blocked');console.error('FICTIONAL marked home: domain negative retained');
 const negatives=[parent.record.id,blocked.record.id],repair={...a,repair_of:negatives},before=read(f),oldHome=structuredClone(before.records.home);
 // A new target or metadata-only revision is never a material correction.
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...repair}),/unchanged repair candidate/);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...childArgs('body-batch-0/g0-1'),repair_of:negatives}),/unrelated negative/);
 await home(f,'home',1);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...repair}),/unchanged repair candidate/);
 const unchanged=read(f).records.home,op=structuredClone(unchanged.operating_record);op.clearing='Explicit independent reconciliation of UNKNOWN distant/opposite conditions; allowance stays ZERO.';
 await save(f,{id:'home',expected_revision:2,kind:'artifact',content:unchanged.content+' Corrected explicit reconciliation; opposite and distant conditions remain OPEN.',operating_record:op,bootstrap_plan_id:f.plan_id});
 const corrected=read(f),inventory=['home','other-home'].map(id=>scoped.scopedReference(corrected.records[id]));
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...repair,current_home_inventory:inventory.slice(0,1)}),/inventory/);
 for(const repair_of of [[parent.record.id],[blocked.record.id]])await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...repair,repair_of}),/negative/);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...repair,extraction_review_ids:[left.record.id]}),/missing complete body|unrelated negative/);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...repair,selection_ids:['unrelated']}),/selection/);
 const {unit_selection_schema:marker,...unmarked}=repair;await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...unmarked}),/marker|repair requires/);
 const d=await review(f,repair,dispositions);assert.equal(d.job.status,'completed',JSON.stringify({error:d.job.error,execution_failure:d.job.execution_failure,execution_started_at:d.job.execution_started_at,execution_deadline_at:d.job.execution_deadline_at,finished_at:d.job.finished_at}));console.error('FICTIONAL marked home: independent corrected domain');
 assert.notEqual(d.job.native_id,blocked.job.native_id);
 assert.throws(()=>scoped.validateScopedNativeAdmission(read(f),d.job,blocked.job.native_id),/independent|reused/);
 assert.throws(()=>scoped.validateScopedNativeAdmission(read(f),d.job,f.session_id),/independent|reused/);
 const counter=d.packet.repair_counterevidence.find(e=>e.review.id===blocked.record.id);
 assert.deepEqual(counter.value,blocked.record);assert.deepEqual(counter.job,blocked.job);
 assert.deepEqual(counter.prior_packet.homes,blocked.packet.homes);
 assert.equal(counter.prior_packet.homes.find(h=>h.source.id==='home').value.content,oldHome.content);
 assert.deepEqual(d.packet.current_home_inventory,inventory);
 const ia={...repair,domain_review_ids:[d.record.id],interface_keys:d.record.qualification_result.interfaces.map(i=>i.key)};
 // Each own-phase target must name both negatives and obtain its own disposition.
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...ia,repair_of:[parent.record.id]}),/negative/);
 const ir=await review(f,ia,dispositions);assert.equal(ir.job.status,'completed',ir.job.error);
 const fa={phase:'integration',...groupMarker,delivery_schema:scoped.CORPUS_PHASED_DELIVERY,domain_review_ids:[d.record.id],interface_review_ids:[ir.record.id],repair_of:negatives};
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...fa,repair_of:[parent.record.id]}),/negative/);
 const final=await review(f,fa,dispositions);assert.equal(final.job.status,'completed',final.job.error);console.error('FICTIONAL marked home: independent interface and final');
 for(const e of [d,ir,final]){
  assert.equal(e.record.qualification_result.repair_dispositions.length,2);
  assert.equal(e.packet.repair_counterevidence.length,2);
  assert.deepEqual(e.packet.repair_counterevidence.find(c=>c.review.id===blocked.record.id).prior_packet.homes,blocked.packet.homes);
 }
 const ready=read(f);
 const {inheritSnapshots}=await import('../plugins/soloco/runtime/snapshot.mjs');
 for(const edit of [s=>s.paused=false,s=>s.owner.epoch++,s=>s.records.home.content+=' stale',s=>s.records['other-home'].content+=' stale',s=>s.records.archive.content+=' changed',s=>s.records[d.record.id].qualification_result.repair_dispositions=[]]){
  const bad=inheritSnapshots(ready,structuredClone(ready));edit(bad);assert.throws(()=>scoped.validateScopedApply(bad,{integration_review_id:final.record.id}),/hold/i);
 }
 assert.equal((await context(f,{action:'apply',integration_review_id:final.record.id})).applied,true);
 const state=read(f);for(const e of [parent,blocked]){assert.deepEqual(state.records[e.record.id],e.record);assert.deepEqual(state.jobs[e.job.id],e.job);}
 assert.deepEqual(state.records.home.previous[0].content,oldHome.content);assert.equal(state.records.home.previous.length,2);
 assert.deepEqual(state.records['other-home'],before.records['other-home']);
 assert.equal(state.records.home.operating_record.remaining,0);assert.equal(state.records['other-home'].operating_record.remaining,0);
 assert.equal(state.records[f.plan_id].scoped_context_plan.extraction_identity,v.extraction_identity);assert.deepEqual(state.records[f.plan_id].scoped_context_plan.units,v.units);
 for(const e of es){assert.deepEqual(state.records[e.record.id],e.record);const reused=await review(f,childArgs(e.target.target.unit_id));assert.equal(reused.reused,true);assert.equal(reused.review_id,e.record.id);}
 for(const q of ['ALLOW only after consent','DENY even with consent','missing','STRING body-batch-0/g0-1'])assert.ok(JSON.stringify(final.packet.extractions).includes(q),q);
 t.diagnostic(JSON.stringify({fictional_only:true,groups:n,initial_homes:0,applied:true,actual_native_qualification:null,source_acceptance:false}));
});

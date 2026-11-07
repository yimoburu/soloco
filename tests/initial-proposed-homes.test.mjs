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

test('FICTIONAL complete-group parent Blocked, recursive child split, exact reuse and independent final dispositions',async t=>{
 const f=await fixture({dense:true,bootstrap:false}),v0=read(f).records[f.plan_id].scoped_context_plan;
 // This fixture uses the real frozen manifest; no item/group locality is inferred.
 const n=v0.units[0].group_ids.length;assert.ok(n>=4);
 const marker={unit_selection_schema:scoped.COMPLETE_GROUP_RANGES},stream={delivery_protocol:scoped.SCOPED_STREAM};
 const block=e=>{const r=e.qualification_result;r.verdict='Blocked';r.permitted_action='hold';r.reason='FICTIONAL full clauses do not fit; opposite qualifiers and UNKNOWN remain unresolved';r.blockers=[r.reason];if(r.items)r.items[0].text='FICTIONAL unresolved intrinsic extraction; no complete result claimed.';e.content=r.reason;e.review={verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action};};
 const parent=await review(f,{phase:'extract',unit_id:'body-batch-0',...stream},block);assert.equal(parent.job.status,'completed',parent.job.error);assert.equal(parent.record.review.verdict,'Blocked');console.error('FICTIONAL lifecycle: parent retained');
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...groupMarker,phase:'extract',unit_id:'body-batch-0/g0-1'}),/ancestor negative/);
 const old=structuredClone(parent),mid=Math.floor(n/2),base={phase:'extract',...marker,...stream,repair_of:[parent.record.id]};
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...base,unit_id:'body-batch-0'}),/material child splitting/);
 for(const unit_id of ['body-batch-0/g00-1','body-batch-0/g0-0',`body-batch-0/g0-${n}`,'body-batch-0/g0-1/g0-1','body-batch-999/g0-1','STRING body-batch-0/g0-1'])await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...base,unit_id}),/selection|group/);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...base,unit_id:'body-batch-0/g0-1',context_unit_ids:[`body-batch-0/g0-${mid}`]}),/overlap/);
 const left=await review(f,{...base,unit_id:`body-batch-0/g0-${mid}`},block);assert.equal(left.job.status,'completed',left.job.error);
 const right=await review(f,{...base,unit_id:`body-batch-0/g${mid}-${n}`});assert.equal(right.job.status,'completed',right.job.error);
 console.error('FICTIONAL lifecycle: child obstruction retained');const negatives=[parent.record.id,left.record.id],small={...base,repair_of:negatives};
 const a=await review(f,{...small,unit_id:'body-batch-0/g0-1'}),b=await review(f,{...small,unit_id:`body-batch-0/g1-${mid}`});
 assert.equal(a.job.status,'completed',a.job.error);assert.equal(b.job.status,'completed',b.job.error);
 const reused=await review(f,{...base,unit_id:`body-batch-0/g${mid}-${n}`});assert.equal(reused.review_id,right.record.id);
 console.error('FICTIONAL lifecycle: grandchildren complete');const es=[a,b,right],args={...domainArgs(es),counterpart_ids:['home'],...marker,repair_of:negatives};
 const disposition=e=>{for(const d of e.qualification_result.repair_dispositions){d.reason='FICTIONAL actual overflow blocker addressed by complete group children; UNKNOWN and exhausted limits remain in full conclusions.';d.clearing_conditions='Exact replacement coverage, all opposite qualifiers and unknown effects preserved; no action or allowance renewed.';}};
 await assert.rejects(review(f,{...args,repair_of:[parent.record.id]}),/negative/);
 await assert.rejects(review(f,{...args,repair_of:[left.record.id]}),/negative/);
 await assert.rejects(review(f,{...args,extraction_review_ids:[a.record.id,right.record.id]}),/missing complete body/);
 await assert.rejects(review(f,{...args,extraction_review_ids:[...es.map(e=>e.record.id),a.record.id]}),/unique/);
 const d=await review(f,args,disposition);assert.equal(d.job.status,'completed',d.job.error);
 assert.equal(d.packet.response_shape.interaction_completeness.assessment_scope,'selected-context');assert.equal(d.packet.repair_counterevidence.length,2);console.error('FICTIONAL lifecycle: domain continuation');
 await assert.rejects(review(f,{...args,unit_selection_schema:undefined}),/^Error: Invalid unit_selection_schema$/);
 const {unit_selection_schema:omitted,...unmarked}=args;await assert.rejects(review(f,unmarked),/repair requires|marker/);
 const ir=await review(f,{...args,domain_review_ids:[d.record.id],interface_keys:d.record.qualification_result.interfaces.map(i=>i.key)},disposition);assert.equal(ir.job.status,'completed',ir.job.error);
 const final=await review(f,{phase:'integration',...marker,...stream,delivery_schema:scoped.CORPUS_PHASED_DELIVERY,domain_review_ids:[d.record.id],interface_review_ids:[ir.record.id],counterpart_ids:['home'],repair_of:negatives},disposition);assert.equal(final.job.status,'completed',final.job.error);
 await context(f,{action:'apply',integration_review_id:final.record.id});
 for(const q of ['ALLOW only after consent','DENY even with consent','missing','STRING body-batch-0/g0-1'])assert.ok(JSON.stringify(final.packet.extractions).includes(q),'complete contributing extraction retained: '+q);
 const state=read(f);assert.deepEqual(state.records[parent.record.id],old.record);assert.deepEqual(state.jobs[parent.job.id],old.job);assert.equal(state.records.home.operating_record.remaining,0);
 assert.equal(state.records[f.plan_id].scoped_context_plan.extraction_identity,v0.extraction_identity);assert.deepEqual(state.records[f.plan_id].scoped_context_plan.units,v0.units);
 for(const e of [a,b,right,d,ir,final])assert.ok(Buffer.byteLength(JSON.stringify(e.record.qualification_result))<=12000);
 t.diagnostic(JSON.stringify({fictional_only:true,original_groups:n,complete_children:3,actual_native_fit:null,source_acceptance:false}));
});

test('FICTIONAL split adversaries reject overlapping/parent primary, supporting-only credit and stale controls; ordered bundles reuse exactly',async()=>{
 const f=await fixture({dense:true,groups:7,bootstrap:false}),v=read(f).records[f.plan_id].scoped_context_plan,n=v.units[0].group_ids.length;
 const parent=await review(f,splitArgs('body-batch-0'));assert.equal(parent.job.status,'completed',parent.job.error);
 const child=await review(f,splitArgs('body-batch-0/g0-1',{context_unit_ids:['body-batch-0/g1-2','body-batch-0/g2-3']}));assert.equal(child.job.status,'completed',child.job.error);
 const reused=await review(f,splitArgs('body-batch-0/g0-1',{context_unit_ids:['body-batch-0/g1-2','body-batch-0/g2-3']}));assert.equal(reused.review_id,child.record.id);
 const reordered=await review(f,splitArgs('body-batch-0/g0-1',{context_unit_ids:['body-batch-0/g2-3','body-batch-0/g1-2']}));assert.equal(reordered.job.status,'completed',reordered.job.error);assert.notEqual(reordered.target.id,child.target.id);assert.notDeepEqual(reordered.record.reviewed_unit_bundle,child.record.reviewed_unit_bundle);
 const wider=await review(f,splitArgs('body-batch-0/g0-2'));assert.equal(wider.job.status,'completed',wider.job.error);
 const support=await review(f,splitArgs('body-batch-0/g0-1',{context_unit_ids:[`body-batch-0/g1-${n}`]}));assert.equal(support.job.status,'completed',support.job.error);
 const domain=es=>({...domainArgs(es),...groupMarker,counterpart_ids:['home']});
 for(const es of [[parent,child],[child,wider]])await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...domain(es)}),/overlap|duplicate/);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...domain([support])}),/missing complete body/);
 const d=await review(f,domain([parent]));assert.equal(d.job.status,'completed',d.job.error);assert.doesNotThrow(()=>scoped.createScopedTarget(read(f),{plan_id:f.plan_id,...domain([parent])}));
 for(const native of [f.session_id,'fictional-source-author',child.job.native_id])assert.throws(()=>scoped.validateScopedNativeAdmission(read(f),d.job,native),/independent|reused/);
 const state=read(f),{inheritSnapshots}=await import('../plugins/soloco/runtime/snapshot.mjs');
 for(const edit of [s=>s.records.home.content+=' CHANGED',s=>s.owner.epoch++,s=>s.paused=true,s=>s.notices.push({id:'new-notice',summary:'new prohibition'}),s=>s.records.ordinary={id:'ordinary',revision:1,kind:'artifact',content:'new unknown'},s=>s.jobs[parent.job.id].native_id='wrong-native']){
  const bad=inheritSnapshots(state,structuredClone(state));edit(bad);assert.throws(()=>scoped.scopedAssignment(bad,d.job),/hold/i);
 }
 // Worker admission, not a forged canonical receipt, rejects source self-review.
 const foreign=await review(f,splitArgs('body-batch-0/g3-4'),undefined,'fictional-source-author');assert.equal(foreign.job.status,'failed');assert.ok(!foreign.record);assert.ok(foreign.job.rejected_native_ids.includes('fictional-source-author'));
});

test('FICTIONAL failed negative delivery is retained before child acceptance; unknown/missing wire and expired tampering Hold',async()=>{
 const f=await fixture({dense:true,groups:7,bootstrap:false}),n=read(f).records[f.plan_id].scoped_context_plan.units[0].group_ids.length;
 const failed=await review(f,splitArgs('body-batch-0'),e=>{blockedJudgment(e);e.qualification_result.unrecognized='FICTIONAL invalid field forces retention rather than a canonical review';});
 assert.equal(failed.job.status,'failed',failed.job.error);assert.ok(!failed.record);assert.equal(failed.job.rejected_output.qualification_negative,'Blocked');assert.ok(failed.job.qualification_delivery.complete);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...splitArgs('body-batch-0/g0-1')}),/failed ancestor/);
 const evidenceId='job:'+failed.job.id,mid=Math.floor(n/2),args=id=>splitArgs(id,{repair_of:[evidenceId]});
 const a=await review(f,args(`body-batch-0/g0-${mid}`)),b=await review(f,args(`body-batch-0/g${mid}-${n}`));assert.equal(a.job.status,'completed',a.job.error);assert.equal(b.job.status,'completed',b.job.error);
 assert.deepEqual(a.packet.repair_counterevidence[0].job,failed.job);assert.deepEqual(read(f).jobs[failed.job.id],failed.job);
 const domain={...domainArgs([a,b]),...groupMarker,counterpart_ids:['home']};
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...domain}),/retained failed|negative/);
 const d=await review(f,{...domain,repair_of:[evidenceId]},dispositions);assert.equal(d.job.status,'completed',d.job.error);assert.deepEqual(d.packet.repair_counterevidence[0].job.rejected_output,failed.job.rejected_output);
 const {inheritSnapshots}=await import('../plugins/soloco/runtime/snapshot.mjs'),state=read(f);
 for(const edit of [j=>delete j.qualification_delivery,j=>delete j.rejected_output,j=>j.rejected_output.text='{}',j=>j.execution_deadline_at=j.execution_started_at,j=>{j.status='expired';delete j.rejected_output;},j=>j.coordination_release.termination_confirmed=false]){
  const bad=inheritSnapshots(state,structuredClone(state));edit(bad.jobs[failed.job.id]);assert.throws(()=>scoped.createScopedTarget(bad,{plan_id:f.plan_id,...args('body-batch-0/g0-1')}),/hold/i);
 }
 assert.throws(()=>scoped.validateScopedNativeAdmission(state,d.job,failed.job.native_id),/independent|reused/);
});

test('FICTIONAL indivisible complete-group overflow and actual worker timeout retain Hold without limits reset',async()=>{
 const f=await fixture({dense:true,groups:7,bootstrap:false}),id='body-batch-0/g0-1';
 const rich=await review(f,splitArgs(id),e=>{e.qualification_result.items[0].text='FICTIONAL indivisible effect; '.repeat(600);});
 assert.equal(rich.job.status,'failed');assert.ok(rich.job.qualification_hold||/12000|exceeds|bytes|overflow/i.test(rich.job.error));assert.ok(!rich.record);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...splitArgs(id+'/g0-1')}),/Scoped context hold/);
 await assert.rejects(context(f,{action:'target',plan_id:f.plan_id,...splitArgs(id,{repair_of:['job:'+rich.job.id]})}),/Scoped context hold/);
 assert.ok(rich.job.timeout_ms<=600000);assert.equal(scoped.SCOPED_LIMITS.output_bytes,12000);
 const g=await fixture({dense:true,groups:7,bootstrap:false});
 const timeout=await review(g,splitArgs('body-batch-0'),()=>{throw Object.assign(new Error('FICTIONAL native expiry with observed closure'),{code:'ROLE_TIMEOUT',termination_confirmed:true});});
 assert.equal(timeout.job.status,'failed');assert.equal(timeout.job.execution_failure.outcome,'timeout');assert.ok(!timeout.record);
 await assert.rejects(context(g,{action:'target',plan_id:g.plan_id,...splitArgs('body-batch-0/g0-1',{repair_of:['job:'+timeout.job.id]})}),/missing wire|missing.*timing|missing.*native/);
});


test('FICTIONAL recovered native warning stays usable through corpus reuse and complete integration',async()=>{
 const f=await fixture({dense:true,groups:7,bootstrap:false});
 const warning={type:'error',message:'Reconnecting... 2/5 (workspace routing discovery failed)'};
 const e=await review(f,splitArgs('body-batch-0'),undefined,undefined,[warning]);assert.equal(e.job.status,'completed',e.job.error);
 assert.deepEqual(e.job.model_evidence.cli_warnings,[warning]);
 assert.doesNotThrow(()=>scoped.scopedPlanView(read(f),{plan_id:f.plan_id}));
 const again=await review(f,splitArgs('body-batch-0'));assert.equal(again.review_id,e.record.id);
 const a={...domainArgs([e]),...groupMarker,counterpart_ids:['home']},d=await review(f,a);assert.equal(d.job.status,'completed',d.job.error);
 const i=await review(f,{...a,domain_review_ids:[d.record.id],interface_keys:d.record.qualification_result.interfaces.map(v=>v.key)});assert.equal(i.job.status,'completed',i.job.error);
 const final=await review(f,{phase:'integration',...groupMarker,delivery_schema:scoped.CORPUS_PHASED_DELIVERY,counterpart_ids:['home'],domain_review_ids:[d.record.id],interface_review_ids:[i.record.id]});assert.equal(final.job.status,'completed',final.job.error);
 await context(f,{action:'apply',integration_review_id:final.record.id});
 const state=read(f),{inheritSnapshots}=await import('../plugins/soloco/runtime/snapshot.mjs');
 for(const edit of [v=>v.cli_warnings[0].unknown_rule='hidden authority',v=>v.cli_warnings='bad',v=>v.cli_observed_negative_outputs=[{}]]){
  const bad=inheritSnapshots(state,structuredClone(state));edit(bad.jobs[e.job.id].model_evidence);assert.throws(()=>scoped.scopedPlanView(bad,{plan_id:f.plan_id}),/hold/i);
 }
});

test('FICTIONAL decomposition reads complete immutable rejected negative wire, never its clipped preview',async()=>{
 const f=await fixture({dense:true,groups:7,bootstrap:false});
 const tail='FICTIONAL negative tail: UNKNOWN and exhausted limits remain OPEN';
 const failed=await review(f,splitArgs('body-batch-0'),e=>{blockedJudgment(e);e.qualification_result.reason='FICTIONAL oversized negative '+ 'x'.repeat(110000)+tail;});
 assert.equal(failed.job.status,'failed');assert.equal(failed.job.rejected_output.truncated,true);assert.ok(failed.job.rejected_output.original);
 const a=splitArgs('body-batch-0/g0-1',{repair_of:['job:'+failed.job.id]}),child=await review(f,a);assert.equal(child.job.status,'completed',child.job.error);
 assert.ok(child.packet.repair_counterevidence[0].value.qualification_result.reason.endsWith(tail));
 const state=read(f),{inheritSnapshots}=await import('../plugins/soloco/runtime/snapshot.mjs');
 for(const edit of [r=>delete r.original,r=>r.original=resolveSnapshot(state,r.original),r=>r.original={...r.original,unknown:'not an exact reference'},r=>r.text+='changed',r=>r.original.immutable_snapshot.sha256='0'.repeat(64),r=>r.truncated=false,r=>r.truncated='true',r=>r.qualification_negative=null,r=>r.author_instance='other',r=>r.context_sha256='wrong',r=>r.qualification_plan.id='other',r=>r.qualification_target.id='other']){
  const bad=inheritSnapshots(state,structuredClone(state));edit(bad.jobs[failed.job.id].rejected_output);assert.throws(()=>scoped.createScopedTarget(bad,{plan_id:f.plan_id,...a}),/hold|snapshot|immutable|hash/i);
 }
 // A parseable preview cannot stand in for a malformed complete original.
 const bad=inheritSnapshots(state,structuredClone(state)),r=bad.jobs[failed.job.id].rejected_output;
 r.text=JSON.stringify({review:{verdict:'Blocked'}});r.original=retainSnapshot(bad,r.text+' malformed tail');r.qualification_negative=null;
 assert.throws(()=>scoped.createScopedTarget(bad,{plan_id:f.plan_id,...a}),/ambiguous|unknown/);

});

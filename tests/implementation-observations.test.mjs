import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {implementationObservations,reportImplementationTiming,OBSERVATIONS_INPUT_PROTOCOL,OBSERVATIONS_MAX_BYTES} from '../plugins/soloco/runtime/implementation-observations.mjs';
import {implementationObservationsCLI} from '../tools/implementation-observations.mjs';
import {requestModelProcess,recordModelProcessBirth,recordModelProcessClosure} from '../plugins/soloco/runtime/model-process-closure.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const at=n=>new Date(Date.UTC(2026,10,10)+n).toISOString();
function fixture(){
 const candidateHash='c'.repeat(64),receiptHash='d'.repeat(64);
 const jobs={
  gen:{id:'gen',role:'engineer',instance_id:'author-instance',native_id:'author-native',status:'completed',created_at:at(0),started_at:at(2),execution_started_at:at(3),finished_at:at(8),development_id:'plan',artifact_id:'candidate',context_sha256:hash('author-context'),coordination_release:{termination_confirmed:true}},
  tests:{id:'tests',kind:'development_test',role:'engineer',status:'completed',created_at:at(10),started_at:at(11),finished_at:at(20),development_id:'plan',candidate_id:'candidate',artifact_id:'receipt',execution_provenance:{launch_intent:true,launch_intent_at:at(12)}},
  qa:{id:'qa',role:'qa',instance_id:'qa-instance',native_id:'qa-native',status:'completed',created_at:at(22),started_at:at(23),execution_started_at:at(24),finished_at:at(30),review_of:{id:'receipt',revision:1},artifact_id:'review',context_sha256:hash('qa-context'),coordination_release:{termination_confirmed:true}}
 };
 const records={
  plan:{id:'plan',kind:'artifact',status:'Draft',revision:1,created_at:at(0),development:{type:'plan',scope_sha256:'e'.repeat(64),attempts:['gen']}},
  candidate:{id:'candidate',kind:'artifact',status:'Submitted',revision:1,job_id:'gen',author_role:'engineer',author_instance:'author-instance',created_at:at(8),content:'SECRET_PRIVATE_BODY',development:{type:'candidate',plan_id:'plan',candidate_sha256:candidateHash,files:[{path:'private.mjs',content:'SECRET_PRIVATE_BODY'}],run:{job_id:'tests',receipt_id:'receipt'}}},
  receipt:{id:'receipt',kind:'artifact',status:'Submitted',revision:1,author_role:'runtime',author_instance:'tests',created_at:at(20),content:'SECRET_PRIVATE_BODY',development:{type:'test',plan_id:'plan',candidate_id:'candidate',candidate_sha256:candidateHash,receipt_sha256:receiptHash,result:{status:'passed',tests_executed:true,exit_code:0,duration_ms:6,stdout:'SECRET_PRIVATE_BODY'},acceptance:{at:at(35),review_id:'review',candidate_sha256:candidateHash,receipt_sha256:receiptHash,directory:'/private/SECRET_PRIVATE_PATH',source_integrated:false}}},
  review:{id:'review',kind:'review',status:'Submitted',revision:1,job_id:'qa',author_role:'qa',author_instance:'qa-instance',created_at:at(30),content:'SECRET_PRIVATE_BODY',review_of:{id:'receipt',revision:1},review:{verdict:'Pass',permitted_action:'accept_local_development',candidate_sha256:candidateHash,receipt_sha256:receiptHash,blockers:[]}}
 };return {id:'fixture-company',revision:4,owner:{session_id:'owner',host:'codex',epoch:1},jobs,records,selection_usage:{engineer:999}};
}
const options=(s,extra={})=>({origin:{kind:'canonical-read-snapshot',observed_at:at(50),state_sha256:hash(s),collections_complete:true,measurement_kind:'synthetic'},limit:50,...extra});
function all(s,extra={}){const result=[];let cursor;do{const o=options(s,extra);if(cursor)o.cursor=cursor;const page=implementationObservations(s,o);result.push(...page.items);cursor=page.next_cursor;}while(cursor);return result;}
const external=(kind,id,subject_id,value)=>({kind,id,subject_id,value,sha256:hash(value)});

test('automatically derives source-bound job/test/QA/acceptance timing without phase JSON or private bodies',()=>{
 const s=fixture(),before=JSON.stringify(s),r=implementationObservations(s,options(s));
 const items=all(s),gen=items.find(x=>x.kind==='job'&&x.id==='gen'),testJob=items.find(x=>x.kind==='job'&&x.id==='tests'),accept=items.find(x=>x.kind==='acceptance');
 assert.equal(gen.timing.queued_work_ms,2);assert.equal(gen.timing.phases.preparation.work_ms,1);assert.equal(gen.timing.phases.execution.work_ms,5);
 assert.equal(testJob.timing.phases.test.work_ms,8);assert.equal(testJob.test_observation.reported_duration_ms,6);
 assert.equal(accept.timing.phases.acceptance.work_ms,5);assert.equal(accept.recorded_bindings_match,true);assert.equal(accept.independence_conditions_observed,true);
 assert.equal(r.summary.quality.first_pass_recorded_local_acceptance.ratio,1);assert.equal(r.summary.quality.first_pass_recorded_local_acceptance.authenticated_native_quality,false);
 assert.equal(r.summary.quality.founder_interventions.reported_count,null);assert.equal(r.summary.quality.founder_interventions.founder_time_ms,null);assert.equal(r.summary.quality.escaped_defects.reported_after_recorded_acceptance,null);
 assert.equal(JSON.stringify(s),before);assert.doesNotMatch(JSON.stringify(r),/SECRET_PRIVATE/);assert.equal(Object.hasOwn(r.summary,'selection_usage'),false);assert.equal(Object.hasOwn(r.summary.quality,'successful_calls'),false);
 assert.equal(r.clock.monotonic_values_invented,false);assert.equal(r.output.UTF8_bytes,Buffer.byteLength(JSON.stringify(r)));
});

test('canonical shared phase endpoints reuse only identical timestamp/clock/attempt across different phases',()=>{
 const s=fixture(),items=all(s,{include_events:true}),gen=items.find(x=>x.kind==='job'&&x.id==='gen'),input=gen.timing_input;
 const reused=input.events.filter(e=>e.source.field==='/started_at');assert.equal(reused.length,2);assert.notEqual(reused[0].phase,reused[1].phase);assert.deepEqual(reused[0].source,reused[1].source);
 assert.equal(reportImplementationTiming(input).attempts[0].queued_work_ms,2);
 for(const mutate of [v=>v.events.find(e=>e.phase==='preparation'&&e.event==='start').at=at(1),v=>v.events.find(e=>e.phase==='preparation'&&e.event==='start').clock_id='other-clock',v=>{const e=v.events.find(e=>e.phase==='preparation'&&e.event==='start');e.phase='queued';e.span_id='other-queue';}]){
  const changed=structuredClone(input);mutate(changed);assert.throws(()=>reportImplementationTiming(changed),/duplicate or conflicting source observation/);
 }
 for(const e of input.events){const source=s.jobs[e.source.id.slice(4)];assert.equal(e.source.sha256,hash(source));assert.equal(source[e.source.field.slice(1)],e.at);assert.equal(e.monotonic_ms,undefined);}
});

test('missing/reversed timestamps and uncertain terminal workers remain unknown and retain their capacity conditions',()=>{
 const s=fixture();delete s.jobs.gen.started_at;s.jobs.qa.status='failed';delete s.jobs.qa.finished_at;s.jobs.qa.coordination_release={termination_confirmed:false};s.jobs.qa.execution_failure={outcome:'timeout'};s.jobs.qa.rejected_output={text:'SECRET_PRIVATE_BODY',truncated:true};
 const r=implementationObservations(s,options(s)),items=all(s),qa=items.find(x=>x.kind==='job'&&x.id==='qa');
 assert.equal(qa.timing.phases.qa.work_ms,null);assert.equal(qa.reservation.terminal_closure_unconfirmed,true);assert.equal(qa.rejected_output_retained,true);
 assert.equal(r.summary.counts.unconfirmed_terminal_closure,1);assert.equal(r.summary.counts.capacity_hold_conditions,1);assert.equal(r.summary.counts.rejected_job_outputs,1);
 assert.equal(r.summary.quality.first_pass_recorded_local_acceptance.ratio,null);
 s.jobs.gen.finished_at=at(1);const reversed=all(s).find(x=>x.kind==='job'&&x.id==='gen');assert.equal(reversed.timing.phases.execution.work_ms,null);assert.ok(reversed.timestamp_issues.some(x=>x.code==='reversed_recorded_interval'));
});

test('all negative reviews and additional generation reservations survive a later recorded acceptance',()=>{
 const s=fixture();s.jobs.repair={...s.jobs.gen,id:'repair',status:'failed',artifact_id:undefined,coordination_release:{termination_confirmed:false}};s.records.plan.development.attempts.push('repair');
 s.records.old={id:'old',kind:'review',status:'Submitted',revision:1,review_of:{id:'receipt',revision:1},review:{verdict:'Blocked',reason:'SECRET_PRIVATE_BODY'}};
 const r=implementationObservations(s,options(s)),items=all(s);assert.equal(r.summary.counts.reviews.Blocked,1);assert.equal(r.summary.counts.reviews.Pass,1);
 assert.equal(r.summary.quality.additional_generation_reservations_observed,1);assert.equal(r.summary.quality.first_pass_recorded_local_acceptance.ratio,0);assert.equal(r.summary.quality.rework_success_rate,null);
 assert.ok(items.find(x=>x.kind==='review'&&x.id==='old').original_negative_preserved);assert.equal(items.filter(x=>x.kind==='job').length,4);
});

test('missing or reused native identities cannot establish independent quality, and incomplete archives cannot establish rates',()=>{
 for(const mutate of [s=>delete s.jobs.qa.native_id,s=>s.jobs.qa.native_id=s.jobs.gen.native_id,s=>s.jobs.qa.native_id=s.owner.session_id,s=>s.records.review.review.blockers.push('unresolved'),s=>s.records.plan.development.attempts.push('unobserved-attempt'),s=>{s.records.receipt.revision=null;s.records.review.review_of.revision=null;}]){
  const s=fixture();mutate(s);const r=implementationObservations(s,options(s));assert.equal(r.summary.quality.first_pass_recorded_local_acceptance.ratio,null);assert.equal(r.summary.quality.first_pass_recorded_local_acceptance.unknown_subjects,1);
 }
 const s=fixture(),o=options(s);delete o.origin.collections_complete;assert.equal(implementationObservations(s,o).summary.quality.first_pass_recorded_local_acceptance.ratio,null);
});

test('runtime tasks expose planned-to-dispatch observations without treating task acceptance as company acceptance',()=>{
 const s=fixture();s.records.task={id:'task',kind:'plan',revision:2,status:'Async:accepted',created_at:at(0),runtime_task:{state:'accepted',created_at:at(0),definition_revision:1,attempts:[{job_id:'qa'}]}};
 const item=all(s).find(x=>x.kind==='task');assert.equal(item.planned_to_dispatch_wall_ms,22);assert.equal(item.task_acceptance_is_company_development_acceptance,false);assert.equal(item.attempts_recorded,1);
});

test('automatically observed overlap and comparable samples distinguish wall occupancy from accumulated work',()=>{
 const s=fixture();s.jobs.parallel={...s.jobs.gen,id:'parallel'};delete s.jobs.parallel.artifact_id;
 const r=implementationObservations(s,options(s));assert.equal(r.summary.phase_timings.execution.work_ms,10);assert.equal(r.summary.phase_timings.execution.occupied_ms,5);assert.equal(r.summary.phase_timings.execution.overlap_work_ms,5);
 const comparable=r.summary.comparable_timings.groups.find(g=>g.completed_samples===2);assert.ok(comparable);assert.equal(comparable.percentile_method,'nearest-rank');assert.equal(comparable.p50_wall_elapsed_ms,8);
});

test('canonical-shaped direct CLI journals expose recorded intervals while unknown closure stays unknown',()=>{
 const s=fixture(),j=s.jobs.gen;j.worker_pid=123;j.host='codex';
 for(const[id,start,finish]of [['one',3,4],['two',4,8]]){
  const invocation={invocation_id:id,job_id:j.id,instance_id:j.instance_id,worker_pid:j.worker_pid,host:j.host,requested_at:at(start)},birth={protocol:'ordinary-model-process-birth-v1',launch_id:id,host:j.host,pid:456,worker_pid:j.worker_pid,spawned_at:at(start),command_sha256:'a'.repeat(64),argv_sha256:'b'.repeat(64),cwd_sha256:'c'.repeat(64)};
  requestModelProcess(j,invocation);recordModelProcessBirth(j,invocation,birth);recordModelProcessClosure(j,invocation,birth,{protocol:'ordinary-model-process-close-v1',birth_sha256:hash(birth),closed_at:at(finish),exit_code:0,signal:null,observation:'original-child-close'});
 }
 const process=all(s).find(x=>x.kind==='job'&&x.id==='gen').process;assert.equal(process.tracking_shape_valid,true);assert.equal(process.original_cli_wall_timing.work_ms,5);assert.equal(process.original_cli_wall_timing.occupied_ms,5);assert.equal(process.producer_authenticity_established,false);
 j.model_process_tracking.invocations.at(-1).closure=null;const pending=all(s).find(x=>x.kind==='job'&&x.id==='gen').process.original_cli_wall_timing;assert.equal(pending.work_ms,null);assert.equal(pending.unmeasured_invocations,1);
 j.model_process_tracking.invocations.at(-1).job_id='different-job';const mismatched=all(s).find(x=>x.kind==='job'&&x.id==='gen').process;assert.equal(mismatched.tracking_shape_valid,true);assert.equal(mismatched.tracking_job_bindings_match,false);assert.equal(mismatched.original_cli_wall_timing,undefined);
});

test('explicit external integration and quality reports remain operator-reported and never authenticate runtime actions',()=>{
 const s=fixture(),observations=[external('merge','merge','receipt',{started_at:at(40),finished_at:at(49),outcome:'completed',clock_id:'operator-clock'}),external('install','install','receipt',{started_at:at(50),outcome:'running'}),external('escaped_defect','defect','receipt',{at:at(60),defect_id:'bug-1'}),external('founder_intervention','founder','receipt',{at:at(65),intervention_id:'human-1',observed_by:'founder'})];
 const r=implementationObservations(s,options(s,{external:observations})),items=all(s,{external:observations}),merge=items.find(x=>x.id==='merge');
 assert.match(merge.producer_grade,/operator-supplied; unauthenticated/);assert.equal(merge.timing.phases.merge.work_ms,9);
 assert.equal(items.find(x=>x.id==='install').timing.phases.install.work_ms,null);assert.equal(r.summary.quality.escaped_defects.reported_after_recorded_acceptance,1);assert.equal(r.summary.quality.founder_interventions.reported_count,1);assert.equal(r.summary.quality.founder_interventions.founder_time_ms,null);
 const bad=structuredClone(observations);bad[0].value.finished_at=at(80);assert.throws(()=>implementationObservations(s,options(s,{external:bad})),/invalid external/);
});

test('delivery transitions measure recorded handoff latency and preserve held/unobserved external outcomes',()=>{
 const s=fixture();s.records.receipt.development.delivery={protocol:'development-delivery-progress-v1',transitions:[{sequence:1,recorded_at:at(42),from:{stage:'owner'},to:{stage:'integrator'},status:'observed',request:{reported_outcome:'completed'}},{sequence:2,recorded_at:at(45),from:{stage:'integrator'},to:{stage:'installer'},status:'held',request:{reported_outcome:'failed'}}]};
 const handoffs=all(s).filter(x=>x.kind==='handoff');assert.equal(handoffs.length,2);assert.equal(handoffs[0].timing.phases.handoff.work_ms,7);assert.equal(handoffs[1].timing.phases.handoff.work_ms,3);
 assert.equal(handoffs[1].recorded_status,'held');assert.equal(handoffs[0].source_integration_verified,false);assert.equal(handoffs[1].installation_verified,false);assert.match(handoffs[0].producer_grade,/operator-reported/);
});

test('new continuation acceptance homes are observed separately without rewriting old receipts or inventing first-pass quality',()=>{
 const s=fixture(),d=s.records.receipt.development,prior=JSON.stringify(s.records.receipt);
 const acceptance={at:at(40),review_id:'review',candidate_sha256:d.candidate_sha256,receipt_sha256:d.receipt_sha256,source_integrated:false,continuation:{acceptance_id:'continued',target_id:'target',old_unknown_reservation_preserved:true}},report={protocol:'development-acceptance-report-v1',acceptance_kind:'review-continuation',recorded_at:at(40),acceptance};
 s.records.continued={id:'continued',kind:'artifact',author_role:'runtime',author_instance:'owner',revision:1,status:'Submitted',created_at:at(40),development:{type:'review_continuation_acceptance',plan_id:'plan',review:{id:'review',revision:1},candidate_id:'candidate',receipt_id:'receipt',candidate_sha256:d.candidate_sha256,receipt_sha256:d.receipt_sha256,old_scope_unchanged:true,old_unknown_reservation_preserved:true,acceptance_report:report,acceptance_report_sha256:hash(report),delivery:{protocol:'development-delivery-progress-v1',transitions:[{sequence:1,recorded_at:at(45),from:{stage:'owner'},to:{stage:'integrator'},status:'unobserved',request:{reported_outcome:'unknown'}}]}}};
 const r=implementationObservations(s,options(s)),rows=all(s),continued=rows.find(x=>x.kind==='acceptance'&&x.id==='continued'),handoff=rows.find(x=>x.kind==='handoff'&&x.id==='continued:0');
 assert.equal(continued.recorded_bindings_match,true);assert.equal(continued.timing.phases.acceptance.work_ms,10);assert.equal(continued.old_scope_unchanged,true);assert.equal(continued.old_unknown_reservation_preserved,true);assert.match(continued.first_pass_classification,/unclassifiable/);
 assert.equal(handoff.reported_outcome,'unknown');assert.equal(handoff.timing.phases.handoff.work_ms,5);assert.equal(handoff.recorded_status,'unobserved');
 assert.equal(r.summary.quality.first_pass_recorded_local_acceptance.ratio,null);assert.equal(r.summary.quality.first_pass_recorded_local_acceptance.unclassifiable_reasons.prospective_continuation,1);assert.equal(JSON.stringify(s.records.receipt),prior);
});

test('stable paging binds snapshot/options/external, discloses every omission and enforces the UTF8 output budget',()=>{
 const s=fixture();for(let i=0;i<80;i++)s.jobs['j-'+i]={...s.jobs.gen,id:'j-'+i,development_id:'plan'};
 const seen=new Set();let cursor,count=0;do{
  const o=options(s,{limit:50});if(cursor)o.cursor=cursor;const r=implementationObservations(s,o);assert.ok(Buffer.byteLength(JSON.stringify(r))<=OBSERVATIONS_MAX_BYTES);assert.equal(r.output.UTF8_bytes,Buffer.byteLength(JSON.stringify(r)));assert.equal(r.omitted_before+r.returned+r.omitted_after,r.total);
  for(const item of r.items){const key=item.kind+':'+item.id;assert.ok(!seen.has(key));seen.add(key);}cursor=r.next_cursor;if(++count>100)throw Error('pagination did not advance');
 }while(cursor);assert.equal(seen.size,85);
 const first=implementationObservations(s,options(s,{limit:1}));s.revision++;assert.throws(()=>implementationObservations(s,options(s,{limit:1,cursor:first.next_cursor})),/stale/);s.revision--;
 assert.throws(()=>implementationObservations(s,options(s,{limit:2,cursor:first.next_cursor})),/stale/);
 for(const o of [{limit:0},{limit:51},{offset:-1},{offset:99999},{offset:1,cursor:first.next_cursor}])assert.throws(()=>implementationObservations(s,options(s,o)));
});

test('CLI reads only committed frozen regular UTF8 JSON and forces the unauthenticated export grade',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'implementation-observations-')),s=fixture(),file=path.join(dir,'state.json');
 const input={protocol:OBSERVATIONS_INPUT_PROTOCOL,state:s,origin:options(s).origin,options:{limit:1}},body=JSON.stringify(input);
 try{
  fs.writeFileSync(file,body);const r=implementationObservationsCLI([file]);assert.equal(r.exitCode,0);assert.equal(r.report.origin.kind,'frozen-export');assert.equal(r.report.origin.producer_authenticity_established,false);assert.equal(fs.readFileSync(file,'utf8'),body);
  const internal=JSON.parse(body);internal.options.output_bytes=25000;fs.writeFileSync(file,JSON.stringify(internal));assert.match(implementationObservationsCLI([file]).report.message,/internal transport setting/);
  const changed=JSON.parse(body);changed.state.jobs.gen.status='failed';fs.writeFileSync(file,JSON.stringify(changed));assert.equal(implementationObservationsCLI([file]).exitCode,2);
  fs.writeFileSync(file,'{"protocol":"one","protocol":"two"}');assert.match(implementationObservationsCLI([file]).report.message,/Duplicate decoded JSON key/);
  const invalid=Buffer.from(body);invalid[invalid.indexOf(Buffer.from('fixture-company'))]=255;fs.writeFileSync(file,invalid);assert.match(implementationObservationsCLI([file]).report.message,/valid UTF-8/);
  fs.writeFileSync(file,body);fs.symlinkSync(file,path.join(dir,'symlink'));assert.equal(implementationObservationsCLI([path.join(dir,'symlink')]).exitCode,2);
  if(process.platform!=='win32'){
   const fifo=path.join(dir,'fifo');assert.equal(spawnSync('mkfifo',[fifo],{timeout:2000}).status,0);
   const child=spawnSync(process.execPath,['tools/implementation-observations.mjs',fifo],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:2000});assert.equal(child.error,undefined);assert.equal(child.status,2);assert.equal(JSON.parse(child.stdout).status,'held');
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('internal transport budget is cursor-bound and complete MCP envelope includes quote-heavy notice bytes',async()=>{
 const {progressObservations}=await import('../plugins/soloco/runtime/progress-observations.mjs'),{fits}=await import('../plugins/soloco/runtime/public-response.mjs');
 const s=fixture();for(let i=0;i<50;i++){s.jobs['extra-'+i]={...s.jobs.gen,id:'extra-'+i};delete s.jobs['extra-'+i].artifact_id;}
 const q='"\\'.repeat(100);s.notices=[{id:'notice',kind:'must_know',summary:q.repeat(4),reference:q,author_role:q,author_instance:q,instance_id:q,native_id:q,host:q,status:q,created_at:at(30),resolution:null}];
 const r=progressObservations(s,{recent_jobs:50});assert.ok(r.next_cursor);assert.equal(r.output.UTF8_bytes,Buffer.byteLength(JSON.stringify(r)));assert.equal(r.output.maximum_UTF8_bytes,25000);assert.ok(r.output.UTF8_bytes<=25000);assert.equal(fits(r),true);assert.equal(r.attention.total,1);
 const next=progressObservations(s,{recent_jobs:50,cursor:r.next_cursor});assert.equal(next.offset,r.returned);assert.equal(next.output.UTF8_bytes,Buffer.byteLength(JSON.stringify(next)));
 const page=implementationObservations(s,options(s,{output_bytes:19000,limit:1}));assert.throws(()=>implementationObservations(s,options(s,{cursor:page.next_cursor,output_bytes:18000,limit:1})),/stale/);
 for(const n of [7999,25001,NaN])assert.throws(()=>implementationObservations(s,options(s,{output_bytes:n})),/internal output budget/);
});

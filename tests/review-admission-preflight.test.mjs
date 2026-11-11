// Actual public dispatch/Store admission and source guards; fictional retained
// candidate/receipt/native observations. Launch/readiness alone are tiny doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {pathToFileURL} from 'node:url';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {Store,withStore,PACKAGE} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {resolveRetentionRepair,retentionRepairSessionKey,retentionRepairPrimarySnapshotData} from '../plugins/soloco/runtime/development-retention-repair.mjs';
import {buildRetentionRepairInitialPrompt} from '../plugins/soloco/runtime/retention-primary-transport.mjs';
import {retentionReviewAdmissionPreflight,measureRetentionReviewGeometry} from '../plugins/soloco/runtime/review-preflight.mjs';
import {fixture,read,change,hash,authorized} from './development-retention-fixture.mjs';

const reason='Controlled complete geometry admission check; no live-company authority.';
function setup(t,{mode}={}){
  const registry=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-admission-bindings-')),prior=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=registry;
  t.after(()=>{if(prior===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=prior;fs.rmSync(registry,{recursive:true,force:true});});
  const a=fixture();t.after(a.cleanup);
  if(mode==='initial-overflow'){
    fs.writeFileSync(path.join(a.root,'.company','development.json'),JSON.stringify({max_bytes_ceiling:200000}));
    change(a,s=>{s.records['mandatory-control'].content='whole required governing input '+'x'.repeat(1100000);const p=s.records.plan;p.development.scope.max_bytes=200000;p.development.scope_sha256=hash(p.development.scope);s.records.candidate.development.scope_sha256=p.development.scope_sha256;});
  }
  if(mode==='final-overflow')change(a,s=>{s.jobs[a.prior_job_id].whole_unclassified_runtime_evidence='whole mandatory prior job evidence '+'x'.repeat(1100000);});
  if(mode==='read-overflow')change(a,s=>{const r=s.records.contract;r.content='x'.repeat(60*32768+1-JSON.stringify({...r,content:''}).length);});
  const ticket=authorized(a);engine.bind(a.root,a.session_id,'codex');
  const args={...a,role:'qa',task:'Read complete history, then the exact primary candidate/receipt and old Blocked review. Judge independently.',review_of:a.receipt_id,retention_repair_id:ticket.id,input_ids:['plan','candidate','receipt','mandatory-control'],evidence_ids:['contract'],timeout_ms:600000,timeout_reason:reason,code_review_window_minutes:30,code_review_reason:reason};
  let launches=0,launchedJob=null;
  const boundary={check:()=>({available:true,authenticated:true,version:'controlled-offline'}),launch:(root,id)=>{assert.equal(root,a.root);launches++;launchedJob=read(a).jobs[id];return new EventEmitter();}};
  const invoke=()=>engine.dispatch(args,'codex',{...boundary,launch:(...v)=>{const child=boundary.launch(...v);child.unref=()=>{};return child;}});
  return {a,ticket,args,boundary,invoke,launches:()=>launches,launchedJob:()=>launchedJob};
}
function token(a){return withStore(a.root,db=>db.changeToken());}
function noSpend(f,before,eventToken){assert.deepEqual(read(f.a),before);assert.equal(token(f.a),eventToken);assert.equal(f.launches(),0);assert.equal(Object.values(before.jobs).filter(j=>j.retention_repair_id===f.ticket.id).length,0);}
function prospective(f){const s=read(f.a),j={id:'controlled-prospective-admission',role:'qa',instance_id:'controlled-independent-instance',native_id:null,host:'codex',epoch:s.owner.epoch,status:'queued',retention_repair_id:f.ticket.id,session_key:retentionRepairSessionKey(f.ticket),review_of:{id:f.a.receipt_id,revision:1},code_review_window_minutes:30,timeout_ms:600000,context_format:3,task:f.args.task,inputs:f.args.input_ids.map(id=>({id,revision:s.records[id].revision})),supplemental_sources:[{id:'contract',revision:1,sha256:hash(s.records.contract),total_characters:JSON.stringify(s.records.contract).length}]};const c=assignmentContext(s,j);j.inputs=c.inputs;j.context_sha256=c.hash;return {s,j,c,validateCurrent:()=>{resolveRetentionRepair(s,j,{root:f.a.root,reserve:true});}};}

for(const mode of ['initial-overflow','final-overflow','read-overflow'])test('actual dispatch holds '+mode+' before job/session/ticket/launch changes',t=>{
  const f=setup(t,{mode}),before=read(f.a),events=token(f.a);let error;try{f.invoke();}catch(value){error=value;}
  assert.equal(error?.code,'REVIEW_PREFLIGHT_HELD',error?.stack);assert.equal(error.preflight.protocol,'retention-review-admission-preflight-v1');assert.equal(error.preflight.status,'held');assert.equal(error.preflight.execution_authorized,false);assert.equal(error.preflight.dispatch_eligibility,'not_assessed');assert(Buffer.byteLength(JSON.stringify(error.preflight),'utf8')<=8192);assert.equal(error.preflight_reference.sha256,error.preflight.report_sha256);
  const codes=error.preflight.hold_reasons.map(r=>r.code);assert(codes.includes(mode==='initial-overflow'?'initial_frame_rejected':mode==='final-overflow'?'final_frame_overflow':'history_rounds_exceeded'),JSON.stringify(error.preflight));noSpend(f,before,events);
});
test('fitting actual dispatch reaches the existing worker boundary with its canonical job/context unchanged',t=>{
  const f=setup(t),before=read(f.a),q=f.invoke(),after=read(f.a),job=after.jobs[q.id];assert.equal(f.launches(),1);assert.deepEqual(f.launchedJob(),job);assert.equal(job.retention_repair_id,f.ticket.id);assert.equal(job.status,'queued');assert.equal(job.context_format,3);assert.equal(job.timeout_ms,600000);assert.equal(job.code_review_window_minutes,30);assert.equal(Object.hasOwn(job,'review_preflight'),false);
  const context=assignmentContext(after,job),snapshot=retentionRepairPrimarySnapshotData(after,job),geometry=measureRetentionReviewGeometry({state:after,job,context,snapshot});assert.equal(context.hash,job.context_sha256);assert.equal(geometry.hold_reasons.length,0);assert.equal(geometry.frames.initial.sha256,buildRetentionRepairInitialPrompt(after,job,context,snapshot).sha256);assert.equal(Object.keys(after.jobs).length,Object.keys(before.jobs).length+1);
});
test('pure geometry cache hits only exact complete inputs while actual source/current guards still run',t=>{
  const f=setup(t),p=prospective(f);let checks=0;const validateCurrent=()=>{checks++;p.validateCurrent();};
  const first=retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent}),second=retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent});assert.equal(first.report.cache.hit,false);assert.equal(second.report.cache.hit,true);assert.equal(checks,4);
  assert.equal(first.commit.input_sha256,second.commit.input_sha256);assert.equal(first.report.execution_authorized,false);
  fs.appendFileSync(path.join(f.a.root,'helper.mjs'),'// Actual original changed after cached measurement\n');assert.throws(()=>retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent}),/held before any attempt/);assert(checks>=5);assert.equal(Object.values(read(f.a).jobs).some(j=>j.retention_repair_id===f.ticket.id),false);
});
test('admission uses the original Store-associated view without whole-state JSON normalization',t=>{
  const f=setup(t),p=prospective(f);Object.defineProperty(p.s,'toJSON',{enumerable:false,value(){throw Error('Store-associated state must not be normalized through JSON');}});
  const result=retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent:p.validateCurrent});assert.equal(result.report.status,'measured');assert.equal(Object.hasOwn(p.s,'toJSON'),true);
});
test('loaded-versus-disk package changes hold with reload guidance, without changing real package files',async t=>{
  const f=setup(t),p=prospective(f),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-copied-package-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const cloned=path.join(root,'soloco');fs.cpSync(PACKAGE,cloned,{recursive:true});
  const module=await import(pathToFileURL(path.join(cloned,'runtime','review-preflight.mjs')).href);assert.equal(module.retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent:p.validateCurrent}).report.status,'measured');
  fs.writeFileSync(path.join(cloned,'changed-package-policy.txt'),'An immutable package asset changed after load.');
  assert.throws(()=>module.retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent:p.validateCurrent}),error=>error.code==='REVIEW_PREFLIGHT_HELD'&&error.preflight.hold_reasons.some(r=>r.message.includes('reload the runtime')));assert.equal(Object.values(read(f.a).jobs).some(j=>j.retention_repair_id===f.ticket.id),false);
});
for(const mutation of ['expired','revoked','unknown','paused','owner'])test('actual canonical '+mutation+' hold remains unchanged despite a warm geometry cache',t=>{
  const f=setup(t),p=prospective(f);retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent:p.validateCurrent});assert.equal(retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent:p.validateCurrent}).report.cache.hit,true);
  const now=Date.now;
  if(mutation==='expired')Date.now=()=>Date.parse(p.s.records.plan.development.scope.expires_at)+1;
  else change(f.a,s=>{if(mutation==='revoked')s.records.plan.development.revoked=true;if(mutation==='unknown'){s.jobs[f.a.prior_job_id].model_process_tracking.invocations[0].closure=null;s.jobs[f.a.prior_job_id].coordination_release.termination_confirmed=false;}if(mutation==='paused')s.paused=true;if(mutation==='owner')s.owner.epoch++;});
  const before=read(f.a),events=token(f.a);try{assert.throws(f.invoke);noSpend(f,before,events);}finally{Date.now=now;}
});
test('actual uncertain capacity remains a SchedulingHold; cached geometry supplies no capacity',t=>{
  const f=setup(t),p=prospective(f);retentionReviewAdmissionPreflight(p.s,p.j,p.c,{validateCurrent:p.validateCurrent});
  change(f.a,s=>{for(let i=0;i<3;i++)s.jobs['uncertain-'+i]={id:'uncertain-'+i,role:'research',instance_id:'held-'+i,status:'failed',started_at:new Date().toISOString()};});const before=read(f.a),events=token(f.a);
  assert.throws(f.invoke,error=>error.name==='SchedulingHold'&&error.code==='EXECUTION_UNCERTAIN');noSpend(f,before,events);
});
for(const mutation of ['job','context','remaining-window'])test('new geometry commit guard rolls back late '+mutation+' changes',t=>{
  const f=setup(t),before=read(f.a),events=token(f.a),original=Store.prototype.transaction,now=Date.now;let clock=now(),crossed=false;Date.now=()=>clock;
  Store.prototype.transaction=function(kind,fn,options={}){return original.call(this,kind,fn,{...options,afterWrite(db,s){options.afterWrite?.(db,s);if(kind!=='job.queued')return;crossed=true;const j=Object.values(s.jobs).find(j=>j.retention_repair_id===f.ticket.id);if(mutation==='job')j.task+=' late mutation';if(mutation==='context')s.notices.push({id:'late-current',kind:'must_know',summary:'A material governing fact arrived.',reference:'contract'});if(mutation==='remaining-window')clock=Date.parse(s.records.plan.development.scope.expires_at)-1800000+1;}});};
  try{assert.throws(f.invoke,error=>error.code==='REVIEW_PREFLIGHT_HELD');assert.equal(crossed,true);noSpend(f,before,events);}finally{Store.prototype.transaction=original;Date.now=now;}
});
test('ordinary dispatch has no retention preflight and preserves the existing contract-free path',t=>{
  const f=setup(t),args={root:f.a.root,session_id:f.a.session_id,epoch:f.a.epoch,role:'research',task:'A bounded ordinary task',input_ids:['contract']};let launches=0;
  const q=engine.dispatch(args,'codex',{check:f.boundary.check,launch:()=>{launches++;return {on(){},unref(){}};}});assert.equal(launches,1);assert.equal(q.role,'research');assert.equal(q.retention_repair_id,undefined);assert.equal(q.output_contract,undefined);
});

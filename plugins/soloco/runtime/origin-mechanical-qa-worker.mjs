// Fixed SOURCE worker for the ACTUAL original pre-quarantine plan target.
// No generic provider, model-selected effect, exclusion mask or authority flag.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareOriginalWorkerLaunchFrom,cleanupOriginalWorkerLaunchFailure} from './peers/prospective-local-worker-inventory-producer.mjs';
import {withStore,stamp,id,noLink,compatibleRuntime,upgradePending} from './store.mjs';
import {runModel} from './adapters.mjs';
import {executionTiming,jobTimeoutState} from './timeout.mjs';
import {requestModelProcess,recordModelProcessBirth,recordModelProcessClosure,reconcileStoredModelProcessClosure,validModelProcessTracking} from './model-process-closure.mjs';
import * as qa from './peers/origin-mechanical-qa-policy.mjs';
import {qaNeed as need,qaData as data,qaCopy as copy,qaSame as same,qaText as text,qaRawHash as hash} from './peers/origin-mechanical-qa-contract.mjs';
import {peerDigest} from './peers/ledger.mjs';

export {ORIGIN_MECHANICAL_REVIEW_INSTRUCTION} from './peers/origin-mechanical-qa-wire-contract.mjs';
import {ORIGIN_MECHANICAL_QA_RAW_CONTEXT,ORIGIN_MECHANICAL_QA_WIRE,assertOriginMechanicalQaPromptFits} from './peers/origin-mechanical-qa-wire-contract.mjs';
export function isOriginMechanicalQaTarget(state,job){return Boolean(job&&state.records?.[job.review_of?.id]?.origin_quarantine_plan);}
export function isOriginMechanicalQaWorker(state,job){
 // These extra hints can ONLY route to stricter original validation, never
 // authorize it. Actual target detection remains mandatory inside the writer.
 return isOriginMechanicalQaTarget(state,job)||Boolean(job&&Object.values(state.records??{}).some(r=>r?.origin_mechanical_qa?.protocol==='peer-origin-mechanical-qa-admission-v1'&&r.origin_mechanical_qa.job_id===job.id));
}
function clock(deadline){need(Number.isSafeInteger(deadline)&&Date.now()<deadline,'ORIGIN_MECHANICAL_QA_EXPIRED');}
function aliases(state){return new Set([state.owner?.session_id,...Object.values(state.jobs??{}).map(j=>j.native_id),...Object.values(state.sessions??{}).map(s=>s.native_id),...(state.retired_sessions??[]).map(s=>s.native_id)].filter(Boolean));}
function parseReview(raw,plan){
 need(typeof raw==='string'&&Buffer.from(raw).toString('utf8')===raw&&Buffer.byteLength(raw)<=100000,'ORIGIN_MECHANICAL_QA_OUTPUT_CAPACITY');
 let outer,inner;try{outer=JSON.parse(raw);}catch{need(false,'ORIGIN_MECHANICAL_QA_OUTPUT_JSON');}
 const out=data(outer,['content','messages','notices','review']),review=data(out.review,['verdict','reason','blockers']);
 need(text(out.content,50000)&&Array.isArray(out.messages)&&out.messages.length===0&&Array.isArray(out.notices)&&out.notices.length===0&&['Pass','Fail','Blocked'].includes(review.verdict)&&text(review.reason,8000)&&Array.isArray(review.blockers)&&review.blockers.length<=64&&review.blockers.every(x=>text(x,1000))&&(review.verdict==='Pass'?review.blockers.length===0:review.blockers.length>0),'ORIGIN_MECHANICAL_QA_OUTPUT');
 try{inner=JSON.parse(out.content);}catch{need(false,'ORIGIN_MECHANICAL_QA_OUTPUT_JSON');}
 const expected={protocol:'peer-origin-mechanical-review-v1',permitted_action:'quarantine_peer_origin',plan_sha256:peerDigest(plan),cut_sha256:plan.cut_sha256,maintenance_role:'reviewer',legacy_authority:'retired-without-conversion',execution_resumed:false};
 need(same(data(inner,Object.keys(expected)),expected),'ORIGIN_MECHANICAL_QA_EXACT_REVIEW_REQUIRED');return copy(out);
}

export async function workPeerOriginMechanicalQa(root,jobId,model=runModel){
 let original,context,job,plan,claimed=false,invoked=false,output,birth=null,closure=null,invocation,monitor,controller=new AbortController(),callTiming;
 let excluded;
 const source=(store,state,{running=true,pending=false,terminal=false}={})=>{
  const current=state.jobs?.[jobId];need(isOriginMechanicalQaTarget(state,current),'ORIGIN_MECHANICAL_QA_ACTUAL_PLAN_REQUIRED');
  const proof=qa.assertPeerOriginMechanicalQaJobFrom(store.db,state,jobId),read=qa.prepareOriginalPeerOriginMechanicalQaContextFrom(store.db,state,{job_id:jobId});
  need(compatibleRuntime(state)&&!upgradePending(state)&&current.role==='qa'&&same(read.admission_ref,proof.admission_ref)&&read.sha256===current.context_sha256&&read.original_context===true,'ORIGIN_MECHANICAL_QA_JOB_CHANGED');
  if(original)need(same(proof.admission_ref,original.admission_ref)&&same(proof.packet_ref,original.packet_ref)&&same(proof.plan_ref,original.plan_ref)&&proof.context_sha256===original.context_sha256&&proof.deadline_at_ms===original.deadline_at_ms&&same(proof.limits,original.limits)&&current.instance_id===job.instance_id,'ORIGIN_MECHANICAL_QA_ADMISSION_CHANGED');
  if(context)need(read.text===context.text&&read.sha256===context.sha256,'ORIGIN_MECHANICAL_QA_CONTEXT_CHANGED');
  if(running)need(current.status===(terminal?'completed':'running')&&current.worker_pid===process.pid,'ORIGIN_MECHANICAL_QA_WORKER_CHANGED');
  if(pending){const entry=current.model_process_tracking?.invocations.at(-1);need(validModelProcessTracking(current.model_process_tracking)&&same({...entry,birth:null,closure:null},{...invocation,birth:null,closure:null})&&current.model_process_tracking.current===invocation.invocation_id&&proof.used_native_calls===original.used_native_calls+1,'ORIGIN_MECHANICAL_QA_ORIGINAL_INVOCATION_REQUIRED');}
  return {current,proof,read};
 };
 const inspect=options=>{const result=withStore(root,store=>store.readSnapshot(()=>source(store,store.read(),options)));clock(Math.min(result.proof.deadline_at_ms,result.current.execution_deadline_at?Date.parse(result.current.execution_deadline_at):Infinity));return result;};
 const positiveCommit=(store,next,terminal=false)=>{const r=source(store,next,{terminal});need(same(store.read(),next),'ORIGIN_MECHANICAL_QA_CURRENT_CHANGED');clock(Math.min(r.proof.deadline_at_ms,Date.parse(r.current.execution_deadline_at??new Date(r.proof.deadline_at_ms).toISOString())));};
 const positiveWrite=(type,fn)=>withStore(root,store=>store.transaction(type,s=>{const current=source(store,s);fn(s,current,store);return s;},{beforeCommit:(_db,next)=>positiveCommit(store,next,type==='job.completed')}));
 const check=()=>{if(controller.signal.aborted)return;try{inspect();}catch(error){controller.abort(error);}};
 const owned=(state)=>{const current=state.jobs?.[jobId];need(original&&current&&current.instance_id===job.instance_id&&current.worker_pid===process.pid&&same(state.records?.[original.admission_ref.id]&&{id:original.admission_ref.id,revision:state.records[original.admission_ref.id].revision,sha256:hash(JSON.stringify(state.records[original.admission_ref.id]))},original.admission_ref),'ORIGIN_MECHANICAL_QA_ORIGINAL_WORKER_REQUIRED');return current;};
 try{
  withStore(root,store=>store.transaction('job.started',state=>{
   const initial=source(store,state,{running:false}),current=initial.current,session=state.sessions?.[current.session_key];need(current.status==='queued'&&!current.native_id&&session?.instance_id===current.instance_id&&session.native_id===null&&jobTimeoutState(current,Date.now()).state==='waiting','ORIGIN_MECHANICAL_QA_FRESH_JOB_REQUIRED');
   job=copy(current);original=copy(initial.proof);context=copy(initial.read);plan=copy(state.records[current.review_of.id].origin_quarantine_plan);excluded=aliases(state);
   current.status='running';current.started_at=stamp();current.worker_pid=process.pid;return state;
  },{beforeCommit:(_db,next)=>positiveCommit(store,next)}));claimed=true;
  need(['peer-origin-mechanical-qa-context-readback-v1','peer-origin-mechanical-qa-context-readback-v2'].includes(context.protocol),'ORIGIN_MECHANICAL_QA_CONTEXT_PROTOCOL');
  const protocol=context.protocol==='peer-origin-mechanical-qa-context-readback-v1'?ORIGIN_MECHANICAL_QA_RAW_CONTEXT:ORIGIN_MECHANICAL_QA_WIRE;
  if(protocol===ORIGIN_MECHANICAL_QA_WIRE)need(context.context_protocol===protocol,'ORIGIN_MECHANICAL_QA_CONTEXT_PROTOCOL');
  const prompt=assertOriginMechanicalQaPromptFits(job.task,context.text,protocol,original.limits.max_context_utf8_bytes);
  const dataRoot=process.env.COMPANY_PLUGIN_DATA||process.env.PLUGIN_DATA||process.env.CLAUDE_PLUGIN_DATA||path.join(os.homedir(),'.cache','soloco'),directory=path.join(dataRoot,'sessions',job.instance_id);noLink(directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  monitor=setInterval(check,100);check();if(controller.signal.aborted)throw controller.signal.reason;
  // Count the original request BEFORE the adapter. No caller flags, provider
  // usage/token estimates, retry loop or second allowance can substitute.
  invocation={invocation_id:id('model-invocation'),job_id:jobId,instance_id:job.instance_id,worker_pid:process.pid,host:job.host,requested_at:stamp()};
  positiveWrite('job.model_process.requested',(state,{current},store)=>{const p=qa.assertPeerOriginMechanicalQaNextInvocationFrom(store.db,state,jobId);need(Date.now()+p.limits.timeout_ms<p.deadline_at_ms,'ORIGIN_MECHANICAL_QA_COMPLETE_TIMEOUT_WINDOW_REQUIRED');requestModelProcess(current,invocation);});
  // The concrete Store argument is supplied only by this fixed source closure.
  let callDeadline=original.deadline_at_ms;
  const gate=()=>{if(controller.signal.aborted)throw controller.signal.reason;const r=inspect({pending:true});clock(Math.min(r.proof.deadline_at_ms,callDeadline));return r;};
  const before=gate(),remaining=before.proof.limits.timeout_ms;need(Date.now()+remaining<callDeadline,'ORIGIN_MECHANICAL_QA_COMPLETE_TIMEOUT_WINDOW_REQUIRED');
  invoked=true;
  output=await withStore(root,store=>{
   let launch;store.transaction('job.model_process.launch_requested',state=>{source(store,state,{pending:true});launch=prepareOriginalWorkerLaunchFrom(store,state,{job_id:jobId,kind:'model',invocation_id:invocation.invocation_id});return state;},{beforeCommit:(_db,next)=>positiveCommit(store,next)});
   return model(job.host,null,prompt,directory,remaining,job.model_selection,{
   originalExecutionLaunch:launch,
   signal:controller.signal,timeoutReason:job.timeout_reason,maxOutputCharacters:100000,executionDeadlineAt:callDeadline,
   // runModel's public onSpawn occurs AFTER spawn. Its existing private spawn
   // seam places the fixed original admission check AFTER executable/provider
   // resolution and BEFORE the actual child is created. No caller chooses it.
   beforeOriginalSpawn:()=>{gate();need(Date.now()+remaining<callDeadline,'ORIGIN_MECHANICAL_QA_COMPLETE_TIMEOUT_WINDOW_REQUIRED');},
   onModelProcess:value=>{need(!birth,'ORIGIN_MECHANICAL_QA_BIRTH_CHANGED');withStore(root,store=>store.transaction('job.model_process.born',s=>{recordModelProcessBirth(owned(s),invocation,value);return s;}));birth=copy(value);},
   onModelClosure:(value,receipt)=>{need(birth&&same(value,birth)&&!closure,'ORIGIN_MECHANICAL_QA_CLOSURE_CHANGED');withStore(root,store=>store.transaction('job.model_process.closed',s=>{recordModelProcessClosure(owned(s),invocation,value,receipt);return s;}));closure=copy(receipt);
    // Original child close may arrive AFTER rejection/timeout. Receipt first,
    // then the unchanged canonical request/birth/close reconciler for ONLY
    // this new original job. This is observation, never positive permission.
    withStore(root,store=>{const current=store.read().jobs[jobId];if(!['failed','cancelled','interrupted'].includes(current?.status))return;store.transaction('job.process_closure_reconciled',s=>{reconcileStoredModelProcessClosure(store,owned(s));return s;});});
   },
   onSpawn:timing=>{need(!callTiming&&birth,'ORIGIN_MECHANICAL_QA_TIMING_CHANGED');const start=Date.parse(timing?.execution_started_at),recorded=executionTiming(start,{timeout_ms:remaining,timeout_reason:job.timeout_reason});need(start>=Date.parse(invocation.requested_at)&&start<=Date.now()&&same(timing,recorded),'ORIGIN_MECHANICAL_QA_TIMING_CHANGED');positiveWrite('job.execution_started',(_s,{current})=>{need(!current.execution_started_at,'ORIGIN_MECHANICAL_QA_TIMING_CHANGED');current.execution_started_at=timing.execution_started_at;current.execution_deadline_at=timing.execution_deadline_at;current.termination_deadline_at=timing.termination_deadline_at;});callTiming=copy(timing);}
  });});
  check();if(controller.signal.aborted)throw controller.signal.reason;inspect({pending:true});
  need(birth&&closure&&closure.exit_code===0&&closure.signal===null&&callTiming&&Date.now()<Date.parse(callTiming.execution_deadline_at)&&text(output?.native_id,300)&&!excluded.has(output.native_id),'ORIGIN_MECHANICAL_QA_ORIGINAL_CLOSURE_REQUIRED');
  const artifact=parseReview(output.text,plan),artifactId=id('artifact');
  positiveWrite('job.completed',(state,{current})=>{
   need(validModelProcessTracking(current.model_process_tracking)&&current.model_process_tracking.invocations.every(x=>x.birth&&x.closure&&x.closure.exit_code===0&&x.closure.signal===null),'ORIGIN_MECHANICAL_QA_ORIGINAL_CLOSURE_REQUIRED');
   need(!aliases(state).has(output.native_id)&&state.sessions[job.session_key]?.native_id===null,'ORIGIN_MECHANICAL_QA_NATIVE_INDEPENDENCE');
   state.records[artifactId]={id:artifactId,kind:'review',content:artifact.content,author_role:'qa',author_instance:job.instance_id,revision:1,status:'Submitted',job_id:jobId,inputs:copy(job.inputs),review_of:copy(job.review_of),review:artifact.review,raw_response:output.text,response_sha256:hash(output.text),context_sha256:context.sha256,created_at:stamp()};
   current.status='completed';current.artifact_id=artifactId;current.finished_at=stamp();current.native_id=output.native_id;current.model_evidence=copy(output.model_evidence??{reported_models:[],reported_effort:null,verification:'unverified',source:'not_reported',scope:'unknown'});current.coordination_release={termination_confirmed:true,reason:'model_process_closed',at:stamp()};state.sessions[job.session_key].native_id=output.native_id;
  });
  return {job_id:jobId,review_id:artifactId,verdict:artifact.review.verdict,execution_authority:false};
 }catch(error){
  const escaped=cleanupOriginalWorkerLaunchFailure(error);
  // No admission/claim means NO writes at all. Otherwise retain only this
  // original worker's negative evidence, even after expiry/owner loss. No new
  // purpose, global release, retry, reviewer acceptance or old unit mutation.
  try{if(claimed)withStore(root,store=>store.transaction('job.failed',state=>{const current=owned(state),rejected=output??error.rejected_output;current.status='failed';current.finished_at=stamp();current.error=String(error.message??error).slice(0,1000);current.execution_failure={code:typeof error.code==='string'?error.code:'ORIGIN_MECHANICAL_QA_WORKER_FAILED',message:current.error,outcome:'failure',at:stamp()};current.coordination_release={termination_confirmed:!invoked||Boolean(birth&&closure),reason:!invoked?'model_not_invoked':birth&&closure?'model_process_closed':'original_process_closure_unknown',at:stamp()};if(rejected&&typeof rejected.text==='string')current.rejected_output={text:rejected.text,context_sha256:context.sha256,accepted:false,...(typeof rejected.native_id==='string'?{native_id:rejected.native_id}:{})};return state;}));}catch(failure){if(!escaped)throw failure;}throw error;
 }finally{if(monitor!==undefined)clearInterval(monitor);}
}

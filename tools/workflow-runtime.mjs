// Evaluation-only software driver. The real dispatch, worker, sandbox-test and
// acceptance functions retain their production authority and evidence checks.
import fs from 'node:fs';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
export const read=root=>withStore(root,db=>db.read());
export const errorEvidence=e=>({message:String(e.message).slice(0,2000),code:e.code??null,termination_confirmed:e.termination_confirmed??null});
export async function waitTest(root,jid,limit=20000){const until=Date.now()+limit;while(Date.now()<until){const s=read(root),j=s.jobs[jid];if(!j)throw Error('Test job is missing');if(!['queued','running'].includes(j.status))return {job:j,receipt:s.records[j.artifact_id]};await new Promise(r=>setTimeout(r,20));}throw Object.assign(Error('Runtime test outcome uncertain; retained without retry'),{code:'TEST_OUTCOME_UNCERTAIN'});}
export function createWorkflow({args,report,started=performance.now(),native=false,model,sharedBudget={calls:0},maxCalls=8,runtimeReady,runtimeCatalog,checkpoint=()=>{},selections,taskByRole,timeoutMs=180000,worker=work}){
 if(native&&(!runtimeReady?.available||!runtimeCatalog?.supported))throw Error('Native workflow requires inspected runtime readiness and model catalog');
 if(!native&&typeof model!=='function')throw Error('Contract-double workflow requires an explicit synthetic model');
 report.events??=[];report.calls??=[];
 const now=()=>performance.now()-started;
 const event=(type,extra={})=>{const value={type,at_ms:now(),...extra};report.events.push(value);return value;};
 const dispatch=async(role,extra={})=>{
  const before=performance.now();
  const job=engine.dispatch({...args,role,task:typeof taskByRole==='function'?taskByRole(role):taskByRole[role],task_summary:'Fictional accepted-workflow evaluation '+role,model_selection:selections[role],timeout_ms:timeoutMs,timeout_reason:'Bounded fictional accepted-workflow evaluation.',...extra},'codex',{launch:()=>({on(){},unref(){}}),check:()=>runtimeReady??{available:true,authenticated:true,version:'contract-double'},catalog:()=>runtimeCatalog??{supported:true,source:'synthetic_contract_double',models:[{id:'gpt-6.1-sol',supported_efforts:['low','medium','high']}],speed_support:{host_default:true}}});
  event('dispatch',{role,job_id:job.id,control_ms:performance.now()-before});
  // An explicit Source fixture may wrap the unchanged worker with Original
  // process observations. Ordinary/native callers retain the original default.
  await worker(args.root,job.id,async(...params)=>{
   if(sharedBudget.calls>=maxCalls)throw Object.assign(Error('Fixed evaluation call budget exhausted'),{termination_confirmed:true});
   sharedBudget.calls++;
   const call={role,job_id:job.id,prompt_bytes:Buffer.byteLength(params[2]),prompt_sha256:digest(params[2]),started_ms:now(),requested:params[5]};report.calls.push(call);checkpoint();
   const callStarted=performance.now();
   try {const state=read(args.root),current=state.jobs[job.id],out=await (native?runModel(...params):model({job:current,target:state.records[current.review_of?.id]},...params));call.native_id=out.native_id;call.output_bytes=Buffer.byteLength(out.text);call.output_sha256=digest(out.text);call.model_evidence=out.model_evidence;return out;}
   catch(e){call.error=errorEvidence(e);throw e;}finally{call.duration_ms=performance.now()-callStarted;checkpoint();}
  });
  const state=read(args.root),finished=state.jobs[job.id];
  if(finished.status!=='completed'||!finished.artifact_id)throw Object.assign(Error('Production worker did not complete: '+JSON.stringify({status:finished.status,error:finished.error})),{code:'WORKER_NOT_COMPLETED'});
  const artifact=state.records[finished.artifact_id];event('returned',{role,job_id:job.id,artifact_id:artifact.id});checkpoint();return {job:finished,artifact};
 };
 return {dispatch,event,read:()=>read(args.root)};
}
export function publicReport(report){return JSON.parse(JSON.stringify(report,(key,value)=>key==='root'||key==='directory'?undefined:key==='native_id'||key==='author_native_id'?value?digest(value):null:value));}

// Thin SOURCE loader only. Root's shared fixture owns the original selected
// decision/plan/packet/grant producers and the explicitly SYNTHETIC inventory.
// This does not fabricate that lineage or replace any backend guard.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
const runtime=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url)),url=p=>pathToFileURL(p).href;
const rawHash=value=>createHash('sha256').update(value).digest('hex');
export async function loadMechanicalQueueWorkerSource(t,policyModuleUrl){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-SYNTHETIC-mechanical-worker-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 const files=['engine.mjs','worker.mjs','origin-mechanical-qa-worker.mjs'],overrides=new Map(files.map(p=>[path.join(runtime,p),url(path.join(temporary,p))]));overrides.set(path.join(runtime,'peers/origin-mechanical-qa-policy.mjs'),String(policyModuleUrl));
 for(const p of files){const original=path.join(runtime,p),source=fs.readFileSync(original,'utf8').replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_all,_quote,relative)=>JSON.stringify(overrides.get(path.resolve(path.dirname(original),relative))??url(path.resolve(path.dirname(original),relative))));fs.writeFileSync(path.join(temporary,p),source);}
 return {engine:await import(url(path.join(temporary,'engine.mjs'))),worker:await import(url(path.join(temporary,'worker.mjs'))),fixedWorker:await import(url(path.join(temporary,'origin-mechanical-qa-worker.mjs'))),temporary};
}
export function syntheticMechanicalModel(f,{verdict='Pass',native_id=randomUUID(),beforeBirth,afterBirth,beforeReturn,omitClosure=false,invalidWire=false}={}){
 let calls=0;
 const model=async(host,native,prompt,cwd,timeout,selection,options)=>{
  calls++;if(native!==null)throw Error('SYNTHETIC fixture expected fresh independent native');
  const state=f.state(),job=Object.values(state.jobs).find(j=>j.status==='running'&&j.worker_pid===process.pid),plan=state.records[job.review_of.id].origin_quarantine_plan;
  if(job.model_process_tracking?.invocations.length!==1)throw Error('Actual original request journal missing before synthetic model boundary');
  beforeBirth?.({host,prompt,cwd,timeout,selection,options,job});
  const started=Date.now(),birth={protocol:'ordinary-model-process-birth-v1',launch_id:'SYNTHETIC-'+randomUUID(),host,pid:88001,worker_pid:process.pid,spawned_at:new Date(started).toISOString(),command_sha256:rawHash('SYNTHETIC no process command'),argv_sha256:rawHash('SYNTHETIC no native arguments'),cwd_sha256:rawHash(cwd)};
  const closure={protocol:'ordinary-model-process-close-v1',birth_sha256:rawHash(JSON.stringify(birth)),closed_at:new Date(started).toISOString(),exit_code:0,signal:null,observation:'original-child-close'};
  options.onModelProcess(birth);
  try{
   afterBirth?.({host,prompt,cwd,timeout,selection,options,job});
   options.onSpawn(executionTiming(started,{timeout_ms:Math.min(timeout,options.executionDeadlineAt-started),timeout_reason:options.timeoutReason}));
   const content={protocol:'peer-origin-mechanical-review-v1',permitted_action:'quarantine_peer_origin',plan_sha256:peerDigest(plan),cut_sha256:plan.cut_sha256,maintenance_role:'reviewer',legacy_authority:'retired-without-conversion',execution_resumed:false};
   const text=invalidWire?'SYNTHETIC original malformed raw wire':JSON.stringify({content:JSON.stringify(content),messages:[],notices:[],review:{verdict,reason:'SYNTHETIC exact SOURCE mechanics only; no native qualification.',blockers:verdict==='Pass'?[]:['Retain this exact adverse SOURCE result.']}});
   await beforeReturn?.({host,prompt,cwd,timeout,selection,options,job,text});return {native_id,text,model_evidence:{reported_models:[],reported_effort:null,verification:'unverified',source:'SYNTHETIC_SOURCE_ONLY',scope:'no actual native execution'}};
  }finally{if(!omitClosure){closure.closed_at=new Date().toISOString();options.onModelClosure(birth,closure);}}
 };
 return {model,get calls(){return calls;},native_id};
}

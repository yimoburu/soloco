// SOURCE loader retaining the canonical Store/Ledger/inventory identities.
// Only standard Node child events are controlled; no Native run is asserted.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {stageOriginalWorker,runOriginalAdapterWithMock,disposeOriginalProcessFixtures} from './original-adapter-process-fixture.mjs';
const runtime=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url)),url=p=>pathToFileURL(p).href;
export async function loadMechanicalQueueWorkerSource(t,policyModuleUrl){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-SYNTHETIC-mechanical-worker-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 const files=['engine.mjs','worker.mjs','origin-mechanical-qa-worker.mjs'],overrides=new Map(files.map(p=>[path.join(runtime,p),url(path.join(temporary,p))]));overrides.set(path.join(runtime,'peers/origin-mechanical-qa-policy.mjs'),String(policyModuleUrl));
 for(const p of files){const original=path.join(runtime,p),source=fs.readFileSync(original,'utf8').replace(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_all,_quote,relative)=>JSON.stringify(overrides.get(path.resolve(path.dirname(original),relative))??url(path.resolve(path.dirname(original),relative))));fs.writeFileSync(path.join(temporary,p),source);}
 const sourceEngine=await import(url(path.join(temporary,'engine.mjs')));
 const engine={...sourceEngine,dispatchPeerOriginMechanicalReview(args,host,internal={}){
  return sourceEngine.dispatchPeerOriginMechanicalReview(args,host,{...internal,launch(root,job_id){
   internal.launch?.(root,job_id); // existing queue/probe assertions are observers
   const carrier=stageOriginalWorker(root,job_id);t.after(()=>{carrier.dispose();disposeOriginalProcessFixtures(root);});return carrier.child;
  }});
 }};
 return {engine,worker:await import(url(path.join(temporary,'worker.mjs'))),fixedWorker:await import(url(path.join(temporary,'origin-mechanical-qa-worker.mjs'))),temporary};
}
export function syntheticMechanicalModel(f,{verdict='Pass',native_id=randomUUID(),beforeBirth,afterBirth,beforeReturn,omitClosure=false,invalidWire=false}={}){
 let calls=0;
 const model=async(host,native,prompt,cwd,timeout,selection,options)=>{
  calls++;if(native!==null)throw Error('SYNTHETIC fixture expected fresh independent native');
  const state=f.state(),job=Object.values(state.jobs).find(j=>j.status==='running'&&j.worker_pid===process.pid),plan=state.records[job.review_of.id].origin_quarantine_plan;
  if(job.model_process_tracking?.invocations.length!==1)throw Error('Actual original request journal missing before synthetic model boundary');
  beforeBirth?.({host,prompt,cwd,timeout,selection,options,job});
  const content={protocol:'peer-origin-mechanical-review-v1',permitted_action:'quarantine_peer_origin',plan_sha256:peerDigest(plan),cut_sha256:plan.cut_sha256,maintenance_role:'reviewer',legacy_authority:'retired-without-conversion',execution_resumed:false};
  const text=invalidWire?'SYNTHETIC original malformed raw wire':JSON.stringify({content:JSON.stringify(content),messages:[],notices:[],review:{verdict,reason:'SYNTHETIC exact SOURCE mechanics only; no native qualification.',blockers:verdict==='Pass'?[]:['Retain this exact adverse SOURCE result.']}});
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>true;
  const forwarded={...options,resolveExecutable:options.resolveExecutable??(()=>process.execPath),onModelProcess:birth=>{options.onModelProcess?.(birth);afterBirth?.({host,prompt,cwd,timeout,selection,options,job});}};
  return runOriginalAdapterWithMock(host,native,prompt,cwd,timeout,selection,forwarded,{child,onLaunch(){queueMicrotask(async()=>{
   try{child.emit('spawn');
    const wire=host==='codex'?[{type:'thread.started',thread_id:native_id},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text}},{type:'turn.completed'}].map(v=>JSON.stringify(v)).join('\n')+'\n':JSON.stringify({type:'result',subtype:'success',result:text,session_id:native_id});
    child.stdout.end(wire);child.stderr.end();
    // Bytes can arrive before a later monitored failure while physical close
    // is still pending. Preserve those actual adapter bytes as rejected DATA.
    await beforeReturn?.({host,prompt,cwd,timeout,selection,options,job,text});
    if(!omitClosure)queueMicrotask(()=>{child.emit('exit',0,null);child.emit('close',0,null);});
    else child.emit('error',Error('SOURCE fixture withheld original close'));
   }catch(error){child.emit('error',error);}
  });}});
 };
 return {model,get calls(){return calls;},native_id};
}

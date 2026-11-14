// SOURCE fixture only: run the original worker and adapter with controlled
// ChildProcess emitters. Callback output remains test DATA; the unchanged
// producers observe the assignment, carrier, model birth and model close.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {withStore} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {jobTimeoutState} from '../plugins/soloco/runtime/timeout.mjs';
import {runOriginalAdapterWithMock,stageOriginalWorker,disposeOriginalProcessFixtures} from './original-adapter-process-fixture.mjs';

let nextPid=760000;
const directories=new Map();
function remember(root,cwd){let paths=directories.get(root);if(!paths)directories.set(root,paths=new Set());paths.add(cwd);}
function wire(host,output){
  if(host==='claude')return JSON.stringify({type:'result',subtype:'success',session_id:output.native_id,result:output.text});
  return [{type:'thread.started',thread_id:output.native_id},{type:'turn.started'},
    {type:'item.completed',item:{type:'agent_message',text:output.text}},{type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n';
}
async function modelFromCallback(root,callback,args){
  const [host,native,prompt,cwd,timeout,selection,options]=args;
  const child=new EventEmitter();child.pid=++nextPid;
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();
  child.stdin.end=()=>{};child.kill=()=>true;
  let creations=0,closed=false,outcome;
  const close=(code=0)=>{if(!closed){closed=true;child.emit('close',code,null);}};
  remember(root,cwd);
  const pending=runOriginalAdapterWithMock(host,native,prompt,cwd,timeout,selection,{
    ...options,resolveExecutable:()=>'/controlled-not-qualified/'+host,
    // Naming is cosmetic and can otherwise schedule a second Codex process.
    sessionTitle:undefined,sessionNameDirectory:undefined,sessionNameSupport:false,
  },{child,onLaunch:()=>{creations++;}});
  // Always drain the adapter, including callback failures, without replacing
  // the original callback's thrown value with a secondary adapter error.
  const settled=Promise.resolve(pending).then(value=>outcome={value},error=>outcome={failed:true,error});
  if(creations===0){const result=await settled;if(result.failed)throw result.error;assert.fail('Original adapter returned without creating its child');}
  assert.equal(creations,1,'the original adapter must launch before the callback stimulus');
  child.emit('spawn');
  await Promise.resolve();
  if(outcome?.failed){close(1);await settled;throw outcome.error;}
  let output;
  try{output=await callback(...args);}
  catch(error){close(1);await settled;throw error;}
  try{child.stdout.emit('data',wire(host,output));}
  catch(error){close(1);await settled;throw error;}
  close();
  const result=await settled;if(result.failed)throw result.error;
  // Preserve deliberate malformed envelopes, dynamic native identity and
  // caller-supplied model_evidence; the worker still checks actual observers.
  return output;
}

export async function workOriginal(root,jobId,callback){
  const job=withStore(root,store=>store.read().jobs[jobId]);
  let waiting=false;try{waiting=jobTimeoutState(job,Date.now()).state==='waiting';}catch{}
  // Let the unchanged worker handle missing, cancelled, expired or otherwise
  // rejected assignments. They must not be turned into fixture assertions.
  const carrier=job?.status==='queued'&&job.original_execution_assignment&&waiting&&
    !job.original_execution_assignment.launches.some(launch=>launch.kind==='worker')?stageOriginalWorker(root,jobId):null;
  try{return await work(root,jobId,(...args)=>modelFromCallback(root,callback,args));}
  finally{carrier?.dispose();}
}

export function disposeCoreOriginalWorkerFixtures(root){
  const paths=directories.get(root);directories.delete(root);
  for(const cwd of paths??[])if(cwd!==root)disposeOriginalProcessFixtures(cwd);
  disposeOriginalProcessFixtures(root);
}

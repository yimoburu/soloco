// Prospective SOURCE component fixture, UNRUN. Only the standard Node child
// factory is controlled. Genuine Store issuers, Original observers, adapters,
// request/closure writes and authority checks remain production Source.
// Controlled child events are not OS, provider, Native or acceptance evidence.
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import {mock} from 'node:test';
import {developmentAction as actualDevelopmentAction,executeDevelopmentTest as actualDevelopmentTest,executePreflightDiagnostic as actualPreflightDiagnostic,executeDevelopmentWorker as actualDevelopmentWorker} from '../plugins/soloco/runtime/develop.mjs';
import {withStore} from '../plugins/soloco/runtime/store.mjs';
import {runOriginalAdapterWithMock} from './original-adapter-process-fixture.mjs';

const developmentRunner=fileURLToPath(new URL('../plugins/soloco/runtime/develop.mjs',import.meta.url));
const carriers=new Map();let nextModelPid=780000;
export const launches=[];
const carrierKey=(root,jobId)=>JSON.stringify([root,jobId]);
function controlledChild(pid){
  const child=new EventEmitter();if(pid!==undefined)child.pid=pid;
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};
  child.kill=()=>true;child.unref=()=>child;return child;
}
// This third argument belongs solely to this test helper. It never enters the
// product internal-options object and cannot authorize a product launch.
export async function sourceDevelopmentAction(args,host='codex',{creationError,asyncChild}={}){
  assert.equal(host,'codex');assert.ok(path.isAbsolute(args.root));let observed=null;
  const replacement=mock.method(childProcess,'spawn',(binary,argv,options)=>{
    assert.equal(observed,null,'One controlled carrier creation per selected action');
    assert.equal(binary,process.execPath);assert.equal(argv.length,4);
    assert.equal(argv[0],'--no-warnings');assert.equal(argv[1],developmentRunner);assert.equal(argv[2],args.root);assert.equal(typeof argv[3],'string');
    assert.equal(options.detached,true);assert.equal(options.stdio,'ignore');assert.equal(options.env.COMPANY_WORKER,'1');
    observed={binary,args:argv,options,child:null};launches.push(observed);
    if(creationError!==undefined)throw creationError;
    const child=asyncChild??controlledChild(process.pid);observed.child=child;
    carriers.set(carrierKey(args.root,argv[3]),observed);return child;
  });syncBuiltinESMExports();
  try{
    const result=await actualDevelopmentAction(args,host);
    if(observed&&asyncChild===undefined){
      observed.child.emit('spawn');
      const launch=withStore(args.root,store=>store.read().jobs[observed.args[3]].original_execution_assignment.launches.find(value=>value.kind==='worker'));
      assert.equal(launch.birth.pid,process.pid);assert.equal(launch.closure,null);
    }
    return result;
  }finally{replacement.mock.restore();syncBuiltinESMExports();}
}
// Only the actual in-process worker's fulfilled/rejected operation supplies
// this controlled boundary close. Disposal never manufactures one for UNKNOWN.
async function executeFixedWorker(root,jobId,operation){
  const carrier=carriers.get(carrierKey(root,jobId));assert.ok(carrier?.child,'Default Source launch must precede worker entry');
  // A repeat call must reach the fixed product guard unchanged. It does not
  // own the already observed process and cannot reclose/reclassify its receipt.
  if(carrier.closed)return operation();
  let code=1;
  try{const result=await operation();code=0;return result;}
  finally{
    if(!carrier.closed){carrier.closed=true;carrier.child.emit('exit',code,null);carrier.child.emit('close',code,null);}
    const launch=withStore(root,store=>store.read().jobs[jobId].original_execution_assignment.launches.find(value=>value.kind==='worker'));
    assert.equal(launch.birth.pid,process.pid);assert.equal(launch.closure.pid,process.pid);assert.equal(launch.closure.code,code);assert.equal(launch.closure.never_started,false);
  }
}
// Each exported entry calls one fixed existing Source function. There is no
// exported callback-success-to-close broker or configurable product executor.
export function sourceExecuteDevelopmentTest(root,jobId,options){return executeFixedWorker(root,jobId,()=>actualDevelopmentTest(root,jobId,options));}
export function sourceExecutePreflightDiagnostic(root,jobId,options){return executeFixedWorker(root,jobId,()=>actualPreflightDiagnostic(root,jobId,options));}
export function sourceExecuteDevelopmentWorker(root,jobId,options){return executeFixedWorker(root,jobId,()=>actualDevelopmentWorker(root,jobId,options));}
// The injected worker model delegates invocation to the actual adapter and
// forwards its genuine private birth/close callbacks unchanged. The chosen
// JSONL answer remains fictional Source DATA, never a provider/QA claim.
export function sourceModelResult(answer){
  return (host,native,prompt,cwd,remaining,selection,options)=>{
    assert.equal(host,'codex');const output=answer(prompt),child=controlledChild(++nextModelPid);
    assert.equal(typeof output.native_id,'string');assert.equal(typeof output.text,'string');
    child.stdin.end=()=>{
      child.emit('spawn');
      child.stdout.emit('data',[
        {type:'thread.started',thread_id:output.native_id},
        {type:'turn.started',thread_id:output.native_id,turn_id:'fictional-preflight-turn'},
        {type:'item.completed',thread_id:output.native_id,turn_id:'fictional-preflight-turn',item:{id:'fictional-preflight-answer',type:'agent_message',phase:'final_answer',text:output.text}},
        {type:'turn.completed',thread_id:output.native_id,turn_id:'fictional-preflight-turn'}
      ].map(value=>JSON.stringify(value)).join('\n')+'\n');
      child.emit('exit',0,null);child.emit('close',0,null);
    };
    return runOriginalAdapterWithMock(host,native,prompt,cwd,remaining,selection,{...options,resolveExecutable:()=>process.execPath,renameSession:async()=>({status:'unsupported',reason:'Source fixture has no naming service'})},{child});
  };
}

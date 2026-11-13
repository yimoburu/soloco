// SOURCE fixture only. Node's ChildProcess boundary is mocked; the original
// Store, writer history, private launch tokens and observer code stay intact.
// These controlled events are not actual Native execution or old host evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mock} from 'node:test';
import {Store,SCHEMA,VERSION,installedTeam,teamHash,stamp} from '../plugins/soloco/runtime/store.mjs';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
import {requestModelProcess,recordModelProcessBirth,recordModelProcessClosure} from '../plugins/soloco/runtime/model-process-closure.mjs';
import {TIMEOUT_POLICY_VERSION,normalizeTimeout} from '../plugins/soloco/runtime/timeout.mjs';
import {recordOriginalWorkerAssignmentFrom,assertOriginalWorkerAssignmentFrom,prepareOriginalWorkerLaunchFrom,spawnOriginalWorkerLaunch} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';

const roots=new Map(),scopes=new Set();let current=null,spawnMock=null,nextPid=740000;
const copy=value=>JSON.parse(JSON.stringify(value));
function register(root,value){let set=roots.get(root);if(!set)roots.set(root,set=new Set());set.add(value);return value;}
function installMock(){
  if(spawnMock)return;
  spawnMock=mock.method(childProcess,'spawn',(command,args,options)=>{
    assert.ok(current,'Unexpected subprocess outside the selected original SOURCE spawn');
    const s=current;assert.equal(s.attempted,false,'one original Node creation per private scope');s.attempted=true;
    s.calls.push([command,args,options]);s.onLaunch?.(command,args,options);
    s.used=true;return s.child;
  });syncBuiltinESMExports();
}
function release(s){
  if(s.released)return;s.released=true;scopes.delete(s);
  if(scopes.size===0&&spawnMock){spawnMock.mock.restore();spawnMock=null;syncBuiltinESMExports();}
}
function nodeScope(child,onLaunch){
  assert.ok(child&&typeof child.once==='function'&&typeof child.removeListener==='function');
  if(!Number.isSafeInteger(child.pid)||child.pid<=0)child.pid=++nextPid;
  const s={child,onLaunch,calls:[],attempted:false,used:false,closed:false,released:false};scopes.add(s);installMock();
  const closed=()=>{s.closed=true;queueMicrotask(()=>release(s));};child.once('close',closed);
  s.invoke=fn=>{const previous=current;current=s;try{return fn();}finally{current=previous;}};
  s.dispose=()=>{if(!s.used){child.removeListener('close',closed);release(s);}else if(s.closed)release(s);};
  // Historical UNKNOWN cleanup is resource disposal only. It does not emit a
  // close or remove any producer observer from the controlled original child.
  s.abandon=()=>{child.removeListener('close',closed);release(s);};
  return s;
}
function controlledChild(pid=++nextPid){
  const child=new EventEmitter();child.pid=pid;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};
  child.kill=()=>true;child.unref=()=>child;return child;
}
function open(root){const store=new Store(root);register(root,{dispose:()=>{if(!store.closed)store.close();}});return store;}
function withStore(root,fn){const store=open(root);try{return fn(store);}finally{store.close();}}
function claim(store,job_id){store.transaction('job.started',state=>{const job=state.jobs[job_id];assertOriginalWorkerAssignmentFrom(store,state,job);assert.equal(job.status,'queued');job.status='running';job.worker_pid=process.pid;job.started_at=stamp();return state;});}

export function stageOriginalWorker(root,job_id){
  const store=open(root),before=store.read().jobs[job_id];assert.ok(before?.original_execution_assignment,'the actual Source queue must precede carrier creation');
  assert.equal(before.status,'queued');
  let token;store.transaction('job.worker_launch_requested',state=>{token=prepareOriginalWorkerLaunchFrom(store,state,{job_id,kind:'worker'});return state;});
  // This PID denotes the controlled in-process worker role, not an OS child.
  // The real Source producer observes it from the standard Node CP mock.
  const child=controlledChild(process.pid),scope=nodeScope(child);
  scope.invoke(()=>spawnOriginalWorkerLaunch(token,process.execPath,['SOURCE-controlled-worker'],{cwd:root,stdio:'ignore'}));
  child.emit('spawn');
  return register(root,{child,dispose(){if(!scope.closed)child.emit('close',0,null);scope.dispose();if(!store.closed)store.close();}});
}
function prepareModel(store,job_id,now){
  // Invalid adapter dependency/clock cases must still reach the unchanged
  // adapter validator. Their unexecuted intent uses a valid Source timestamp.
  let requested=Date.now();try{const value=typeof now==='function'?now():null;if(Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000)requested=value;}catch{}
  const invocation={invocation_id:'SOURCE-invocation-'+randomUUID(),job_id,instance_id:store.read().jobs[job_id].instance_id,worker_pid:process.pid,host:store.read().jobs[job_id].host,requested_at:new Date(requested).toISOString()};
  store.transaction('job.model_process.requested',state=>{requestModelProcess(state.jobs[job_id],invocation);return state;});
  let token;store.transaction('job.model_process.launch_requested',state=>{token=prepareOriginalWorkerLaunchFrom(store,state,{job_id,kind:'model',invocation_id:invocation.invocation_id});return state;});
  return {token,
    onModelProcess:birth=>{store.transaction('job.model_process.born',state=>{recordModelProcessBirth(state.jobs[job_id],invocation,birth);return state;});},
    onModelClosure:(birth,receipt)=>{store.transaction('job.model_process.closed',state=>{recordModelProcessClosure(state.jobs[job_id],invocation,birth,receipt);return state;});}};
}
export function runOriginalAdapterWithMock(host,native,prompt,cwd,timeout,selection,options,{child,onLaunch}={}){
  assert.ok(options?.originalExecutionLaunch,'actual-worker mode requires its incoming original token');
  assert.equal(options.spawn,undefined,'remove the former product spawn override at the test call site');
  const scope=nodeScope(child,onLaunch);register(cwd,{dispose:()=>scope.closed?scope.dispose():scope.abandon()});let result;
  try{result=scope.invoke(()=>runModel(host,native,prompt,cwd,timeout,selection,options));}
  catch(error){scope.dispose();throw error;}
  // Rejection before Node creation has no original emitter to retain. Created
  // children keep their scope through actual (possibly late) close instead.
  Promise.resolve(result).then(()=>scope.dispose(),()=>scope.dispose());
  return result;
}
export function createOriginalAdapterProcessFixture({host='codex',child,onLaunch,now=Date.now}={}){
  assert.ok(['codex','claude'].includes(host));assert.equal(typeof now,'function');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-adapter-original-SOURCE-')),store=new Store(root,true),team=installedTeam();
  register(root,{dispose:()=>{if(!store.closed)store.close();}});
  store.transaction('company.created',()=>({schema:SCHEMA,runtime_version:VERSION,id:'SOURCE-company-'+randomUUID(),name:'SOURCE adapter fixture',idea:'No actual model or Native execution.',phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host,session_id:'SOURCE-owner-'+randomUUID(),epoch:1},records:{},sessions:{},jobs:{},messages:[],notices:[],created_at:stamp()}));
  const job_id='SOURCE-job-'+randomUUID();store.transaction('job.queued',state=>{const job={id:job_id,instance_id:'SOURCE-instance-'+randomUUID(),role:'research',host,status:'queued',native_id:null,epoch:1,created_at:stamp(),timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout()};recordOriginalWorkerAssignmentFrom(store,state,job);state.jobs[job_id]=job;return state;});
  const carrier=stageOriginalWorker(root,job_id);claim(store,job_id);let used=false,modelScope=null,disposed=false;
  const fixture={root,job_id,get processCreated(){return modelScope?.used===true;},get processClosed(){return modelScope?.closed===true;},
    run(actualHost,native,prompt,cwd,timeout,selection,options={}){
      assert.equal(actualHost,host);assert.equal(used,false,'one model invocation per standalone fixture');used=true;
      assert.equal(options.spawn,undefined,'test Node mock replaces the former options.spawn');
      const tracked=prepareModel(store,job_id,options.now??now),oldBirth=options.onModelProcess,oldClose=options.onModelClosure;
      const final={...options,originalExecutionLaunch:tracked.token,
        onModelProcess:birth=>{tracked.onModelProcess(birth);return oldBirth?.(birth);},
        onModelClosure:(birth,receipt)=>{tracked.onModelClosure(birth,receipt);return oldClose?.(birth,receipt);}};
      modelScope=nodeScope(child,onLaunch);
      let result;try{result=modelScope.invoke(()=>runModel(actualHost,native,prompt,cwd,timeout,selection,final));}catch(error){modelScope.dispose();throw error;}
      Promise.resolve(result).then(()=>modelScope.dispose(),()=>modelScope.dispose());return result;
    },
    dispose(){
      if(disposed)return;
      if(modelScope?.used&&!modelScope.closed)return; // the caller must supply the actual late close first
      disposed=true;modelScope?.dispose();carrier.dispose();disposeOriginalProcessFixtures(root);fs.rmSync(root,{recursive:true,force:true});
    }};
  return fixture;
}

export function stageOriginalHistoricalJob(root,desired,{deferTerminal=false}={}){
  assert.equal(typeof deferTerminal,'boolean');
  const target=copy(desired),store=open(root);let currentJob=store.read().jobs[target.id];
  if(!currentJob){
    store.transaction(target.kind==='development_test'?'development.test_reserved':target.kind==='development_preflight'?'development.preflight_diagnostic_reserved':'job.queued',state=>{
      // This controlled Source launch starts now. Retained business timestamps
      // remain desired terminal DATA, never a backdated launch capability.
      const development=['development_test','development_preflight'].includes(target.kind),job={timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout(),...copy(target),created_at:stamp(),role:target.role??'SOURCE-runtime',host:target.host??(development?'local':'codex'),status:'queued',native_id:null};
      for(const field of ['started_at','worker_pid','execution_started_at','execution_deadline_at','termination_deadline_at','execution_provenance','finished_at','model_process_tracking','execution_failure','error','artifact_id','coordination_release','timeout_reconciliation','rejected_output'])delete job[field];
      if(development)delete job.instance_id;else job.instance_id??='SOURCE-instance-'+randomUUID();
      recordOriginalWorkerAssignmentFrom(store,state,job);state.jobs[job.id]=job;return state;
    });currentJob=store.read().jobs[target.id];
  }else{assert.ok(currentJob.original_execution_assignment);assert.equal(currentJob.id,target.id);assert.equal(currentJob.status,'queued');if(target.instance_id!==undefined)assert.equal(currentJob.instance_id,target.instance_id);}
  const carrier=stageOriginalWorker(root,target.id);claim(store,target.id);
  const development=['development_test','development_preflight'].includes(currentJob.kind),knownClosed=target.status==='completed'||target.coordination_release?.termination_confirmed===true;
  let scope=null;
  if(development){
    let token;store.transaction('development.execution_launch_requested',state=>{token=prepareOriginalWorkerLaunchFrom(store,state,{job_id:target.id,kind:'development'});return state;});
    const child=controlledChild();scope=nodeScope(child);scope.invoke(()=>spawnOriginalWorkerLaunch(token,process.execPath,['SOURCE-historical-controlled-unit'],{cwd:root,stdio:'ignore'}));child.emit('spawn');
    if(knownClosed)child.emit('close',0,null);
  }else {
    const tracking=store.read().jobs[target.id].model_process_tracking;
    // Historical tracking is retained as semantic DATA in the final typed
    // transition; it cannot substitute for this newly observed Source launch.
    if(tracking)store.transaction('SOURCE.historical-tracking-data',state=>{delete state.jobs[target.id].model_process_tracking;return state;});
    const tracked=prepareModel(store,target.id,Date.now),child=controlledChild(),native=target.native_id??'SOURCE-controlled-native-'+randomUUID(),host=store.read().jobs[target.id].host;
    child.stdin.end=()=>{child.emit('spawn');if(knownClosed){
      child.stdout.emit('data',host==='claude'?JSON.stringify({type:'result',subtype:'success',session_id:native,result:'SOURCE controlled historical DATA.'}):[
        {type:'thread.started',thread_id:native},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:'SOURCE controlled historical DATA.'}},{type:'turn.completed'}
      ].map(JSON.stringify).join('\n')+'\n');child.emit('close',0,null);
    }};
    // Actual adapter observers generate the ordinary-model-process records.
    // A retained UNKNOWN uses no real timer and no fabricated close event.
    const pending=runOriginalAdapterWithMock(host,null,'SOURCE historical fixture only.',root,1000,null,{originalExecutionLaunch:tracked.token,
      timeoutReason:'Controlled finite Source historical fixture',resolveExecutable:()=>process.execPath,setTimeout:()=>Object.freeze({SOURCE_ONLY_NO_REAL_TIMER:true}),clearTimeout:()=>{},
      onModelProcess:tracked.onModelProcess,onModelClosure:tracked.onModelClosure},{child});
    pending.catch(()=>{});
    const actual=store.read().jobs[target.id].model_process_tracking?.invocations.at(-1);
    assert.ok(actual?.birth,'the controlled original adapter must observe its own actual Source birth');
    if(knownClosed)assert.ok(actual.closure,'the controlled original adapter must observe its own actual close');
    else assert.equal(actual.closure,null,'historical UNKNOWN receives no synthetic close');
  }
  if(!deferTerminal)store.transaction(knownClosed?'job.completed':'job.failed',state=>{
    const job=state.jobs[target.id],assignment=job.original_execution_assignment,identity={id:job.id,instance_id:job.instance_id,host:job.host,role:job.role};
    const final={...job,...copy(target),role:target.role??identity.role,host:target.host??identity.host,original_execution_assignment:assignment};
    if(identity.instance_id!==undefined)final.instance_id=identity.instance_id;
    state.jobs[target.id]=final;return state;
  });
  if(knownClosed){scope?.dispose();carrier.dispose();store.close();}
  else register(root,{dispose(){scope?.abandon();if(!store.closed)store.close();}});
  return store.closed?withStore(root,s=>s.read().jobs[target.id]):store.read().jobs[target.id];
}
export function disposeOriginalProcessFixtures(root){
  const set=roots.get(root);if(!set)return;roots.delete(root);
  // Close observed carriers before their backing Stores; UNKNOWN unit scopes
  // are merely abandoned, never falsely observed as closed for cleanup.
  for(const value of [...set].reverse())value.dispose();
}

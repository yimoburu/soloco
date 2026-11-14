// Source contract fixture only. Original Store/assignment/launch issuers and
// adapter observers are real; Node ChildProcess emitters and clocks are doubles.
// No OS child, host CLI, provider, executed test or Native acceptance is proved.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mock} from 'node:test';
import {Store,withStore,stamp} from '../plugins/soloco/runtime/store.mjs';
import {TIMEOUT_POLICY_VERSION,normalizeTimeout} from '../plugins/soloco/runtime/timeout.mjs';
import {recordOriginalWorkerAssignmentFrom,assertOriginalWorkerAssignmentFrom,prepareOriginalWorkerLaunchFrom,spawnOriginalWorkerLaunch} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import {runOriginalAdapterWithMock,stageOriginalWorker,stageOriginalHistoricalJob,disposeOriginalProcessFixtures} from './original-adapter-process-fixture.mjs';

export {stageOriginalHistoricalJob,disposeOriginalProcessFixtures};
export const launchOriginalWorker=(root,jobId)=>stageOriginalWorker(root,jobId).child;

export class ControlledClock {
  constructor(time=Date.now()){this.time=time;this.next=0;this.jobs=new Map();}
  now=()=>{this.time=Math.max(this.time,Date.now());return this.time;};
  set=(fn,delay)=>{const key=++this.next;this.jobs.set(key,{at:this.now()+delay,fn});return key;};
  clear=key=>this.jobs.delete(key);
  move(to){
    assert.ok(Number.isSafeInteger(to)&&to>=this.time,'controlled clock moves forward only');let steps=0;
    while(true){
      const next=[...this.jobs].filter(([,job])=>job.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      assert.ok(++steps<100,'bounded controlled timer delivery');this.time=next[1].at;this.jobs.delete(next[0]);next[1].fn();
    }
    this.time=to;
  }
}
let nextPid=750000;
class ControlledChild extends EventEmitter {
  constructor(){super();this.pid=++nextPid;this.stdout=new EventEmitter();this.stderr=new EventEmitter();this.stdin=new EventEmitter();this.stdin.end=()=>{};this.signals=[];}
  kill(signal){this.signals.push(signal);return true;}
}
const wire=(nativeId,text)=>[{type:'thread.started',thread_id:nativeId},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text}},{type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n';

// work() supplies the one-use private launch and paired durable observers.
// The fixture never constructs either a launch token or a process receipt.
export function startOriginalModel(args,{nativeId='controlled-original-reviewer',clock=new ControlledClock()}={}){
  assert.equal(args.length,7);const [host,native,prompt,cwd,limit,selection,options]=args;
  assert.equal(host,'codex');assert.ok(options?.originalExecutionLaunch);assert.equal(options.spawn,undefined);
  const child=new ControlledChild();let creations=0;
  const promise=runOriginalAdapterWithMock(host,native,prompt,cwd,limit,selection,{...options,now:clock.now,setTimeout:clock.set,clearTimeout:clock.clear,resolveExecutable:()=>'/controlled-not-qualified/codex',sessionNameSupport:false},{child,onLaunch:()=>{creations++;}});
  assert.equal(creations,1,'the real adapter must consume the incoming private launch before the test stimulus');
  let closed=false;
  const close=(code=0,signal=null)=>{if(closed)return;closed=true;child.emit('close',code,signal);};
  const respond=text=>{assert.equal(closed,false);assert.equal(typeof text,'string');child.stdout.emit('data',wire(nativeId,text));close();};
  child.emit('spawn');
  return {promise,child,clock,respond,close,error:error=>child.emit('error',error)};
}

// A fictional historical receipt needs a genuine development carrier too.
// The caller supplies an initially live, finite Source-only scope; subsequent
// review advances its logical clock beyond that same scope without renewing it.
export function stageOriginalReviewController(root,{jobId,planId,candidateId,receiptId}){
  withStore(root,store=>store.transaction('development.test_reserved',state=>{
    const job={id:jobId,kind:'development_test',role:'runtime',host:'local',native_id:null,epoch:state.owner.epoch,status:'queued',development_id:planId,candidate_id:candidateId,created_at:stamp(),timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout()};
    recordOriginalWorkerAssignmentFrom(store,state,job);state.jobs[jobId]=job;return state;
  }));
  const carrier=stageOriginalWorker(root,jobId);
  try{
    withStore(root,store=>store.transaction('job.started',state=>{const job=state.jobs[jobId];assertOriginalWorkerAssignmentFrom(store,state,job);assert.equal(job.status,'queued');job.status='running';job.worker_pid=process.pid;job.started_at=stamp();return state;}));
    const issuer=new Store(root);
    try{
    let launch;
    issuer.transaction('development.execution_launch_requested',state=>{
      state.jobs[jobId].execution_provenance={protocol:'development-test-launch-v1',launch_intent:true,runner_entered:true,launch_intent_at:stamp()};
      launch=prepareOriginalWorkerLaunchFrom(issuer,state,{job_id:jobId,kind:'development'});return state;
    });
    const child=new ControlledChild();let creations=0;
    const replacement=mock.method(childProcess,'spawn',(command,args,options)=>{assert.equal(++creations,1);assert.equal(command,process.execPath);assert.deepEqual(args,['SOURCE-controlled-review-controller']);assert.deepEqual(options,{cwd:root,stdio:'ignore'});return child;});
    syncBuiltinESMExports();
    try{assert.equal(spawnOriginalWorkerLaunch(launch,process.execPath,['SOURCE-controlled-review-controller'],{cwd:root,stdio:'ignore'}),child);}
    finally{replacement.mock.restore();syncBuiltinESMExports();}
    assert.equal(creations,1);child.emit('spawn');child.emit('close',0,null);
    const observed=issuer.read().jobs[jobId].original_execution_assignment.launches.filter(item=>item.kind==='development');
    assert.equal(observed.length,1);assert.equal(observed[0].birth?.pid,child.pid);assert.equal(observed[0].closure?.pid,child.pid);assert.equal(observed[0].closure.never_started,false);assert.equal(observed[0].closure.code,0);
    withStore(root,store=>store.transaction('job.completed',state=>{const job=state.jobs[jobId];job.status='completed';job.artifact_id=receiptId;job.finished_at=stamp();return state;}));
    }finally{issuer.close();}
  }finally{carrier.dispose();}
  return withStore(root,store=>store.read().jobs[jobId]);
}

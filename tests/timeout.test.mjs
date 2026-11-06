import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {runModel, commandArgs, parseOutput, parseArtifact} from '../plugins/soloco/runtime/adapters.mjs';
import {
  normalizeTimeout, executionTiming, deadlinePhase, jobTimeoutState,
  DEFAULT_EXECUTION_TIMEOUT_MS, MIN_EXECUTION_TIMEOUT_MS,
  MAX_EXECUTION_TIMEOUT_MS, STARTUP_TIMEOUT_MS, TERMINATION_GRACE_MS
} from '../plugins/soloco/runtime/timeout.mjs';

// All dependencies below are local fakes: no child process, CLI discovery,
// real timer, network, account access or paid model invocation is needed.
class Clock {
  constructor() {this.time=1000000; this.next=1; this.timers=new Map();}
  now=()=>this.time;
  set=(fn, delay)=>{
    assert.ok(Number.isFinite(delay) && delay>=0);
    const id=this.next++;
    this.timers.set(id,{at:this.time+delay,fn});
    return id;
  };
  clear=id=>{this.timers.delete(id);};
  move(to, fire=true) {
    assert.ok(to>=this.time);
    if (!fire) {this.time=to; return;}
    let count=0;
    while (true) {
      const next=[...this.timers].filter(([,timer])=>timer.at<=to).sort((a,b)=>a[1].at-b[1].at || a[0]-b[0])[0];
      if (!next) break;
      assert.ok(++count<100, 'timer loop must be bounded');
      const [id,timer]=next;
      this.time=Math.max(this.time,timer.at);
      this.timers.delete(id);
      timer.fn();
    }
    this.time=to;
  }
}
class Signal {
  constructor() {this.aborted=false; this.handlers=new Set();}
  addEventListener(event, handler) {assert.equal(event,'abort'); this.handlers.add(handler);}
  removeEventListener(event, handler) {assert.equal(event,'abort'); this.handlers.delete(handler);}
  abort() {
    if (this.aborted) return;
    this.aborted=true;
    for (const handler of [...this.handlers]) handler();
  }
}
class Child extends EventEmitter {
  constructor({closeOnTerm=false, closeOnKill=false}={}) {
    super();
    this.stdout=new EventEmitter();
    this.stderr=new EventEmitter();
    this.stdin=new EventEmitter();
    this.stdin.end=prompt=>{this.prompt=prompt;};
    this.signals=[];
    this.closeOnTerm=closeOnTerm;
    this.closeOnKill=closeOnKill;
  }
  kill(signal) {
    this.signals.push(signal);
    if ((signal==='SIGTERM' && this.closeOnTerm) || (signal==='SIGKILL' && this.closeOnKill)) this.emit('close',null);
    return true;
  }
}
const codexOutput = text => JSON.stringify({type:'thread.started',thread_id:'native-fictional'})+'\n'+JSON.stringify({type:'item.completed',item:{type:'agent_message',text}})+'\n';
function harness({child=new Child(), signal=new Signal(), onSpawn, timeout=1000, timeoutReason='Small deterministic fixture', host='codex', nativeId=null, selection=null, spawnHook, resolveHook, timeoutContext, clockStart, executionDeadlineAt}={}) {
  const clock=new Clock();
  if(clockStart!==undefined)clock.time=clockStart;
  const calls=[];
  const receipts=[];
  let resolves=0;
  const options={
    signal, timeoutReason, timeoutContext, executionDeadlineAt,
    now:clock.now, setTimeout:clock.set, clearTimeout:clock.clear,
    resolveExecutable:host=>{resolves++; resolveHook?.(); return `/fictional/${host}`;},
    spawn:(...args)=>{calls.push(args); spawnHook?.(); return child;},
    onSpawn:record=>{receipts.push(record); return onSpawn?.(record);}
  };
  const promise=runModel(host,nativeId,'fictional prompt','/fictional/work',timeout,selection,options);
  const result=promise.then(value=>({value}),error=>({error}));
  return {clock,child,signal,calls,receipts,result,get resolves(){return resolves;}};
}
function clean(h) {
  assert.equal(h.clock.timers.size,0,'all lifecycle timers removed');
  assert.equal(h.signal.handlers.size,0,'abort listener removed');
  for (const emitter of [h.child,h.child.stdout,h.child.stderr,h.child.stdin]) assert.deepEqual(emitter.eventNames(),[],'adapter listeners removed');
}
test('absolute review deadline clamps actual delayed spawn and its watchdog',async()=>{
 const end=1080000,h=harness({timeout:80000,executionDeadlineAt:end});
 h.clock.move(1030000,false);h.child.emit('spawn');
 assert.equal(h.receipts.length,1);assert.equal(h.receipts[0].timeout_ms,50000);
 assert.equal(Date.parse(h.receipts[0].execution_deadline_at),end);
 assert.equal(Date.parse(h.receipts[0].termination_deadline_at),end+3000);
 h.clock.move(end,false);h.child.emit('close',0);
 assert.equal((await h.result).error.code,'ROLE_TIMEOUT');clean(h);
});

test('absolute expiry before spawn prevents timing credit and cannot accept late success',async()=>{
 const h=harness({timeout:600000,executionDeadlineAt:1002000,child:new Child({closeOnTerm:true})});
 h.clock.move(1002000,false);h.child.emit('spawn');
 assert.equal(h.receipts.length,0);assert.equal((await h.result).error.code,'ROLE_TIMEOUT');clean(h);
 for(const executionDeadlineAt of [NaN,Infinity,'1080000',-1]){
  const bad=harness({executionDeadlineAt});assert.match((await bad.result).error.message,/absolute execution deadline/);assert.equal(bad.calls.length,0);clean(bad);
 }
});

function complete(h,text='artifact') {
  h.child.stdout.emit('data',codexOutput(text));
  h.child.emit('close',0);
}

 test('timeout policy validates boundaries and reasons without coercion',()=>{
  assert.equal(DEFAULT_EXECUTION_TIMEOUT_MS,180000);
  assert.equal(MIN_EXECUTION_TIMEOUT_MS,1000);
  assert.equal(MAX_EXECUTION_TIMEOUT_MS,600000);
  assert.equal(STARTUP_TIMEOUT_MS,240000);
  assert.equal(TERMINATION_GRACE_MS,3000);
  assert.equal(normalizeTimeout().timeout_ms,180000);
  assert.equal(normalizeTimeout({timeout_ms:180000}).timeout_ms,180000);
  for (const timeout_ms of [1000,600000]) assert.deepEqual(normalizeTimeout({timeout_ms,timeout_reason:'  bounded task  '}),{timeout_ms,timeout_reason:'bounded task'});
  for (const timeout_ms of [0,-1,999,600001,1000.5,NaN,Infinity,'1000',null,true]) assert.throws(()=>normalizeTimeout({timeout_ms,timeout_reason:'fixture'}));
  for (const timeout_reason of ['', '   ', null, 3, 'x'.repeat(301)]) assert.throws(()=>normalizeTimeout({timeout_ms:1000,timeout_reason}));
  assert.throws(()=>normalizeTimeout({timeout_ms:1000}));
  assert.throws(()=>normalizeTimeout({timeout_ms:1000,timeout_reason:'fixture',extension_ms:1000}));
  assert.throws(()=>normalizeTimeout(null));
  assert.equal(normalizeTimeout({timeout_ms:1000,timeout_reason:'x'.repeat(300)}).timeout_reason.length,300);
});

test('spawn timing is independent of creation time and deadline boundaries are exclusive',()=>{
  const record=executionTiming(1000000,{timeout_ms:1000,timeout_reason:'fixture'});
  assert.equal(record.timeout_policy_version,1);
  assert.equal(Date.parse(record.execution_started_at),1000000);
  assert.equal(Date.parse(record.execution_deadline_at),1001000);
  assert.equal(Date.parse(record.termination_deadline_at),1004000);
  assert.equal(deadlinePhase(1001000,1000999),'before');
  assert.equal(deadlinePhase(1001000,1001000),'termination_grace');
  assert.equal(deadlinePhase(1001000,1003999),'termination_grace');
  assert.equal(deadlinePhase(1001000,1004000),'overdue');
  assert.throws(()=>executionTiming(null));
  assert.throws(()=>deadlinePhase('invalid',1000000));
});

test('reconciliation separates queue, startup and execution; excludes development tests',()=>{
  const policy={timeout_policy_version:1,timeout_ms:600000,timeout_reason:'Long bounded task'};
  const queued={...policy,status:'queued',created_at:1000000};
  assert.equal(jobTimeoutState(queued,1239999).state,'waiting');
  assert.equal(jobTimeoutState(queued,1240000).state,'overdue');
  const startup={...queued,status:'running',started_at:1239000};
  assert.equal(jobTimeoutState(startup,1240000).phase,'startup');
  assert.equal(jobTimeoutState(startup,1479000).state,'terminating');
  assert.equal(jobTimeoutState(startup,1482000).state,'overdue');
  const running={...startup,...executionTiming(1240000,policyFor(600000))};
  assert.equal(jobTimeoutState(running,1839999).state,'executing');
  assert.equal(jobTimeoutState(running,1840000).state,'terminating');
  assert.equal(jobTimeoutState(running,1843000).state,'overdue');
  assert.equal(jobTimeoutState({...running,type:'development_test'},9999999).state,'excluded');
  assert.equal(jobTimeoutState({...running,kind:'development_test'},9999999).state,'excluded');
  const changed={...running,execution_deadline_at:new Date(1900000).toISOString()};
  assert.equal(jobTimeoutState(changed,1840000).state,'inspection');
  assert.equal(jobTimeoutState({...running,status:'cancelled'},9999999).state,'terminal');
});
function policyFor(timeout_ms) {return {timeout_ms,timeout_reason:'Long bounded task'};}

test('legacy timing does not expand, reset, or manufacture missing deadlines',()=>{
  assert.equal(jobTimeoutState({status:'queued',created_at:1000000},1240000).state,'overdue');
  const legacy={status:'running',created_at:1000000,started_at:1240000};
  assert.equal(jobTimeoutState(legacy,1419999).state,'executing');
  assert.equal(jobTimeoutState(legacy,1420000).state,'terminating');
  assert.equal(jobTimeoutState(legacy,1423000).state,'overdue');
  assert.equal(jobTimeoutState({...legacy,timeout_ms:600000},1423000).state,'overdue');
  for (const job of [
    {status:'running'}, {status:'queued'}, {...legacy,started_at:'invalid'},
    {...legacy,timeout_policy_version:99},
    {...legacy,timeout_policy_version:1},
    {...legacy,execution_started_at:1240000},
    {...legacy,timeout_policy_version:1,timeout_ms:1000,timeout_reason:'fixture',execution_deadline_at:1241000}
  ]) assert.equal(jobTimeoutState(job,1423000).state,'inspection');
  assert.equal(jobTimeoutState({...legacy,status:'failed'},9999999).state,'terminal');
  assert.equal(jobTimeoutState(legacy,1239999).state,'inspection');
});

test('normal completion starts allowance at spawn and preserves isolation and selection',async()=>{
  const selection={mode:'explicit',model:'fictional-model',effort:'high'};
  const h=harness({selection,nativeId:'previous-native'});
  h.clock.move(1239999);
  assert.equal(h.receipts.length,0);
  h.child.emit('spawn');
  assert.equal(h.receipts.length,1);
  assert.equal(Date.parse(h.receipts[0].execution_started_at),1239999);
  assert.equal(Date.parse(h.receipts[0].execution_deadline_at),1240999);
  assert.deepEqual(h.calls[0][1],commandArgs('codex','previous-native',selection));
  assert.equal(h.calls[0][2].env.COMPANY_WORKER,'1');
  assert.equal(Object.hasOwn(h.calls[0][2].env,'CLAUDECODE'),false);
  assert.deepEqual(h.calls[0][2].stdio,['pipe','pipe','pipe']);
  assert.equal(h.child.prompt,'fictional prompt');
  h.clock.move(1240998);
  complete(h,'accepted before deadline');
  const result=await h.result;
  assert.equal(result.value.text,'accepted before deadline');
  assert.equal(result.value.native_id,'native-fictional');
  assert.equal(result.value.model_evidence.verification,'unverified');
  assert.deepEqual(h.child.signals,[]);
  clean(h);
  h.clock.move(2000000);
  assert.deepEqual(h.child.signals,[]);
});

test('existing default positional timeout works with omitted rationale',async()=>{
  const h=harness({timeout:180000,timeoutReason:undefined});
  h.child.emit('spawn');
  assert.equal(h.receipts[0].timeout_ms,180000);
  assert.ok(h.receipts[0].timeout_reason);
  complete(h);
  assert.equal((await h.result).value.text,'artifact');
  clean(h);
});

test('invalid timeout or selection fails before resolving or starting a process',async()=>{
  for (const settings of [
    {timeout:999}, {timeout:1000,timeoutReason:''},
    {timeout:600001}, {selection:{mode:'explicit',model:'bad model'}}
  ]) {
    const h=harness(settings);
    assert.ok((await h.result).error);
    assert.equal(h.calls.length,0);
    assert.equal(h.resolves,0);
    clean(h);
  }
});

test('unverified explicit Claude effort fails before executable resolution or launch',async()=>{
  const h=harness({host:'claude',selection:{mode:'explicit',model:'sonnet',effort:'high'}});
  assert.ok((await h.result).error);
  assert.equal(h.resolves,0);
  assert.equal(h.calls.length,0);
  assert.equal(h.receipts.length,0);
  assert.equal(h.child.prompt,undefined);
  assert.deepEqual(h.child.signals,[]);
  clean(h);
});

test('timeout retains cause, fences late output and escalates for resistant child',async()=>{
  const h=harness();
  h.child.emit('spawn');
  h.clock.move(1001000);
  assert.deepEqual(h.child.signals,['SIGTERM']);
  h.child.stdout.emit('data',codexOutput('too late'));
  h.child.emit('error',new Error('later error must not replace timeout'));
  h.clock.move(1003999);
  assert.deepEqual(h.child.signals,['SIGTERM']);
  h.clock.move(1004000);
  const result=await h.result;
  assert.equal(result.error.code,'ROLE_TIMEOUT');
  assert.equal(result.error.termination_confirmed,false);
  assert.deepEqual(h.child.signals,['SIGTERM','SIGKILL']);
  h.child.emit('close',0);
  h.child.stdout.emit('data',codexOutput('also too late'));
  assert.equal((await h.result).error,result.error);
  clean(h);
});

test('timeout followed by close confirms closure and cancels escalation',async()=>{
  const h=harness();
  h.child.emit('spawn');
  h.clock.move(1001000);
  h.child.emit('close',0);
  const result=await h.result;
  assert.equal(result.error.code,'ROLE_TIMEOUT');
  assert.equal(result.error.termination_confirmed,true);
  clean(h);
  h.clock.move(1005000);
  assert.deepEqual(h.child.signals,['SIGTERM']);
});

test('at and after deadline a delayed timer cannot allow successful close',async()=>{
  for (const at of [1001000,1001001,1005000]) {
    const h=harness();
    h.child.emit('spawn');
    h.child.stdout.emit('data',codexOutput('initial output'));
    h.clock.move(at,false);
    h.child.emit('close',0);
    const result=await h.result;
    assert.equal(result.error.code,'ROLE_TIMEOUT');
    assert.equal(result.error.termination_confirmed,true);
    assert.deepEqual(h.child.signals,[],'already closed child needs no signals');
    clean(h);
  }
});

test('output arriving at deadline triggers timeout even with delayed timer',async()=>{
  const h=harness({child:new Child({closeOnTerm:true})});
  h.child.emit('spawn');
  h.clock.move(1001000,false);
  complete(h,'late');
  assert.equal((await h.result).error.code,'ROLE_TIMEOUT');
  assert.deepEqual(h.child.signals,['SIGTERM']);
  clean(h);
});

test('pre-abort and abort during command resolution never start child',async()=>{
  const signal=new Signal();
  signal.abort();
  const h=harness({signal});
  assert.equal((await h.result).error.code,'ROLE_ABORTED');
  assert.equal(h.calls.length,0);
  assert.equal(h.resolves,0);
  clean(h);
  const resolvingSignal=new Signal();
  const r=harness({signal:resolvingSignal,resolveHook:()=>resolvingSignal.abort()});
  assert.equal((await r.result).error.code,'ROLE_ABORTED');
  assert.equal(r.calls.length,0);
  clean(r);
});

test('abort in spawn/listener gap stops child and prevents sending prompt',async()=>{
  const signal=new Signal();
  const h=harness({signal,spawnHook:()=>signal.abort()});
  assert.equal(h.child.prompt,undefined);
  assert.deepEqual(h.child.signals,['SIGTERM']);
  h.child.emit('spawn');
  assert.equal(h.receipts.length,0);
  h.child.emit('close',0);
  assert.equal((await h.result).error.code,'ROLE_ABORTED');
  clean(h);
});

test('cancellation before spawn, during execution and after timeout is monotonic',async()=>{
  for (const beforeSpawn of [true,false]) {
    const h=harness();
    if (!beforeSpawn) h.child.emit('spawn');
    h.signal.abort();
    h.signal.abort();
    h.child.stdout.emit('data',codexOutput('cancelled output'));
    h.child.emit('spawn');
    assert.equal(h.receipts.length,beforeSpawn ? 0 : 1);
    assert.deepEqual(h.child.signals,['SIGTERM']);
    h.clock.move(1003000);
    assert.deepEqual(h.child.signals,['SIGTERM','SIGKILL']);
    assert.equal((await h.result).error.code,'ROLE_ABORTED');
    clean(h);
  }
  const h=harness();
  h.child.emit('spawn');
  h.clock.move(1001000);
  h.signal.abort();
  h.child.emit('close',0);
  assert.equal((await h.result).error.code,'ROLE_TIMEOUT');
  clean(h);
});

test('startup limit neither creates execution receipt nor consumes execution allowance',async()=>{
  const h=harness();
  h.clock.move(1240000);
  assert.deepEqual(h.child.signals,['SIGTERM']);
  h.child.emit('spawn');
  assert.equal(h.receipts.length,0);
  h.clock.move(1243000);
  assert.equal((await h.result).error.code,'ROLE_STARTUP_TIMEOUT');
  assert.deepEqual(h.child.signals,['SIGTERM','SIGKILL']);
  clean(h);
  const late=harness();
  late.clock.move(1240000,false);
  late.child.emit('spawn');
  assert.equal(late.receipts.length,0);
  late.child.emit('close',0);
  assert.equal((await late.result).error.code,'ROLE_STARTUP_TIMEOUT');
  clean(late);
});

test('spawn errors and errors after spawn retain escalation until close',async()=>{
  for (const spawned of [false,true]) {
    const h=harness();
    if (spawned) h.child.emit('spawn');
    h.child.emit('error',new Error('fixture process error'));
    assert.deepEqual(h.child.signals,['SIGTERM']);
    h.child.emit('error',new Error('second error'));
    h.clock.move(1003000);
    const result=await h.result;
    assert.equal(result.error.code,'ROLE_PROCESS_ERROR');
    assert.match(result.error.message,/fixture process error/);
    assert.equal(h.receipts.length,spawned ? 1 : 0);
    assert.deepEqual(h.child.signals,['SIGTERM','SIGKILL']);
    clean(h);
  }
  const h=harness();
  h.child.emit('error',new Error('spawn failed'));
  h.child.emit('close',-2);
  assert.equal((await h.result).error.termination_confirmed,true);
  assert.equal(h.receipts.length,0);
  clean(h);
});

test('synchronous spawn failure has no timers, receipt or child signals',async()=>{
  const h=harness({spawnHook:()=>{throw new Error('sync spawn failure');}});
  assert.match((await h.result).error.message,/sync spawn failure/);
  assert.equal(h.receipts.length,0);
  assert.deepEqual(h.child.signals,[]);
  clean(h);
});

test('recording failure stops the spawned child and cannot publish success',async()=>{
  const h=harness({onSpawn:()=>{throw new Error('record unavailable');}});
  h.child.emit('spawn');
  assert.deepEqual(h.child.signals,['SIGTERM']);
  complete(h,'must be held');
  const result=await h.result;
  assert.equal(result.error.code,'ROLE_PROCESS_ERROR');
  assert.match(result.error.message,/record unavailable/);
  clean(h);
});

test('synchronous close during TERM/KILL settles once and removes timers',async()=>{
  for (const child of [new Child({closeOnTerm:true}),new Child({closeOnKill:true})]) {
    const h=harness({child});
    h.child.emit('spawn');
    h.signal.abort();
    if (!child.closeOnTerm) h.clock.move(1003000);
    const result=await h.result;
    assert.equal(result.error.code,'ROLE_ABORTED');
    assert.equal(result.error.termination_confirmed,true);
    assert.deepEqual(child.signals,child.closeOnTerm ? ['SIGTERM'] : ['SIGTERM','SIGKILL']);
    h.child.emit('close',0);
    assert.equal((await h.result).error,result.error);
    clean(h);
  }
});

test('output overflow, stream error and thrown signal request retain bounded failure',async()=>{
  const overflow=harness();
  overflow.child.emit('spawn');
  overflow.child.stdout.emit('data','x'.repeat(2000001));
  overflow.child.emit('close',0);
  assert.equal((await overflow.result).error.code,'ROLE_OUTPUT_LIMIT');
  clean(overflow);
  const stream=harness();
  stream.child.emit('spawn');
  stream.child.stdin.emit('error',new Error('input failed'));
  stream.child.emit('close',0);
  assert.equal((await stream.result).error.code,'ROLE_PROCESS_ERROR');
  clean(stream);
  const failedKill=harness();
  failedKill.child.kill=signal=>{failedKill.child.signals.push(signal); throw new Error('signal rejected');};
  failedKill.child.emit('spawn');
  failedKill.signal.abort();
  failedKill.clock.move(1003000);
  const result=await failedKill.result;
  assert.equal(result.error.code,'ROLE_ABORTED');
  assert.equal(result.error.termination_confirmed,false);
  assert.deepEqual(failedKill.child.signals,['SIGTERM','SIGKILL']);
  clean(failedKill);
});

test('early process exit and malformed output are failures with cleanup',async()=>{
  const before=harness();
  before.child.emit('close',0);
  assert.equal((await before.result).error.code,'ROLE_SPAWN_ERROR');
  assert.equal(before.receipts.length,0);
  clean(before);
  const bad=harness();
  bad.child.emit('spawn');
  bad.child.stdout.emit('data','invalid JSON');
  bad.child.emit('close',0);
  assert.ok((await bad.result).error);
  clean(bad);
  const exit=harness();
  exit.child.emit('spawn');
  exit.child.stderr.emit('data','fictional failure');
  exit.child.emit('close',1);
  assert.equal((await exit.result).error.code,'ROLE_EXIT_ERROR');
  clean(exit);
});

test('Codex and Claude launch/resume isolation and observations remain distinct',async()=>{
  const codex=commandArgs('codex',null,{mode:'explicit',model:'fictional-model',effort:'medium'});
  for (const value of ['--ignore-user-config','sandbox_mode="read-only"','approval_policy="never"','features.shell_tool=false','features.unified_exec=false','features.multi_agent=false','web_search="disabled"']) assert.ok(codex.includes(value));
  assert.deepEqual(commandArgs('codex','native').slice(0,2),['exec','resume']);
  assert.ok(codex.includes('model_reasoning_effort="medium"'));
  const selected={mode:'explicit',model:'sonnet'};
  const h=harness({host:'claude',nativeId:'fictional-session',selection:selected});
  assert.deepEqual(h.calls[0][1],commandArgs('claude','fictional-session',selected));
  const args=h.calls[0][1];
  assert.equal(args[args.indexOf('--tools')+1],'');
  assert.equal(args[args.indexOf('--setting-sources')+1],'');
  assert.equal(args[args.indexOf('--mcp-config')+1],'{"mcpServers":{}}');
  assert.equal(args[args.indexOf('--permission-mode')+1],'plan');
  assert.ok(args.includes('{"disableAllHooks":true}'));
  h.child.emit('spawn');
  h.child.stdout.emit('data',JSON.stringify({subtype:'success',result:'claude artifact',session_id:'fictional-session',modelUsage:{sonnet:{inputTokens:2,costUSD:0.01,secret:'discard'}}}));
  h.child.emit('close',0);
  const result=(await h.result).value;
  assert.equal(result.text,'claude artifact');
  assert.equal(result.model_evidence.scope,'session_cumulative_including_internal_calls');
  assert.equal(result.model_evidence.reported_effort,null);
  assert.equal(result.model_evidence.usage.sonnet.secret,undefined);
  clean(h);
  assert.equal(parseOutput('codex',codexOutput('text')).model_evidence.verification,'unverified');
  assert.deepEqual(parseArtifact('{"content":"fixture","messages":[],"notices":[]}'),{content:'fixture',messages:[],notices:[]});
  assert.throws(()=>parseArtifact('{"content":"fixture","messages":{}}'));
});


test('internal upgrade context wires a 30-minute spawn receipt and real execution timer',async()=>{
  const h=harness({timeout:1800000,timeoutContext:'upgrade-call'});
  h.clock.move(1100000);
  h.child.emit('spawn');
  assert.equal(h.receipts.length,1);
  assert.equal(h.receipts[0].timeout_ms,1800000);
  assert.equal(Date.parse(h.receipts[0].execution_started_at),1100000);
  assert.equal(Date.parse(h.receipts[0].execution_deadline_at),2900000);
  assert.equal(Date.parse(h.receipts[0].termination_deadline_at),2903000);
  assert.deepEqual([...h.clock.timers.values()].map(t=>t.at),[2900000]);
  h.clock.move(2899999);
  assert.deepEqual(h.child.signals,[]);
  h.clock.move(2900000);
  assert.deepEqual(h.child.signals,['SIGTERM']);
  h.clock.move(2903000);
  assert.equal((await h.result).error.code,'ROLE_TIMEOUT');
  assert.deepEqual(h.child.signals,['SIGTERM','SIGKILL']);
  clean(h);
});

test('upgrade context is explicit, bounded and uses overflow-safe lifecycle clocks',async()=>{
  for(const settings of [
    {timeout:1800000}, {timeout:1800000,timeoutContext:'unknown'},
    {timeout:1800001,timeoutContext:'upgrade-call'},
    {timeout:1800000,timeoutContext:'upgrade-call',clockStart:8640000000000000-1802999}
  ]) {
    const h=harness(settings);
    assert.ok((await h.result).error);
    assert.equal(h.resolves,0);assert.equal(h.calls.length,0);clean(h);
  }
  const h=harness({timeout:1800000,timeoutContext:'upgrade-call',clockStart:8640000000000000-1803000});
  h.child.emit('spawn');
  assert.equal(Date.parse(h.receipts[0].termination_deadline_at),8640000000000000);
  complete(h);assert.equal((await h.result).value.text,'artifact');clean(h);
  assert.throws(()=>normalizeTimeout({timeout_ms:1800000,timeout_reason:'ordinary'}));
  assert.equal(jobTimeoutState({status:'running',timeout_policy_version:1,timeout_ms:1800000,timeout_reason:'ordinary'},1000).state,'inspection');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeerExecutorIncarnationSource,assertOriginalPeerExecutorIncarnation as inspect} from '../plugins/soloco/runtime/peers/executor-incarnation.mjs';

// Fictional in-memory host observers establish source mechanics only. No ledger
// writes, child process, provider, model, account or native qualification occurs.
const code=expected=>error=>error?.code===expected;
const clone=value=>structuredClone(value);
function fixture(){
  const ledger={root:'/fictional/company',company_id:'fictional-company'},source=createPeerExecutorIncarnationSource(ledger);
  const value={task_id:'task-a',attempt_id:'attempt-a',context_sha256:'a'.repeat(64),principal_id:'cos-a',generation:3,native_id:'native-a',turn_id:'turn-a',process:{pid:12345,started_at:new Date().toISOString()},deadline_at_ms:Date.now()+60000};
  let observed=clone(value),calls=0;
  const read=()=>{calls++;return observed;},handle=source.observe(value,read);
  const select={ledger,task_id:value.task_id,attempt_id:value.attempt_id,context_sha256:value.context_sha256};
  return {ledger,source,value,handle,select,read,calls:()=>calls,set:value=>{observed=value;},inspect:()=>inspect(handle,select)};
}

test('an original source returns an opaque handle and deeply frozen exact DATA',()=>{
  const f=fixture();assert.equal(f.calls(),1);
  assert.equal(Object.getPrototypeOf(f.handle),null);assert.deepEqual(Reflect.ownKeys(f.handle),[]);assert(Object.isFrozen(f.handle));
  const result=f.inspect();assert.equal(f.calls(),2);assert.equal(result.protocol,'soloco-peer-executor-incarnation-v1');
  assert.equal(result.company_id,f.ledger.company_id);assert.equal(typeof result.incarnation_id,'string');assert(Number.isSafeInteger(result.runtime_generation));
  for(const key of Object.keys(f.value))assert.deepEqual(result[key],f.value[key]);
  assert(Object.isFrozen(result));assert(Object.isFrozen(result.process));
  assert.throws(()=>{result.process.pid=1;},TypeError);
  f.value.process.pid=999;assert.equal(f.inspect().process.pid,12345);
});

test('matching DATA, serialized handles, copies and Proxies cannot self-enroll',()=>{
  const f=fixture();let traps=0;
  const fake=new Proxy(f.handle,{get(){traps++;throw Error('unreachable');},getPrototypeOf(){traps++;throw Error('unreachable');}});
  for(const handle of [{...f.handle},JSON.parse(JSON.stringify(f.handle)),clone(f.inspect()),fake,null,undefined])assert.throws(()=>inspect(handle,f.select),code('EXECUTOR_INCARNATION_REQUIRED'));
  assert.equal(traps,0);assert.equal(f.inspect().task_id,'task-a');
});

test('foreign ledger, task, attempt or context is rejected and revokes that handle',()=>{
  for(const patch of [{ledger:{root:'/fictional/company',company_id:'fictional-company'}},{task_id:'task-b'},{attempt_id:'attempt-b'},{context_sha256:'b'.repeat(64)}]){
    const f=fixture();assert.throws(()=>inspect(f.handle,{...f.select,...patch}),code('EXECUTOR_INCARNATION_CHANGED'));
    assert.throws(f.inspect,code('EXECUTOR_INCARNATION_REVOKED'));
  }
});

test('revocation and stop are permanent; restarted sources use new internal generations',()=>{
  const f=fixture(),first=f.inspect(),second=f.source.observe(f.value,f.read);
  f.source.revoke(f.handle);assert.throws(f.inspect,code('EXECUTOR_INCARNATION_REVOKED'));
  assert.equal(inspect(second,f.select).task_id,'task-a');f.source.stop();f.source.stop();
  assert.throws(()=>inspect(second,f.select),code('EXECUTOR_INCARNATION_REVOKED'));
  assert.throws(()=>f.source.observe(f.value,f.read),code('EXECUTOR_INCARNATION_REVOKED'));
  const next=createPeerExecutorIncarnationSource(f.ledger),handle=next.observe(f.value,f.read),result=inspect(handle,f.select);
  assert.notEqual(result.incarnation_id,first.incarnation_id);assert(result.runtime_generation>first.runtime_generation);
  assert.throws(()=>next.revoke(second),code('EXECUTOR_INCARNATION_REQUIRED'));
});

test('every current source association field is immutable and drift latches revocation',()=>{
  const patches=[{task_id:'other'},{attempt_id:'other'},{context_sha256:'b'.repeat(64)},{principal_id:'other'},{generation:4},{native_id:'other'},{turn_id:'other'},{process:{pid:12346,started_at:new Date().toISOString()}},{deadline_at_ms:Date.now()+50000}];
  for(const patch of patches){const f=fixture();f.set({...clone(f.value),...patch});assert.throws(f.inspect,code('EXECUTOR_INCARNATION_CHANGED'));f.set(clone(f.value));assert.throws(f.inspect,code('EXECUTOR_INCARNATION_REVOKED'));}
});

test('ledger root/company replacement and accessor identities fail closed',()=>{
  for(const key of ['root','company_id']){const f=fixture();f.ledger[key]+='-changed';assert.throws(f.inspect,code('EXECUTOR_INCARNATION_CHANGED'));}
  const f=fixture();let hits=0;Object.defineProperty(f.ledger,'root',{get(){hits++;return '/fictional/company';}});
  assert.throws(f.inspect,code('EXECUTOR_INCARNATION_LEDGER'));assert.equal(hits,0);
  f.source.stop();
});

test('current observer errors preserve identity and are latched',()=>{
  const f=fixture(),failure=Error('original source failure');let fail=false;
  const handle=f.source.observe(f.value,()=>{if(fail)throw failure;return f.value;});fail=true;
  assert.throws(()=>inspect(handle,f.select),error=>error===failure);fail=false;
  assert.throws(()=>inspect(handle,f.select),code('EXECUTOR_INCARNATION_REVOKED'));
});

test('Promises and malformed current results cannot renew an incarnation',async()=>{
  for(const result of [Promise.resolve({}),Promise.reject(Error('observed rejection')),null,{...fixture().value,extra:true}]){
    const f=fixture();f.set(result);assert.throws(f.inspect,code(result instanceof Promise?'EXECUTOR_INCARNATION_ASYNC':'EXECUTOR_INCARNATION_DATA'));
    f.set(clone(f.value));assert.throws(f.inspect,code('EXECUTOR_INCARNATION_REVOKED'));
  }
  await Promise.resolve();
});

test('rejecting a Promise does not invoke its constructor or then accessors',()=>{
  const f=fixture(),value=Promise.resolve(undefined);let hits=0;
  Object.defineProperties(value,{constructor:{get(){hits++;throw Error('unreachable');}},then:{get(){hits++;throw Error('unreachable');}}});
  f.set(value);assert.throws(f.inspect,code('EXECUTOR_INCARNATION_ASYNC'));assert.equal(hits,0);
  f.set(clone(f.value));assert.throws(f.inspect,code('EXECUTOR_INCARNATION_REVOKED'));
});

test('closed DATA rejects accessors, proxies and coercion without executing them',()=>{
  const f=fixture();let hits=0;
  const accessor={...f.value};Object.defineProperty(accessor,'turn_id',{enumerable:true,get(){hits++;return 'turn-a';}});
  const proxy=new Proxy(f.value,{ownKeys(){hits++;throw Error('unreachable');},getPrototypeOf(){hits++;throw Error('unreachable');}});
  const coercion={...f.value,deadline_at_ms:{[Symbol.toPrimitive](){hits++;return Date.now()+1000;}}};
  for(const value of [accessor,proxy,coercion,{...f.value,process:{...f.value.process,extra:1}},{...f.value,context_sha256:'bad'}])assert.throws(()=>f.source.observe(value,()=>value),code('EXECUTOR_INCARNATION_DATA'));
  const selection={...f.select};Object.defineProperty(selection,'task_id',{enumerable:true,get(){hits++;return 'task-a';}});
  assert.throws(()=>inspect(f.handle,selection),code('EXECUTOR_INCARNATION_DATA'));assert.equal(hits,0);
});

test('mint checks the actual current observer and the fixed 120-second bound',()=>{
  const f=fixture();assert.throws(()=>f.source.observe(f.value,()=>({...f.value,turn_id:'different'})),code('EXECUTOR_INCARNATION_CHANGED'));
  for(const deadline_at_ms of [Date.now()-1,Date.now()])assert.throws(()=>f.source.observe({...f.value,deadline_at_ms},()=>f.value),code('EXECUTOR_INCARNATION_EXPIRED'));
  assert.throws(()=>f.source.observe({...f.value,deadline_at_ms:Date.now()+240000},()=>f.value),code('EXECUTOR_INCARNATION_DEADLINE'));
  const value={...f.value,deadline_at_ms:Date.now()+120000};assert(inspect(f.source.observe(value,()=>value),f.select));
});

test('expiry is checked after the current observer and cannot be renewed',async()=>{
  const f=fixture(),value={...f.value,deadline_at_ms:Date.now()+50};let calls=0;
  const handle=f.source.observe(value,()=>{calls++;return value;});await new Promise(resolve=>setTimeout(resolve,80));
  assert.throws(()=>inspect(handle,f.select),code('EXECUTOR_INCARNATION_EXPIRED'));assert.equal(calls,2);
  value.deadline_at_ms=Date.now()+60000;assert.throws(()=>inspect(handle,f.select),code('EXECUTOR_INCARNATION_REVOKED'));
});

test('stop or recursive inspection during current observation cannot yield a live receipt',()=>{
  const f=fixture();let stop=false;const handle=f.source.observe(f.value,()=>{if(stop)f.source.stop();return f.value;});stop=true;
  assert.throws(()=>inspect(handle,f.select),code('EXECUTOR_INCARNATION_REVOKED'));
  const g=fixture();let recurse=false,recursive;recursive=g.source.observe(g.value,()=>{if(recurse)assert.throws(()=>inspect(recursive,g.select),code('EXECUTOR_INCARNATION_REENTRANT'));return g.value;});recurse=true;
  assert.throws(()=>inspect(recursive,g.select),code('EXECUTOR_INCARNATION_REVOKED'));
});

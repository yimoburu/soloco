// Trusted host construction only. Neither this factory nor readCurrent may be
// offered as a model/MCP dependency. Reachability authenticates the source; this
// module does not qualify a native host or grant a task, lease, epoch or effect.
import {randomUUID} from 'node:crypto';
import {types} from 'node:util';

const PROTOCOL='soloco-peer-executor-incarnation-v1';
const MAX_RUNTIME_MS=120000;
const bootNonce=randomUUID(),handles=new WeakMap();
const now=Date.now,parseTime=Date.parse,apply=Reflect.apply;
const originalPromise=Promise,promisePrototype=Promise.prototype,promiseThen=Promise.prototype.then;
const speciesGetter=Object.getOwnPropertyDescriptor(Promise,Symbol.species).get;
let nextGeneration=0;
const associationKeys=['task_id','attempt_id','context_sha256','principal_id','generation','native_id','turn_id','process','deadline_at_ms'];
const selectorKeys=['ledger','task_id','attempt_id','context_sha256'];
const fail=code=>{throw Object.assign(Error(code),{code});};

function data(value,keys){
  if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)fail('EXECUTOR_INCARNATION_DATA');
  const descriptors=Object.getOwnPropertyDescriptors(value),actual=Reflect.ownKeys(descriptors);
  if(actual.length!==keys.length||actual.some(k=>typeof k!=='string'||!keys.includes(k)))fail('EXECUTOR_INCARNATION_DATA');
  for(const key of keys){const d=descriptors[key];if(!d||!Object.hasOwn(d,'value')||!d.enumerable)fail('EXECUTOR_INCARNATION_DATA');}
  return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
}
function text(value,max=300){
  if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0')||/[\ud800-\udfff]/u.test(value))fail('EXECUTOR_INCARNATION_DATA');
  return value;
}
function sha(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('EXECUTOR_INCARNATION_DATA');return value;}
function ledgerIdentity(ledger){
  if(!ledger||typeof ledger!=='object'||types.isProxy(ledger))fail('EXECUTOR_INCARNATION_LEDGER');
  const read=key=>{const d=Object.getOwnPropertyDescriptor(ledger,key);if(!d||!Object.hasOwn(d,'value'))fail('EXECUTOR_INCARNATION_LEDGER');return d.value;};
  return {root:text(read('root'),4000),company_id:text(read('company_id'))};
}
function association(value){
  const v=data(value,associationKeys),p=data(v.process,['pid','started_at']);
  for(const key of ['task_id','attempt_id','principal_id','native_id','turn_id'])text(v[key]);
  sha(v.context_sha256);
  if(!Number.isSafeInteger(v.generation)||v.generation<1||!Number.isSafeInteger(p.pid)||p.pid<1||!Number.isSafeInteger(v.deadline_at_ms))fail('EXECUTOR_INCARNATION_DATA');
  text(p.started_at,64);if(!Number.isFinite(parseTime(p.started_at)))fail('EXECUTOR_INCARNATION_DATA');
  return Object.freeze({...v,process:Object.freeze(p)});
}
function same(a,b){return associationKeys.every(key=>key==='process'?a.process.pid===b.process.pid&&a.process.started_at===b.process.started_at:a[key]===b[key]);}
function observePromiseRejection(value){
  // Native then still performs species lookup. Do not invoke a supplied
  // constructor/accessor/subclass while rejecting malformed async observers.
  const constructor=Object.getOwnPropertyDescriptor(promisePrototype,'constructor'),species=Object.getOwnPropertyDescriptor(originalPromise,Symbol.species);
  if(Object.getPrototypeOf(value)===promisePrototype&&!Object.hasOwn(value,'constructor')&&constructor?.value===originalPromise&&species?.get===speciesGetter)
    apply(promiseThen,value,[undefined,()=>{}]);
}
function current(record){
  const s=record.source;
  if(s.stopped||record.revoked)fail('EXECUTOR_INCARNATION_REVOKED');
  if(record.checking){record.revoked=true;fail('EXECUTOR_INCARNATION_REENTRANT');}
  record.checking=true;
  try{
    const before=ledgerIdentity(s.ledger);
    if(before.root!==s.root||before.company_id!==s.company_id)fail('EXECUTOR_INCARNATION_CHANGED');
    const value=apply(record.readCurrent,undefined,[]);
    if(types.isPromise(value)){
      record.revoked=true;observePromiseRejection(value);fail('EXECUTOR_INCARNATION_ASYNC');
    }
    const observed=association(value),after=ledgerIdentity(s.ledger);
    if(!same(observed,record.association)||after.root!==s.root||after.company_id!==s.company_id)fail('EXECUTOR_INCARNATION_CHANGED');
    if(s.stopped||record.revoked)fail('EXECUTOR_INCARNATION_REVOKED');
    if(record.association.deadline_at_ms<=now())fail('EXECUTOR_INCARNATION_EXPIRED');
  }catch(error){record.revoked=true;throw error;}
  finally{record.checking=false;}
}

/** Internal source seam: readCurrent is the original synchronous, no-I/O host
 * observer. Its provenance comes from the fixed production composition, never
 * from a caller-selected callback or matching DATA. Only the copied DATA below
 * is exposed; the issuer, source state and opaque handle remain private. */
export function createPeerExecutorIncarnationSource(ledger){
  const identity=ledgerIdentity(ledger);
  if(nextGeneration>=Number.MAX_SAFE_INTEGER)fail('EXECUTOR_INCARNATION_CAPACITY');
  const source={ledger,...identity,runtime_generation:++nextGeneration,issuer:randomUUID(),stopped:false};
  return Object.freeze({
    observe(value,readCurrent){
      if(source.stopped)fail('EXECUTOR_INCARNATION_REVOKED');
      if(typeof readCurrent!=='function'||types.isProxy(readCurrent))fail('EXECUTOR_INCARNATION_SOURCE');
      const observed=association(value),at=now();
      if(observed.deadline_at_ms<=at)fail('EXECUTOR_INCARNATION_EXPIRED');
      if(observed.deadline_at_ms-at>MAX_RUNTIME_MS)fail('EXECUTOR_INCARNATION_DEADLINE');
      const record={source,association:observed,readCurrent,revoked:false,checking:false};
      current(record);
      const handle=Object.freeze(Object.create(null));
      record.readback=Object.freeze({protocol:PROTOCOL,incarnation_id:bootNonce+':'+source.issuer+':'+randomUUID(),runtime_generation:source.runtime_generation,company_id:source.company_id,...observed});
      handles.set(handle,record);return handle;
    },
    revoke(handle){
      const record=handles.get(handle);
      if(!record||record.source!==source)fail('EXECUTOR_INCARNATION_REQUIRED');
      record.revoked=true;
    },
    stop(){source.stopped=true;}
  });
}

export function assertOriginalPeerExecutorIncarnation(handle,selection){
  const record=handles.get(handle);
  if(!record)fail('EXECUTOR_INCARNATION_REQUIRED');
  try{
    const v=data(selection,selectorKeys),a=record.association;
    text(v.task_id);text(v.attempt_id);sha(v.context_sha256);
    if(v.ledger!==record.source.ledger||v.task_id!==a.task_id||v.attempt_id!==a.attempt_id||v.context_sha256!==a.context_sha256)fail('EXECUTOR_INCARNATION_CHANGED');
    current(record);return record.readback;
  }catch(error){record.revoked=true;throw error;}
}

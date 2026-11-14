// SYNTHETIC predecessor for the historical bootstrap state-machine fixture.
// It checks only this fixture's disposable ledger and paired bootstrap rows.
// It proves no genuine origin, global execution history, Native closure or
// production capacity, and cannot issue a process-launch capability.
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {PeerLedger,canonical,peerDigest,originalPeerExecutionCustodyFrom} from '../plugins/soloco/runtime/peers/ledger.mjs';

const ledgers=new WeakMap(),aliases=new WeakMap();
const need=(ok,code='SYNTHETIC_BOOTSTRAP_INVENTORY_REQUIRED')=>{if(!ok)throw Object.assign(Error(code),{code});};
const same=(a,b)=>canonical(a)===canonical(b);
const hash=text=>createHash('sha256').update(text).digest('hex');
const ref=row=>({family:'work_items',id:row.id,revision:row.revision,sha256:row.sha256});
function closed(value,keys){
 need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors);
 need(names.length===keys.length&&names.every(key=>typeof key==='string'&&keys.includes(key)&&descriptors[key].enumerable&&Object.hasOwn(descriptors[key],'value')));
 return Object.fromEntries(names.map(key=>[key,descriptors[key].value]));
}
function registered(ledger){
 const r=ledgers.get(ledger);need(r&&Object.getPrototypeOf(ledger)===PeerLedger.prototype);
 for(const key of ['root','company_id','directory','db'])need(Object.getOwnPropertyDescriptor(ledger,key)?.value===r.connection[key]);
 return r;
}
export function registerSyntheticBootstrapInventoryLedger(ledger){
 need(ledger&&!types.isProxy(ledger)&&Object.getPrototypeOf(ledger)===PeerLedger.prototype&&!ledgers.has(ledger));
 const connection=Object.fromEntries(['root','company_id','directory','db'].map(key=>[key,Object.getOwnPropertyDescriptor(ledger,key)?.value]));
 ledgers.set(ledger,{connection,launches:new Map()});
 // The existing expiry test replaces ONLY raw.put with a clock observer. Keep
 // its genuine raw reader/loan rather than accepting arbitrary provider DATA.
 const original=ledger.guardedWrite;
 ledger.guardedWrite=function(type,principal,callback,terminal){
  need(this===ledger);registered(ledger);
  return Reflect.apply(original,this,[type,principal,raw=>{
   aliases.set(raw.get,{ledger,raw,loan:originalPeerExecutionCustodyFrom(ledger,raw)});
   return callback(raw);
  },terminal]);
 };
}
function loanFrom(ledger,tx){
 registered(ledger);
 try{return originalPeerExecutionCustodyFrom(ledger,tx);}catch(error){
  const get=tx&&!types.isProxy(tx)&&Object.getOwnPropertyDescriptor(tx,'get'),alias=get&&Object.hasOwn(get,'value')&&aliases.get(get.value);
  if(!alias||alias.ledger!==ledger)throw error;
  const actual=Object.getOwnPropertyDescriptors(alias.raw),candidate=Object.getOwnPropertyDescriptors(tx);
  need(Reflect.ownKeys(candidate).length===Reflect.ownKeys(actual).length);
  for(const key of Reflect.ownKeys(actual))need(candidate[key]&&Object.hasOwn(candidate[key],'value')&&(key==='put'?typeof candidate[key].value==='function':candidate[key].value===actual[key].value));
  alias.loan.assert();return alias.loan;
 }
}
function exactCurrent(tx,reference){
 const r=closed(reference,['family','id','revision','sha256']);
 need(r.family==='work_items'&&typeof r.id==='string'&&r.id.length>0&&r.revision===1&&/^[a-f0-9]{64}$/.test(r.sha256));
 const row=tx.get(r.family,r.id);need(row&&same(ref(row),r)&&peerDigest(row.value)===r.sha256);return row;
}
function pair(ledger,tx,reference){
 const admission=exactCurrent(tx,reference),a=admission.value,b=a.binding;
 need(a.kind==='bootstrap_membership_admission'&&a.protocol==='peer-bootstrap-membership-admission-v1'&&b?.protocol==='peer-bootstrap-membership-binding-v1');
 need(same(b.connection,Object.fromEntries(['root','company_id','directory'].map(key=>[key,ledger[key]])))&&['reconstruction','review'].includes(b.phase));
 const phase=tx.get('work_items','membership-phase:'+b.enrollment_id+':'+b.phase),slot=tx.get('slots','membership-execution:'+b.attempt_id),effect=tx.get('effects','membership-execution:'+b.attempt_id);
 need(phase&&slot&&effect&&phase.value.bootstrap_protocol==='peer-bootstrap-membership-phase-v1'&&phase.value.kind==='membership_phase'&&same(phase.value.admission_ref,reference));
 need(phase.value.membership_id===b.enrollment_id&&phase.value.phase===b.phase&&phase.value.attempt_id===b.attempt_id&&phase.value.execution_id===slot.id&&same(phase.value.principal_ref,b.principal_ref)&&same(phase.value.context_ref,b.context_ref));
 const unit={kind:'membership_execution',membership_id:b.enrollment_id,principal_id:b.principal_ref.id,attempt_id:b.attempt_id};
 for(const row of [slot,effect])for(const [key,value]of Object.entries(unit))need(row.value[key]===value);
 need(['reserved','running','unknown','closed'].includes(phase.value.status)&&['active','unknown','released'].includes(slot.value.status));
 if(slot.value.status==='released')need(phase.value.status==='closed'&&slot.value.termination_confirmed===true&&effect.value.status==='succeeded'&&effect.value.termination_confirmed===true&&phase.value.result_ref&&same(slot.value.result_ref,phase.value.result_ref)&&same(effect.value.result_ref,phase.value.result_ref));
 else need(phase.value.status!=='closed'&&effect.value.termination_confirmed===false&&effect.value.status===(slot.value.status==='unknown'?'unknown':'reserved'));
 const context=exactCurrent(tx,b.context_ref);need(context.value.kind==='membership_context'&&typeof context.value.text==='string'&&context.value.sha256===b.context_sha256&&hash(context.value.text)===b.context_sha256,'SYNTHETIC_BOOTSTRAP_CONTEXT_CHECK_REQUIRED');
 return {admission,phase,slot,effect};
}
function inspect(ledger,tx,options){
 need(options&&typeof options==='object'&&!types.isProxy(options));const stage=Object.getOwnPropertyDescriptor(options,'stage');need(stage&&Object.hasOwn(stage,'value'));
 const value=closed(options,stage.value==='existing'?['stage','admission_ref']:['stage']);need(['reserve','existing'].includes(value.stage));
 const loan=loanFrom(ledger,tx),company=tx.get('control','company'),cap=company?.value.policy?.worker_cap;
 need(company?.value.protocol==='peer-cos-v1'&&Number.isSafeInteger(cap)&&cap>0&&cap<=3);
 loan.assert();const occupied=ledger.query("SELECT COUNT(*) AS occupied FROM peer_rows WHERE family='slots' AND status IN ('active','unknown')").get().occupied;loan.assert();
 need(Number.isSafeInteger(occupied)&&occupied>=0&&occupied<=cap,'CAPACITY_BUSY');if(value.stage==='reserve')need(occupied<cap,'CAPACITY_BUSY');
 const own=value.stage==='existing'?pair(ledger,tx,value.admission_ref):null;loan.assert();
 return {loan,pair:own,facts:Object.freeze({protocol:'SYNTHETIC-bootstrap-inventory-predecessor-v1',synthetic:true,genuine_origin_proven:false,authority_issued:false,worker_cap:cap,occupied,remaining:cap-occupied,own_reservation:own?{admission_ref:structuredClone(value.admission_ref),occupied:own.slot.value.status!=='released'}:null})};
}
export function assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom(ledger,tx,options){return inspect(ledger,tx,options).facts;}
export function assertOriginalPeerMaintenanceExecutionCapacityFrom(ledger,options){
 registered(ledger);need(!ledger.inTransaction);return Reflect.apply(PeerLedger.prototype.read,ledger,[tx=>inspect(ledger,tx,options).facts]);
}
export function prepareOriginalPeerExecutionLaunchFrom(ledger,tx,options){
 const {admission_ref}=closed(options,['admission_ref']),checked=inspect(ledger,tx,{stage:'existing',admission_ref}),{loan,pair:rows}=checked;
 need(loan.phase==='raw'&&loan.write&&!loan.external&&loan.type==='membership/admit'&&rows.phase.value.status==='reserved'&&rows.slot.value.status==='active');
 for(const row of Object.values(rows))need(row.created_seq===loan.sequence&&row.revision===1);
 const launches=registered(ledger).launches,key=canonical(admission_ref);need(!launches.has(key));
 const marker=Object.freeze({protocol:'SYNTHETIC-bootstrap-no-launch-marker-v1',authority_issued:false}),state={marker,status:'pending'};
 launches.set(key,state);loan.onCommit(()=>{state.status='committed';});loan.onRollback(()=>{state.status='rolled-back';});return marker;
}
export function assertOriginalOrdinaryTaskSourceTupleFrom(){throw Object.assign(Error('Ordinary-task source tuple is unavailable in the synthetic bootstrap fixture'),{code:'SYNTHETIC_BOOTSTRAP_ORDINARY_TUPLE_UNAVAILABLE'});}

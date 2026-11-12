import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {digest} from '../plugins/soloco/runtime/peers/model.mjs';
import {PEER_OWNER_CONTEXT_POOL_INSTRUCTION} from '../plugins/soloco/runtime/peers/owner-context-pool.mjs';
import {ownerGateFixture,beginOwnerGate,disposeOwnerGateFixture} from './peer-owner-operating-gate-fixture.mjs';
import {logicalSQLState} from './peer-task-effects-fixture.mjs';

// Real source core and P1 writes, with ONLY the deployment/preflight seam
// relocated to a fixed SYNTHETIC WeakMap issuer. This is neither an actual
// native wire/profile qualification nor an authenticated company operation.
test.after(disposeOwnerGateFixture);
const code=expected=>error=>error?.code===expected;
const peers=fileURLToPath(new URL('../plugins/soloco/runtime/peers/',import.meta.url));
const url=value=>pathToFileURL(value).href;
async function relocated(t,{missing=false,withoutPoolInstruction=false}={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-owner-wire-preflight-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const deployment=path.join(directory,'deployment.mjs');
  const common=`import {createHash} from 'node:crypto';
import {PEER_OWNER_CONTEXT_POOL_INSTRUCTION} from ${JSON.stringify(url(path.join(peers,'owner-context-pool.mjs')))};
const hash=value=>createHash('sha256').update(value).digest('hex');
export const OWNER_MAINTENANCE_INSTRUCTION='SYNTHETIC fixed owner-wire source instruction. '+${withoutPoolInstruction?"''":"PEER_OWNER_CONTEXT_POOL_INSTRUCTION"};
export function inspectOriginalOwnerMaintenanceSupport(){return {protocol:'peer-owner-maintenance-assignment-v1',bridge_sha256:'a'.repeat(64),synthetic_source_test:true};}
`;
  const issuer=`const plans=new WeakMap(),calls=[];let failure=null,inspectionOverride=null;
export function setFailure(value){failure=value;}
export function setInspectionOverride(value){inspectionOverride=value;}
export function observedPreflights(){return calls.map(value=>({...value}));}
export function preflightOriginalOwnerMaintenanceContext({text,native_id}){
 if(failure)throw failure;
 const input=OWNER_MAINTENANCE_INSTRUCTION+'\\n'+text,frame=JSON.stringify({kind:'owner-maintenance',native_id,input}),rpc=JSON.stringify({jsonrpc:'2.0',id:1,method:'owner',params:{frame}});
 if(Buffer.byteLength(input)>100000||Buffer.byteLength(rpc)>4000000)throw Object.assign(Error('SYNTHETIC wire capacity'),{code:'SYNTHETIC_WIRE_CAPACITY'});
 const commitment={context_sha256:hash(text),native_id,instruction_sha256:hash(OWNER_MAINTENANCE_INSTRUCTION),frame_sha256:hash(frame),recipe_sha256:hash('SYNTHETIC fixed owner-wire recipe'),frame_bytes:100000,wire_bytes:4000000,input_utf8_bytes:Buffer.byteLength(input),whole_rpc_utf8_bytes:Buffer.byteLength(rpc)},plan=Object.freeze(Object.create(null));
 plans.set(plan,commitment);calls.push({plan,text,native_id});return plan;
}
export function inspectOriginalOwnerMaintenancePreflight(plan){if(!plans.has(plan))throw Object.assign(Error('Original SYNTHETIC wire plan required'),{code:'SYNTHETIC_WIRE_ORIGINAL_REQUIRED'});return {...structuredClone(plans.get(plan)),...(inspectionOverride??{})};}
`;
  fs.writeFileSync(deployment,common+(missing?'':issuer));
  let source=fs.readFileSync(path.join(peers,'owner-handover.mjs'),'utf8');
  source=source.replace(/(['"])(\.\/[^'"]+\.mjs)\1/g,(_match,_quote,relative)=>JSON.stringify(url(relative==='./context-component-deployment.mjs'?deployment:path.join(peers,relative))));
  const coreFile=path.join(directory,'owner.mjs');fs.writeFileSync(coreFile,source);
  return {core:await import(url(coreFile)),deployment:await import(url(deployment))};
}
function countRawPuts(f){
  const guarded=f.ledger.guardedWrite;let calls=0;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){return Reflect.apply(guarded,this,[type,principal,raw=>callback(Object.freeze({...raw,put(...args){calls++;return raw.put(...args);}})),terminal]);};
  return {get calls(){return calls;},restore:()=>{f.ledger.guardedWrite=guarded;}};
}
function unchangedBeforeFirstPut(f,operation,predicate){
  const before=logicalSQLState(f),observed=countRawPuts(f);
  try{assert.throws(operation,predicate);}finally{observed.restore();}
  assert.equal(observed.calls,0,'preflight failure precedes every physical P1 mutation');
  assert.deepEqual(logicalSQLState(f),before);
}
function reconstructed(t,core){const f=ownerGateFixture(t,{module:core});beginOwnerGate(f);f.reconstruct();return f;}

test('missing fixed preflight exports hold begin before revocation or any P1 put',async t=>{
  const {core}=await relocated(t,{missing:true}),f=ownerGateFixture(t,{module:core});f.pause();
  unchangedBeforeFirstPut(f,()=>f.begin(),code('OWNER_WIRE_PREFLIGHT_UNAVAILABLE'));
  const founder=f.get('principals','founder');assert.equal(founder.value.status,'active');assert.equal(founder.value.legacy_owner.epoch,7);
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

test('a fixed instruction without the exact lossless pool decoder holds before custody writes',async t=>{
  const {core,deployment}=await relocated(t,{withoutPoolInstruction:true}),f=ownerGateFixture(t,{module:core});f.pause();
  assert.equal(deployment.OWNER_MAINTENANCE_INSTRUCTION.includes(PEER_OWNER_CONTEXT_POOL_INSTRUCTION),false);
  unchangedBeforeFirstPut(f,()=>f.begin(),code('OWNER_WIRE_INSTRUCTION_CHANGED'));
  assert.equal(f.get('principals','founder').value.status,'active');
});

test('the original begin preflight failure retains identity and leaves the outgoing owner untouched',async t=>{
  const {core,deployment}=await relocated(t),f=ownerGateFixture(t,{module:core});f.pause();
  const cause=Error('Original fixed source framing cause.'),failure=Object.assign(Error('Original fixed source framing error.',{cause}),{code:'SYNTHETIC_WIRE_CAPACITY'});deployment.setFailure(failure);
  unchangedBeforeFirstPut(f,()=>f.begin(),error=>{assert.equal(error,failure);assert.equal(error.cause,cause);return true;});
  assert.equal(f.get('principals','founder').value.legacy_owner.epoch,7);assert.equal(f.get('control','company').value.owner_handover,undefined);
});

test('exact admission preflight failure occurs before its first put, slot or model charge',async t=>{
  const {core,deployment}=await relocated(t),f=reconstructed(t,core),beforeGrant=f.get('grants','owner-review-grant'),beforeInfo=f.incoming.inspect({epoch:8});
  const cause=Error('Original admission framing cause.'),member=Error('Original framing member.'),failure=new AggregateError([member],'Original fixed admission framing failure.',{cause});deployment.setFailure(failure);
  unchangedBeforeFirstPut(f,()=>core.prepareOriginalPeerOwnerMaintenance(f.incoming,{operation_id:f.op(),epoch:8}),error=>{assert.equal(error,failure);assert.equal(error.cause,cause);assert.equal(error.errors[0],member);return true;});
  assert.deepEqual(f.get('grants','owner-review-grant'),beforeGrant);assert.equal(f.get('control','usage'),null);
  assert.equal(f.incoming.inspect({epoch:8}).used_review_calls,beforeInfo.used_review_calls);
});

test('mismatched inspected wire commitments cannot consume an otherwise valid admission',async t=>{
  for(const override of [{context_sha256:'0'.repeat(64)},{native_id:'replacement-native'},{instruction_sha256:'0'.repeat(64)},{frame_bytes:99999},{input_utf8_bytes:100001},{whole_rpc_utf8_bytes:4000001}]){
    const {core,deployment}=await relocated(t),f=reconstructed(t,core);deployment.setInspectionOverride(override);
    unchangedBeforeFirstPut(f,()=>core.prepareOriginalPeerOwnerMaintenance(f.incoming,{operation_id:f.op(),epoch:8}),code('OWNER_WIRE_PREFLIGHT_CHANGED'));
    assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.incoming.inspect({epoch:8}).used_review_calls,0);
  }
});

test('actual source admission retains the original opaque plan and exact canonical context commitment',async t=>{
  const {core,deployment}=await relocated(t),f=reconstructed(t,core),operation_id=f.op();
  const cap=core.prepareOriginalPeerOwnerMaintenance(f.incoming,{operation_id,epoch:8}),binding=core.inspectOriginalPeerOwnerMaintenance(cap),plan=core.originalPeerOwnerMaintenanceWirePlan(cap),framing=core.prepareOriginalPeerOwnerMaintenanceContext(cap),call=deployment.observedPreflights().at(-1),commitment=deployment.inspectOriginalOwnerMaintenancePreflight(plan);
  assert.equal(plan,call.plan);assert.equal(core.originalPeerOwnerMaintenanceWirePlan(cap),plan);
  assert.deepEqual(binding.wire_commitment,commitment);assert.deepEqual(framing.wire_commitment,commitment);
  assert.equal(call.text,framing.text);assert.equal(canonical(JSON.parse(framing.text)),framing.text);
  assert.equal(commitment.context_sha256,digest(framing.text));assert.equal(framing.sha256,commitment.context_sha256);assert.equal(commitment.native_id,binding.native_id);
  assert.equal(commitment.instruction_sha256,digest(deployment.OWNER_MAINTENANCE_INSTRUCTION));
  assert.equal(commitment.input_utf8_bytes,Buffer.byteLength(deployment.OWNER_MAINTENANCE_INSTRUCTION+'\n'+framing.text));
  assert(commitment.input_utf8_bytes<=commitment.frame_bytes&&commitment.whole_rpc_utf8_bytes<=commitment.wire_bytes);
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,1);assert.equal(f.get('control','usage').value.model_calls,1);
  const phase=f.get('work_items',binding.admission_ref.id.replace('admission:','phase:'));assert.deepEqual(phase.value.reads,[]);
  const before=logicalSQLState(f);assert.equal(core.prepareOriginalPeerOwnerMaintenance(f.incoming,{operation_id,epoch:8}),cap);assert.deepEqual(logicalSQLState(f),before);
});

test('JSON, cloned plans and mutable returned DATA cannot replace the original private plan',async t=>{
  const {core,deployment}=await relocated(t),f=reconstructed(t,core),cap=core.prepareOriginalPeerOwnerMaintenance(f.incoming,{operation_id:f.op(),epoch:8});
  const plan=core.originalPeerOwnerMaintenanceWirePlan(cap),original=deployment.inspectOriginalOwnerMaintenancePreflight(plan),binding=core.inspectOriginalPeerOwnerMaintenance(cap),framing=core.prepareOriginalPeerOwnerMaintenanceContext(cap),before=logicalSQLState(f);
  for(const fake of [{},structuredClone(plan),{...plan},copyData(original)])assert.throws(()=>deployment.inspectOriginalOwnerMaintenancePreflight(fake),code('SYNTHETIC_WIRE_ORIGINAL_REQUIRED'));
  assert.throws(()=>core.originalPeerOwnerMaintenanceWirePlan({...cap}),code('OWNER_MAINTENANCE_ORIGINAL_REQUIRED'));
  assert.throws(()=>core.prepareOriginalPeerOwnerMaintenance(f.incoming,{operation_id:f.op(),epoch:8,wire_plan:plan}),code('OWNER_INPUT'));
  binding.wire_commitment.native_id='forged';framing.wire_commitment.context_sha256='0'.repeat(64);framing.text='caller-selected replacement';
  assert.deepEqual(deployment.inspectOriginalOwnerMaintenancePreflight(plan),original);assert.deepEqual(core.inspectOriginalPeerOwnerMaintenance(cap).wire_commitment,original);
  assert.equal(core.prepareOriginalPeerOwnerMaintenanceContext(cap).sha256,original.context_sha256);assert.equal(core.originalPeerOwnerMaintenanceWirePlan(cap),plan);
  assert.deepEqual(logicalSQLState(f),before);
});
const copyData=value=>JSON.parse(canonical(value));

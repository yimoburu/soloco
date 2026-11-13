// Fixed original maintenance routes. Every purpose retains its own original
// admission, wire plan, authority, budget and completion grammar. Source support never issues authority.
import fs from 'node:fs';
import path from 'node:path';
import {types} from 'node:util';
import {canonical,peerDigest} from './ledger.mjs';
import {loadOriginalSelectedPackagedPeerBridge,inspectOriginalInputFrontierSupport} from './context-component-deployment.mjs';
import {createPolicySupervisor} from './policy-supervisor.mjs';
import {prepareOriginalProtectedInputFrontierLaunch,requestOriginalProtectedCodexStop} from './protected-codex-domain.mjs';
import {originalPeerInputFrontierMaintenanceLedger,prepareOriginalPeerInputFrontier,inspectOriginalPeerInputFrontier,originalPeerInputFrontierPreflight,completeOriginalPeerInputFrontier,holdOriginalPeerInputFrontier,recordOriginalPeerInputFrontierLateEvidence} from './input-frontier-maintenance.mjs';
import {runOriginalInputFrontierHost} from './input-frontier-host.mjs';
import * as originHost from './origin-maintenance-host.mjs';
import * as originRange from './origin-maintenance.mjs';
import * as originSeal from './origin-frontier-seal.mjs';
import * as ownerReview from './owner-handover.mjs';

const fail=code=>{throw Object.assign(Error(code),{code});};
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const same=(a,b)=>canonical(a)===canonical(b);
let inventory;
async function originalInventory(){
 // Deliberately no job-count, Source-generation journal, fresh zero, blanket
 // UNKNOWN ban or same-UID file handle masquerading as launch coverage. The
 // genuinely original producer is a SEPARATE prerequisite and is absent from
 // this Source cut. Its absence must stop BEFORE admission or process birth.
 const file=new URL('./prospective-local-worker-inventory-producer.mjs',import.meta.url),entry=fs.lstatSync(file,{throwIfNoEntry:false});
 if(!entry?.isFile()||entry.isSymbolicLink())fail('FRONTIER_ORIGINAL_EXECUTION_INVENTORY_SOURCE_REQUIRED');
 inventory??=await import(file.href);
 if(typeof inventory.assertOriginalPeerMaintenanceExecutionCapacityFrom!=='function')fail('FRONTIER_ORIGINAL_EXECUTION_INVENTORY_SOURCE_REQUIRED');return inventory;
}
async function capacity(ledger,stage,cap){
 const source=await originalInventory();
 // This fixed source interface must authenticate its actual ledger, original
 // admission/launch history and maintenance-unit mapping, rather than trust a
 // JSON census. A known conservative UNKNOWN occupancy remains occupied.
 const result=source.assertOriginalPeerMaintenanceExecutionCapacityFrom(ledger,{stage,...(cap?{admission_ref:inspectOriginalPeerInputFrontier(cap).admission_ref}:{})});
 if(!plain(result)||result.protocol!=='original-local-execution-inventory-v1'||result.retained_row_census_complete!==true||result.admission_launch_coverage_complete!==true||result.cardinality_known!==true||result.unit!=='new-origin-maintenance-model-invocation'||!Number.isSafeInteger(result.occupied)||result.occupied<0||!Number.isSafeInteger(result.remaining)||result.remaining<0||stage==='reserve'&&result.remaining<1)fail('FRONTIER_ORIGINAL_EXECUTION_INVENTORY_UNQUALIFIED');return result;
}
function directory(name,exclusive=false){
 if(!path.isAbsolute(name)||path.resolve(name)!==name)fail('FRONTIER_LAUNCH_DIRECTORY');
 for(let p=name;;p=path.dirname(p)){const s=fs.lstatSync(p,{throwIfNoEntry:false});if(s?.isSymbolicLink())fail('FRONTIER_LAUNCH_DIRECTORY');if(p===path.dirname(p))break;}
 try{fs.mkdirSync(name,{mode:0o700});}catch(e){if(e.code!=='EEXIST'||exclusive)throw e;}
 const s=fs.lstatSync(name);if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o777)!==0o700||fs.realpathSync(name)!==name)fail('FRONTIER_LAUNCH_DIRECTORY');return name;
}
export async function runOriginalPeerInputFrontier(api,input){
 if(arguments.length!==2||types.isProxy(input)||!plain(input))fail('FRONTIER_LAUNCH_INPUT');const ds=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(ds);if(keys.length!==4||keys.some(k=>typeof k!=='string'||!['frontier_id','node_id','operation_id','stage'].includes(k)||!ds[k].enumerable||!Object.hasOwn(ds[k],'value')))fail('FRONTIER_LAUNCH_INPUT');input=Object.fromEntries(keys.map(k=>[k,ds[k].value]));if(!['produce','review'].includes(input.stage))fail('FRONTIER_LAUNCH_INPUT');
 const ledger=originalPeerInputFrontierMaintenanceLedger(api);await capacity(ledger,'reserve');
 await loadOriginalSelectedPackagedPeerBridge();inspectOriginalInputFrontierSupport();
 const owner=Symbol('original-input-frontier-launch');let cap,launch,finished=false;
 try{
  // Existing service performs full fixed interpreter/whole-RPC preflight before
  // FIRST put and spends exactly one existing phase unit, including on failure.
  // There is no second prepare/admit, recovery loop or HTTP-count conversion.
  cap=prepareOriginalPeerInputFrontier(api,input);const admitted=inspectOriginalPeerInputFrontier(cap),preflight=originalPeerInputFrontierPreflight(cap);
  await capacity(ledger,'existing',cap);
  const base=directory(path.join(ledger.directory,'peer-execution')),frontiers=directory(path.join(base,'input-frontier')),own=directory(path.join(frontiers,peerDigest(admitted.admission_ref)),true),state=directory(path.join(own,'state'),true),scratch=directory(path.join(own,'scratch'),true),supervisor=createPolicySupervisor({owner,directory:own});
  launch=await prepareOriginalProtectedInputFrontierLaunch(owner,supervisor,{cwd:ledger.root,read_paths:[],state_root:state,scratch_root:scratch},preflight);
  await capacity(ledger,'existing',cap);
  const observed=await runOriginalInputFrontierHost(owner,launch,api,cap);
  if(observed.error||!observed.drain){
   const held=holdOriginalPeerInputFrontier(cap,{error:observed.error??'FRONTIER_ORIGINAL_DRAIN_REQUIRED'});finished=true;
   const late=observed.diagnostic?recordOriginalPeerInputFrontierLateEvidence(cap,observed.diagnostic):null;
   return {protocol:'peer-input-frontier-launch-result-v1',...held,late_evidence:late,qualified:false,attempt_reusable:false};
  }
  await capacity(ledger,'existing',cap);const result=await completeOriginalPeerInputFrontier(cap,observed.drain);finished=true;
  return {protocol:'peer-input-frontier-launch-result-v1',...result,native_qualified:false,attempt_reusable:false};
 }catch(error){
  if(launch)try{requestOriginalProtectedCodexStop(owner,launch);}catch{}
  if(cap&&!finished){const held=holdOriginalPeerInputFrontier(cap,{error:typeof error?.code==='string'?error.code:'FRONTIER_LAUNCH_UNKNOWN'});finished=true;return {protocol:'peer-input-frontier-launch-result-v1',...held,qualified:false,attempt_reusable:false};}
  throw error;
 }
}

// Finite original SOURCE descriptors only; no caller-supplied transport,
// profile, validator, proof or factory can select a maintenance route.
const RANGE=Object.freeze({name:'origin-range',result:'peer-origin-maintenance-launch-result-v1',ledger:originRange.originalPeerOriginMaintenanceLedger,prepare:originRange.prepareOriginalPeerOriginMaintenance,inspect:originRange.inspectOriginalPeerOriginMaintenance,preflight:originRange.originalPeerOriginMaintenancePreflight,support:originHost.inspectOriginalOriginMaintenanceSupport,launch:originHost.prepareOriginalProtectedOriginMaintenanceLaunch,host:originHost.runOriginalOriginMaintenanceHost,complete:originRange.completeOriginalPeerOriginMaintenance,hold:originRange.holdOriginalPeerOriginMaintenance,late:originRange.recordOriginalPeerOriginLateEvidence});
const SEAL=Object.freeze({name:'origin-frontier-seal',result:'peer-origin-frontier-seal-launch-result-v1',ledger:originSeal.originalPeerOriginFrontierSealLedger,prepare:originSeal.prepareOriginalPeerOriginFrontierSeal,inspect:originSeal.inspectOriginalPeerOriginFrontierSeal,preflight:originSeal.originalPeerOriginFrontierSealPreflight,support:originHost.inspectOriginalOriginFrontierSealSupport,launch:originHost.prepareOriginalProtectedOriginFinalReviewLaunch,host:originHost.runOriginalOriginFrontierSealHost,complete:originSeal.completeOriginalPeerOriginFrontierSeal,hold:originSeal.holdOriginalPeerOriginFrontierSeal,late:originSeal.recordOriginalPeerOriginFrontierSealLateEvidence});
const OWNER=Object.freeze({name:'owner-fresh-review',result:'peer-owner-maintenance-fresh-launch-result-v1',ledger:ownerReview.originalPeerOwnerLifecycleLedger,prepare:ownerReview.prepareOriginalPeerOwnerMaintenanceFreshReview,inspect:ownerReview.inspectOriginalPeerOwnerMaintenance,preflight:ownerReview.originalPeerOwnerMaintenanceWirePlan,support:originHost.inspectOriginalOwnerMaintenanceFreshSupport,launch:originHost.prepareOriginalProtectedOriginFinalReviewLaunch,host:originHost.runOriginalOwnerMaintenanceFreshHost,complete:ownerReview.completeOriginalPeerOwnerMaintenance,hold:ownerReview.holdOriginalPeerOwnerMaintenance,late:ownerReview.recordOriginalPeerOwnerMaintenanceLateEvidence});
function launchInput(input,required,optional=[]){
 if(types.isProxy(input)||!plain(input))fail('ORIGIN_LAUNCH_INPUT');const ds=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(ds);
 if(required.some(k=>!keys.includes(k))||keys.some(k=>typeof k!=='string'||![...required,...optional].includes(k)||!ds[k].enumerable||!Object.hasOwn(ds[k],'value')))fail('ORIGIN_LAUNCH_INPUT');return Object.fromEntries(keys.map(k=>[k,ds[k].value]));
}
async function originalMaintenanceCapacity(ledger,stage,reference){
 const source=await originalInventory(),result=source.assertOriginalPeerMaintenanceExecutionCapacityFrom(ledger,{stage,...(reference?{admission_ref:reference}:{})});
 if(types.isProxy(result)||!plain(result)||result.protocol!=='original-local-execution-inventory-v1'||result.retained_row_census_complete!==true||result.admission_launch_coverage_complete!==true||result.cardinality_known!==true||result.unit!=='new-origin-maintenance-model-invocation'||!Number.isSafeInteger(result.occupied)||result.occupied<0||!Number.isSafeInteger(result.remaining)||result.remaining<0||stage==='reserve'&&result.remaining<1)fail('ORIGIN_ORIGINAL_EXECUTION_INVENTORY_UNQUALIFIED');return result;
}
async function runMaintenance(api,input,fixed){
 const ledger=fixed.ledger(api);await originalMaintenanceCapacity(ledger,'reserve');
 await loadOriginalSelectedPackagedPeerBridge();fixed.support();
 const owner=Symbol('original-'+fixed.name+'-launch');let cap,launch,finished=false;
 try{
  // Exactly one original preparation. Its service checks full preflight before
  // FIRST real put and charges existing explicit authority once, including on
  // uncertain failure. No retries, readmission, budget renewal or conversion.
  cap=fixed.prepare(api,input);const admitted=fixed.inspect(cap),preflight=fixed.preflight(cap);
  await originalMaintenanceCapacity(ledger,'existing',admitted.admission_ref);
  const base=directory(path.join(ledger.directory,'peer-execution')),family=directory(path.join(base,fixed.name)),own=directory(path.join(family,peerDigest(admitted.admission_ref)),true),state=directory(path.join(own,'state'),true),scratch=directory(path.join(own,'scratch'),true),supervisor=createPolicySupervisor({owner,directory:own});
  launch=await fixed.launch(owner,supervisor,{cwd:ledger.root,read_paths:[],state_root:state,scratch_root:scratch},preflight);
  await originalMaintenanceCapacity(ledger,'existing',admitted.admission_ref);
  const observed=await fixed.host(owner,launch,api,cap);
  if(observed.error||!observed.drain){const held=fixed.hold(cap,{error:observed.error??'ORIGIN_ORIGINAL_DRAIN_REQUIRED'});finished=true;const late=observed.diagnostic?await fixed.late(cap,observed.diagnostic):null;return {protocol:fixed.result,...held,late_evidence:late,qualified:false,attempt_reusable:false};}
  await originalMaintenanceCapacity(ledger,'existing',admitted.admission_ref);const result=await fixed.complete(cap,observed.drain);finished=true;
  return {protocol:fixed.result,...result,native_qualified:false,attempt_reusable:false,owner_activated:false,origin_sealed:false};
 }catch(error){
  if(launch)try{requestOriginalProtectedCodexStop(owner,launch);}catch{}
  if(cap&&!finished){const held=fixed.hold(cap,{error:typeof error?.code==='string'?error.code:'ORIGIN_LAUNCH_UNKNOWN'});finished=true;return {protocol:fixed.result,...held,qualified:false,attempt_reusable:false};}
  throw error;
 }
}
export async function runOriginalPeerOriginMaintenance(api,input){
 if(arguments.length!==2)fail('ORIGIN_LAUNCH_INPUT');input=launchInput(input,['operation_id','kind','segments'],['reconstruction_ref']);if(!['peer-origin-reconstruction','peer-origin-review'].includes(input.kind))fail('ORIGIN_LAUNCH_INPUT');return runMaintenance(api,input,RANGE);
}
export async function runOriginalPeerOriginFrontierSealReview(api,input){
 if(arguments.length!==2)fail('ORIGIN_LAUNCH_INPUT');input=launchInput(input,['operation_id','frontier_ref','root_result_ref']);
 if(typeof originSeal.loadPeerOriginFrontierSealCheckpointSupport!=='function')fail('ORIGIN_FRONTIER_SEAL_CHECKPOINT_SOURCE_REQUIRED');
 await originSeal.loadPeerOriginFrontierSealCheckpointSupport();return runMaintenance(api,input,SEAL);
}
export async function runOriginalPeerOwnerMaintenanceReview(lifecycle,input){
 if(arguments.length!==2)fail('ORIGIN_LAUNCH_INPUT');return runMaintenance(lifecycle,launchInput(input,['operation_id','epoch']),OWNER);
}

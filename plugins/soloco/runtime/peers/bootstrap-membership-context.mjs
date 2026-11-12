// Fixed SOURCE joins only. Missing DIRECT entries Hold; present module and
// transitive/provider failures propagate unchanged. No caller import/provider.
import * as deployment from './context-component-deployment.mjs';
import * as maintenance from './origin-maintenance.mjs';
import {inspectPeerOwnerOperatingState} from './owner-operating-state.mjs';
import {assertPeerPublicOwnerCustody} from './owner-transfer-intent.mjs';
import {assertPeerOriginLegacyFences} from './origin-quarantine.mjs';
import {originSidecars} from './origin-plan.mjs';
import {need,same,copy,ref,digest,hash,closed,BOOTSTRAP_CONTEXT,validateBootstrapMembershipFirstRpc} from './bootstrap-membership-contract.mjs';

export function assertPeerBootstrapOwnerFrom(tx,{ledger,actor}){
 const c=tx.get('control','company'),p=c&&tx.get('principals',c.value.founder_principal_id),v=p?.value,o=v?.legacy_owner;
 need(c?.value.protocol==='peer-cos-v1'&&c.value.paused===true&&v?.kind==='founder'&&v.status==='active'&&o&&o.host===actor.host&&o.session_id===actor.session_id&&v.host===actor.host&&v.native_id===actor.native_id&&Number.isSafeInteger(o.epoch)&&o.epoch>0,'BOOTSTRAP_OWNER_CHANGED');
 need(typeof maintenance?.assertPeerOriginSelectedMaintenanceFrom==='function','BOOTSTRAP_ORIGINAL_SELECTION_SOURCE_REQUIRED');maintenance.assertPeerOriginSelectedMaintenanceFrom(tx,{company_id:ledger.company_id});
 inspectPeerOwnerOperatingState(tx);assertPeerPublicOwnerCustody({...tx,connection:{root:ledger.root,company_id:ledger.company_id,directory:ledger.directory}});
 for(const id of ['scheduler','publisher'])need(tx.get('principals',id)?.value.status==='held','BOOTSTRAP_ORDINARY_RUNTIME_HELD');
 return {control:c,owner:p,epoch:o.epoch};
}
export function assertPeerBootstrapOperationFrom(tx,{ledger,actor,input,action}){
 const owner=assertPeerBootstrapOwnerFrom(tx,{ledger,actor});need(input.epoch===owner.epoch,'BOOTSTRAP_EPOCH_CHANGED');
 need(typeof maintenance.assertPeerOriginPausedBootstrapPurposeFrom==='function','BOOTSTRAP_PURPOSE_SOURCE_REQUIRED');
 const enrollment=input.enrollment_id&&tx.get('work_items','membership:'+input.enrollment_id),scope=enrollment?.value.scope??input.scope;
 need(typeof scope==='string'&&scope.length,'BOOTSTRAP_SCOPE_REQUIRED');
 maintenance.assertPeerOriginPausedBootstrapPurposeFrom(tx,{ledger});
 // That genuine origin assertion qualifies only its own layer. No selected
 // finite bootstrap purpose/current full-pin/source-cut producer is frozen on
 // this base. Do not guess its fields or turn origin DATA into spending power.
 need(false,'BOOTSTRAP_PURPOSE_PRODUCER_REQUIRED');
}
export function bootstrapMembershipEvidenceFrom(tx,options){
 assertPeerBootstrapOperationFrom(tx,options);need(false,'BOOTSTRAP_QUALIFIED_CONTEXT_SOURCE_REQUIRED');
}
export function prepareBootstrapMembershipAssignment(text){
 need(typeof deployment.preflightOriginalBootstrapMembershipContext==='function'&&typeof deployment.inspectOriginalBootstrapMembershipPreflight==='function','BOOTSTRAP_PREFLIGHT_SOURCE_REQUIRED');
 const plan=deployment.preflightOriginalBootstrapMembershipContext(text),commitment=deployment.inspectOriginalBootstrapMembershipPreflight(plan);
 validateBootstrapMembershipFirstRpc(commitment,text);
 return {plan,commitment:copy(commitment)};
}
export function inspectBootstrapMembershipPreflight(plan,text){
 need(typeof deployment.inspectOriginalBootstrapMembershipPreflight==='function','BOOTSTRAP_PREFLIGHT_SOURCE_REQUIRED');const commitment=deployment.inspectOriginalBootstrapMembershipPreflight(plan);
 validateBootstrapMembershipFirstRpc(commitment,text);return copy(commitment);
}
export function captureBootstrapMembershipObservationFrom(tx,{ledger}){
 need(typeof maintenance.assertPeerOriginPhysicalFrom==='function','BOOTSTRAP_OBSERVATION_SOURCE_REQUIRED');const physical=maintenance.assertPeerOriginPhysicalFrom(ledger,tx),origin=tx.get('control','origin');
 return {protocol:'peer-bootstrap-observation-physical-v1',origin_ref:copy(physical.origin_ref),sidecar_frontier:copy(origin.value.sidecar_frontier)};
}
export function assertBootstrapMembershipObservationPhysicalFrom(tx,{ledger,physical}){
 assertPeerOriginLegacyFences(ledger.db);need(same(originSidecars(ledger.directory),physical.sidecar_frontier)&&same(ref('control',tx.get('control','origin')),physical.origin_ref)&&same(tx.get('control','company').value.origin,physical.origin_ref),'BOOTSTRAP_OBSERVATION_PHYSICAL_CHANGED');
}

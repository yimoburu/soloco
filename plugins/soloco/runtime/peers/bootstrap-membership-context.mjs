// Fixed SOURCE joins only. Missing DIRECT entries Hold; present module and
// transitive/provider failures propagate unchanged. No caller import/provider.
import * as deployment from './context-component-deployment.mjs';
import * as maintenance from './origin-maintenance.mjs';
import {FAMILIES} from './ledger.mjs';
import {assertPeerOriginSelectedMaintenanceFrom} from './origin-maintenance-authority.mjs';
import {bootstrapMembershipAuthorityFrom} from './origin-paused-bootstrap-accounting.mjs';
import {assertPeerBootstrapInputFrontierCheckpointFrom} from './input-frontier-checkpoint.mjs';
import {membershipPrincipalAliases} from './model.mjs';
import {inspectPeerOwnerOperatingState} from './owner-operating-state.mjs';
import {assertPeerPublicOwnerCustody} from './owner-transfer-intent.mjs';
import {assertPeerOriginLegacyFences} from './origin-quarantine.mjs';
import {originSidecars} from './origin-plan.mjs';
import {need,same,copy,ref,digest,hash,closed,reference,canonical,BOOTSTRAP_CONTEXT,BOOTSTRAP_BASIS,validateBootstrapMembershipFirstRpc} from './bootstrap-membership-contract.mjs';

export function assertPeerBootstrapOwnerFrom(tx,{ledger,actor}){
 const c=tx.get('control','company'),p=c&&tx.get('principals',c.value.founder_principal_id),v=p?.value,o=v?.legacy_owner;
 need(c?.value.protocol==='peer-cos-v1'&&c.value.paused===true&&v?.kind==='founder'&&v.status==='active'&&o&&o.host===actor.host&&o.session_id===actor.session_id&&v.host===actor.host&&v.native_id===actor.native_id&&Number.isSafeInteger(o.epoch)&&o.epoch>0,'BOOTSTRAP_OWNER_CHANGED');
 assertPeerOriginSelectedMaintenanceFrom(tx,{company_id:ledger.company_id});
 inspectPeerOwnerOperatingState(tx);assertPeerPublicOwnerCustody({...tx,connection:{root:ledger.root,company_id:ledger.company_id,directory:ledger.directory}});
 for(const id of ['scheduler','publisher'])need(tx.get('principals',id)?.value.status==='held','BOOTSTRAP_ORDINARY_RUNTIME_HELD');
 return {control:c,owner:p,epoch:o.epoch};
}
export function assertPeerBootstrapOperationFrom(tx,{ledger,actor,input,action}){
 const owner=assertPeerBootstrapOwnerFrom(tx,{ledger,actor});need(input.epoch===owner.epoch,'BOOTSTRAP_EPOCH_CHANGED');
 need(['membership/bootstrap','membership/enroll','membership/admit','membership/activate','membership/revoke','bootstrap-membership.native_created','bootstrap-membership.read','bootstrap-membership.submitted','bootstrap-membership.completed','bootstrap-membership.unknown','bootstrap-membership.late_evidence'].includes(action),'BOOTSTRAP_ACTION_HELD');
 const enrollment=input.enrollment_id&&tx.get('work_items','membership:'+input.enrollment_id),scope=enrollment?.value.scope??input.scope??(action==='membership/enroll'?'*':undefined);
 need(typeof scope==='string'&&scope.length,'BOOTSTRAP_SCOPE_REQUIRED');
 const proof=bootstrapMembershipAuthorityFrom(tx,{ledger});
 need(proof.protocol==='peer-origin-paused-bootstrap-accounting-v1'&&proof.deadline_at_ms>Date.now()&&proof.purpose?.protocol==='peer-origin-paused-bootstrap-purpose-v1'&&proof.purpose.purpose==='membership-qualification-only','BOOTSTRAP_PURPOSE_SOURCE_REQUIRED');
 const origin=tx.get('control','origin');need(origin?.value.status==='sealed'&&origin.value.seal_ref,'BOOTSTRAP_QUALIFIED_CONTEXT_SOURCE_REQUIRED');
 const seal=exactCurrent(tx,origin.value.seal_ref);need(seal.value.kind==='origin_frontier_obligation_seal'&&seal.value.protocol==='peer-origin-frontier-obligation-seal-v1','BOOTSTRAP_QUALIFIED_CONTEXT_SOURCE_REQUIRED');
 const checkpoint=assertPeerBootstrapInputFrontierCheckpointFrom(tx,{ledger,checkpoint_ref:seal.value.checkpoint_ref});
 return {...proof,scope,epoch:owner.epoch,checkpoint,deadline_at_ms:Math.min(proof.deadline_at_ms,checkpoint.deadline_at_ms),authority_issued:false};
}
function exactCurrent(tx,input){const r=closed(input,['family','id','revision','sha256']);need(FAMILIES.includes(r.family),'BOOTSTRAP_SOURCE_CHANGED');reference(r,r.family);const row=tx.getVersion(r),head=tx.get(r.family,r.id);need(row&&head&&same(ref(r.family,head),r)&&same(ref(r.family,row),r)&&digest(row.value)===r.sha256,'BOOTSTRAP_SOURCE_CHANGED');return row;}
function allPrincipals(tx){const out=[];let cursor;for(;;){const page=tx.list('principals',{limit:100,...(cursor?{cursor}:{})});out.push(...page.items);need(out.length<=10000,'BOOTSTRAP_CAPACITY');if(page.complete)return out;need(page.next_cursor&&page.next_cursor!==cursor,'BOOTSTRAP_INCOMPLETE');cursor=page.next_cursor;}}
export function bootstrapMembershipEvidenceFrom(tx,options){
 const {ledger,enrollment,phase}=options;need(['reconstruction','review'].includes(phase),'BOOTSTRAP_PHASE');
 const proof=assertPeerBootstrapOperationFrom(tx,options),checked=proof.checkpoint;
 need(checked.current_meaning?.protocol===BOOTSTRAP_BASIS&&same(checked.authority_company_ref,proof.authority_company_ref)&&same(checked.authority_origin_ref,proof.authority_origin_ref),'BOOTSTRAP_QUALIFIED_CONTEXT_SOURCE_REQUIRED');
 need(enrollment?.value.bootstrap_protocol==='peer-bootstrap-membership-enrollment-v1'&&enrollment.value.enrollment_id===options.input.enrollment_id&&same(enrollment.value.bootstrap_authority_ref,proof.authority_company_ref),'BOOTSTRAP_ENROLLMENT_REQUIRED');
 const input_refs=enrollment.value.input_refs.map(r=>{const row=exactCurrent(tx,r);return {reference:copy(r),value:copy(row.value)};});
 const natives=[...new Set(checked.contributors)].sort(),principals=[];for(const p of allPrincipals(tx)){const aliases=membershipPrincipalAliases(tx,p.id);if(aliases.natives.some(n=>natives.includes(n)))principals.push(p.id);}
 // These are literal authenticated HISTORICAL rows and the complete checked
 // original meaning. No counter/namespace field is zeroed or normalized. The
 // complete CURRENT observation travels separately in the outer assignment.
 const body={...copy(checked.source_base),scope:enrollment.value.scope,input_refs};
 const raw=canonical(body),deadline_at_ms=Math.min(proof.deadline_at_ms,checked.deadline_at_ms,checked.current_meaning.qualification.deadline_at_ms,Date.parse(enrollment.value.expires_at));
 need(Buffer.byteLength(raw)<=proof.authority_company_value.policy.max_context_bytes&&deadline_at_ms>Date.now(),'BOOTSTRAP_CONTEXT_CAPACITY');
 const currentCompany=exactCurrent(tx,proof.current_company_ref),currentOrigin=exactCurrent(tx,proof.current_origin_ref);
 const accounting={protocol:'peer-bootstrap-membership-current-accounting-v1',observed_before_admission:true,baseline_event:copy(proof.baseline_event),
  current_company:{reference:copy(proof.current_company_ref),value:copy(currentCompany.value)},current_origin:{reference:copy(proof.current_origin_ref),value:copy(currentOrigin.value)},
  purpose:copy(proof.purpose),transitions:copy(proof.transitions),namespace_replay:copy(checked.replay),
  planned_delta:{used_enrollments:0,used_model_calls:1,used_review_calls:phase==='review'?1:0},authority_issued:false};
 return {body,sha256:digest(raw),contributors:{principals:principals.sort(),natives},deadline_at_ms,accounting};
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

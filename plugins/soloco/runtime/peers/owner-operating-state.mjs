// Pure shared reader for the canonical succession records. No factory, model,
// native producer, ledger transaction or authority-issuing operation is here.
import {canonical,peerDigest} from './ledger.mjs';

const fail=code=>{throw Object.assign(Error(code),{code});};
const need=(yes,code='OWNER_OPERATING_STATE_INVALID')=>{if(!yes)fail(code);};
const same=(a,b)=>canonical(a)===canonical(b);
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const reference=r=>r&&Object.keys(r).sort().join(',')==='family,id,revision,sha256'&&typeof r.id==='string'&&Number.isSafeInteger(r.revision)&&r.revision>0&&/^[a-f0-9]{64}$/.test(r.sha256??'');
function exact(tx,r,family){need(reference(r)&&r.family===family);const row=tx.getVersion(r);need(row?.revision===r.revision&&row.sha256===r.sha256&&peerDigest(row.value)===r.sha256);return row;}
function receipt(tx,r,action,session){const row=exact(tx,r,'commands');need(row.revision===1&&row.value.kind==='owner_command'&&row.value.action===action&&row.value.principal_id===session&&/^[a-f0-9]{64}$/.test(row.value.request_sha256??''));return row.value.result;}

export function inspectPeerOwnerOperatingState(tx){
 const c=tx.get('control','company');need(c?.value.protocol==='peer-cos-v1');
 if(!Object.hasOwn(c.value,'owner_handover'))return {protocol:'peer-owner-operating-state-v1',controlled:false,status:'same-owner',ordinary_allowed:true,generic_resume_allowed:true};
 const pointer=c.value.owner_handover;need(pointer&&Object.keys(pointer).sort().join(',')==='epoch,id'&&/^owner-handover:[a-f0-9]{64}$/.test(pointer.id??'')&&Number.isSafeInteger(pointer.epoch)&&pointer.epoch>1);
 const h=tx.get('work_items',pointer.id),v=h?.value,p=tx.get('principals',c.value.founder_principal_id),o=p?.value.legacy_owner;
 need(v?.protocol==='peer-owner-handover-v1'&&['pending','reconstructed','recovery-held','activated','resumed'].includes(v.status)&&v.founder_id===p?.id&&v.epoch===pointer.epoch&&p.value.kind==='founder'&&v.incoming&&o&&same(o,{host:v.incoming.host,session_id:v.incoming.session_id,epoch:v.epoch})&&p.value.native_id===v.incoming.native_id&&p.value.host===v.incoming.host);
 need(v.previous_owner?.epoch+1===v.epoch&&Array.isArray(v.expected_overrides));
 const previous=v.expected_overrides.filter(x=>x.family==='principals'&&x.id===p.id);need(previous.length===1&&previous[0].original);
 const original=exact(tx,previous[0].original,'principals'),revoked=exact(tx,p.value.membership_previous,'principals');
 need(original.value.kind==='founder'&&original.value.status==='active'&&same(original.value.legacy_owner,v.previous_owner)&&revoked.id===p.id&&revoked.revision===original.revision+1&&revoked.value.status==='revoked'&&revoked.value.revoked_for===h.id&&revoked.value.generation===original.value.generation+1&&same(revoked.value.legacy_owner,v.previous_owner)&&p.value.generation===revoked.value.generation);
 const begin=receipt(tx,v.begin_command_ref,'handover.begin',v.incoming.session_id);
 need(begin.handover_id===h.id&&begin.epoch===v.epoch&&begin.status==='pending'&&begin.paused===true);
 const accepted=['activated','resumed'].includes(v.status);
 need(p.value.status===(accepted?'active':'pending'));
 if(accepted){
  if(v.recovery_ref){const recovery=exact(tx,v.recovery_ref,'work_items').value;need(recovery.kind==='owner_handover_recovery_disposition'&&recovery.owner_handover_id===h.id&&recovery.epoch===v.epoch&&recovery.original_deadline_at_ms===v.expires_at_ms&&Array.isArray(recovery.attempt_refs)&&recovery.attempt_refs.length>0);
   for(const a of recovery.attempt_refs){for(const [family,r]of [['work_items',a.phase_ref],['slots',a.slot_ref],['effects',a.effect_ref]]){need(reference(r)&&r.family===family);const current=tx.get(family,r.id);need(current&&same(ref(family,current),r)&&current.value.status==='unknown','OWNER_RECOVERY_CHANGED');}exact(tx,a.admission_ref,'work_items');exact(tx,a.context_ref,'work_items');}
  }
  const q=exact(tx,p.value.owner_acceptance,'work_items'),entry=v.review_history?.at(-1);
  need(q.value.kind==='owner_handover_qualification'&&q.value.status==='accepted'&&q.value.review?.verdict==='Pass'&&q.value.review.permitted_action==='activate_owner_handover'&&q.value.termination_confirmed===true&&q.value.subject_sha256===v.subject_sha256&&same(q.value.reconstruction_ref,v.reconstruction_ref)&&same(entry?.result_ref,p.value.owner_acceptance)&&Number.isSafeInteger(q.value.accepted_at_ms)&&q.value.accepted_at_ms<v.expires_at_ms);
  const activation=receipt(tx,v.activation_command_ref,'handover.activate',v.incoming.session_id);
  need(activation.handover_id===h.id&&activation.status==='activated'&&activation.epoch===v.epoch&&activation.paused===true&&same(activation.principal,ref('principals',p))&&same(activation.acceptance,p.value.owner_acceptance));
 }
 if(v.status==='resumed'){
  const resumed=receipt(tx,v.resume_command_ref,'resume',v.incoming.session_id),control=exact(tx,v.resume_control_ref,'control');
  need(control.id==='company'&&control.value.paused===false&&same(control.value.owner_handover,pointer)&&resumed.paused===false&&resumed.epoch===v.epoch&&same(resumed.control,v.resume_control_ref));
 }else need(c.value.paused===true);
 return {protocol:'peer-owner-operating-state-v1',controlled:true,handover_id:h.id,epoch:v.epoch,status:v.status,ordinary_allowed:v.status==='resumed',generic_resume_allowed:false};
}

// Called by the shared model before a business mutation/replay. Dedicated core
// maintenance is a separate fixed source path and does not call this function.
export function assertPeerOwnerOperatingState(tx,action){
 const state=inspectPeerOwnerOperatingState(tx);
 if(state.controlled&&action==='company/resume')fail('OWNER_DEDICATED_RESUME_REQUIRED');
 if(!state.ordinary_allowed)fail('OWNER_NOT_RESUMED');
 return state;
}

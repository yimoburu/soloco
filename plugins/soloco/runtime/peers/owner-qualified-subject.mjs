// SOURCE-only consumer. This does not select an owner, revoke an old owner,
// authorize execution or enable a native form. v1 remains byte-for-byte intact.
import {canonical,peerDigest} from './ledger.mjs';
import {inspectPeerPinnedTeamFrom} from './legacy-origin.mjs';
import {inspectCheckedCurrentMeaningFrom} from './input-frontier-maintenance.mjs';
import {frontierHash,frontierData,frontierNeed as need,frontierSame as same,frontierRef as ref} from './input-frontier.mjs';

export const OWNER_QUALIFIED_SUBJECT='peer-owner-qualified-subject-v1';
export const OWNER_QUALIFIED_ASSIGNMENT='peer-owner-maintenance-assignment-v3';
// No cap increase or partial fallback. These exact full values must also pass
// the fixed original first-RPC/interpreter preflight BEFORE a later admission.
export function preparePeerOwnerQualifiedSubjectFrom(tx,{ledger,frontier_ref,root_result_ref,incoming}){
 const connection={root:ledger.root,directory:ledger.directory,company_id:ledger.company_id};
 const actor=frontierData(incoming,['host','session_id','native_id']);need(['codex','claude'].includes(actor.host)&&[actor.session_id,actor.native_id].every(v=>typeof v==='string'&&v.trim()&&!v.includes('\0')),'OWNER_V2_INCOMING');
 const control=tx.get('control','company'),founder=control&&tx.get('principals',control.value.founder_principal_id),pins=inspectPeerPinnedTeamFrom(tx,{company_id:connection.company_id});
 need(control?.value.protocol==='peer-cos-v1'&&control.value.paused===true&&founder?.value.kind==='founder'&&['active','pending'].includes(founder.value.status),'OWNER_V2_SAFE_BOUNDARY');
 const current_meaning=inspectCheckedCurrentMeaningFrom(tx,{frontier_ref,root_result_ref},{ledger});need(same(current_meaning.connection,{company_id:connection.company_id,root_sha256:frontierHash(connection.root)})&&same(current_meaning.pinned_team.reference,pins.reference)&&current_meaning.pinned_team.bundle_sha256===pins.bundle_sha256,'OWNER_V2_SOURCE_CHANGED');
 // Live canonical authority is full DATA outside the qualified semantic
 // representation. A past extraction cannot resurrect a spent grant or change
 // the actual founder epoch, policy, pin hashes, paused state or counters.
 const body={protocol:OWNER_QUALIFIED_SUBJECT,connection:current_meaning.connection,incoming:actor,control:{reference:ref('control',control),value:control.value},founder:{reference:ref('principals',founder),value:founder.value},pinned_team:{reference:pins.reference,bundle_sha256:pins.bundle_sha256,team_sha256:pins.bundle.team_sha256,governance_sha256:pins.bundle.governance_sha256,parts:pins.sources},current_meaning};
 const text=canonical(body);need(Buffer.byteLength(text)<=Math.min(65536,control.value.policy.max_context_bytes),'OWNER_V2_SUBJECT_CAPACITY');return {body,text,sha256:peerDigest(body),utf8_bytes:Buffer.byteLength(text)};
}

export function preparePeerOwnerQualifiedAssignmentFrom(tx,{ledger,frontier_ref,root_result_ref,incoming,reconstruction,history,authority}){
 const subject=preparePeerOwnerQualifiedSubjectFrom(tx,{ledger,frontier_ref,root_result_ref,incoming}),control=tx.get('control','company');
 // Caller is the fixed future owning lifecycle; these DATA args do not mint
 // authority. Complete actual history is required, not an unqualified summary.
 frontierData(history,['prior_attempts','prior_reconstructions','recovery_dispositions','prior_external_attempts','late_obligations']);
 for(const value of Object.values(history))need(Array.isArray(value),'OWNER_V2_HISTORY_REQUIRED');
 const body={protocol:OWNER_QUALIFIED_ASSIGNMENT,connection:subject.body.connection,subject:{sha256:subject.sha256,body:subject.body},reconstruction,history,authority:{...authority,peer_policy:control.value.policy}},text=canonical(body);
 need(Buffer.byteLength(text)<=Math.min(65536,control.value.policy.max_context_bytes),'OWNER_V2_CONTEXT_CAPACITY');return {body,text,sha256:peerDigest(body),utf8_bytes:Buffer.byteLength(text),native_qualified:false};
}

// Preparation only. No adapter from the unpublished v1 migration is used here.
import {canonical,peerDigest} from './ledger.mjs';
import {LEGACY_ORIGIN_PROTOCOL} from './legacy-origin.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;

export function preparePeerAdoptionV2(snapshot,{expires_at,source_instruction}={}){
 if(!text(source_instruction,4000))fail('LEGACY_PLAN_INSTRUCTION_REQUIRED');
 const end=Date.parse(expires_at),now=Date.now();
 if(!Number.isFinite(end)||end<=now||end>now+7*86400000)fail('LEGACY_PLAN_EXPIRY_REQUIRED');
 return {protocol:'peer-adoption-plan-v2',origin_protocol:LEGACY_ORIGIN_PROTOCOL,authority:snapshot.authority,source_cut_sha256:snapshot.source_cut_sha256,basis_sha256:snapshot.basis_sha256,sources:snapshot.sources,pinned_team:snapshot.pinned_team,pinned_team_sha256:peerDigest(snapshot.pinned_team),origin_projection:snapshot.projection,origin_projection_sha256:snapshot.origin_projection_sha256,source_instruction,expires_at,issues:snapshot.issues,status:'preparation-held',permitted_action:'review-preparation-only',original_authority:'preserved-retired-not-translated',allowance_conversion:'none',fresh_execution_authority:false,execution_resumed:false,required_next_producers:['fixed-original-environment-and-whole-domain-capability','native-reviewed-complete-original-obligation-mapping','original-native-review-provenance-bridge','checked-origin-seal-and-atomic-apply'],native_qualification:false};
}

// Trusted internal apply preflight, deliberately not in the public action enum.
// Recompute all current preparation bindings rather than accepting a caller's
// ready flag or stale plan. No backup, writable Store or old draft call follows.
export function assertPeerAdoptionV2ApplyReady(snapshot,plan){
 if(!plan||plan.protocol!=='peer-adoption-plan-v2'||typeof plan.expires_at!=='string'||typeof plan.source_instruction!=='string')fail('LEGACY_PLAN_REQUIRED');
 const actual=preparePeerAdoptionV2(snapshot,{expires_at:plan.expires_at,source_instruction:plan.source_instruction});
 if(peerDigest(actual)!==peerDigest(plan)||canonical(actual)!==canonical(plan))fail('LEGACY_PLAN_CHANGED');
 fail('LEGACY_ADOPTION_PRODUCER_HELD');
}

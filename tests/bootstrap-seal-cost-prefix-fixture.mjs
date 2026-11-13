// Fictional persisted-P1 admission grammar only. This fixture deliberately does
// not call the seal producer, checkpoint planner, Native issuer or any provider.
// Its semantic/checkpoint predecessors are explicitly UNQUALIFIED SYNTHETIC
// DATA. Acceptance by the cold transition/cost reader is conditional grammar
// compatibility; it is neither a genuine qualified frontier nor a Native proof.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FAMILIES} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {ORIGIN_FRONTIER_SEAL_KIND,ORIGIN_FRONTIER_SEAL_CONTEXT,ORIGIN_FRONTIER_SEAL_PURPOSE,peerOriginFrontierSealResponseContract} from '../plugins/soloco/runtime/peers/origin-frontier-seal-contract.mjs';
import {ORIGIN_FRONTIER_SEAL_INSTRUCTION} from '../plugins/soloco/runtime/peers/origin-frontier-seal-instruction.mjs';
import {peerOriginFrontierSealAuthoritySha256} from '../plugins/soloco/runtime/peers/origin-frontier-seal-transition.mjs';

const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const PURPOSE='bounded-preparation-bootstrap';
const ACTIONS=['origin/read','task/prepare-readonly','membership/bootstrap'];

export function stageSyntheticSealCostPrefix(f){
  const {ledger,ref,peerDigest,canonical}=f;
  assert.equal(typeof ref,'function');assert.equal(typeof peerDigest,'function');assert.equal(typeof canonical,'function');
  return ledger.write('origin.frontier-seal.admitted','founder',tx=>{
    const origin=tx.get('control','origin'),company=tx.get('control','company');
    const owner=tx.get('principals',company.value.founder_principal_id),usage=tx.get('control','usage'),m=origin.value.maintenance;
    const actor={host:owner.value.host,native_id:owner.value.native_id,session_id:owner.value.legacy_owner.session_id};
    assert.equal(actor.host,'codex');assert.equal(actor.native_id,actor.session_id);
    assert.equal(company.value.paused,true);assert.equal(m.status,'active');
    assert.equal(m.frontier_seal_protocol,ORIGIN_FRONTIER_SEAL_PURPOSE);assert.equal(m.frontier_seal_purpose,PURPOSE);
    assert.equal(m.units,'new-origin-maintenance-model-invocation');assert.equal(m.old_allowance_conversion,'none');
    for(const [used,maximum]of [['used_model_calls','max_model_calls'],['used_review_calls','max_review_calls'],['used_frontier_seal_reviews','max_frontier_seal_reviews']]){
      assert.ok(Number.isSafeInteger(m[used])&&m[used]>=0&&Number.isSafeInteger(m[maximum])&&m[used]<m[maximum]);
    }
    assert.match(origin.value.current_cut_sha256,/^[a-f0-9]{64}$/);
    const deadline_at_ms=Date.parse(m.expires_at);
    assert.ok(Number.isSafeInteger(deadline_at_ms)&&deadline_at_ms>0);
    const operation_id='SYNTHETIC-reserved-seal-cost-prefix';
    const command_id='origin-frontier-seal-operation:'+peerDigest([ledger.company_id,actor,operation_id]);
    const execution_id='origin-frontier-seal:00000000-0000-4000-8000-000000000001';
    const phase_id=execution_id+':phase',participant_id=execution_id+':participant';
    const connection={company_id:ledger.company_id,root_sha256:sha(ledger.root)};
    // These immutable-shaped references name ONLY fictional predecessor DATA.
    // They are never resolved as genuine frontier/root/review/pin evidence.
    const predecessor=id=>({family:'work_items',id,revision:1,sha256:peerDigest({SYNTHETIC_UNQUALIFIED_PREDECESSOR_DATA:id})});
    const frontier_ref=predecessor('SYNTHETIC-unqualified-seal-frontier');
    const root_result_ref=predecessor('SYNTHETIC-unqualified-seal-root');
    const root_review_ref=predecessor('SYNTHETIC-unqualified-seal-root-review');
    const pins_ref=predecessor('SYNTHETIC-unqualified-seal-pins');
    const mandatory_markers=[{protocol:'peer-input-frontier-mandatory-marker-v1',source_id:'SYNTHETIC-retained-original-UNKNOWN',closure:'UNKNOWN',acceptance:false}];
    const bundle_sha256=peerDigest({SYNTHETIC_UNQUALIFIED_PIN_BUNDLE:true});
    const meaning={protocol:'peer-checked-input-current-meaning-v1',connection,frontier_ref,
      frontier_sha256:peerDigest({SYNTHETIC_UNQUALIFIED_FRONTIER:true}),source_vector_sha256:peerDigest({SYNTHETIC_UNQUALIFIED_VECTOR:true}),
      pinned_team:{reference:pins_ref,bundle_sha256},items:[{SYNTHETIC_UNQUALIFIED_SEMANTIC_PREDECESSOR_DATA:true,content:'Retain the original UNKNOWN and every finite allowance; no semantic qualification is asserted.'}],
      mandatory_frontier:mandatory_markers,qualification:{SYNTHETIC_UNQUALIFIED_PREDECESSOR_DATA:true,root_result_ref,root_review_ref,deadline_at_ms}};
    const rows=family=>{const out=[];let cursor;for(;;){const page=tx.list(family,{limit:100,...(cursor?{cursor}:{})});out.push(...page.items);assert.ok(out.length<=1000);if(page.complete)return out;assert.ok(page.next_cursor&&page.next_cursor!==cursor);cursor=page.next_cursor;}};
    const heads=FAMILIES.flatMap(family=>rows(family).map(row=>ref(family,row)));
    heads.sort((a,b)=>{const left=canonical([a.family,a.id]),right=canonical([b.family,b.id]);return left<right?-1:left>right?1:0;});
    const readset={heads,count:heads.length,sha256:peerDigest(heads)};
    // Capture original collection snapshots before the first checkpoint write.
    const reservations=rows('slots').filter(row=>['active','unknown'].includes(row.value.status)).map(row=>({reference:ref('slots',row),value:row.value}));
    const notices=rows('notices').filter(row=>row.value.status!=='resolved').map(row=>({reference:ref('notices',row),value:row.value}));
    const late_obligations=(origin.value.late_obligation_refs??[]).map(reference=>({reference,value:tx.getVersion(reference).value}));
    const previous=tx.events({after:Math.max(0,tx.sequence-2),limit:1}).items[0];
    assert.equal(previous.seq,tx.sequence-1);
    const checkpoint_body={protocol:'peer-input-frontier-checkpoint-preimage-v1',connection,purpose:'origin-frontier-seal',operation_id,command_id,frontier_ref,root_result_ref,
      current_meaning:meaning,contributors:[actor.native_id],deadline_at_ms,readset,baseline_event:{sequence:previous.seq,sha256:previous.sha256}};
    const checkpoint_text=canonical(checkpoint_body),baseline_sha256=sha(checkpoint_text);
    const checkpoint_id='input-frontier-checkpoint:'+peerDigest(['origin-frontier-seal',ledger.company_id,connection.root_sha256,command_id]);
    const pages=[];
    for(let offset=0,index=0;offset<checkpoint_text.length;index++){
      let end=Math.min(checkpoint_text.length,offset+16000);
      if(end<checkpoint_text.length&&/[\uD800-\uDBFF]/.test(checkpoint_text[end-1])&&/[\uDC00-\uDFFF]/.test(checkpoint_text[end]))end--;
      assert.ok(end>offset);
      const page=tx.put('work_items',checkpoint_id+':page:'+index,{kind:'input_frontier_checkpoint_page',protocol:'peer-input-frontier-checkpoint-page-v1',checkpoint_id,sequence:index,text:checkpoint_text.slice(offset,end)},0);
      pages.push(ref('work_items',page));offset=end;
    }
    const checkpoint=tx.put('work_items',checkpoint_id,{kind:'input_frontier_checkpoint',protocol:'peer-input-frontier-checkpoint-v1',connection,purpose:'origin-frontier-seal',operation_id,command_id,
      expected_event_sequence:tx.sequence,baseline_sha256,body_sha256:baseline_sha256,characters:checkpoint_text.length,utf8_bytes:Buffer.byteLength(checkpoint_text),pages},0);
    const checkpoint_ref=ref('work_items',checkpoint);
    const units={maintenance:m,global_usage:usage,original_legacy_units:'retained-without-conversion',legacy_unknown_reservations:origin.value.legacy_unknown_reservations??[]};
    const subject={protocol:'peer-origin-frontier-seal-subject-v1',company_id:ledger.company_id,root_sha256:connection.root_sha256,origin_id:origin.value.id,
      source_cut_sha256:origin.value.current_cut_sha256,legacy_source_cut_sha256:company.value.legacy_source_cut_sha256??origin.value.current_cut_sha256,
      frontier_ref,root_result_ref,root_review_ref,complete_current_cut_sha256:baseline_sha256,current_meaning_sha256:peerDigest(meaning),pinned_team:pins_ref,pinned_bundle_sha256:bundle_sha256,
      mandatory_markers_sha256:peerDigest(mandatory_markers),original_reservations_sha256:peerDigest(reservations),original_units_sha256:peerDigest(units),purpose:PURPOSE,allowed_actions:ACTIONS};
    const body={protocol:ORIGIN_FRONTIER_SEAL_CONTEXT,kind:ORIGIN_FRONTIER_SEAL_KIND,connection,subject,
      checkpoint:{protocol:'peer-input-frontier-checkpoint-v1',planned_ref:checkpoint_ref,baseline_sha256,contributors:[actor.native_id],deadline_at_ms,readset:{protocol:'peer-input-frontier-checkpoint-readset-v1',count:readset.count,sha256:readset.sha256}},
      checked_current_meaning:meaning,pinned_team:{reference:pins_ref,bundle_sha256,parts:[{SYNTHETIC_UNQUALIFIED_PIN_PREDECESSOR_DATA:true}],raw_consumption:'SYNTHETIC unqualified predecessor DATA; no original DAG is claimed'},
      authority:{owner:{reference:ref('principals',owner),value:owner.value},company:{reference:ref('control',company),value:company.value},origin:{reference:ref('control',origin),value:origin.value},peer_policy:company.value.policy,units},
      mandatory_markers,reservations,notices,late_obligations,excluded_native_ids:[actor.native_id],response_contract:peerOriginFrontierSealResponseContract(subject)};
    const text=canonical(body),context_sha256=sha(text),input_utf8_bytes=Buffer.byteLength(text)+Buffer.byteLength(ORIGIN_FRONTIER_SEAL_INSTRUCTION);
    const whole_rpc_utf8_bytes=input_utf8_bytes+1024;
    assert.ok(Buffer.byteLength(text)<=company.value.policy.max_context_bytes&&whole_rpc_utf8_bytes<=100000);
    const first_rpc={protocol:'peer-origin-frontier-seal-first-rpc-v1',payload_sha256:context_sha256,instruction_sha256:sha(ORIGIN_FRONTIER_SEAL_INSTRUCTION),
      frame_sha256:peerDigest({SYNTHETIC_UNOBSERVED_FRAME_GEOMETRY_ONLY:true}),recipe_sha256:peerDigest({SYNTHETIC_UNOBSERVED_RECIPE_GEOMETRY_ONLY:true}),input_utf8_bytes,whole_rpc_utf8_bytes,
      frame_bytes:100000,wire_bytes:4000000,context_utf8_bytes:Buffer.byteLength(text),policy_maximum_context_bytes:company.value.policy.max_context_bytes,native_identity:'UNOBSERVED_GEOMETRY_ONLY'};
    const context=tx.put('work_items',execution_id+':context',{kind:'origin_frontier_seal_context',body,text,sha256:context_sha256},0);
    const next=tx.put('control','origin',{...origin.value,maintenance:{...m,used_model_calls:m.used_model_calls+1,used_review_calls:m.used_review_calls+1,used_frontier_seal_reviews:m.used_frontier_seal_reviews+1}},origin.revision);
    const next_company=tx.put('control','company',{...company.value,origin:ref('control',next)},company.revision);
    const next_usage=tx.put('control','usage',{...(usage?.value??{}),model_calls:(usage?.value.model_calls??0)+1},usage?.revision??0);
    const charges={authority_before:ref('control',origin),authority_after:ref('control',next),global_before:usage?ref('control',usage):null,global_after:ref('control',next_usage)};
    const grant_sha256=peerOriginFrontierSealAuthoritySha256(m),target_id='origin-frontier-seal-target:'+peerDigest([origin.value.id,subject.source_cut_sha256,grant_sha256,root_result_ref]);
    const context_ref=ref('work_items',context),binding={protocol:'peer-origin-frontier-seal-admission-v1',kind:ORIGIN_FRONTIER_SEAL_KIND,command_id,pause_generation:m.pause_generation,company_id:ledger.company_id,origin_id:origin.value.id,actor,
      context_ref,context_sha256,subject,subject_sha256:peerDigest(subject),checkpoint_ref,baseline_sha256,deadline_at_ms,grant_sha256};
    const admission=tx.put('work_items',execution_id+':admission',{kind:'origin_frontier_seal_admission',protocol:binding.protocol,binding,charges,first_rpc,
      source_support:{protocol:'peer-origin-frontier-seal-assignment-v1',bridge_sha256:peerDigest({SYNTHETIC_UNOBSERVED_SOURCE_SUPPORT_DATA:true}),creation_mode:'fresh-original-protected-thread'}},0);
    const admission_ref=ref('work_items',admission);
    const phase=tx.put('work_items',phase_id,{kind:'origin_frontier_seal_phase',command_id,status:'reserved',admission_ref,native_id:null,execution_id},0);
    tx.put('work_items',participant_id,{kind:'origin_frontier_seal_participant',command_id,status:'reserved',admission_ref,ordinary_membership:false},0);
    tx.put('work_items',target_id,{kind:'origin_frontier_seal_target',command_id,admission_ref,spent:true,origin_id:origin.value.id,source_cut_sha256:subject.source_cut_sha256,grant_sha256,root_result_ref},0);
    for(const family of ['slots','effects'])tx.put(family,execution_id,{kind:'origin_frontier_seal_execution',command_id,status:family==='slots'?'active':'reserved',scope:'*',admission_ref,capacity_known:true,termination_confirmed:false,original_unit:'new-origin-maintenance-model-invocation'},0);
    const command=tx.put('commands',command_id,{kind:'origin_frontier_seal_command',protocol:'peer-origin-frontier-seal-command-v1',command_id,operation_id,
      request_sha256:peerDigest({operation_id,frontier_ref,root_result_ref}),admission_ref,context_ref,checkpoint_ref,baseline_sha256,phase_id,execution_id,participant_id,target_id,
      origin_id:origin.value.id,grant_sha256,deadline_at_ms,company_id:ledger.company_id,actor,purpose:PURPOSE},0);
    const command_ref=ref('commands',command);
    tx.event('origin.frontier-seal.journal',{protocol:'peer-origin-frontier-seal-journal-v1',original_command_ref:command_ref,checkpoint_ref});
    return {SYNTHETIC_CONDITIONAL_PERSISTED_GRAMMAR_ONLY:true,semantic_predecessor_qualified:false,native_qualified:false,authority_issued:false,
      command_ref,original_command_ref:command_ref,admission_ref,context_ref,checkpoint_ref,phase_ref:ref('work_items',phase),execution_id,charges,
      before_company_ref:ref('control',company),after_company_ref:ref('control',next_company),deadline_at_ms,
      expected_delta:{model_calls:1,review_calls:1,frontier_seal_reviews:1,enrollments:0}};
  });
}

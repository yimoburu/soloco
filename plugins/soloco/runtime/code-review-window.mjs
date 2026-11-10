import {resolveRetentionRepair} from './development-retention-repair.mjs';
import {reviewContinuationSubject} from './development-review-continuation.mjs';
// Private dispatch validation; a longer fixed review window grants no action
// under an expired development grant and cannot replace an uncertain session.
import {digest} from './store.mjs';
import {contextSource} from './current-state.mjs';
import {validateRecordReadDelivery} from './record-read-delivery.mjs';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ref=r=>({id:r.id,revision:r.revision,sha256:digest(JSON.stringify(r))});
export function codeReviewWindowSubject(state,args,{fresh=true,root=process.cwd()}={}) {
  const repair=resolveRetentionRepair(state,args,{root});if(repair)return {protocol:'development-code-review-window-subject-v1',retention_repair:{id:repair.ticket.id,revision:repair.ticket.revision,sha256:digest(JSON.stringify(repair.ticket))},receipt:repair.subject.receipt,candidate:repair.subject.candidate,plan:repair.subject.plan,controller_sha256:repair.subject.controller.sha256,candidate_sha256:repair.subject.candidate_sha256,receipt_sha256:repair.subject.receipt_sha256};
  const continuation=reviewContinuationSubject(state,args,{fresh,root});if(continuation){
    const p=state.records[args.review_of].development.proposal;
    if(fresh&&Date.now()+p.code_review_window_minutes*60000>Date.parse(p.expires_at))throw Object.assign(Error('Insufficient authorized time for the complete fixed code review window'),{code:'SCOPE_WINDOW_UNAVAILABLE'});
    return continuation;
  }
  if(args.role!=='qa'||args.prototype_id!==undefined||args.development_id!==undefined||args.specialist_ref!==undefined||args.handover_review_window_minutes!==undefined||args.handover_review_reason!==undefined)throw Error('Code review window requires separate ordinary QA of an exact runtime test receipt');
  const receipt=state.records[args.review_of],d=receipt?.development,candidate=state.records[d?.candidate_id],plan=state.records[d?.plan_id],controller=state.jobs[receipt?.author_instance];
  if(!receipt||receipt.kind!=='artifact'||receipt.author_role!=='runtime'||receipt.status!=='Submitted'||d?.type!=='test'||!sha(d.candidate_sha256)||!sha(d.receipt_sha256)||digest(JSON.stringify(d.result))!==d.receipt_sha256||receipt.content!==JSON.stringify(d.result)||candidate?.development?.type!=='candidate'||candidate.development.candidate_sha256!==d.candidate_sha256||candidate.development.plan_id!==plan?.id||!plan?.development?.scope||controller?.kind!=='development_test'||controller.status!=='completed'||controller.artifact_id!==receipt.id||controller.candidate_id!==candidate.id||controller.development_id!==plan.id||candidate.development.run?.receipt_id!==receipt.id||candidate.development.run?.job_id!==controller.id)throw Error('Code review window target must retain its actual runtime receipt/candidate/controller lineage');
  const key=`qa:review:${receipt.id}:${receipt.revision}`;
  if(fresh&&state.sessions[key])throw Error('Code review window requires a fresh target session; original failed or uncertain reviews remain retained');
  return {protocol:'development-code-review-window-subject-v1',receipt:ref(receipt),candidate:ref(candidate),plan:ref(plan),controller_sha256:digest(JSON.stringify(controller)),candidate_sha256:d.candidate_sha256,receipt_sha256:d.receipt_sha256};
}

// Every declared supplementary source must be complete inline or have a whole
// successful-delivery interval union. Source hashes alone prove no delivery.
export function validateCodeReviewDelivery(state,job,record,contextText){
  const ledger=job.delivered_record_reads;validateRecordReadDelivery(ledger);
  if(ledger.native_id!==job.native_id||ledger.initial_delivery.assignment_context_sha256!==job.context_sha256||JSON.stringify(record.delivered_record_reads)!==JSON.stringify(ledger))throw Error('Code review lacks its exact closed native delivery binding');
  const pack=JSON.parse(contextText);if(!Array.isArray(pack.records))throw Error('Code review requires complete inline record memberships');
  for(const ref of job.supplemental_sources??[]){
    const value=contextSource(state,ref.id),text=JSON.stringify(value);
    if(!value||digest(text)!==ref.sha256)throw Error('Code review supplemental source changed');
    if(pack.records.some(r=>r.id===ref.id&&r.revision===ref.revision&&digest(JSON.stringify(r))===ref.sha256))continue;
    const ranges=ledger.ranges.filter(r=>r.id===ref.id&&r.sha256===ref.sha256).sort((a,b)=>a.offset-b.offset);let end=0;
    for(const r of ranges){if(r.revision!==(ref.revision??null)||r.total_characters!==text.length||digest(text.slice(r.offset,r.offset+r.length))!==r.range_sha256||r.offset>end)throw Error('Code review READ delivery has a gap or mismatched range');end=Math.max(end,r.offset+r.length);}
    if(end!==text.length)throw Error('Code review lacks complete delivered supplemental evidence');
  }
  return true;
}

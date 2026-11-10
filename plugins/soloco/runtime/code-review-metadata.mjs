// Structural runtime metadata only. This never accepts a verdict, current
// grant, source selection or body supplied by a model as proof of permission.
import {normalizeCodeReviewWindow} from './timeout.mjs';
import {validateRecordReadDelivery} from './record-read-delivery.mjs';
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ref=v=>exact(v,['id','revision','sha256'])&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=500&&Number.isSafeInteger(v.revision)&&v.revision>0&&sha(v.sha256);
export function validCodeReviewMetadata(job){
  try{
    const setting=normalizeCodeReviewWindow(job),d=job.delivered_record_reads;
    if(!setting)return job.code_review_subject===undefined&&d===undefined;
    if(job.role!=='qa'||job.prototype_id||job.development_id||job.specialist||setting.code_review_reason!==job.code_review_reason||!job.review_of)return false;
    const s=job.code_review_subject,keys=['protocol','receipt','candidate','plan','controller_sha256','candidate_sha256','receipt_sha256'];
    const continuation=s&&Object.hasOwn(s,'continuation');if(continuation)keys.push('continuation','current_authority_sha256');
    if(!exact(s,keys)||s.protocol!=='development-code-review-window-subject-v1'||!ref(s.receipt)||!ref(s.candidate)||!ref(s.plan)||!sha(s.controller_sha256)||!sha(s.candidate_sha256)||!sha(s.receipt_sha256))return false;
    if(continuation?(!ref(s.continuation)||!sha(s.current_authority_sha256)||s.continuation.id!==job.review_of.id||s.continuation.revision!==job.review_of.revision):(s.receipt.id!==job.review_of.id||s.receipt.revision!==job.review_of.revision))return false;
    if(d!==undefined){validateRecordReadDelivery(d);if(d.initial_delivery.assignment_context_sha256!==job.context_sha256||job.native_id&&job.native_id!==d.native_id)return false;}
    return true;
  }catch{return false;}
}

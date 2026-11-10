// Presentation only: the current target remains authoritative. The historical
// test receipt selects literal/alias slots; it supplies no current permission.
import {digest} from './store.mjs';
import {renderDevelopmentReviewContext,restoreDevelopmentReceiptJSON,DEVELOPMENT_RECEIPT_JSON_PROTOCOL} from './development-receipt-json.mjs';
import {restoreDevelopmentFileBodies,DEVELOPMENT_FILE_BODIES_PROTOCOL} from './development-file-bodies.mjs';
export const CONTINUATION_REVIEW_TRANSPORT='development-review-continuation-transport-v1';
const targetProtocol='development-review-local-acceptance-continuation-v1';
const fail=()=>{throw Error('Invalid continuation review presentation binding');};
const hash=v=>digest(JSON.stringify(v));
const ref=r=>({id:r.id,revision:r.revision,sha256:hash(r)});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function pair(pack,reviewOf){
  if(!Array.isArray(pack.records))fail();
  const select=id=>{const rows=pack.records.filter(r=>r.id===id);if(rows.length!==1)fail();return rows[0];};
  const target=select(reviewOf.id),d=target.development;
  if(target.revision!==reviewOf.revision||target.kind!=='artifact'||target.author_role!=='runtime'||target.status!=='Submitted'||d?.type!=='review_continuation'||d.protocol!==targetProtocol)fail();
  const receipt=select(d.receipt_id),t=receipt.development;
  if(receipt.kind!=='artifact'||receipt.author_role!=='runtime'||t?.type!=='test'||t.plan_id!==d.plan_id||t.candidate_id!==d.candidate_id)fail();
  return {target,receipt};
}
function make(context,job){
  const pack=JSON.parse(context.text),{target,receipt}=pair(pack,job.review_of);
  const dependency={id:receipt.id,revision:receipt.revision};
  const presentation=JSON.parse(renderDevelopmentReviewContext(context,{...job,review_of:dependency}));
  return JSON.stringify({protocol:CONTINUATION_REVIEW_TRANSPORT,canonical_context_sha256:digest(context.text),assignment_context_sha256:context.hash,review_target:ref(target),receipt_dependency:ref(receipt),presentation});
}
export function restoreContinuationReviewContext(text,originalSha,assignmentSha,reviewTarget){
  let wire;try{wire=JSON.parse(text);}catch{fail();}
  if(!exact(wire,['protocol','canonical_context_sha256','assignment_context_sha256','review_target','receipt_dependency','presentation'])||wire.protocol!==CONTINUATION_REVIEW_TRANSPORT||wire.canonical_context_sha256!==originalSha||wire.assignment_context_sha256!==assignmentSha||!equal(wire.review_target,reviewTarget))fail();
  const selected={id:wire.receipt_dependency?.id,revision:wire.receipt_dependency?.revision},inner=JSON.stringify(wire.presentation);
  const original=wire.presentation?.protocol===DEVELOPMENT_RECEIPT_JSON_PROTOCOL?restoreDevelopmentReceiptJSON(inner,originalSha,assignmentSha,selected):wire.presentation?.protocol===DEVELOPMENT_FILE_BODIES_PROTOCOL?restoreDevelopmentFileBodies(inner,originalSha,assignmentSha,selected):inner;
  if(digest(original)!==originalSha)fail();
  const pack=JSON.parse(original),{target,receipt}=pair(pack,reviewTarget);
  if(!equal(ref(target),wire.review_target)||!equal(ref(receipt),wire.receipt_dependency)||make({text:original,hash:assignmentSha},{role:'qa',context_format:3,review_of:{id:target.id,revision:target.revision}})!==text)fail();
  return original;
}
export function renderContinuationAwareReviewContext(context,job){
  if(job?.role!=='qa'||!job.review_of||job.development_id||job.prototype_id||![undefined,1,2,3,5].includes(job.context_format)||context?.qualification||context?.qualification_evidence||context?.handover_evidence||context?.operating_evidence||context?.stream)return renderDevelopmentReviewContext(context,job);
  let pack;try{pack=JSON.parse(context?.text);}catch{return renderDevelopmentReviewContext(context,job);}
  const target=Array.isArray(pack?.records)?pack.records.find(r=>r?.id===job.review_of.id):undefined;
  if(target?.development?.type!=='review_continuation')return renderDevelopmentReviewContext(context,job);
  const text=make(context,job);
  if(restoreContinuationReviewContext(text,digest(context.text),context.hash,ref(target))!==context.text)fail();
  return text;
}

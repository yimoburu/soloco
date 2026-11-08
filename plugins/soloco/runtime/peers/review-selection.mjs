// Pure selection facts only. SQL, authority, current eligibility and contributor
// independence belong to the callers. Exact records are supplied by P1's private
// final-write/history resolver; this module never chooses a latest version.
export const REVIEW_SELECTION_RECIPE='peer-review-selection-v1';
export const REVIEW_PRODUCER_RECIPE='sha256-review-task-attempt-create-zero-v1';
const semantic=new Set(['tasks','homes','proposals','reviews','conflicts','notices','messages','deliveries']);
class FactError extends Error{}
const need=(v,message)=>{if(!v)throw new FactError(message);};
export function reviewScope(value){
  if(value===undefined||value===null)return '*';
  // Unicode mode rejects isolated UTF-16 surrogates while preserving complete
  // pairs. Keep the original string: scope identity is not normalized or trimmed.
  need(typeof value==='string'&&value.trim()&&value.length<=160&&!value.includes('\0')&&!/[\ud800-\udfff]/u.test(value),'Invalid production scope');return value;
}
export function reviewReference(value){
  need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='family,id,revision,sha256','Exact review selection reference required');
  need(semantic.has(value.family)&&typeof value.id==='string'&&value.id.trim()&&value.id.length<=2000&&!value.id.includes('\0')&&!/[\ud800-\udfff]/u.test(value.id)&&Number.isSafeInteger(value.revision)&&value.revision>0&&/^[a-f0-9]{64}$/.test(value.sha256??''),'Invalid review selection reference');
  return {family:value.family,id:value.id,revision:value.revision,sha256:value.sha256};
}
export function parseReviewOutput(output,subject,{canonical}){
  let parsed,encoded;try{parsed=JSON.parse(output);encoded=canonical(parsed);}catch{throw new FactError('Canonical observed review JSON required');}
  need(typeof output==='string'&&encoded===output,'Review output must use canonical JSON');
  const r=parsed?.review;
  need(r&&r.subject!==undefined&&subject!==undefined&&canonical(r.subject)===canonical(subject)&&['Pass','Fail','Blocked'].includes(r.verdict)&&Array.isArray(r.blockers)&&r.blockers.every(b=>typeof b==='string'&&b.trim())&&!(r.verdict==='Pass'&&r.blockers.length),'Observed review subject/verdict/blockers invalid');
  need(typeof r.reason==='string'&&r.reason.trim()&&r.reason.length<=12000&&!r.reason.includes('\0')&&Buffer.byteLength(canonical(r.blockers))<=16000,'Invalid bounded review reason/blockers');
  return {subject:JSON.parse(canonical(subject)),verdict:r.verdict,reason:r.reason,blockers:JSON.parse(canonical(r.blockers))};
}
export function extractReviewSelection({current,history,resolve,canonical,hash}){
  let anchor=null,subject=null,scope=null,adverse=['Fail','Blocked'].includes(current.value?.verdict),origin='unsupported';
  // P1 supplies fixed trusted canonical/hash primitives and decoded plain data.
  // resolve is the effectful boundary: it may execute guarded SQL/caller hooks.
  // Its failures must escape unchanged even if a hook throws a FactError
  // obtained from this module's exported validator. Internal data checks alone
  // produce semantic uncertainty. Arbitrary replacement primitives are outside
  // this extraction contract; this module performs no SQL or authorization.
  const resolverFailures=new Set();
  const resolveRecord=r=>{try{return resolve(r);}catch(error){resolverFailures.add(error);throw error;}};
  const same=(a,b)=>a!==undefined&&b!==undefined&&canonical(a)===canonical(b);
  const digest=value=>hash(canonical(value));
  const exact=(r,f)=>{const value=reviewReference(r);need(value.family===f,'Unexpected production reference family');return value;};
  const record=r=>{const row=resolveRecord(r);need(row&&row.family===r.family&&row.id===r.id&&row.revision===r.revision&&row.sha256===r.sha256&&row.value&&typeof row.value==='object'&&!Array.isArray(row.value)&&digest(row.value)===r.sha256,'Exact production history unavailable or changed');return row;};
  let first;
  try{
    need(Array.isArray(history)&&history.length===current.revision&&history.every((v,i)=>v.family==='reviews'&&v.id===current.id&&v.revision===i+1&&digest(v.value)===v.sha256)&&history.at(-1).sha256===current.sha256,'Complete canonical review history unavailable');
    need(history.every(row=>row.value&&typeof row.value==='object'&&!Array.isArray(row.value)),'Unsupported review record shape');
    first=history.find(row=>row.value.proof?.protocol==='peer-runtime-observation-v1');
    if(!first){
      // The sole protected producer allocates 64-hex digest IDs with an initial
      // compare-and-swap of zero. Non-digest manual IDs cannot be its output.
      need(!/^[a-f0-9]{64}$/.test(current.id)&&history.every(({value:v})=>v.proof?.protocol==='peer-native-review-v1'&&v.status==='accepted'&&v.verdict==='Pass'&&Array.isArray(v.blockers)&&v.blockers.length===0&&!['task_id','native_id','output_sha256','context_sha256'].some(k=>Object.hasOwn(v,k))&&Object.keys(v.proof).length===1),'Unresolved review production association');
      subject=reviewReference(current.value.subject);scope=reviewScope(current.value.scope);
      for(const row of history){reviewReference(row.value.subject);reviewScope(row.value.scope);}
      return {outcome:'MANUAL_NONADVERSE',anchor:null,subject,scope,adverse:false,origin:'manual',error:null};
    }
    anchor={review:{family:'reviews',id:first.id,revision:first.revision,sha256:first.sha256}};
    const original=first.value,r=current.value;
    need(original.proof?.protocol==='peer-runtime-observation-v1','Unsupported original review production');origin='runtime';
    need(first.revision===1,'Unresolved production association before protected anchor');
    anchor.task=exact(original.proof.task,'tasks');
    // effects are protected support, not semantic input references.
  }catch(error){
    if(resolverFailures.has(error)||!(error instanceof FactError))throw error;
    return {outcome:'INTEGRITY_UNKNOWN',anchor,subject,scope,adverse,origin,error:error.message};
  }
  // Protected effects use the same exact shape but are not a semantic family.
  // Keep this support resolver explicit rather than widening reviewReference.
  try{
    const original=first.value,r=current.value;
    const support=value=>{
      need(value&&Object.keys(value).sort().join(',')==='family,id,revision,sha256'&&value.family==='effects'&&typeof value.id==='string'&&value.id.trim()&&value.id.length<=2000&&!value.id.includes('\0')&&!/[\ud800-\udfff]/u.test(value.id)&&Number.isSafeInteger(value.revision)&&value.revision>0&&/^[a-f0-9]{64}$/.test(value.sha256??''),'Invalid protected observation reference');return {...value};
    };
    anchor.observation=support(original.proof.observation);
    need(r.proof?.protocol==='peer-runtime-observation-v1'&&same(r.proof.task,anchor.task)&&same(r.proof.observation,anchor.observation),'Original production anchor changed');
    const task=record(anchor.task),t=task.value,a=t.attempt,result=t.result;
    need(a&&typeof a==='object'&&!Array.isArray(a)&&typeof a.id==='string'&&a.id.trim()&&a.context&&typeof a.context==='object'&&/^[a-f0-9]{64}$/.test(a.context.sha256??''),'Unsupported production attempt');
    need(result&&typeof result.output==='string','Protected raw review output missing');
    let parsed;try{parsed=JSON.parse(result.output);}catch{throw new FactError('Malformed protected raw review output');}
    if(['Fail','Blocked'].includes(parsed?.review?.verdict))adverse=true;
    const raw=parseReviewOutput(result.output,parsed?.review?.subject,{canonical});
    subject=reviewReference(raw.subject);
    // Invalid scope is integrity uncertainty, but must not erase known raw
    // adversity merely because a mutable review alias claims Pass.
    scope=reviewScope(t.definition?.scope??t.scope);
    const output=hash(result.output),observation=record(anchor.observation).value;
    const normalized={subject,verdict:raw.verdict,reason:raw.reason,blockers:raw.blockers};
    need(a&&t.status==='returned'&&t.review_id===current.id&&current.id===digest(['review',task.id,a.id])&&same(t.review_of,subject)&&same(result.observation,anchor.observation),'Producing task/review linkage changed');
    need(result.error===null&&result.termination_confirmed===true&&a.termination_confirmed===true&&result.output_sha256===output&&result.native_id&&a.native_id===result.native_id,'Protected production result changed');
    need(observation.kind==='runtime_observation'&&observation.status==='recorded'&&observation.action==='task/finish'&&observation.task_id===task.id&&observation.attempt_id===a.id&&anchor.observation.id===digest(['runtime-observation',task.id,a.id,'task/finish'])&&observation.scope===scope&&t.scope===scope&&observation.output_sha256===output&&observation.native_id===result.native_id&&observation.context_sha256===a.context.sha256&&observation.termination_confirmed===true&&same(observation.review,normalized),'Protected observation linkage changed');
    for(const value of [original,r])need(value.status==='accepted'&&same(value.subject,subject)&&value.scope===scope&&value.verdict===raw.verdict&&value.reason===raw.reason&&same(value.blockers,raw.blockers)&&value.task_id===task.id&&value.termination_confirmed===true&&value.native_id===result.native_id&&value.output_sha256===output&&value.context_sha256===a.context.sha256,'Review aliases contradict protected production');
    return {outcome:'PROTECTED',anchor,subject,scope,adverse,origin,error:null};
  }catch(error){
    if(resolverFailures.has(error)||!(error instanceof FactError))throw error;
    return {outcome:'INTEGRITY_UNKNOWN',anchor,subject,scope,adverse,origin,error:error.message};
  }
}

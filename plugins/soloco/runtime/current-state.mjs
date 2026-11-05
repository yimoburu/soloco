import {digest} from './store.mjs';
const fields=['id','kind','author_role','recorded_by','content','status','action','previous_name','name','created_at'];
// Only the supported runtime rename record shape is presentation-only. Unknown
// fields/record producers remain conservative; no free-form status inference.
export function presentationOnly(record) {
  if(typeof record?.content!=='string'||/[;\n]|\b(?:and|also|but|while|prohibit|forbid|must)\b/i.test(record.content))return false;
  const command=record.content.trim().replace(/[.!]$/,'').toLowerCase();
  const from=record.previous_name?.toLowerCase(),to=record.name?.toLowerCase();
  const pure=[`rename ${from} to ${to}`,`rename the company from ${from} to ${to}`,`rename company to ${to}`,`rename the company to ${to}`,`rename to ${to}`].includes(command);
  return pure&& record?.kind==='decision'&&record.action==='rename'&&record.author_role==='human_founder'
    &&typeof record.recorded_by==='string'&&typeof record.previous_name==='string'&&typeof record.name==='string'
    &&Object.keys(record).every(k=>fields.includes(k));
}
export function contextSource(state,id) {if(Object.hasOwn(state.records??{},id))return state.records[id];return id.startsWith('upgrade:')?state.upgrade_history?.find(u=>u.id===id.slice(8)):id.startsWith('job:')?state.jobs?.[id.slice(4)]:state.records?.[id];}
export function recordReference(record,id=record.id) {return {id,revision:record.revision??null,sha256:digest(JSON.stringify(record))};}
export function classificationFor(state,record,id=record.id) {
  const c=state.context_classifications?.[id];if(!c)return null;
  if(typeof c!=='object'||Object.keys(c).some(k=>!['source','disposition','roles','scopes','plan','review','source_instruction','at'].includes(k)))throw Error('Unknown context classification fields: '+id);
  if(c.source.sha256!==digest(JSON.stringify(record))||c.source.revision!==(record.revision??null))return null; // changed source is mandatory until freshly classified
  const plan=state.records[c.plan.id],review=state.records[c.review.id];
  if(!plan||digest(JSON.stringify(plan))!==c.plan.sha256||!review||digest(JSON.stringify(review))!==c.review.sha256)throw Error('Context classification evidence changed: '+record.id);
  const job=state.jobs?.[review.job_id],v=review.review,p=plan.context_classification_plan;
  if(!p||review.author_role!=='qa'||review.status!=='Submitted'||job?.status!=='completed'||job.role!=='qa'||!job.native_id||review.author_instance!==job.instance_id||job.artifact_id!==review.id||review.author_instance===plan.author_instance||review.review_of?.id!==plan.id||review.review_of.revision!==plan.revision||v?.verdict!=='Pass'||v.permitted_action!=='apply_context_classification'||v.plan_sha256!==digest(JSON.stringify(p))||!Array.isArray(v.blockers)||v.blockers.length||p.disposition!==c.disposition||JSON.stringify(p.roles)!==JSON.stringify(c.roles)||JSON.stringify(p.scopes)!==JSON.stringify(c.scopes)||!p.sources.some(s=>JSON.stringify(s)===JSON.stringify(c.source)))throw Error('Context classification provenance invalid: '+record.id);
  if(job.native_id===plan.author_instance||job.native_id===state.owner?.session_id)throw Error('Context classification reused coordinator native identity');
  for(const source of p.sources){const value=contextSource(state,source.id);if(value?.author_instance===job.instance_id||value?.author_instance===job.native_id||state.jobs?.[value?.job_id]?.native_id===job.native_id)throw Error('Context classification reviewer owns source evidence');}
  if(Object.values(state.records).some(r=>r.status==='Submitted'&&r.review_of?.id===plan.id&&r.review_of?.revision===plan.revision&&['Fail','Blocked'].includes(r.review?.verdict)))throw Error('Context classification retains an unresolved negative review');
  return c;
}
export function relevantRecord(state,record,job={}) {
  if(presentationOnly(record))return false;
  const c=classificationFor(state,record);
  if(!c)return true;
  if(c.disposition==='resolved')return false;
  // No declared task scope means applicability is unknown, not unrelated.
  if(c.scopes?.length&&job.context_scope&& !c.scopes.includes(job.context_scope))return false;
  if(c.roles?.length&&!c.roles.includes(job.role))return false;
  return true;
}
export function governingRecords(state,job={}) {
  return Object.values(state.records).filter(r=>(['intent','decision','preference'].includes(r.kind)||['Fail','Blocked'].includes(r.review?.verdict))&&relevantRecord(state,r,job));
}
export function contextPlan(state,{record_ids,disposition,roles=[],scopes=[]}) {
  if(!Array.isArray(record_ids)||!record_ids.length||record_ids.length>100||new Set(record_ids).size!==record_ids.length)throw Error('Choose 1..100 unique record IDs');
  if(!['current','resolved'].includes(disposition))throw Error('Choose current or resolved disposition');
  for(const [name,values] of [['roles',roles],['scopes',scopes]])if(!Array.isArray(values)||values.length>100||values.some(v=>typeof v!=='string'||!v.trim()||v.length>160)||new Set(values).size!==values.length)throw Error('Invalid context '+name);
  if(roles.some(role=>!Object.hasOwn(state.roles,role)))throw Error('Unknown role');
  return {version:1,disposition,roles,scopes,sources:record_ids.map(id=>{const r=contextSource(state,id);if(!r)throw Error('Context source missing');return recordReference(r,id);})};
}
export function validateContextPlan(state,plan) {
  if(plan?.version!==1)throw Error('Unsupported context classification plan');
  const current=contextPlan(state,{record_ids:plan.sources.map(s=>s.id),...plan});
  if(JSON.stringify(current)!==JSON.stringify(plan))throw Error('Context classification source changed');
  return true;
}
export function contextRead(state,{id,sha256,offset=0,length=16000}) {
  const record=contextSource(state,id);if(!record||digest(JSON.stringify(record))!==sha256)throw Error('Missing or changed supplemental source');
  const text=JSON.stringify(record);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>32768||offset+length>text.length)throw Error('Invalid supplemental evidence range');
  return {id,revision:record.revision??null,sha256,offset,length,text:text.slice(offset,offset+length),total_characters:text.length};
}

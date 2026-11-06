import {validateScopedExclusion,SCOPED_PROTOCOL} from './scoped-context.mjs';
import {validateOperatingIndex} from './operating-state.mjs';
import {digest,requireText} from './store.mjs';
import {snapshotReference,resolveSnapshot,resolveSnapshotEntry,hasSnapshotReferences,legacyHandoverSource} from './snapshot.mjs';
import {buildQualificationEvidence,knownModelCatalog} from './upgrade-evidence.mjs';
import {validateQualificationExclusion,QUALIFICATION_PROTOCOL} from './context-qualification.mjs';
const fields=['id','kind','author_role','recorded_by','content','status','action','previous_name','name','created_at'];
const knownStateFields=new Set(['id','name','idea','owner','schema','runtime_version','plugin_version','revision','created_at','updated_at','paused','mode','phase','team_sha256','governance','governance_sha256','cos_instructions','roles','records','jobs','sessions','notices','messages','upgrade','upgrade_history','retired_sessions','context_classifications','context_last_plan','handover']);
const proofJobFields=new Set(['id','role','instance_id','session_key','native_id','host','epoch','status','artifact_id','review_of','inputs','context_format','context_scope','context_sha256','task','task_summary','next_handoff','model_selection','model_catalog','model_evidence','cli_version','requester','coordination','coordination_release','expected_deliverable','supplemental_sources','retrieved_inputs','created_at','started_at','finished_at','worker_pid','timeout_policy_version','timeout_minutes','timeout_ms','timeout_reason','execution_started_at','execution_deadline_at','termination_deadline_at']);
const keysOnly=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function proofJobSafe(job) {
  if(Object.keys(job).some(k=>!proofJobFields.has(k)))return false;
  for(const key of ['review_of','requester','model_selection','model_catalog','model_evidence','coordination_release'])if(job[key]!==undefined&&job[key]!==null&&(typeof job[key]!=='object'||Array.isArray(job[key])))return false;
  const scalarObject=(value,keys)=>keysOnly(value,keys)&&Object.values(value).every(v=>v===null||typeof v!=='object');
  const refs=(value,keys)=>Array.isArray(value)&&value.every(r=>keysOnly(r,keys)&&Object.values(r).every(v=>v===null||typeof v!=='object'));
  for(const [key,value] of Object.entries(job)){
    if(value===null||typeof value!=='object')continue;
    if(key==='inputs'){if(!refs(value,['id','revision']))return false;}
    else if(key==='supplemental_sources'||key==='retrieved_inputs'){if(!refs(value,['id','revision','sha256','offset','length','total_characters']))return false;}
    else if(key==='review_of'){if(!scalarObject(value,['id','revision']))return false;}
    else if(key==='requester'){if(!scalarObject(value,['role','session_id','host','epoch']))return false;}
    else if(key==='model_selection'){if(!scalarObject(value,['mode','model','effort','speed','reason']))return false;}
    else if(key==='model_catalog'){if(!knownModelCatalog(value))return false;}
    else if(key==='coordination_release'){if(!scalarObject(value,['termination_confirmed','reason','at'])||value.termination_confirmed!==true||value.reason!=='model_process_closed')return false;}
    else if(key==='model_evidence'){
      if(!keysOnly(value,['reported_models','reported_effort','reported_service_tier','applied_controls','source','scope','verification','usage'])
        ||!Array.isArray(value.reported_models)||value.reported_models.some(v=>typeof v!=='string')
        ||Object.entries(value).some(([k,v])=>!['reported_models','applied_controls','usage'].includes(k)&&v!==null&&typeof v==='object')
        ||(value.applied_controls&&!scalarObject(value.applied_controls,['model','effort','service_tier','fast_mode','switch_models_on_flag','scope','verification']))
        ||(value.usage&&Object.values(value.usage).some(v=>!keysOnly(v,['inputTokens','outputTokens','cacheReadInputTokens','cacheCreationInputTokens','webSearchRequests','costUSD'])||Object.values(v).some(n=>!Number.isFinite(n)||n<0))))return false;
    }else return false; // Complex/unknown legacy metadata needs explicit review.
  }
  return true;
}
export function currentExtensions(state) {
  // Prospective mechanical metadata is omitted only after exact receipt/index
  // validation. With no publication, frozen classification inputs are unchanged.
  if(Object.hasOwn(state,'operating_state'))validateOperatingIndex(state);
  return Object.fromEntries(Object.entries(state).filter(([key])=>!knownStateFields.has(key)&&key!=='operating_state'));
}
// Only the supported runtime rename record shape is presentation-only. Unknown
// fields/record producers remain conservative; no free-form status inference.
export function presentationOnly(record) {
  if(typeof record?.content!=='string'||typeof record.previous_name!=='string'||typeof record.name!=='string')return false;
  const command=record.content.trim().toLowerCase();
  const from=record.previous_name.toLowerCase(),to=record.name.toLowerCase();
  // Compare the entire instruction with the literal names. A name may itself
  // contain words such as "and" or "must"; extra instructions still do not
  // match any complete supported rename form.
  const pure=[`rename ${from} to ${to}`,`rename the company from ${from} to ${to}`,`rename company to ${to}`,`rename the company to ${to}`,`rename to ${to}`]
    .some(text=>command===text||command===text+'.'||command===text+'!');
  return pure&& record?.kind==='decision'&&record.action==='rename'&&record.author_role==='human_founder'
    &&typeof record.recorded_by==='string'&&typeof record.previous_name==='string'&&typeof record.name==='string'
    &&Object.keys(record).every(k=>fields.includes(k));
}
export function contextSource(state,id) {if(Object.hasOwn(state.records??{},id))return state.records[id];return id.startsWith('upgrade:')?(state.upgrade_history?.find(u=>u.id===id.slice(8))??(state.upgrade?.id===id.slice(8)?state.upgrade:undefined)):id.startsWith('job:')?state.jobs?.[id.slice(4)]:state.records?.[id];}
export function recordReference(record,id=record.id) {return {id,revision:record.revision??null,sha256:digest(JSON.stringify(record))};}
export function classificationFor(state,record,id=record.id,validation) {
  const c=state.context_classifications?.[id];if(!c)return null;
  if(c.scoped_qualification){
    const proof=c.scoped_qualification;
    if(Object.keys(c).some(k=>!['source','disposition','plan','review','scoped_qualification','source_instruction','at'].includes(k))||proof.protocol!==SCOPED_PROTOCOL||proof.source?.id!==id||c.disposition!=='represented')throw Error('Scoped classification identity/fields changed: '+id);
    for(const [key,value] of [['source',proof.source],['plan',proof.plan],['review',proof.integration]])if(JSON.stringify(c[key])!==JSON.stringify(value))throw Error('Scoped classification metadata changed: '+id);
    validateScopedExclusion(state,proof);return c;
  }
  if(c.partition_qualification){
    const proof=c.partition_qualification;
    if(Object.keys(c).some(k=>!['source','disposition','plan','review','partition_qualification','source_instruction','at'].includes(k)))throw Error('Unknown context tree classification fields: '+id);
    if(proof.protocol!==QUALIFICATION_PROTOCOL||proof.source?.id!==id)throw Error('Context tree classification identity mismatch: '+id);
    for(const [key,value] of [['source',proof.source],['plan',proof.plan],['review',proof.aggregate]])if(c[key]!==undefined&&JSON.stringify(c[key])!==JSON.stringify(value))throw Error('Context tree classification metadata changed: '+id);
    if(c.disposition!==undefined&&c.disposition!=='represented')throw Error('Context tree disposition changed: '+id);
    validateQualificationExclusion(state,proof);
    return {...c,source:proof.source,disposition:'represented',plan:proof.plan,review:proof.aggregate};
  }
  if(typeof c!=='object'||Object.keys(c).some(k=>!['source','disposition','roles','scopes','plan','review','source_instruction','at','qualification'].includes(k)))throw Error('Unknown context classification fields: '+id);
  if(c.source?.id!==id)throw Error('Context classification source identity mismatch: '+id);
  if(c.source.sha256!==digest(JSON.stringify(record))||c.source.revision!==(record.revision??null))return null; // changed source is mandatory until freshly classified
  const plan=state.records[c.plan.id],review=state.records[c.review.id];
  if(!plan||digest(JSON.stringify(plan))!==c.plan.sha256||!review||digest(JSON.stringify(review))!==c.review.sha256)throw Error('Context classification evidence changed: '+record.id);
  const job=state.jobs?.[review.job_id],v=review.review,p=plan.context_classification_plan;
  if(p?.version===2){
    // Source/counterpart changes revoke exclusion. Proof mutation is a hold.
    try{validateContextPlan(state,p);}catch(error){if(/source changed/.test(error.message))return null;throw error;}
    if(!c.qualification||JSON.stringify(c.qualification)!==JSON.stringify(qualificationReceipt(job,p,review)))throw Error('Context qualification receipt changed');
    validateQualification(state,plan,review,{ownership:false});
  }
  if(!p||review.author_role!=='qa'||review.status!=='Submitted'||job?.status!=='completed'||job.role!=='qa'||!job.native_id||review.author_instance!==job.instance_id||job.artifact_id!==review.id||review.author_instance===plan.author_instance||review.review_of?.id!==plan.id||review.review_of.revision!==plan.revision||v?.verdict!=='Pass'||v.permitted_action!=='apply_context_classification'||v.plan_sha256!==digest(JSON.stringify(p))||!Array.isArray(v.blockers)||v.blockers.length||p.disposition!==c.disposition||JSON.stringify(p.roles)!==JSON.stringify(c.roles)||JSON.stringify(p.scopes)!==JSON.stringify(c.scopes)||!p.sources.some(s=>JSON.stringify(s)===JSON.stringify(c.source)))throw Error('Context classification provenance invalid: '+record.id);
  if(job.native_id===plan.author_instance||job.native_id===state.owner?.session_id)throw Error('Context classification reused coordinator native identity');
  for(const source of p.sources){const value=contextSource(state,source.id);if(value?.author_instance===job.instance_id||value?.author_instance===job.native_id||state.jobs?.[value?.job_id]?.native_id===job.native_id)throw Error('Context classification reviewer owns source evidence');}
  if(validation?.negativePlans?validation.negativePlans.has(JSON.stringify([plan.id,plan.revision])):Object.values(state.records).some(r=>r.status==='Submitted'&&r.review_of?.id===plan.id&&r.review_of?.revision===plan.revision&&['Fail','Blocked'].includes(r.review?.verdict)))throw Error('Context classification retains an unresolved negative review');
  return c;
}
export function relevantRecord(state,record,job={},classification=classificationFor(state,record)) {
  if(presentationOnly(record))return false;
  const c=classification;
  if(!c)return true;
  if(['resolved','represented'].includes(c.disposition))return false;
  // No declared task scope means applicability is unknown, not unrelated.
  if(c.scopes?.length&&job.context_scope&& !c.scopes.includes(job.context_scope))return false;
  if(c.roles?.length&&!c.roles.includes(job.role))return false;
  return true;
}
function unrelatedScopedHome(projection,id,job){
  const scopes=projection.scopedHomes?.get(id);
  return Boolean(!projection.globalMandatory?.has(id)&&job.context_scope&&scopes?.length&&!scopes.includes('*')&&!scopes.includes(job.context_scope));
}
export function governingRecords(state,job={},projection=reviewedContext(state)) {
  if(Object.entries(state.records).some(([key,r])=>key!==r.id))throw Error('Ambiguous record identity; exact source repair required');
  return Object.values(state.records).filter(r=>!unrelatedScopedHome(projection,r.id,job)&&(projection.mandatory.has(r.id)||((['intent','decision','preference'].includes(r.kind)||['Fail','Blocked'].includes(r.review?.verdict))&&relevantRecord(state,r,job,projection.classifications.get(r.id)??null))));
}
// Typed job/upgrade homes are exact compulsory inputs too. Ordinary format 3
// includes ONLY these declared homes, never every historical execution body.
export function mandatoryExecutionEvidence(state,projection=reviewedContext(state)){
  const values=[];
  for(const id of projection.mandatory)if(!Object.hasOwn(state.records??{},id)){
    const value=resolveSnapshotEntry(state,contextSource(state,id));
    if(!value)throw Error('Mandatory context home missing: '+id);
    values.push({source:recordReference(value,id),value});
  }
  return values.sort((a,b)=>a.source.id.localeCompare(b.source.id));
}
// New ordinary dispatch contract. Legacy format 3 retains its original
// category-based selection; format 5 includes every unqualified semantic record.
export function currentRecords(state,job={},projection=reviewedContext(state)) {
  if(Object.entries(state.records).some(([key,r])=>key!==r.id))throw Error('Ambiguous record identity; exact source repair required');
  return Object.values(state.records).filter(r=>!unrelatedScopedHome(projection,r.id,job)&&(!job.id||r.job_id!==job.id)&&(projection.mandatory.has(r.id)||(!projection.excluded(r.id)&&relevantRecord(state,r,job,projection.classifications.get(r.id)??null))));
}
export function currentExecutionEvidence(state,job={},projection=reviewedContext(state)) {
  const sources=[];
  const add=(id,value)=>{
    const c=projection.classifications.get(id);
    // Duplicate IDs with different bytes cannot borrow the first occurrence's
    // disposition. Keep those distinct originals compulsory.
    if(c&&c.source.sha256===digest(JSON.stringify(value))&&!relevantRecord(state,value,job,c))return;
    sources.push({source:recordReference(value,id),value});
  };
  for(const [key,value] of Object.entries(state.jobs??{}))if(key!==job.id&&!projection.proofJobs.has(key))add('job:'+key,value);
  for(const value of [...(state.upgrade_history??[]),...(state.upgrade?[state.upgrade]:[])])add('upgrade:'+value.id,value);
  return sources;
}
export function contextPlan(state,{record_ids,disposition,roles=[],scopes=[],counterpart_ids,coverage}) {
  if(!Array.isArray(record_ids)||!record_ids.length||record_ids.length>100||new Set(record_ids).size!==record_ids.length)throw Error('Choose 1..100 unique record IDs');
  if(!['current','resolved','represented'].includes(disposition))throw Error('Choose current, resolved or represented disposition');
  for(const [name,values] of [['roles',roles],['scopes',scopes]])if(!Array.isArray(values)||values.length>100||values.some(v=>typeof v!=='string'||!v.trim()||v.length>160)||new Set(values).size!==values.length)throw Error('Invalid context '+name);
  if(roles.some(role=>!Object.hasOwn(state.roles,role)))throw Error('Unknown role');
  const sources=record_ids.map(id=>{const r=contextSource(state,id);if(!r)throw Error('Context source missing');return recordReference(r,id);});
  if(disposition!=='represented'){
    if(counterpart_ids!==undefined||coverage!==undefined)throw Error('Counterparts require represented disposition');
    return {version:1,disposition,roles,scopes,sources};
  }
  if(roles.length||scopes.length)throw Error('Represented obligations are mandatory in every scope');
  if(!Array.isArray(counterpart_ids)||!counterpart_ids.length||counterpart_ids.length>100||new Set(counterpart_ids).size!==counterpart_ids.length)throw Error('Choose 1..100 exact mandatory counterparts');
  const counterparts=counterpart_ids.map(id=>{
    if(record_ids.includes(id)||!Object.hasOwn(state.records,id))throw Error('Counterpart must be a separate live record');
    if(hasSnapshotReferences(state.records[id]))throw Error('Current counterpart must present obligations directly; snapshot containers remain original evidence');
    return recordReference(state.records[id],id);
  });
  const dimensions=['findings','failures','uncertain_effects','exhausted_allowances'];
  if(!Array.isArray(coverage)||coverage.length!==sources.length)throw Error('Complete per-source semantic coverage required');
  for(const source of sources){
    const matches=coverage.filter(c=>c?.source_id===source.id),c=matches[0];
    if(matches.length!==1||Object.keys(c).sort().join(',')!==['source_id','counterpart_ids',...dimensions].sort().join(',')
      ||!Array.isArray(c.counterpart_ids)||!c.counterpart_ids.length||new Set(c.counterpart_ids).size!==c.counterpart_ids.length
      ||c.counterpart_ids.some(id=>!counterpart_ids.includes(id))||dimensions.some(k=>typeof c[k]!=='string'||!c[k].trim()||c[k].length>20000))throw Error('Explicit finding/failure/uncertainty/allowance coverage required');
  }
  if(!state.owner?.session_id||!Number.isSafeInteger(state.owner.epoch))throw Error('Qualification owner epoch required');
  return {version:2,disposition,roles,scopes,sources,counterparts,coverage:structuredClone(coverage),owner:{...state.owner}};
}
export function validateContextPlan(state,plan) {
  if(![1,2].includes(plan?.version))throw Error('Unsupported context classification plan');
  const current=contextPlan(plan.version===2?{...state,owner:plan.owner}:state,{...plan,record_ids:plan.sources.map(s=>s.id),...(plan.version===2?{counterpart_ids:plan.counterparts.map(s=>s.id)}:{})});
  if(JSON.stringify(current)!==JSON.stringify(plan))throw Error('Context classification source changed');
  return true;
}
function qualificationReceipt(job,plan,review) {
  return {protocol:2,epoch:plan.owner.epoch,native_id:job?.native_id,job_sha256:digest(JSON.stringify(job)),legacy_dependencies:job?.context_format===4?review.context_qualification?.legacy_dependencies:[]};
}
function delivered(state,job,ref) {
  if(state.records[ref.id]&&job.inputs?.some(i=>i.id===ref.id&&i.revision===ref.revision))return true;
  let end=0;
  for(const read of (job.retrieved_inputs??[]).filter(r=>r.id===ref.id&&r.sha256===ref.sha256).sort((a,b)=>a.offset-b.offset)){
    if(!Number.isSafeInteger(read.offset)||!Number.isSafeInteger(read.length)||read.length<1||read.offset>end)break;
    end=Math.max(end,read.offset+read.length);
  }
  return end>=JSON.stringify(contextSource(state,ref.id)).length;
}
function validateQualification(state,plan,review,{ownership=true}={}) {
  const p=plan.context_classification_plan,job=state.jobs?.[review?.job_id],v=review?.review;
  if(p?.version!==2||job?.status!=='completed'||job.role!=='qa'||job.prototype_id||job.development_id||job.artifact_id!==review.id||!job.native_id
    ||job.epoch!==p.owner.epoch||review.author_role!=='qa'||review.author_instance!==job.instance_id
    ||review.status!=='Submitted'||review.review_of?.id!==plan.id||review.review_of.revision!==plan.revision
    ||job.review_of?.id!==plan.id||job.review_of.revision!==plan.revision
    ||job.native_id===p.owner.session_id||job.instance_id===plan.author_instance||job.native_id===plan.author_instance
    ||v?.verdict!=='Pass'||v.permitted_action!=='apply_context_classification'||v.plan_sha256!==digest(JSON.stringify(p))
    ||v.coverage_complete!==true||v.obligations_preserved!==true||!Array.isArray(v.unique_findings)||v.unique_findings.length
    ||!Array.isArray(v.blockers)||v.blockers.length)throw Error('Exact independent semantic qualification Pass required');
  const frozen=job.context_format===4;
  if(frozen){
    const receipt=review.context_qualification;
    if(receipt?.protocol!==2||receipt.semantic_delivery_complete!==true||receipt.native_id!==job.native_id||receipt.plan_sha256!==v.plan_sha256||receipt.context_sha256!==job.context_sha256||!Array.isArray(receipt.legacy_dependencies))throw Error('Runtime same-native qualification delivery receipt required');
    for(const ref of receipt.legacy_dependencies){const source=contextSource(state,ref.id);if(!keysOnly(ref,['id','revision','sha256'])||!source||JSON.stringify(recordReference(source,ref.id))!==JSON.stringify(ref))throw Error('Qualification legacy evidence changed');}
    if(ownership){const evidence=buildQualificationEvidence(state,plan,job);if(receipt.stream_sha256!==evidence.sources[evidence.pages[0].source_id].sha256||JSON.stringify(receipt.legacy_dependencies)!==JSON.stringify(evidence.handover.review_context.value.legacy_dependencies))throw Error('Qualification delivery source changed');}
  }
  for(const ref of [...p.sources,...p.counterparts]){
    const value=contextSource(state,ref.id);
    if(!frozen&&hasSnapshotReferences(value))throw Error('Referenced originals require streamed qualification');
    if(ownership&&ownsEvidence(state,value,job))throw Error('Qualification reviewer owns source or counterpart');
    if(!frozen&&!delivered(state,job,ref))throw Error('Qualification reviewer did not receive complete exact source/counterpart '+ref.id);
  }
}
function ownsEvidence(state,value,job) {
  const todo=[value],seen=new Set(),snapshots=new Set();
  const identityFields=new Set(['author_instance','recorded_by','session_id','native_id','instance_id','probe_native_id','reviewer_native_id']);
  while(todo.length){
    const item=todo.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);
    const legacy=legacyHandoverSource(state,item);if(legacy){todo.push(legacy);continue;}
    if(state.jobs?.[item.job_id]?.native_id===job.native_id)return true;
    const ref=snapshotReference(item);
    if(ref){if(!snapshots.has(ref.sha256)){snapshots.add(ref.sha256);todo.push(resolveSnapshot(state,item));}continue;}
    for(const [key,value] of Object.entries(item)){
      if(identityFields.has(key)&&[job.instance_id,job.native_id].includes(value))return true;
      if(value&&typeof value==='object')todo.push(value);
    }
  }
  return false;
}
// Engine integration must call this for v2 instead of constructing classifications
// directly. contextMatches is supplied to avoid a context/current-state cycle.
export function applyContextQualification(state,plan,review,{source_instruction,contextMatches}={}) {
  requireText(source_instruction,'source_instruction');
  const p=plan?.context_classification_plan;
  if(p?.version!==2)throw Error('Expected v2 context qualification');
  validateContextPlan(state,p);
  if(JSON.stringify(p.owner)!==JSON.stringify(state.owner))throw Error('Qualification owner epoch changed');
  validateQualification(state,plan,review);
  if(typeof contextMatches!=='function'||!contextMatches(state,state.jobs[review.job_id],state.jobs[review.job_id].context_sha256))throw Error('Qualification review context stale');
  if(Object.values(state.records).some(r=>r.status==='Submitted'&&r.review_of?.id===plan.id&&r.review_of.revision===plan.revision&&['Fail','Blocked'].includes(r.review?.verdict)))throw Error('Qualification retains an unresolved negative review');
  const classifications={};
  for(const source of p.sources)classifications[source.id]={source,disposition:p.disposition,roles:p.roles,scopes:p.scopes,plan:recordReference(plan),review:recordReference(review),qualification:qualificationReceipt(state.jobs[review.job_id],p,review),source_instruction,at:new Date().toISOString()};
  return classifications;
}
export function reviewedContext(state) {
  const classifications=new Map(),mandatory=new Set(),proofs=new Set(),proofJobs=new Set(),scopedHomes=new Map(),globalMandatory=new Set();
  const validation={negativePlans:new Set(Object.values(state.records??{}).filter(r=>r.status==='Submitted'&&r.review_of&&['Fail','Blocked'].includes(r.review?.verdict)).map(r=>JSON.stringify([r.review_of.id,r.review_of.revision])))};
  for(const id of Object.keys(state.context_classifications??{})){
    const source=contextSource(state,id);if(!source)throw Error('Context classification source is missing: '+id);
    const c=classificationFor(state,source,id,validation);
    if(!c){
      const stale=state.context_classifications[id];
      if(stale.disposition==='represented'){
        const plan=state.records[stale.plan.id]?.context_classification_plan;
        if(!plan?.counterparts)throw Error('Context qualification proof changed');
        if(!state.records[id])throw Error('Reviewed historical source changed; fresh qualification required: '+id);
        mandatory.add(id);globalMandatory.add(id);
        for(const ref of plan.counterparts){if(!state.records[ref.id])throw Error('Mandatory counterpart missing');mandatory.add(ref.id);globalMandatory.add(ref.id);}
      }
      continue;
    }
    classifications.set(id,c);
    if(c.scoped_qualification){
      const p=c.scoped_qualification;
      for(const {source,scopes} of p.home_scopes){mandatory.add(source.id);const prior=scopedHomes.get(source.id)??[];scopedHomes.set(source.id,[...new Set([...prior,...scopes])]);}
      proofs.add(p.plan.id);
      for(const receipt of p.receipts){proofJobs.add(receipt.job.id.slice(4));proofs.add(receipt.review.id);proofs.add(receipt.target.id);const target=state.records[receipt.target.id]?.scoped_context_target;if(target)proofs.add(target.plan.id);}
      continue;
    }
    if(c.partition_qualification){
      const p=c.partition_qualification,plan=state.records[p.plan.id].context_partition_plan;
      for(const ref of [...p.counterparts,...plan.reviewed_subject.records.map(r=>r.ref)]){mandatory.add(ref.id);globalMandatory.add(ref.id);}
      proofs.add(p.plan.id);
      for(const reviewer of p.reviewers){const job=state.jobs[reviewer.id];proofJobs.add(job.id);proofs.add(job.artifact_id);proofs.add(job.review_of.id);}
      continue;
    }
    if(['resolved','represented'].includes(c.disposition)){
      proofs.add(c.plan.id);proofs.add(c.review.id);
      const jobId=state.records[c.review.id].job_id,job=state.jobs[jobId];
      // Only the exact producing QA job, with recognized mechanical fields, is
      // part of the classification proof. An aliasing artifact_id, error or
      // unknown extension is independent evidence and stays compulsory.
      if(job&&job.id===jobId&&job.artifact_id===c.review.id&&proofJobSafe(job))proofJobs.add(jobId);
      if(c.disposition==='represented')for(const ref of state.records[c.plan.id].context_classification_plan.counterparts){mandatory.add(ref.id);globalMandatory.add(ref.id);}
    }
  }
  for(const key of proofJobs)if(mandatory.has('job:'+key)||classifications.get('job:'+key)?.disposition==='current')proofJobs.delete(key);
  return {classifications,mandatory,proofs,proofJobs,scopedHomes,globalMandatory,excluded:id=>!mandatory.has(id)&&(['resolved','represented'].includes(classifications.get(id)?.disposition)||(!classifications.has(id)&&proofs.has(id)))};
}
export function contextRead(state,{id,sha256,offset=0,length=16000}) {
  const record=contextSource(state,id);if(!record||digest(JSON.stringify(record))!==sha256)throw Error('Missing or changed supplemental source');
  const text=JSON.stringify(record);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>32768||offset+length>text.length)throw Error('Invalid supplemental evidence range');
  return {id,revision:record.revision??null,sha256,offset,length,text:text.slice(offset,offset+length),total_characters:text.length};
}

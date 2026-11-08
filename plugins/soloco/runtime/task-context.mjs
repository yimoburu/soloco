import {SchedulingHold,taskRecovery} from './recovery.mjs';
// Ordinary async-task working context. This is a derived view of canonical
// records, not an applicability classifier, acceptance receipt or authority.
import {digest,owner,upgradePending} from './store.mjs';
import {recordReference,contextSource,currentRecords,currentExtensions,reviewedContext,mandatoryExecutionEvidence,currentExecutionEvidence,proofJobSafe} from './current-state.mjs';
import {hasSnapshotReferences,inheritSnapshots} from './snapshot.mjs';
import {validateTaskRecord,isTaskBookkeeping,isTaskScopedMessage,isTaskOutput,isTaskOwnOutput,taskMessageInput,taskDefinitionHash} from './tasks.mjs';
import {runtimeControlBinding,isRuntimeBookkeeping} from './task-runtime-authority.mjs';
import {bindCoordination} from './coordination.mjs';
import {normalizeTimeout} from './timeout.mjs';

export const TASK_CONTEXT_PROTOCOL='async-task-context-v1';
export const TASK_CONTEXT_BUDGET=64*1024;
export const PORTFOLIO_CONTEXT_BUDGET=16*1024;
const sha=value=>digest(JSON.stringify(value));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=message=>{throw Error('Task context Held: '+message);};
const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
const only=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const inputReference=value=>only(value,['id','revision'])&&Object.keys(value).length===2&&typeof value.id==='string'&&(value.revision===null||Number.isSafeInteger(value.revision)&&value.revision>0);
const unsigned=value=>Number.isSafeInteger(value)&&value>=0;
const usageScope='Complete visible task prompts and returned texts; provider-added instructions and hidden reasoning are not measured';
function runtimeUsageSafe(value){
  if(!only(value,['version','budget_bytes','visible_wire_bytes','initial_prompt_utf8_bytes','context_utf8_bytes','requests','rounds','scope'])||value.version!==1||value.scope!==usageScope||value.budget_bytes!==TASK_CONTEXT_BUDGET||!Array.isArray(value.requests)||!value.requests.length||value.requests.length>17||value.rounds!==value.requests.length)return false;
  if(['visible_wire_bytes','initial_prompt_utf8_bytes','context_utf8_bytes'].some(key=>!unsigned(value[key]))||value.context_utf8_bytes>value.initial_prompt_utf8_bytes||value.visible_wire_bytes>value.budget_bytes)return false;
  const fields=['request_utf8_bytes','request_utf16_characters','response_utf8_bytes','response_utf16_characters'];
  if(value.requests.some(r=>!only(r,fields)||Object.keys(r).length!==fields.length||fields.some(key=>!unsigned(r[key]))))return false;
  return value.initial_prompt_utf8_bytes===value.requests[0].request_utf8_bytes&&value.visible_wire_bytes===value.requests.reduce((n,r)=>n+r.request_utf8_bytes+r.response_utf8_bytes,0);
}
// This exemption describes only this source's prospective operational job
// envelope. Unknown fields, failures, stale outputs and legacy jobs are evidence.
function runtimeJobBookkeeping(state,job,currentJob){
  try{
    if(state.jobs?.[job.id]!==job||!['queued','running','completed'].includes(job.status)||job.context_format!==7||!only(job.runtime_task,['id','definition_revision','definition_sha256'])||Object.keys(job.runtime_task).length!==3)return false;
    const record=canonicalTask(state,job.runtime_task.id),task=record.runtime_task,attempt=task.attempts[0],control=runtimeControlBinding(state);
    if(!equal(task.owner,state.owner)||!attempt||task.attempts.length!==1||attempt.job_id!==job.id||attempt.instance_id!==job.instance_id||attempt.definition_revision!==task.definition_revision||attempt.definition_sha256!==task.definition_sha256||!equal(job.runtime_task,taskDefinitionBinding(record)))return false;
    if(job.host!==task.owner.host||job.epoch!==task.owner.epoch||job.role!==task.spec.role||job.task!==task.spec.task||job.context_scope!==task.spec.context_scope||job.expected_deliverable!==task.spec.expected_deliverable||job.task_summary!==task.spec.expected_deliverable||job.next_handoff!=='Runtime validates the exact result and wakes eligible dependent tasks'||job.session_key!==job.role+':async:'+job.id)return false;
    if(!equal(job.requester,{role:'runtime',instance_id:control.instance_id,task_id:record.id,owner_epoch:task.owner.epoch})||!/^[a-f0-9]{64}$/.test(job.context_sha256??''))return false;
    const timeout=normalizeTimeout({timeout_ms:task.spec.timeout_ms,timeout_reason:task.spec.timeout_reason});
    if(job.timeout_policy_version!==1||job.timeout_ms!==timeout.timeout_ms||job.timeout_reason!==timeout.timeout_reason)return false;
    const dependencies=task.spec.depends_on.map(dep=>canonicalTask(state,dep.task_id).runtime_task.attempts[0]?.job_id);
    if(dependencies.some(id=>typeof id!=='string'))return false;
    const bound=bindCoordination(state,{depends_on:[...new Set(dependencies)]});
    const coordination=bound||task.spec.resources.length?{version:1,dependencies:bound?.dependencies??[],resources:task.spec.resources}:null;
    if(!equal(job.coordination,coordination))return false;
    if(task.spec.review_task_id){
      const producer=canonicalTask(state,task.spec.review_task_id),prior=state.jobs?.[producer.runtime_task.attempts[0]?.job_id],target=state.records?.[prior?.artifact_id];
      if(!target||!equal(job.review_of,{id:target.id,revision:target.revision}))return false;
    }else if(job.review_of!==null)return false;
    if(!Array.isArray(job.inputs)||job.inputs.some(input=>{
      const value=taskMessageInput(state,job,state.records?.[input.id]);
      return !inputReference(input)||!value||(value.revision??null)!==input.revision;
    })||task.spec.input_ids.some(id=>!job.inputs.some(input=>input.id===id)))return false;
    if(job.runtime_context_usage!==undefined&&!runtimeUsageSafe(job.runtime_context_usage))return false;
    const {runtime_task,runtime_context_usage,requester,coordination:ignored,...legacy}=job;
    if(!proofJobSafe(legacy))return false;
    if(job.status==='completed'){
      const output=state.records?.[job.artifact_id];
      return isTaskOutput(state,output)||currentJob.id===job.id&&isTaskOwnOutput(state,currentJob,output);
    }
    return job.artifact_id===undefined&&job.finished_at===undefined&&job.coordination_release===undefined;
  }catch{return false;}
}
const checkBudget=(value,fallback)=>{
  const budget=value??fallback;
  if(!Number.isSafeInteger(budget)||budget<512||budget>200000)throw Error('Context budget must be an integer512..200000 UTF-8bytes');
  return budget;
};
const ref=(id,value)=>({id,revision:null,sha256:sha(value)});
const taskRecords=state=>Object.values(state.records??{}).filter(r=>typeof r?.id==='string'&&r.id.startsWith('async-task-'));
const controls=state=>({company_id:state.id,name:state.name,idea:state.idea,owner:state.owner,paused:state.paused,mode:state.mode,phase:state.phase,team_sha256:state.team_sha256,
  governance_source:ref('@public:pinned:governance',state.governance),cos_instructions_source:ref('@public:pinned:cos_instructions',state.cos_instructions),roles_source:ref('@public:pinned:roles',state.roles)});

export function taskDefinitionBinding(record){
  const task=record?.runtime_task;
  if(task?.version!==1||!Number.isSafeInteger(task.definition_revision)||task.definition_revision<1||task.definition_sha256!==taskDefinitionHash(task.spec))fail('task definition missing or changed');
  return {id:record.id,definition_revision:task.definition_revision,definition_sha256:task.definition_sha256};
}
function canonicalTask(state,id){
  const record=state.records?.[id];
  if(!record)fail('canonical task missing: '+id);
  validateTaskRecord(record,state);
  taskDefinitionBinding(record);
  return record;
}
function taskForJob(state,job){
  const binding=job.runtime_task;
  if(!binding||typeof binding.id!=='string'||Object.keys(binding).some(k=>!['version','id','definition_revision','definition_sha256'].includes(k))||(binding.version!==undefined&&binding.version!==1))fail('runtime task binding required');
  const record=canonicalTask(state,binding.id),task=record.runtime_task;
  if(binding.definition_revision!==task.definition_revision||binding.definition_sha256!==task.definition_sha256)fail('task definition superseded');
  if(!equal(task.owner,state.owner)||job.epoch!==undefined&&job.epoch!==state.owner.epoch||job.host!==undefined&&job.host!==task.owner.host)fail('task owner epoch or host changed');
  if(job.role!==task.spec.role||job.task!==task.spec.task||(job.context_scope??'*')!==(task.spec.context_scope??'*'))fail('assignment does not match task definition');
  owner(state,task.owner.session_id,task.owner.host,task.owner.epoch);
  if(state.mode!=='preparation')fail('only the current bounded preparation contract is supported');
  if(['cancelling','cancelled'].includes(task.state))fail('task was cancelled');
  if(state.paused||upgradePending(state))fail('company paused or upgrading');
  if(!runtimeControlBinding(state).enabled)fail('runtime is stopped');
  if(!Object.hasOwn(state.roles??{},job.role))fail('task role is not in the current catalog');
  return record;
}
function prerequisiteEvidence(state,job,evidenceIds=[]){
  const selected=new Map(),tasks=new Map(),receipts=new Map(),visiting=new Set(),visited=new Set();
  const currentSource=(id)=>{
    const value=contextSource(state,id);if(!value)fail('prerequisite source missing: '+id);
    selected.set(id,value);return {source:recordReference(value,id),value};
  };
  const visitSource=(id,evidence)=>{
    const entry=currentSource(id),producer=entry.value.runtime_output;
    if(producer)visit(producer.task_id,evidence||['Fail','Blocked'].includes(entry.value.review?.verdict));
    return entry;
  };
  const visit=(id,evidence=false)=>{
    if(id===job.runtime_task.id||visiting.has(id))fail('cyclic prerequisite evidence closure');
    const record=canonicalTask(state,id),task=record.runtime_task,attempt=task.attempts[0],producer=state.jobs?.[attempt?.job_id],output=state.records?.[producer?.artifact_id];
    if(!evidence&&['cancelling','cancelled'].includes(task.state))fail('prerequisite task was cancelled: '+id);
    if(!equal(task.owner,state.owner)||!producer||!(evidence?isTaskOwnOutput(state,producer,output):isTaskOutput(state,output)))fail('prerequisite output is missing, stale, negative or unqualified: '+id);
    if(visited.has(id))return;
    if(visited.size+visiting.size>=100)fail('prerequisite closure exceeds100 tasks; split the bounded assignment');
    visiting.add(id);
    const use=evidence?'retained evidence only; no prerequisite permission':'prerequisite';
    tasks.set(id,{binding:taskDefinitionBinding(record),owner:task.owner,spec:task.spec,use,source_protocol:'task-definition-v1; this binding is not a full mutable-record retrieval handle'});
    const outputEntry=currentSource(output.id),receipt={job_id:producer.id,instance_id:producer.instance_id,native_id:producer.native_id,context_sha256:producer.context_sha256,output_source:outputEntry.source,use,inputs:[],supplemental_sources:[],retrieved_inputs:[]};
    if(producer.review_of){
      const target=visitSource(producer.review_of.id,evidence);
      if(target.value.revision!==producer.review_of.revision)fail('prerequisite reviewed subject changed');
      receipt.reviewed_subject=target.source;
    }
    for(const input of producer.inputs??[]){
      const entry=visitSource(input.id,true),delivered=taskMessageInput(state,producer,entry.value);
      if(!inputReference(input)||!delivered||(delivered.revision??null)!==input.revision)fail('prerequisite original input changed: '+input.id);
      const inputEvidence={delivered_ref:input,current_source:entry.source};
      if(!equal(delivered,entry.value))inputEvidence.original_delivery={source:recordReference(delivered,input.id),value:delivered,provenance:'Exact original envelope reconstructed only from this producer attempt\'s proven worker acknowledgment. Retained delivery evidence, not a current company_context retrieval handle.'};
      receipt.inputs.push(inputEvidence);
    }
    for(const field of ['supplemental_sources','retrieved_inputs'])for(const source of producer[field]??[]){
      const entry=visitSource(source.id,true),delivered=taskMessageInput(state,producer,entry.value),original=recordReference(delivered,source.id);
      if(original.sha256!==source.sha256||(source.revision!==undefined&&original.revision!==source.revision))fail('prerequisite supplemental evidence changed: '+source.id);
      receipt[field].push({delivered_ref:source,current_source:entry.source,...(!equal(delivered,entry.value)?{original_delivery:{source:original,value:delivered,provenance:'Proven original delivery evidence; not a current retrieval handle.'}}:{})});
    }
    for(const dependency of task.spec.depends_on)visit(dependency.task_id,evidence);
    if(task.spec.review_task_id)visit(task.spec.review_task_id,evidence);
    visiting.delete(id);visited.add(id);receipts.set(producer.id,receipt);
  };
  const task=canonicalTask(state,job.runtime_task.id).runtime_task;
  for(const dependency of task.spec.depends_on)visit(dependency.task_id);
  if(task.spec.review_task_id)visit(task.spec.review_task_id);
  // Explicit runtime-produced inputs have the same evidence requirements even
  // when the caller references the exact output rather than a readiness edge.
  for(const input of [...task.spec.input_ids.map(id=>({id})),...(job.review_of?[job.review_of]:[])]){
    const value=contextSource(state,input.id);if(value?.runtime_output)visit(value.runtime_output.task_id,['Fail','Blocked'].includes(value.review?.verdict));
  }
  // Compulsory counterevidence is data, not a positive readiness edge. Derive
  // these roots before input expansion so initial and resumed packets agree.
  for(const id of evidenceIds){const value=contextSource(state,id);if(value?.runtime_output&&['Fail','Blocked'].includes(value.review?.verdict))visit(value.runtime_output.task_id,true);}
  return {selected,tasks:[...tasks.values()].sort((a,b)=>a.binding.id.localeCompare(b.binding.id)),receipts:[...receipts.values()].sort((a,b)=>a.job_id.localeCompare(b.job_id))};
}
function requiredSources(state,job){
  const projection=reviewedContext(state);
  // Do not borrow currentRecords' broad job_id-only own-output shortcut. Only
  // exact prospective runtime output may be omitted as output rather than input.
  const selected=new Map(currentRecords(state,{...job,id:undefined},projection).filter(r=>!isTaskBookkeeping(state,r)&&!isRuntimeBookkeeping(state,r)
    &&!isTaskOwnOutput(state,job,r)&&!isTaskOutput(state,r)
    &&(!isTaskScopedMessage(state,r)||r.runtime_message.to_task_id===job.runtime_task.id)).map(r=>[r.id,taskMessageInput(state,job,r)]));
  const prerequisites=prerequisiteEvidence(state,job,[...selected.keys()]);
  for(const [id,value] of prerequisites.selected)selected.set(id,value);
  for(const input of [...(job.inputs??[]),...(job.review_of?[job.review_of]:[])]){
    if(!inputReference(input))fail('input reference is missing or malformed');
    const raw=contextSource(state,input.id),value=raw&&taskMessageInput(state,job,raw);
    if(!value||(value.revision??null)!==input.revision)fail('input missing or changed: '+input.id);
    selected.set(input.id,value);
  }
  for(const id of canonicalTask(state,job.runtime_task.id).runtime_task.spec.input_ids??[]){
    const raw=contextSource(state,id),value=raw&&taskMessageInput(state,job,raw);if(!value)fail('declared source missing: '+id);selected.set(id,value);
  }
  const records=[...selected].sort(([a],[b])=>a.localeCompare(b)).map(([id,value])=>({source:recordReference(value,id),value}));
  // The generic helper's own-ID shortcut is not a schema proof. Inspect every
  // unqualified execution source, then omit only exact current runtime metadata.
  const executionKey=entry=>entry.source.id+'\0'+entry.source.sha256;
  const executions=new Map(currentExecutionEvidence(state,{...job,id:undefined},projection).filter(entry=>!entry.source.id.startsWith('job:')||!runtimeJobBookkeeping(state,entry.value,job)).map(entry=>[executionKey(entry),entry]));
  for(const entry of mandatoryExecutionEvidence(state,projection))executions.set(executionKey(entry),entry);
  const execution=[...executions.values()].sort((a,b)=>a.source.id.localeCompare(b.source.id)||a.source.sha256.localeCompare(b.source.sha256));
  for(const value of [...records,...execution])if(hasSnapshotReferences(value.value))fail('required referenced originals need complete supported qualification/retrieval: '+value.source.id);
  return {records,execution,producer_tasks:prerequisites.tasks,producer_evidence:prerequisites.receipts};
}
function verifySupplemental(state,job){
  for(const source of [...(job.supplemental_sources??[]),...(job.retrieved_inputs??[])]){
    const raw=contextSource(state,source.id),value=raw&&taskMessageInput(state,job,raw);
    if(!value||recordReference(value,source.id).sha256!==source.sha256||(source.revision!==undefined&&source.revision!==(value.revision??null)))fail('retrieved or supplemental evidence changed: '+source.id);
  }
}
function peerTargets(state,task){
  const ids=task.spec.peer_task_ids??[];
  if(!Array.isArray(ids)||ids.length>16||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))fail('invalid declared peer task inventory');
  return ids.map(id=>{
    const record=canonicalTask(state,id),peer=record.runtime_task;
    if(!equal(peer.owner,state.owner)||!equal(peer.owner,task.owner))fail('peer task owner or epoch changed: '+id);
    return {...taskDefinitionBinding(record),role:peer.spec.role,scope:peer.spec.context_scope??'*'};
  });
}

export function taskAssignmentContext(state,job,{budget}={}){
  const limit=checkBudget(budget,TASK_CONTEXT_BUDGET),record=taskForJob(state,job),task=record.runtime_task;
  verifySupplemental(state,job);
  const source=requiredSources(state,job),extensions=currentExtensions(state);
  if(hasSnapshotReferences(extensions))fail('unknown referenced state extension requires qualification');
  const notices=(state.notices??[]).filter(n=>n.job_id!==job.id).map(({deliveries,seen_at,...n})=>n);
  const messages=(state.messages??[]).filter(m=>m.to===job.role&&m.job_id!==job.id);
  const packet={
    protocol:TASK_CONTEXT_PROTOCOL,controls:controls(state),runtime:runtimeControlBinding(state),governance:state.governance,charter:state.roles[job.role],
    task:{source:taskDefinitionBinding(record),owner:task.owner,spec:task.spec},
    peer_targets:peerTargets(state,task),
    assignment:{job_id:job.id??null,instance_id:job.instance_id??null,requester:job.requester??null,role:job.role,task:job.task,context_scope:task.spec.context_scope??'*',review_of:job.review_of??null,coordination:job.coordination??null,model_selection:job.model_selection??{mode:'default'}},
    records:source.records,producer_tasks:source.producer_tasks,producer_evidence:source.producer_evidence,mandatory_execution_evidence:source.execution,notices,messages,
    ...(Object.keys(extensions).length?{state_extensions:extensions}:{}),
    coverage:{contract:'conservative-current-records-v1',complete_for_declared_inputs:true,scope:task.spec.context_scope??'*',source_membership_sha256:sha({records:source.records.map(r=>r.source),execution:source.execution.map(r=>r.source)}),
      historical_meaning:'Original history remains retained. This task packet grants neither semantic classification of omitted history nor acceptance or permission.'},
    supplemental_evidence:{protocol:'record-reads-v1',available:true,sources:job.supplemental_sources??[],lookup:'company_context inspect/read',rule:'Exact known source IDs, revisions and hashes only. Missing evidence requires a bounded read or a Held result; native conversation memory is not current authority.'}
  };
  const text=JSON.stringify(packet),size=bytes(text);
  if(size>limit)throw new SchedulingHold('CONTEXT_CAPACITY',`Task context Held: required coherent packet exceeds ${limit} UTF-8bytes (actual ${size}); coverage incomplete; widen retrieval or split the task; nothing was truncated`);
  // Only already delivered bodies whose exact source still resolves can be
  // reread. Historical delivery projections never masquerade as current handles.
  const required_sources=[...new Map([...source.records,...source.execution].filter(entry=>{
    const current=contextSource(state,entry.source.id);
    return current&&recordReference(current,entry.source.id).sha256===entry.source.sha256;
  }).map(entry=>[entry.source.id+'\0'+entry.source.sha256,entry.source])).values()];
  return {text,hash:digest(text),inputs:source.records.filter(r=>state.records?.[r.source.id]).map(r=>({id:r.source.id,revision:r.source.revision})),required_sources,context_bytes:size,context_budget_bytes:limit,complete:true};
}

export function taskContextMatches(state,job,hash,options){
  try {
    const current=state.jobs?.[job.id]??job;
    const view=inheritSnapshots(state,{...state,notices:(state.notices??[]).filter(n=>n.job_id!==job.id),messages:(state.messages??[]).filter(m=>m.job_id!==job.id)});
    return taskAssignmentContext(view,current,options).hash===hash;
  }catch{return false;}
}

function latestAttempt(state,record){
  const attempt=record.runtime_task.attempts?.at(-1);
  if(!attempt)return null;
  const job=state.jobs?.[attempt.job_id];
  return {job_id:attempt.job_id,instance_id:attempt.instance_id??null,status:job?.status??'unobserved',native_id:job?.native_id??null,
    artifact:job?.artifact_id&&state.records?.[job.artifact_id]?recordReference(state.records[job.artifact_id]):null,
    termination_confirmed:job?.coordination_release?.termination_confirmed===true};
}
function brief(state,record){
  const task=record.runtime_task;
  return {source:taskDefinitionBinding(record),record_source:recordReference(record),role:task.spec.role,state:task.state,scope:task.spec.context_scope??'*',
    expected_deliverable:task.spec.expected_deliverable,depends_on:task.spec.depends_on??[],resources:task.spec.resources??[],latest_attempt:latestAttempt(state,record),
    peer_task_ids:task.spec.peer_task_ids??[],
    detail_required:true};
}
function readCursor(cursor,inventory){
  if(cursor===undefined)return 0;
  let value;try{value=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));}catch{throw Error('Invalid portfolio cursor');}
  if(value.inventory!==inventory||!Number.isSafeInteger(value.offset)||value.offset<0)throw Error('Portfolio cursor stale or invalid; refresh current task membership');
  return value.offset;
}
export function portfolioContext(state,{task_ids,scope='*',limit=20,budget,cursor}={}){
  const ceiling=checkBudget(budget,PORTFOLIO_CONTEXT_BUDGET);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Portfolio limit must be1..100');
  if(task_ids!==undefined&&(!Array.isArray(task_ids)||task_ids.length>100||task_ids.some(id=>typeof id!=='string')||new Set(task_ids).size!==task_ids.length))throw Error('Choose at most100 unique task IDs');
  const records=taskRecords(state);for(const r of records)validateTaskRecord(r,state);
  if(task_ids?.some(id=>!records.some(r=>r.id===id)))throw Error('Requested portfolio task missing');
  const matches=records.filter(r=>(!task_ids||task_ids.includes(r.id))&&(scope==='*'||r.runtime_task.spec.context_scope==='*'||r.runtime_task.spec.context_scope===scope)).sort((a,b)=>a.id.localeCompare(b.id));
  const inventory=sha(matches.map(r=>recordReference(r))),offset=readCursor(cursor,inventory);
  if(offset>matches.length)throw Error('Portfolio cursor past current membership');
  let constraintRefs=[],constraint_error=null;
  try{const p=reviewedContext(state);constraintRefs=currentRecords(state,{role:'runner',context_scope:scope},p).filter(r=>!isTaskBookkeeping(state,r)&&!isRuntimeBookkeeping(state,r)&&!isTaskScopedMessage(state,r)&&!isTaskOutput(state,r)).map(r=>recordReference(r)).sort((a,b)=>a.id.localeCompare(b.id));}catch(error){constraint_error=error.message;}
  let runtime;try{const binding=runtimeControlBinding(state);runtime={state:binding.enabled?'enabled':'stopped',binding};}catch(error){runtime={state:'needs_attention',reason:error.message};}
  const pendingNotices=(state.notices??[]).filter(n=>!n.resolution);
  const result={protocol:'async-portfolio-v1',controls:controls(state),runtime,scope,summary_only:true,decision_ready:false,
    tasks:{items:[],total:matches.length,offset,returned:0,complete:false,next_cursor:null,inventory_sha256:inventory},
    constraints:{sources:[],total:constraintRefs.length,complete:constraint_error===null,reason:constraint_error,requires_exact_retrieval:true},
    notices:{items:[],total:pendingNotices.length,complete:pendingNotices.length===0,lookup:'Inspect unresolved_notices and exact-read its source handle; delivery is not acknowledgment.'},
    coverage:{native_history:'not a source of current company authority',semantic_evidence_complete:false,rule:'Portfolio metadata does not replace exact task definitions, governing sources or required independent acceptance.'}};
  if(bytes(result)>ceiling)throw Error('Portfolio control header exceeds budget; request a larger bounded budget');
  for(const record of matches.slice(offset,offset+limit)){
    const item=brief(state,record),candidate={...result,tasks:{...result.tasks,items:[...result.tasks.items,item]}};
    if(bytes(candidate)>ceiling)break;
    result.tasks.items.push(item);
  }
  result.tasks.returned=result.tasks.items.length;
  result.tasks.complete=offset+result.tasks.returned===matches.length;
  if(!result.tasks.complete){
    if(result.tasks.returned)result.tasks.next_cursor=Buffer.from(JSON.stringify({inventory,offset:offset+result.tasks.returned})).toString('base64url');
    else result.tasks.reason='A single task brief does not fit; increase the bounded budget or inspect that exact task. No zero-progress continuation was issued.';
  }
  for(const source of constraintRefs){const candidate={...result,constraints:{...result.constraints,sources:[...result.constraints.sources,source]}};if(bytes(candidate)>ceiling){result.constraints.complete=false;break;}result.constraints.sources.push(source);}
  for(const n of pendingNotices){const value={id:n.id,kind:n.kind,summary:n.summary,reference:n.reference};const candidate={...result,notices:{...result.notices,items:[...result.notices.items,value]}};if(bytes(candidate)>ceiling)break;result.notices.items.push(value);}
  result.notices.complete=result.notices.items.length===pendingNotices.length;
  result.complete=result.tasks.complete&&result.constraints.complete&&result.notices.complete;
  if(bytes(result)>ceiling)throw Error('Portfolio continuation metadata exceeds budget; request a larger bounded budget');
  return result;
}

export function taskCheckpoint(state,record,{budget}={}){
  const ceiling=checkBudget(budget,TASK_CONTEXT_BUDGET);
  const current=canonicalTask(state,record?.id);
  if(!equal(current,record))fail('checkpoint source is not the current canonical record');
  const t=current.runtime_task,last=latestAttempt(state,current);
  const checkpoint={protocol:'async-task-checkpoint-v1',task:taskDefinitionBinding(current),owner:t.owner,current_owner:state.owner,paused:state.paused,
    objective:t.spec.task,...(t.spec.outcome?{outcome:t.spec.outcome,outcome_status:'hypothesis; observed impact requires separate evidence'}:{}),recovery:taskRecovery(t,last?state.jobs[last.job_id]:null),expected_deliverable:t.spec.expected_deliverable,acceptance:t.spec.acceptance,source_instruction:t.spec.source_instruction,
    scope:t.spec.context_scope??'*',state:t.state,depends_on:t.spec.depends_on??[],peer_task_ids:t.spec.peer_task_ids??[],input_sources:(t.spec.input_ids??[]).map(id=>{
      const value=contextSource(state,id);if(!value)fail('checkpoint input missing: '+id);return recordReference(value,id);
    }),latest_attempt:last,blockers:[...(t.attention?[t.attention]:[]),...(!equal(t.owner,state.owner)?['Task owner or epoch changed']:[]),...(state.paused?['Company is paused']:[])],next_action:state.paused?'Wait for authorized resume':!equal(t.owner,state.owner)?'Resolve current ownership before any scheduling':t.state==='needs_attention'?'Resolve the recorded blocker within authority':last&&!last.termination_confirmed?'Reconcile current execution before any replacement':'Revalidate current task and prerequisite gates before scheduling',
    freshness:'Rebuild task context from current canonical records before use. This checkpoint is a resume aid, never permission or a substitute for source/version checks.'};
  if(bytes(checkpoint)>ceiling)fail('checkpoint exceeds the bounded resume budget; retrieve exact task details or split the task; nothing was truncated');
  return checkpoint;
}

import {validateOutcome} from './outcome.mjs';
import {taskRecovery,recoveryCode,SchedulingHold,schedulingRecovery} from './recovery.mjs';
import {owner,digest,stamp,requireText} from './store.mjs';
import {normalizeCoordination,bindCoordination} from './coordination.mjs';
import {normalizeTimeout} from './timeout.mjs';

export const TASK_PROTOCOL='async-task-v1';
export const TASK_STATES=['planned','queued','running','returned','accepted','needs_attention','cancelling','cancelled'];
const taskKeys=['version','operation_id','command_sha256','owner','definition_revision','definition_sha256','spec','state','attempts','created_at','updated_at','previous_definition','attention','attention_code'];
const recordKeys=['id','kind','status','author_role','author_instance','revision','content','created_at','updated_at','runtime_task'];
const ownerKeys=['host','session_id','epoch'];
const attemptKeys=['job_id','instance_id','definition_revision','definition_sha256','created_at','artifact_id','finished_at'];
const specKeys=['role','task','input_ids','evidence_ids','peer_task_ids','resources','context_scope','expected_deliverable','acceptance','depends_on','review_task_id','model_selection','timeout_ms','timeout_reason','source_instruction','max_attempts','outcome'];
const allowed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=v=>JSON.parse(JSON.stringify(v));
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const identifier=value=>typeof value==='string'&&Boolean(value.trim())&&value.length<=2000;
const selectionShape=m=>allowed(m,['mode','model','effort','speed','reason'])&&['default','explicit'].includes(m.mode)&&typeof m.reason==='string'&&Boolean(m.reason.trim())&&m.reason.length<=300&&(m.model===undefined||typeof m.model==='string'&&Boolean(m.model.trim())&&m.model.length<=200)&&(m.mode!=='explicit'||typeof m.model==='string')&&(m.effort===undefined||typeof m.effort==='string'&&Boolean(m.effort.trim())&&m.effort.length<=40)&&(m.speed===undefined||['host_default','fast_disabled'].includes(m.speed));
function operation(value){return requireText(value,'operation_id',160).trim();}
function hashId(prefix,state,who,key){return prefix+digest(JSON.stringify([state.id,who.epoch,key])).slice(0,32);}
function validOwner(who){return allowed(who,ownerKeys)&&['codex','claude'].includes(who.host)&&typeof who.session_id==='string'&&Boolean(who.session_id.trim())&&who.session_id.length<=200&&Number.isSafeInteger(who.epoch)&&who.epoch>0;}
function actor(state,args,host,paused=false){
  if(!Number.isSafeInteger(args.epoch))throw Error('Supply the current ownership epoch');
  owner(state,args.session_id,host,args.epoch);
  if(state.paused&&!paused)throw Error('Company is paused; async work remains held');
  return copy(state.owner);
}
function bump(record){record.revision++;record.updated_at=stamp();record.runtime_task.updated_at=record.updated_at;record.status='Async:'+record.runtime_task.state;return record;}
function names(value,label,max=100){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>max||value.some(v=>typeof v!=='string'||!v||v.length>2000)||new Set(value).size!==value.length)throw Error(`${label} must contain at most ${max} unique exact IDs`);
  return [...value];
}
function normalizeSpec(value,state,source){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Task specification is required');
  if(Object.keys(value).some(k=>!specKeys.includes(k)&&!['root','session_id','epoch','operation_id','action','task_id','expected_definition_revision'].includes(k)))throw Error('Unsupported task specification field');
  const role=requireText(value.role,'role',100);
  if(role==='runner'||!Object.hasOwn(state.roles??{},role))throw Error('Choose a specialist from the pinned role catalog');
  const task=requireText(value.task,'task',20000),acceptance=requireText(value.acceptance,'acceptance',4000);
  const expected_deliverable=requireText(value.expected_deliverable,'expected_deliverable',300);
  const input_ids=names(value.input_ids,'input_ids');
  if(input_ids.some(key=>!Object.hasOwn(state.records??{},key)))throw Error('Task input record is missing');
  const evidence_ids=names(value.evidence_ids,'evidence_ids');
  if(evidence_ids.some(key=>!Object.hasOwn(state.records??{},key)))throw Error('Task supplemental evidence record is missing');
  const peer_task_ids=names(value.peer_task_ids,'peer_task_ids',16);
  if(peer_task_ids.some(key=>!same(taskRecord(state,key).runtime_task.owner,state.owner)))throw Error('Task peer recipients must share the current owner and epoch');
  const resources=normalizeCoordination({resources:value.resources}).resources;
  const depends_on=value.depends_on??[];
  if(!Array.isArray(depends_on)||depends_on.length>16)throw Error('Task dependencies must be a bounded array');
  const deps=depends_on.map(d=>{
    if(!allowed(d,['task_id','gate'])||typeof d.task_id!=='string'||!['output','accepted','test'].includes(d.gate))throw Error('Each dependency needs an exact task_id and output, accepted or test gate');
    taskRecord(state,d.task_id);return {task_id:d.task_id,gate:d.gate};
  });
  if(new Set(deps.map(d=>d.task_id)).size!==deps.length)throw Error('Task dependencies must not repeat');
  if(value.review_task_id!==undefined&&value.review_task_id!==null)taskRecord(state,value.review_task_id);
  if(value.max_attempts!==undefined&&value.max_attempts!==1)throw Error('Async tasks allow one attempt; recovery never grants another attempt');
  const timeout=normalizeTimeout({timeout_ms:value.timeout_ms,timeout_reason:value.timeout_reason});
  const spec={role,task,input_ids,evidence_ids,peer_task_ids,resources,context_scope:requireText(value.context_scope??'*','context_scope',160),expected_deliverable,acceptance,depends_on:deps,review_task_id:value.review_task_id??null,timeout_ms:timeout.timeout_ms,source_instruction:requireText(source??value.source_instruction,'source_instruction',4000),max_attempts:1};
  if(timeout.timeout_reason!==undefined)spec.timeout_reason=timeout.timeout_reason;
  if(value.model_selection!==undefined){
    const m=value.model_selection;
    if(!selectionShape(m)||JSON.stringify(m).length>2000)throw Error('Invalid task model selection');
    spec.model_selection=copy(m);
  }
  if(value.outcome!==undefined){spec.outcome=validateOutcome(value.outcome);for(const id of spec.outcome.evidence_ids)if(!input_ids.includes(id))throw Error('Outcome evidence must be supplied as exact task inputs');}
  return spec;
}
export const taskDefinitionHash=spec=>digest(JSON.stringify(spec));
function validateSpec(spec){
  if(spec.outcome!==undefined){validateOutcome(spec.outcome);if(spec.outcome.evidence_ids.some(id=>!spec.input_ids?.includes(id)))throw Error('Outcome evidence must remain exact task inputs');}
  if(!allowed(spec,specKeys)||typeof spec.role!=='string'||spec.role==='runner'||typeof spec.task!=='string'||!spec.task.trim()||spec.task.length>20000||typeof spec.acceptance!=='string'||!spec.acceptance.trim()||spec.acceptance.length>4000||typeof spec.expected_deliverable!=='string'||!spec.expected_deliverable.trim()||spec.expected_deliverable.length>300||typeof spec.source_instruction!=='string'||!spec.source_instruction.trim()||spec.source_instruction.length>4000||typeof spec.context_scope!=='string'||!spec.context_scope.trim()||spec.context_scope.length>160||spec.max_attempts!==1||!Number.isSafeInteger(spec.timeout_ms)||spec.timeout_ms<1000||spec.timeout_ms>600000)throw Error('Invalid canonical async task specification');
  if(!Array.isArray(spec.input_ids)||!Array.isArray(spec.evidence_ids)||!Array.isArray(spec.peer_task_ids)||!Array.isArray(spec.resources))throw Error('Canonical task input/resource arrays are missing');
  names(spec.input_ids,'input_ids');names(spec.evidence_ids,'evidence_ids');names(spec.peer_task_ids,'peer_task_ids',16);normalizeCoordination({resources:spec.resources});
  if(!Array.isArray(spec.depends_on)||spec.depends_on.length>16||spec.depends_on.some(d=>!allowed(d,['task_id','gate'])||typeof d.task_id!=='string'||!d.task_id.startsWith('async-task-')||!['output','accepted','test'].includes(d.gate))||new Set(spec.depends_on.map(d=>d.task_id)).size!==spec.depends_on.length||!(spec.review_task_id===null||typeof spec.review_task_id==='string'&&spec.review_task_id.startsWith('async-task-')))throw Error('Invalid canonical async task prerequisites');
  normalizeTimeout({timeout_ms:spec.timeout_ms,timeout_reason:spec.timeout_reason});
  if(spec.model_selection!==undefined&&!selectionShape(spec.model_selection))throw Error('Invalid canonical task model selection');
}
export function commandRecordId(state,args,host=state.owner.host){
  return hashId('async-command-',state,{host,session_id:args.session_id,epoch:args.epoch},operation(args.operation_id));
}
function command(state,args,host,action,payload){
  const key=commandRecordId(state,args,host),hash=digest(JSON.stringify({action,payload})),prior=state.records?.[key];
  if(prior){
    if(!isCommandRecord(state,prior)||prior.runtime_command.payload_sha256!==hash)throw Error('operation_id already names a different command');
    return {key,hash,prior};
  }
  return {key,hash,prior:null};
}
function commitCommand(state,c,args,action,record){
  const at=stamp();
  const source_instruction=['cancel','dispose'].includes(action)&&args.source_instruction!==undefined?requireText(args.source_instruction,'source_instruction',4000):undefined;
  state.records[c.key]={id:c.key,kind:'artifact',status:'Async:command',author_role:'runner',author_instance:state.owner.session_id,revision:1,content:source_instruction??`Async task ${action}`,created_at:at,runtime_command:{version:1,operation_id:operation(args.operation_id),payload_sha256:c.hash,owner:copy(state.owner),task_id:record.id,definition_revision:record.runtime_task.definition_revision,action,...(source_instruction===undefined?{}:{source_instruction}),...(action==='dispose'?{message_id:args.message_id}:{})}};
}
export function validateTaskRecord(record,state){
  const t=record?.runtime_task;
  if(!allowed(record,recordKeys)||!allowed(t,taskKeys)||t.version!==1||!validOwner(t.owner)||typeof t.operation_id!=='string'||!/^[a-f0-9]{64}$/.test(t.command_sha256??'')||!Number.isSafeInteger(t.definition_revision)||t.definition_revision<1||!allowed(t.spec,specKeys)||!TASK_STATES.includes(t.state)||!Array.isArray(t.attempts)||t.attempts.length>1||record.kind!=='plan'||record.status!=='Async:'+t.state||record.author_role!=='runner'||record.author_instance!==t.owner.session_id||record.content!==t.spec.task||!Number.isSafeInteger(record.revision)||record.revision<1||t.definition_sha256!==taskDefinitionHash(t.spec))throw Error('Invalid canonical async task record');
  if(t.attempts.some(a=>!allowed(a,attemptKeys)||typeof a.job_id!=='string'||typeof a.instance_id!=='string'||!Number.isSafeInteger(a.definition_revision)||typeof a.definition_sha256!=='string'))throw Error('Invalid task attempt binding');
  if(!timestamp(record.created_at)||record.updated_at!==undefined&&!timestamp(record.updated_at)||!timestamp(t.created_at)||!timestamp(t.updated_at)||record.created_at!==t.created_at)throw Error('Invalid task record timestamps');
  if(!t.operation_id.trim()||t.operation_id.length>160||t.attempts.some(a=>!identifier(a.job_id)||!identifier(a.instance_id)||!timestamp(a.created_at)||a.definition_revision<1||!/^[a-f0-9]{64}$/.test(a.definition_sha256)||a.artifact_id!==undefined&&!identifier(a.artifact_id)||a.finished_at!==undefined&&!timestamp(a.finished_at)))throw Error('Invalid task attempt metadata');
  if(t.state==='planned'&&t.attempts.length||['queued','running','returned','accepted','cancelling'].includes(t.state)&&t.attempts.length!==1)throw Error('Task lifecycle state lacks its exact attempt binding');
  if(t.previous_definition!==undefined&&(!allowed(t.previous_definition,['revision','sha256'])||!Number.isSafeInteger(t.previous_definition.revision)||t.previous_definition.revision>=t.definition_revision||!/^[a-f0-9]{64}$/.test(t.previous_definition.sha256??'')))throw Error('Invalid previous task definition reference');
  if(t.attention!==undefined&&t.attention!==null&&(typeof t.attention!=='string'||t.attention.length>4000))throw Error('Invalid task attention record');
  if(t.attention_code!==undefined&&!recoveryCode(t.attention_code))throw Error('Invalid task recovery code');
  validateSpec(t.spec);
  if(state&&(!Object.hasOwn(state.records??{},record.id)||!same(state.records[record.id],record)||record.id!==hashId('async-task-',state,t.owner,t.operation_id)))throw Error('Async task identity or canonical source changed');
  return record;
}
export function taskRecord(state,key){
  if(typeof key!=='string'||!key.startsWith('async-task-')||!Object.hasOwn(state.records??{},key))throw Error('Async task record is missing');
  return validateTaskRecord(state.records[key],state);
}
function isCommandRecord(state,record){
  const c=record?.runtime_command;
  if(!(allowed(record,['id','kind','status','author_role','author_instance','revision','content','created_at','runtime_command'])&&allowed(c,['version','operation_id','payload_sha256','owner','task_id','definition_revision','action','source_instruction','message_id'])&&c.version===1&&validOwner(c.owner)&&typeof c.operation_id==='string'&&Boolean(c.operation_id.trim())&&c.operation_id.length<=160&&timestamp(record.created_at)&&record.id===hashId('async-command-',state,c.owner,c.operation_id)&&record.kind==='artifact'&&record.status==='Async:command'&&record.author_role==='runner'&&record.author_instance===c.owner.session_id&&record.revision===1&&record.content===(c.source_instruction??`Async task ${c.action}`)&&['submit','amend','cancel','dispose'].includes(c.action)&&/^[a-f0-9]{64}$/.test(c.payload_sha256??'')&&Object.hasOwn(state.records??{},record.id)&&same(state.records[record.id],record)))return false;
  if(c.source_instruction!==undefined&&(!['cancel','dispose'].includes(c.action)||typeof c.source_instruction!=='string'||!c.source_instruction.trim()||c.source_instruction.length>4000)||c.action==='cancel'&&c.source_instruction===undefined||c.message_id!==undefined&&(c.action!=='dispose'||!identifier(c.message_id)))return false;
  const target=state.records?.[c.task_id];
  if(!target||!Number.isSafeInteger(c.definition_revision)||c.definition_revision<1||c.definition_revision>target.runtime_task?.definition_revision)return false;
  validateTaskRecord(target,state);
  if(c.action==='cancel'&&c.payload_sha256!==digest(JSON.stringify({action:'cancel',payload:{task_id:c.task_id,expected_definition_revision:c.definition_revision,source_instruction:c.source_instruction}})))return false;
  if(c.action==='dispose'&&c.message_id!==undefined){
    const message=validateTaskMessage(state.records[c.message_id],state),d=message.runtime_message.disposition;
    if(message.runtime_message.to_task_id!==target.id||d?.by!=='owner'||d.operation_id!==c.operation_id||d.source_instruction!==c.source_instruction||c.payload_sha256!==digest(JSON.stringify({action:'dispose',payload:{message_id:message.id,disposition:d.content,...(c.source_instruction===undefined?{}:{source_instruction:c.source_instruction})}})))return false;
  }else if(c.action==='dispose'&&c.source_instruction!==undefined)return false;
  return same(c.owner,target.runtime_task.owner)&&(c.action!=='submit'||c.task_id===hashId('async-task-',state,c.owner,c.operation_id));
}
// Direct founder qualifiers remain current semantic evidence until separately
// qualified; command delivery or task cancellation never classifies that intent.
export function isTaskBookkeeping(state,record){
  try{if(record?.runtime_task)return Boolean(validateTaskRecord(record,state));return isCommandRecord(state,record)&&record.runtime_command.source_instruction===undefined;}catch{return false;}
}
// Cancellation revokes prerequisite use without rewriting a completed job or
// its retained evidence. Follow declared edges and exact runtime output inputs
// so a passing review cannot conceal a cancelled producer further upstream.
export function assertTaskPrerequisites(state,key){
  const visiting=new Set(),done=new Set();
  const visit=id=>{
    if(visiting.has(id))throw Error('Cyclic task prerequisite evidence');
    if(done.has(id))return;
    const record=taskRecord(state,id),t=record.runtime_task;
    if(['cancelling','cancelled'].includes(t.state))throw Error('Task prerequisite was cancelled: '+id);
    visiting.add(id);
    const inputs=new Set(t.spec.input_ids),next=new Set([...t.spec.depends_on.map(dep=>dep.task_id),...(t.spec.review_task_id?[t.spec.review_task_id]:[])]);
    for(const input of inputs){
      const value=state.records?.[input];if(!Object.hasOwn(state.records??{},input)||!value)throw Error('Task prerequisite input is missing: '+input);
      const negative=['Fail','Blocked'].includes(value.review?.verdict),producer=state.jobs?.[value.job_id];
      if(value.runtime_output&&!(negative&&producer&&isTaskOwnOutput(state,producer,value)))next.add(value.runtime_output.task_id);
    }
    for(const dependency of next)visit(dependency);
    visiting.delete(id);done.add(id);
  };
  visit(typeof key==='string'?key:key.id);
  return true;
}
// Explicit prospective worker contract only: a returned proposal is not current
// company knowledge. Failures, old/unqualified shapes and stale results remain
// compulsory. Consumers separately add exact task inputs/review/dependencies.
export function isTaskOutput(state,record,{own_job_id=null}={}){
  try{
    if(!allowed(record,['id','kind','content','author_role','author_instance','revision','status','job_id','inputs','retrieved_inputs','review_of','review','runtime_output','created_at'])||!allowed(record.runtime_output,['version','task_id','definition_revision','definition_sha256'])||record.runtime_output.version!==1||!Object.hasOwn(state.records??{},record.id)||!same(state.records[record.id],record)||record.status!=='Submitted'||record.revision!==1||typeof record.content!=='string'||!timestamp(record.created_at))return false;
    const marker=record.runtime_output,task=taskRecord(state,marker.task_id),t=task.runtime_task,job=currentAttempt(state,task);
    if(own_job_id!==job.id)assertTaskPrerequisites(state,task);
    if(!same(state.owner,t.owner)||marker.definition_revision!==t.definition_revision||marker.definition_sha256!==t.definition_sha256||job.id!==record.job_id||job.artifact_id!==record.id||job.status!=='completed'||job.context_format!==7||job.context_scope!==t.spec.context_scope||!/^[a-f0-9]{64}$/.test(job.context_sha256??'')||typeof job.native_id!=='string'||!job.native_id||job.native_id===t.owner.session_id||job.coordination_release?.termination_confirmed!==true||job.coordination_release.reason!=='model_process_closed'||record.author_role!==job.role||record.author_instance!==job.instance_id||!same(record.inputs,job.inputs)||!Array.isArray(record.inputs)||!same(record.review_of,job.review_of))return false;
    if(record.inputs.some(ref=>!allowed(ref,['id','revision'])||Object.keys(ref).length!==2||typeof ref.id!=='string'||!(ref.revision===null||Number.isSafeInteger(ref.revision)&&ref.revision>0)||!Object.hasOwn(state.records,ref.id)||(taskMessageInput(state,job,state.records[ref.id]).revision??null)!==ref.revision))return false;
    if(record.retrieved_inputs!==undefined&&(!Array.isArray(record.retrieved_inputs)||!same(record.retrieved_inputs,job.retrieved_inputs)||record.retrieved_inputs.some(ref=>!allowed(ref,['id','revision','sha256','offset','length','total_characters'])||typeof ref.id!=='string'||!/^[a-f0-9]{64}$/.test(ref.sha256??''))))return false;
    if(record.kind==='review'){
      const own=own_job_id===job.id;
      if(!(record.review?.verdict==='Pass'||own&&['Fail','Blocked'].includes(record.review?.verdict))||!allowed(record.review,['verdict','reason','blockers','permitted_action','candidate_sha256','receipt_sha256'])||typeof record.review.reason!=='string'||!record.review.reason.trim())return false;
      if(record.review.verdict==='Pass')bindCoordination(state,{depends_on:[job.id]});
    }else if(record.kind!=='artifact'||record.review!==null||record.review_of!==null)return false;
    return true;
  }catch{return false;}
}
export function isTaskOwnOutput(state,job,record){return job?.id===record?.job_id&&isTaskOutput(state,record,{own_job_id:job.id});}
function cycleCheck(state,key,spec){
  const walk=(id,seen)=>{
    if(seen.has(id))throw Error('Cyclic async task dependencies');
    const next=new Set(seen);next.add(id);
    const s=id===key?spec:taskRecord(state,id).runtime_task.spec;
    for(const dep of [...s.depends_on.map(d=>d.task_id),...(s.review_task_id?[s.review_task_id]:[])])walk(dep,next);
  };walk(key,new Set());
}
export function submitTask(state,args,host){
  const who=actor(state,args,host),op=operation(args.operation_id);
  if(args.spec&&!allowed(args.spec,specKeys))throw Error('Unsupported task specification field');
  const spec=normalizeSpec(args.spec??args,state,args.source_instruction),c=command(state,args,host,'submit',spec);
  if(c.prior)return taskRecord(state,c.prior.runtime_command.task_id);
  const key=hashId('async-task-',state,who,op);
  if(Object.hasOwn(state.records,key))throw Error('Async task identity is already present');
  cycleCheck(state,key,spec);
  const at=stamp();
  const record={id:key,kind:'plan',status:'Async:planned',author_role:'runner',author_instance:who.session_id,revision:1,content:spec.task,created_at:at,runtime_task:{version:1,operation_id:op,command_sha256:c.hash,owner:who,definition_revision:1,definition_sha256:taskDefinitionHash(spec),spec,state:'planned',attempts:[],created_at:at,updated_at:at}};
  state.records[key]=record;commitCommand(state,c,args,'submit',record);return record;
}
function expected(record,args){if(args.expected_definition_revision!==record.runtime_task.definition_revision)throw Error('Task definition changed; refresh before mutating');}
export function amendTask(state,args,host){
  actor(state,args,host);const record=taskRecord(state,args.task_id);
  if(!same(record.runtime_task.owner,state.owner))throw Error('Task belongs to an earlier owner; create an explicit new task');
  if(args.spec&&!allowed(args.spec,specKeys))throw Error('Unsupported task specification field');
  const spec=normalizeSpec(args.spec??args,state,args.source_instruction);
  const c=command(state,args,host,'amend',{task_id:record.id,expected_definition_revision:args.expected_definition_revision,spec});
  if(c.prior)return record;
  expected(record,args);cycleCheck(state,record.id,spec);
  const t=record.runtime_task;
  t.previous_definition={revision:t.definition_revision,sha256:t.definition_sha256};t.definition_revision++;t.definition_sha256=taskDefinitionHash(spec);t.spec=spec;record.content=spec.task;
  if(t.attempts.length){
    const job=state.jobs?.[t.attempts[0].job_id];if(job&&['queued','running'].includes(job.status))job.status='cancelled';
    t.state='needs_attention';t.attention_code='DEFINITION_CHANGED';t.attention='Definition superseded an existing attempt; reconcile closure and create a separately authorized task if more work is required';
  }else t.state='planned';
  bump(record);commitCommand(state,c,args,'amend',record);return record;
}
export function cancelTask(state,args,host){
  actor(state,args,host,true);requireText(args.source_instruction,'source_instruction',4000);
  const record=taskRecord(state,args.task_id),c=command(state,args,host,'cancel',{task_id:record.id,expected_definition_revision:args.expected_definition_revision,source_instruction:args.source_instruction});
  if(c.prior)return record;expected(record,args);
  const t=record.runtime_task,job=state.jobs?.[t.attempts[0]?.job_id];
  if(job&&['queued','running'].includes(job.status)){job.status='cancelled';t.state='cancelling';}
  else t.state=job&&job.coordination_release?.termination_confirmed!==true?'cancelling':'cancelled';
  t.attention=t.state==='cancelling'?'Cancellation requested; execution closure is not confirmed':null;
  bump(record);commitCommand(state,c,args,'cancel',record);return record;
}
export function taskView(record){
  validateTaskRecord(record);const t=record.runtime_task;
  return {id:record.id,revision:record.revision,definition_revision:t.definition_revision,definition_sha256:t.definition_sha256,state:t.state,role:t.spec.role,task:t.spec.task,expected_deliverable:t.spec.expected_deliverable,acceptance:t.spec.acceptance,context_scope:t.spec.context_scope,resources:t.spec.resources,depends_on:t.spec.depends_on,peer_task_ids:t.spec.peer_task_ids,review_task_id:t.spec.review_task_id,attempts:t.attempts.map(copy),...(t.spec.outcome?{outcome:copy(t.spec.outcome),outcome_status:'hypothesis; observed impact requires separate evidence'}:{}),recovery:taskRecovery(t),attention:t.attention??null,updated_at:t.updated_at};
}
function currentAttempt(state,record){
  const t=record.runtime_task,a=t.attempts[0],job=a&&state.jobs?.[a.job_id];
  if(!a||!job||job.instance_id!==a.instance_id||a.definition_revision!==t.definition_revision||a.definition_sha256!==t.definition_sha256||job.epoch!==t.owner.epoch||!same(job.runtime_task,{id:record.id,definition_revision:a.definition_revision,definition_sha256:a.definition_sha256}))throw Error('Task attempt is missing, superseded or has changed identity');
  if(job.role!==t.spec.role||job.host!==t.owner.host||job.task!==t.spec.task||!same(job.coordination?.resources??[],t.spec.resources))throw Error('Task attempt purpose or resource scope changed');
  if(t.spec.review_task_id){
    const producer=taskRecord(state,t.spec.review_task_id),prior=producer.runtime_task.attempts[0],producerJob=prior&&state.jobs?.[prior.job_id],target=state.records?.[producerJob?.artifact_id];
    if(!target||job.review_of?.id!==target.id||job.review_of?.revision!==target.revision)throw Error('Task review subject changed');
  }else if(job.review_of)throw Error('Ordinary task acquired an undeclared review subject');
  return job;
}
function output(state,record,gate){
  assertTaskPrerequisites(state,record);
  if(['planned','queued','running'].includes(record.runtime_task.state)&&state.jobs?.[record.runtime_task.attempts[0]?.job_id]?.status!=='completed')throw new SchedulingHold('DEPENDENCY_PENDING','Task producer has not returned its required output');
  const job=currentAttempt(state,record),artifact=state.records?.[job.artifact_id];
  if(job.coordination_release?.termination_confirmed!==true)throw new SchedulingHold('EXECUTION_UNCERTAIN','Task producer process closure is unconfirmed');
  const coordination=bindCoordination(state,{depends_on:[job.id]});
  if(gate==='accepted'&&(artifact?.kind!=='review'||artifact.review?.verdict!=='Pass'))throw Error('Accepted prerequisite requires a current independent exact-subject Pass');
  if(gate==='test'&&job.kind!=='development_test')throw Error('Test prerequisite requires a canonical passing runtime test receipt');
  return {job,artifact,reference:coordination.dependencies[0]};
}
export function taskReady(state,record){
  try{
    validateTaskRecord(record,state);const t=record.runtime_task;
    if(!same(state.owner,t.owner))throw new SchedulingHold('AUTHORITY_CHANGED','Task owner or epoch changed');
    if(state.paused)throw new SchedulingHold('PAUSED','Company is paused');
    if(t.state!=='planned'||t.attempts.length)throw Error('Task is not a fresh planned assignment');
    assertTaskPrerequisites(state,record);
    const jobs=[],required=[],inputs=new Set(t.spec.input_ids);
    for(const dep of t.spec.depends_on){const r=taskRecord(state,dep.task_id);const item=output(state,r,dep.gate);jobs.push(item.job.id);required.push(item.job.id);inputs.add(item.artifact.id);if(item.reference.subject)inputs.add(item.reference.subject.id);}
    let review_of=null;
    if(t.spec.review_task_id){const r=taskRecord(state,t.spec.review_task_id),item=output(state,r,'output');review_of=item.artifact.id;required.push(item.job.id);inputs.add(review_of);}
    const coordination=bindCoordination(state,{depends_on:[...new Set(jobs)],resources:t.spec.resources});
    return {ready:true,depends_on:[...new Set(jobs)],review_of,input_ids:[...inputs],resources:[...t.spec.resources],coordination,required_context_jobs:[...new Set(required)]};
  }catch(error){return {ready:false,reason:error.message,recovery:schedulingRecovery(error)};}
}
export function bindTaskAttempt(state,record,job){
  // The caller may insert the new queued job before binding it in the same
  // transaction. Its own claim is not a conflicting pre-existing claimant.
  if(job?.runtime_task&&!same(job.runtime_task,{id:record.id,definition_revision:record.runtime_task.definition_revision,definition_sha256:record.runtime_task.definition_sha256}))throw Error('Job is already bound to a different task');
  const view={...state,jobs:Object.fromEntries(Object.entries(state.jobs??{}).filter(([key])=>key!==job?.id))};
  const ready=taskReady(view,record);if(!ready.ready)throw Error(ready.reason);
  const t=record.runtime_task;
  if(!job||typeof job.id!=='string'||typeof job.instance_id!=='string'||job.status!=='queued'||job.role!==t.spec.role||job.task!==t.spec.task||job.epoch!==t.owner.epoch||job.host!==t.owner.host)throw Error('Queued job does not match the authorized task');
  if(!same(job.coordination?.resources??[],ready.resources)||!same((job.coordination?.dependencies??[]).map(d=>d.job_id).sort(),ready.depends_on.slice().sort()))throw Error('Queued task resource/dependency bindings changed');
  if((job.review_of?.id??null)!==ready.review_of||ready.input_ids.some(key=>!job.inputs?.some(ref=>ref.id===key&&Object.hasOwn(state.records,key)&&(state.records[key].revision??null)===ref.revision)))throw Error('Queued task evidence/review bindings changed');
  job.runtime_task={id:record.id,definition_revision:t.definition_revision,definition_sha256:t.definition_sha256};
  t.attempts.push({job_id:job.id,instance_id:job.instance_id,definition_revision:t.definition_revision,definition_sha256:t.definition_sha256,created_at:stamp()});
  t.state='queued';bump(record);return record;
}
export function reconcileTask(state,record){
  validateTaskRecord(record,state);const t=record.runtime_task;
  if(!same(state.owner,t.owner)&&!['cancelled','needs_attention'].includes(t.state)){t.state='needs_attention';t.attention='Task owner or epoch changed; prior authority does not permit further execution or acceptance';return bump(record);}
  if(!t.attempts.length||['cancelled','needs_attention'].includes(t.state))return record;
  const prior=JSON.stringify(t);let job;
  try{job=currentAttempt(state,record);}catch(error){t.state='needs_attention';t.attention_code=schedulingRecovery(error).code;t.attention=error.message;}
  if(job){
    if(t.state==='cancelling'){
      if(job.coordination_release?.termination_confirmed===true){t.state='cancelled';t.attention=null;}
    }else if(job.status==='queued')t.state='queued';
    else if(job.status==='running')t.state='running';
    else if(job.status==='completed'){
      try{const {artifact}=output(state,record,'output');t.state=artifact.kind==='review'?'accepted':'returned';t.attempts[0].artifact_id=artifact.id;t.attempts[0].finished_at=job.finished_at??t.attempts[0].finished_at??stamp();}
      catch(error){t.state='needs_attention';t.attention_code=schedulingRecovery(error).code;t.attention=error.message;}
    }else {t.state='needs_attention';t.attention=`Attempt ${job.status}; inspect retained outcome and process closure before any new work`;}
  }
  if(JSON.stringify(t)!==prior)bump(record);return record;
}

function messageId(state,who,op){return hashId('async-message-',state,who,op);}
export function validateTaskMessage(r,state){
  const m=r?.runtime_message;
  if(!allowed(r,['id','kind','status','author_role','author_instance','revision','content','created_at','updated_at','runtime_message'])||!allowed(m,['version','operation_id','payload_sha256','owner','from_task_id','from_attempt_id','to_task_id','definition_revision','state','disposition','source_instruction'])||m.version!==1||!validOwner(m.owner)||!timestamp(r.created_at)||r.updated_at!==undefined&&!timestamp(r.updated_at)||typeof m.operation_id!=='string'||!m.operation_id.trim()||m.operation_id.length>160||r.kind!=='artifact'||r.status!=='Async:message'||r.id!==messageId(state,m.owner,m.operation_id)||typeof r.content!=='string'||!r.content.trim()||r.content.length>20000||!['pending','processed'].includes(m.state)||!Object.hasOwn(state.records??{},r.id)||!same(state.records[r.id],r)||!Number.isSafeInteger(r.revision)||r.revision<1)throw Error('Invalid canonical async message');
  if(m.source_instruction!==undefined&&(m.from_task_id!==null||typeof m.source_instruction!=='string'||!m.source_instruction.trim()||m.source_instruction.length>4000))throw Error('Message founder source instruction is malformed');
  const target=taskRecord(state,m.to_task_id);
  if(!same(target.runtime_task.owner,m.owner)||!Number.isSafeInteger(m.definition_revision)||m.definition_revision<1||m.definition_revision>target.runtime_task.definition_revision)throw Error('Message recipient/owner binding changed');
  const payload={from_task_id:m.from_task_id,from_attempt_id:m.from_attempt_id,to_task_id:m.to_task_id,definition_revision:m.definition_revision,content:r.content,...(m.source_instruction===undefined?{}:{source_instruction:m.source_instruction})};
  if(m.payload_sha256!==digest(JSON.stringify(payload)))throw Error('Message payload changed');
  if(m.from_task_id===null){if(m.from_attempt_id!==null||r.author_role!=='runner'||r.author_instance!==m.owner.session_id)throw Error('Message founder attribution changed');}
  else{
    const producer=taskRecord(state,m.from_task_id),job=state.jobs?.[m.from_attempt_id];
    if(!same(producer.runtime_task.owner,m.owner)||!job||job.runtime_task?.id!==producer.id||!producer.runtime_task.attempts.some(a=>a.job_id===job.id&&a.instance_id===job.instance_id&&a.definition_revision===job.runtime_task.definition_revision&&a.definition_sha256===job.runtime_task.definition_sha256)||job.epoch!==m.owner.epoch||job.host!==m.owner.host||r.author_role!==job.role||r.author_instance!==job.instance_id)throw Error('Message producer attribution changed');
  }
  if(m.state==='pending'&&m.disposition!==null||m.state==='processed'&&(!allowed(m.disposition,['operation_id','content','at','task_id','attempt_id','by','author_instance','source_instruction'])||m.disposition.task_id!==target.id||!timestamp(m.disposition.at)||!identifier(m.disposition.author_instance)||typeof m.disposition.operation_id!=='string'||!m.disposition.operation_id.trim()||m.disposition.operation_id.length>160||!(m.disposition.attempt_id===null||identifier(m.disposition.attempt_id))||typeof m.disposition.content!=='string'||!m.disposition.content.trim()||m.disposition.content.length>4000||!['owner','worker'].includes(m.disposition.by)))throw Error('Message disposition is malformed');
  if(m.disposition?.source_instruction!==undefined&&(m.disposition.by!=='owner'||typeof m.disposition.source_instruction!=='string'||!m.disposition.source_instruction.trim()||m.disposition.source_instruction.length>4000))throw Error('Message disposition source instruction is malformed');
  if(m.disposition?.by==='owner'&&m.disposition.author_instance!==m.owner.session_id)throw Error('Message disposition owner attribution changed');
  if(m.disposition?.by==='worker'){
    const receiver=state.jobs?.[m.disposition.attempt_id],attempt=target.runtime_task.attempts.find(a=>a.job_id===receiver?.id);
    if(!receiver||!attempt||receiver.runtime_task?.id!==target.id||receiver.instance_id!==attempt.instance_id||m.disposition.author_instance!==receiver.instance_id||receiver.runtime_task.definition_revision!==m.definition_revision||attempt.definition_sha256!==receiver.runtime_task.definition_sha256||receiver.epoch!==m.owner.epoch)throw Error('Message disposition receiver attribution changed');
  }
  return r;
}
const validMessage=(state,record)=>validateTaskMessage(record,state);
export function isTaskMessage(state,record){try{return Boolean(validateTaskMessage(record,state));}catch{return false;}}
export function isTaskScopedMessage(state,record){return isTaskMessage(state,record)&&record.runtime_message.source_instruction===undefined&&record.runtime_message.disposition?.source_instruction===undefined;}
function appendMessage(state,who,origin,args){
  const target=taskRecord(state,args.to_task_id),t=target.runtime_task;
  if(!same(t.owner,who))throw Error('Peer message recipient owner or epoch differs');
  const content=requireText(args.content,'content',20000),op=operation(args.operation_id),key=messageId(state,who,op);
  const source_instruction=args.source_instruction===undefined?undefined:requireText(args.source_instruction,'source_instruction',4000);
  if(origin.task_id&&source_instruction!==undefined)throw Error('Worker peer messages cannot introduce founder source instructions');
  // A lost response may be replayed after its receiver was amended. Preserve
  // the original definition binding: replay retrieves a durable envelope and
  // never grants permission to retarget that message at the new definition.
  const prior=state.records[key]&&validMessage(state,state.records[key]);
  const payload={from_task_id:origin.task_id??null,from_attempt_id:origin.attempt_id??null,to_task_id:target.id,definition_revision:t.definition_revision,content,...(source_instruction===undefined?{}:{source_instruction})};
  if(prior)payload.definition_revision=prior.runtime_message.definition_revision;
  const hash=digest(JSON.stringify(payload));
  if(prior){if(prior.runtime_message.payload_sha256!==hash)throw Error('Message operation_id already names different content');return prior;}
  const at=stamp();
  const {content:messageContent,...binding}=payload;
  return state.records[key]={id:key,kind:'artifact',status:'Async:message',author_role:origin.role,author_instance:origin.instance_id,revision:1,content:messageContent,created_at:at,runtime_message:{version:1,operation_id:op,payload_sha256:hash,owner:copy(who),...binding,state:'pending',disposition:null}};
}
export function sendTaskMessage(state,args,host){const who=actor(state,args,host,true);return appendMessage(state,who,{role:'runner',instance_id:who.session_id},args);}
export function appendPeerMessage(state,job,args){
  const record=taskRecord(state,job.runtime_task?.id),current=currentAttempt(state,record);
  if(!same(state.owner,record.runtime_task.owner)||state.paused||current.id!==job.id||current.instance_id!==job.instance_id||!['running','completed'].includes(current.status))throw Error('Peer message producer is no longer eligible');
  if(!record.runtime_task.spec.peer_task_ids.includes(args.to_task_id))throw Error('Peer message receiver is outside the declared task route');
  return appendMessage(state,record.runtime_task.owner,{task_id:record.id,attempt_id:job.id,role:job.role,instance_id:job.instance_id},args);
}
export function messagesForTask(state,key,{after=null,limit=20}={}){
  const task=taskRecord(state,key);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Message page limit must be 1..100');
  const all=Object.values(state.records??{}).filter(r=>r.runtime_message?.to_task_id===key).map(r=>validMessage(state,r)).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  const start=after===null?0:all.findIndex(r=>r.id===after)+1;
  if(after!==null&&!start)throw Error('Message cursor is stale; restart the inbox read');
  const values=all.slice(start,start+limit);
  return {task_id:task.id,items:values.map(copy),total:all.length,returned:values.length,complete:start+values.length>=all.length,next_cursor:start+values.length<all.length?values.at(-1)?.id??null:null};
}
export function disposeTaskMessage(state,args,host){
  actor(state,args,host,true);const r=validMessage(state,state.records[args.message_id]);
  const target=taskRecord(state,r.runtime_message.to_task_id),content=requireText(args.disposition,'disposition',4000);
  const source_instruction=args.source_instruction===undefined?undefined:requireText(args.source_instruction,'source_instruction',4000);
  const c=command(state,args,host,'dispose',{message_id:r.id,disposition:content,...(source_instruction===undefined?{}:{source_instruction})});if(c.prior)return r;
  if(r.runtime_message.definition_revision!==target.runtime_task.definition_revision)throw Error('Recipient definition changed; message needs explicit reconciliation');
  if(r.runtime_message.state==='processed')throw Error('Message already has a durable disposition');
  r.runtime_message.state='processed';r.runtime_message.disposition={operation_id:operation(args.operation_id),content,at:stamp(),task_id:target.id,attempt_id:target.runtime_task.attempts[0]?.job_id??null,by:'owner',author_instance:state.owner.session_id,...(source_instruction===undefined?{}:{source_instruction})};r.revision++;r.updated_at=stamp();
  commitCommand(state,c,args,'dispose',target);return r;
}
export function disposePeerMessage(state,job,args){
  const target=taskRecord(state,job.runtime_task?.id),current=currentAttempt(state,target),r=validMessage(state,state.records[args.message_id]);
  if(!same(state.owner,target.runtime_task.owner)||state.paused||job.id!==current.id||job.instance_id!==current.instance_id||!['running','completed'].includes(current.status)||r.runtime_message.to_task_id!==target.id||r.runtime_message.definition_revision!==target.runtime_task.definition_revision)throw Error('Peer disposition recipient is no longer eligible');
  const content=requireText(args.disposition,'disposition',4000),op=operation(args.operation_id??`${job.id}:${r.id}:disposition`),prior=r.runtime_message.disposition;
  if(prior){if(prior.by==='worker'&&prior.attempt_id===job.id&&prior.author_instance===job.instance_id&&prior.operation_id===op&&prior.content===content)return r;throw Error('Message already has a different durable disposition');}
  if(r.revision!==1||!current.inputs?.some(ref=>ref.id===r.id&&ref.revision===r.revision))throw Error('Peer disposition requires the exact delivered message input');
  r.runtime_message.state='processed';r.runtime_message.disposition={operation_id:op,content,at:stamp(),task_id:target.id,attempt_id:job.id,by:'worker',author_instance:job.instance_id};r.revision++;r.updated_at=stamp();return r;
}
export function isOwnMessageDisposition(state,job,record){
  try{
    validateTaskMessage(record,state);const m=record.runtime_message,d=m.disposition;
    if(m.state!=='processed'||record.revision!==2||d?.by!=='worker'||d.attempt_id!==job.id||d.author_instance!==job.instance_id||m.to_task_id!==job.runtime_task?.id||m.definition_revision!==job.runtime_task.definition_revision)return false;
    const current=currentAttempt(state,taskRecord(state,m.to_task_id));
    return current.id===job.id&&current.instance_id===job.instance_id&&current.inputs?.some(ref=>ref.id===record.id&&ref.revision===1)===true;
  }catch{return false;}
}
// A receiver's own post-result acknowledgment changes delivery state, not the
// immutable body it was assigned. Reconstruct only that exact initial envelope.
// New tasks and owner-authored dispositions still see the real current record.
export function taskMessageInput(state,job,record){
  if(!isOwnMessageDisposition(state,job,record))return record;
  const original=copy(record);original.revision=1;delete original.updated_at;original.runtime_message.state='pending';original.runtime_message.disposition=null;return original;
}

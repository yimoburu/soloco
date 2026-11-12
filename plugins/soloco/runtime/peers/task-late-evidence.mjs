// Fixed original-host composition only. A diagnostic is negative evidence;
// neither a matching JSON object nor this module grants task/owner authority.
import {createHash} from 'node:crypto';
import {PeerLedger,canonical,peerDigest} from './ledger.mjs';

const OBSERVER='fixed-original-native-task';
const PROTOCOL='peer-task-late-evidence-v1';
const MAX_NOTICE_BYTES=1000000;
const copy=value=>JSON.parse(canonical(value));
const same=(a,b)=>canonical(a)===canonical(b);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const hash=text=>createHash('sha256').update(text).digest('hex');
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
function need(condition,code='TASK_LATE_EVIDENCE_CHANGED'){
  if(!condition)throw Object.assign(Error(code),{code});
}
function admissionReference(value){
  need(value&&Object.getPrototypeOf(value)===Object.prototype&&
    Object.keys(value).sort().join(',')==='family,id,revision,sha256'&&
    value.family==='commands'&&typeof value.id==='string'&&value.id.length<=2000&&
    value.revision===1&&sha(value.sha256),'TASK_LATE_ADMISSION_REQUIRED');
  return copy(value);
}
function exact(tx,reference){
  const row=tx.getVersion(reference);
  need(row&&same(ref(reference.family,row),reference)&&peerDigest(row.value)===reference.sha256);
  return row;
}
function originalAdmission(tx,reference){
  const command=exact(tx,reference),head=tx.get('commands',reference.id),value=command.value;
  need(head&&same(ref('commands',head),reference)&&same(head.value,value)&&
    value.action==='task/admit'&&value.principal_id==='scheduler');
  const result=value.result,task=result?.task,attempt=task?.value?.attempt,context=result?.context;
  need(result?.admitted===true&&task?.value?.status==='running'&&attempt&&context&&
    same(attempt.context,context)&&attempt.id===peerDigest(['attempt',task.id,task.value.definition_revision]));
  const {text,sha256,hash:alias,utf8_bytes,...body}=context;
  need(typeof text==='string'&&canonical(body)===text&&hash(text)===sha256&&alias===sha256&&
    Buffer.byteLength(text)===utf8_bytes&&same(context.task.definition,task.value.definition));
  const event=tx.events({after:head.created_seq-1,limit:1}).items[0];
  const commands=event?.payload?.changes?.filter(change=>change.family==='commands');
  const tasks=event?.payload?.changes?.filter(change=>change.family==='tasks'&&change.id===task.id);
  need(event?.type==='task/admit'&&event.principal_id==='scheduler'&&commands?.length===1&&
    same({family:'commands',id:commands[0].id,revision:commands[0].revision,sha256:commands[0].sha256},reference)&&
    tasks?.length===1&&same({family:'tasks',id:tasks[0].id,revision:tasks[0].revision,sha256:tasks[0].sha256},ref('tasks',task)));
  exact(tx,ref('tasks',task));
  const principal=exact(tx,context.principal);
  need(principal.id===task.value.owner_principal_id&&typeof principal.value.native_id==='string');
  return {command:head,task,context,principal};
}
function currentTask(tx,original,observation){
  const task=tx.get('tasks',original.task.id),attempt=task?.value?.attempt;
  need(attempt?.id===original.task.value.attempt.id&&
    same(attempt.context,original.context)&&
    task.value.definition_sha256===original.task.value.definition_sha256);
  need(observation.native_id===original.principal.value.native_id&&
    observation.thread_id===observation.native_id&&observation.process&&
    Number.isSafeInteger(observation.process.pid)&&observation.process.pid>0&&
    Number.isFinite(Date.parse(observation.process.started_at)));
  for(const process of [attempt.process,task.value.result?.observed_process,task.value.closure?.observed_process]){
    if(!process)continue;
    need(process.pid===observation.process.pid&&
      (process.started_at??process.execution_started_at)===observation.process.started_at);
  }
  return task;
}
function retainedNotice(tx,current,admission,observation){
  const event=tx.events({after:current.created_seq-1,limit:1}).items[0];
  const changes=event?.payload?.changes?.filter(change=>change.family==='notices'&&change.id===current.id);
  need(event?.type==='task.source-late-evidence'&&event.principal_id===OBSERVER&&changes?.length===1&&changes[0].revision===1);
  const original=exact(tx,{family:'notices',id:current.id,revision:1,sha256:changes[0].sha256});
  need(original.value.protocol===PROTOCOL&&original.value.source_observer===OBSERVER&&
    same(original.value.original_admission_ref,admission)&&
    same(original.value.observation,observation)&&original.value.acceptance_authority===false&&
    original.value.reservation_release_authority===false);
  return original;
}

/** Retain exact original task diagnostics after failure, expiry or replacement.
 * The source-owned caller supplies its original admission, never model fields.
 * A current task result, slot, grant, owner or first verdict is never replaced.
 * The native publisher must call this only for a failed original launch. */
export async function recordOriginalPeerTaskLateEvidence(ledger,original_admission_ref,diagnosticToken){
  need(Object.getPrototypeOf(ledger)===PeerLedger.prototype,'TASK_LATE_LEDGER_REQUIRED');
  const admission=admissionReference(original_admission_ref);
  const connection={root:ledger.root,company_id:ledger.company_id,directory:ledger.directory};
  const original=ledger.read(tx=>originalAdmission(tx,admission));
  const domain=await import('./protected-codex-domain.mjs');
  need(typeof domain.assertOriginalProtectedOwnedTaskDiagnostic==='function','TASK_LATE_SOURCE_UNAVAILABLE');
  const observation=domain.assertOriginalProtectedOwnedTaskDiagnostic(diagnosticToken,{
    ledger,admission_ref:admission,context_sha256:original.context.sha256,kind:'task'
  });
  const {observation_sha256,...body}=observation??{};
  need(body.protocol==='peer-owned-task-observation-v1'&&body.kind==='task'&&body.qualifies===false&&
    same(body.admission_ref,admission)&&body.context_sha256===original.context.sha256&&
    sha(observation_sha256)&&peerDigest(body)===observation_sha256,'TASK_LATE_DIAGNOSTIC_REQUIRED');
  const id='task-source-late:'+peerDigest([admission,observation_sha256]);
  const expected=new Map();
  const remember=(family,row,idValue=row?.id)=>expected.set(canonical([family,idValue]),{
    family,id:idValue,reference:row?ref(family,row):null
  });
  const deadline=Date.now()+30000; // Local commit bound; no model allowance.
  return ledger.guardedWrite('task.source-late-evidence',OBSERVER,tx=>{
    const currentOriginal=originalAdmission(tx,admission);
    const task=currentTask(tx,currentOriginal,observation),company=tx.get('control','company');
    need(company?.value.protocol==='peer-cos-v1');
    const owner=tx.get('principals',company.value.founder_principal_id),previous=tx.get('notices',id);
    need(owner);
    for(const [family,row]of [['commands',currentOriginal.command],['tasks',task],['control',company],['principals',owner]])remember(family,row);
    if(previous){
      const originalNotice=retainedNotice(tx,previous,admission,observation);
      remember('notices',previous);tx.sealWrites();
      return {retained:true,repeated:true,notice_ref:ref('notices',previous),original_notice_ref:ref('notices',originalNotice),accepted:false,reservations_released:false};
    }
    // One canonical home contains the complete raw fact. No clipped copy,
    // proposal/review, task result or closure claim is manufactured.
    const value={protocol:PROTOCOL,kind:'decision_required',status:'pending',scope:'*',
      principal_id:currentOriginal.task.value.owner_principal_id,task_id:task.id,
      source_observer:OBSERVER,source_observer_only:true,required_handoff:true,uncertain_obligation:true,
      original_admission_ref:admission,original_task_ref:ref('tasks',currentOriginal.task),
      original_context_sha256:currentOriginal.context.sha256,observation_sha256,observation:copy(observation),
      observed_current_owner:{principal_ref:ref('principals',owner),legacy_owner:copy(owner.value.legacy_owner??null)},
      acceptance_authority:false,reservation_release_authority:false,created_at:new Date().toISOString(),
      content:'Material original task evidence arrived after a failed launch. Inspect these exact facts and their obligations; preserve the original result, verdict, spend and reservations. This notice grants no acceptance, closure, retry or owner authority.'};
    need(Buffer.byteLength(canonical(value))<=MAX_NOTICE_BYTES,'TASK_LATE_EVIDENCE_CAPACITY');
    const notice=tx.put('notices',id,value,0);remember('notices',notice);
    tx.event('task.source_late_obligation',{source_observer:OBSERVER,notice_ref:ref('notices',notice),
      original_admission_ref:admission,accepted:false,reservations_released:false});
    tx.sealWrites();
    return {retained:true,repeated:false,notice_ref:ref('notices',notice),original_notice_ref:ref('notices',notice),accepted:false,reservations_released:false};
  },tx=>{
    need(Object.entries(connection).every(([key,value])=>ledger[key]===value),'TASK_LATE_LEDGER_REQUIRED');
    for(const expectedRow of expected.values()){
      const current=tx.get(expectedRow.family,expectedRow.id);
      need(expectedRow.reference?current&&same(ref(expectedRow.family,current),expectedRow.reference):!current);
    }
    return deadline;
  });
}

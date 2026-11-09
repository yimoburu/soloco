import {PeerLedger,canonical,peerDigest} from './ledger.mjs';
import {digest} from './model.mjs';

// Trusted host composition only. Never expose this factory, ledger or observer
// through model tools. The actual observer has only record; its same-ledger and
// same-principal binding is a host precondition, not an introspectable brand.
// This component delivers observations. It never admits, launches, terminates,
// refunds or accepts business work. ACK means an exact P2 command committed.
export const OBSERVATION_PROTOCOL='p3-runtime-observation-v1';
export const OBSERVATION_PREFIX='p3:runtime-observation:v1:';
export const OBSERVATION_STATUS=Object.freeze({pending:'p3_observation_pending',held:'p3_observation_held',ack:'p3_observation_ack'});
export const JOURNAL_ENVELOPE_RESERVE=1024;
export const JOURNAL_LIMITS=Object.freeze({
  defaults:Object.freeze({entry_bytes:128000,attempt_count:3,attempt_bytes:384000,pending_count:1000,pending_bytes:8000000}),
  ceilings:Object.freeze({entry_bytes:1000000,attempt_count:3,attempt_bytes:3000000,pending_count:10000,pending_bytes:16000000})
});
// Byte accounting charges the complete canonical initial row plus 1024 bytes
// for the bounded mutable ACK/issue envelope. It is an admission policy, not a
// JS heap measurement. Per-attempt bounds include its acknowledged history;
// aggregate pending bounds exclude acknowledged history before enumeration.
// A task has one P2 attempt. This journal supports at most one process, one
// finish and one closure, in that order; process is optional. A failed immutable
// observation cannot be replaced by changed arguments under another event.
// Any page failure with a supplied cursor requires an explicit fresh restart.
// Recovery collects one bounded owning snapshot, then delivers outside it; it
// never carries an old enumeration cursor across a journal mutation.
const pendingStates=[OBSERVATION_STATUS.pending,OBSERVATION_STATUS.held];
const allStates=Object.values(OBSERVATION_STATUS);
const actions=['task/process','task/finish','task/closure'];
const phases=['prepare','observer','readback','ack','verify'];
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const copy=v=>JSON.parse(canonical(v));
const equal=(a,b)=>canonical(a)===canonical(b);
const bytes=v=>Buffer.byteLength(canonical(v));
const reference=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
export class ObservationJournalError extends Error{
  constructor(code,message,options){super(message,options);this.name='ObservationJournalError';this.code=code;}
}
function need(ok,code,message){if(!ok)throw new ObservationJournalError(code,message);}
function shape(value,required,optional=[]){
  need(value&&typeof value==='object'&&!Array.isArray(value),'JOURNAL_SHAPE','Object required');
  const keys=Object.keys(value);
  need(required.every(k=>own(value,k))&&keys.every(k=>required.includes(k)||optional.includes(k)),'JOURNAL_SHAPE','Unknown or missing journal field');
}
function text(value,label,max){
  need(typeof value==='string'&&value.trim()&&value.length<=max&&!value.includes('\0')&&!/[\ud800-\udfff]/u.test(value),'JOURNAL_INPUT','Invalid '+label);
  return value;
}
function sha(value){need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'JOURNAL_INTEGRITY','Invalid digest');return value;}
function integer(value,max,label){need(Number.isSafeInteger(value)&&value>0&&value<=max,'JOURNAL_INPUT','Invalid '+label);return value;}
function exactRef(value,family){
  shape(value,['family','id','revision','sha256']);
  need(value.family===family,'JOURNAL_INTEGRITY','Reference family changed');text(value.id,'reference id',2000);integer(value.revision,Number.MAX_SAFE_INTEGER,'revision');sha(value.sha256);
  return value;
}
function normalize(input){
  const value=copy(input);shape(value,['action','args'],['predecessor_event_id']);
  need(actions.includes(value.action),'JOURNAL_ACTION','Unsupported observation action');
  const a=value.args;
  const extra=value.action==='task/finish'?['termination_confirmed','error','output','native_id','review_evidence']:value.action==='task/closure'?['termination_confirmed']:[];
  shape(a,['operation_id','task_id','attempt_id','observed_process'],extra);
  text(a.operation_id,'operation id',160);text(a.task_id,'task id',200);text(a.attempt_id,'attempt id',200);
  // Structural bounds belong here; physical process validity remains P2-owned.
  // In particular, a missing/invalid PID is never manufactured or repaired.
  if(a.observed_process!==null)shape(a.observed_process,[],['pid','started_at','execution_started_at','close_observed']);
  need(bytes(a.observed_process)<=4000,'JOURNAL_CAPACITY','Observed process exceeds P2 capacity');
  if(own(a,'termination_confirmed'))need(typeof a.termination_confirmed==='boolean','JOURNAL_INPUT','Boolean termination flag required');
  if(own(a,'error'))need(bytes(a.error)<=4000,'JOURNAL_CAPACITY','Error payload exceeds P2 capacity');
  if(own(a,'output'))need(typeof a.output==='string'&&Buffer.byteLength(a.output)<=64000,'JOURNAL_CAPACITY','Raw output exceeds P2 capacity');
  if(own(a,'native_id'))text(a.native_id,'native identity',300);
  if(own(a,'review_evidence'))shape(a.review_evidence,[],['subject','verdict','reason','blockers','output_sha256','context_sha256','native_id']);
  need(bytes(a)<=1000000,'JOURNAL_CAPACITY','Request exceeds P2 capacity');
  const predecessor=value.predecessor_event_id??null;
  if(predecessor!==null)eventId(predecessor);
  return {action:value.action,args:a,predecessor_event_id:predecessor};
}
function eventId(id){text(id,'event id',200);need(id.startsWith(OBSERVATION_PREFIX)&&/^[a-f0-9]{64}$/.test(id.slice(OBSERVATION_PREFIX.length)),'JOURNAL_INPUT','Invalid observation event key');return id;}
function pendingValue(payload){return {protocol:OBSERVATION_PROTOCOL,scope:OBSERVATION_PROTOCOL,principal_id:payload.principal_id,task_id:payload.task_id,status:OBSERVATION_STATUS.pending,payload,payload_sha256:digest(payload),ack:null,issue:null};}
function charge(value){return bytes(pendingValue(value.payload))+JOURNAL_ENVELOPE_RESERVE;}
// P2 accepts either start alias, but compares their actual strings. Parsing is
// validity checking only: equal instants in different strings are not identity.
// This validates closure delivery evidence; it never changes an input or row.
function processIdentity(value,closed=false){
  need(value&&typeof value==='object'&&!Array.isArray(value)&&Number.isSafeInteger(value.pid)&&value.pid>0,'JOURNAL_RECEIPT','Valid retained/requested process identity required');
  const started=value.started_at??value.execution_started_at;
  need(typeof started==='string'&&Number.isFinite(Date.parse(started))&&!(value.started_at!==undefined&&value.execution_started_at!==undefined&&value.started_at!==value.execution_started_at),'JOURNAL_RECEIPT','Unambiguous process start required');
  if(closed)need(value.close_observed===true,'JOURNAL_RECEIPT','Explicit process close evidence required');
  return {pid:value.pid,started};
}

export function createObservationJournal(options){
  // Preserve the prior native historical-production checks, with two focused
  // repairs: diagnose self-inconsistent envelopes before provider lookup and
  // prove, rather than discard, the optional process-production transition.
  const currentHistoricalEnvelope=historicalEnvelope;
  historicalEnvelope=function(tx,family,row){
    shape(row,['id','revision','sha256','created_seq','value']);
    const r=exactRef(reference(family,row),family);
    need(peerDigest(row.value)===r.sha256,'JOURNAL_RECEIPT','Receipt result has a self-inconsistent canonical commitment');
    // No catch: storage, transaction and hook failures retain their identity,
    // causes and uncertainty even when their codes resemble journal errors.
    return currentHistoricalEnvelope(tx,family,row);
  };
  const currentClosureReceipt=closureReceipt;
  closureReceipt=function(tx,c,p,taskRow,t){
    currentClosureReceipt(tx,c,p,taskRow,t);
    retainedProduction(tx,c,p,taskRow,t);
  };
  function productionMember(event,r,{created=false}={}){
    exactRef(r,r.family);
    const changes=event.payload.changes.filter(change=>change.family===r.family&&change.id===r.id);
    need(changes.length===1&&changes[0].revision===r.revision&&changes[0].sha256===r.sha256&&(!created||r.revision===1&&changes[0].previous_sha256===null),'JOURNAL_RECEIPT','Historical production event has a different exact member');
  }
  function observationProduction(tx,r,action){
    exactRef(r,'effects');
    need(r.revision===1,'JOURNAL_RECEIPT','Protected historical observation was revised');
    const current=tx.get('effects',r.id);
    need(current&&equal(reference('effects',current),r)&&peerDigest(current.value)===r.sha256,'JOURNAL_RECEIPT','Historical observation has a different current binding');
    const stored=tx.getVersion(r);
    need(stored&&equal(current.value,stored.value),'JOURNAL_RECEIPT','Historical observation has no exact immutable binding');
    const v=stored.value;
    need(v.kind==='runtime_observation'&&v.status==='recorded'&&v.action===action&&v.principal_id===principal,'JOURNAL_RECEIPT','Historical observation has a different producer');
    integer(current.created_seq,Number.MAX_SAFE_INTEGER,'observation creation sequence');
    const event=tx.events({after:current.created_seq-1,limit:1}).items[0];
    need(event&&event.seq===current.created_seq&&event.type===action&&event.principal_id===principal,'JOURNAL_RECEIPT','Historical observation production event is unavailable or different');
    productionMember(event,r,{created:true});
    return event;
  }
  function productionCommand(tx,event,action){
    const changes=event.payload.changes.filter(change=>change.family==='commands');
    need(changes.length===1,'JOURNAL_RECEIPT','Historical observation lacks one producing command');
    const change=changes[0],r=exactRef({family:change.family,id:change.id,revision:change.revision,sha256:change.sha256},'commands');
    need(r.revision===1&&change.previous_sha256===null,'JOURNAL_RECEIPT','Historical producer command was not newly created');
    const c=tx.get('commands',r.id);
    need(c&&c.created_seq===event.seq&&equal(reference('commands',c),r)&&peerDigest(c.value)===r.sha256,'JOURNAL_RECEIPT','Historical producer command differs from its creation binding');
    const stored=tx.getVersion(r);
    need(stored&&equal(c.value,stored.value),'JOURNAL_RECEIPT','Historical producer command differs from its immutable event binding');
    const v=c.value;
    shape(v,['principal_id','operation_id','action','request_sha256','result','created_at']);
    need(v.principal_id===principal&&v.action===action&&typeof v.operation_id==='string'&&v.operation_id.trim()&&v.operation_id.length<=160&&!v.operation_id.includes('\0')&&c.id===digest(['peer-command-v1',principal,v.operation_id])&&typeof v.created_at==='string'&&Number.isFinite(Date.parse(v.created_at))&&bytes(v.result)<=800000,'JOURNAL_RECEIPT','Historical producer command identity or result bound changed');
    sha(v.request_sha256);
    productionMember(event,r,{created:true});
    return c;
  }
  function productionTask(tx,event,produced,p){
    const value=historicalEnvelope(tx,'tasks',produced);
    need(produced.id===p.task_id&&value.attempt?.id===p.attempt_id,'JOURNAL_RECEIPT','Historical produced task or attempt changed');
    productionMember(event,reference('tasks',produced));
    return value;
  }
  function retainedProcessBinding(tx,p,taskRow,producedRow,currentCommand){
    const t=taskRow.value,produced=producedRow.value,a=t.attempt,b=produced.attempt;
    const hasProcess=value=>own(value,'process'),hasReference=value=>own(value,'process_observation');
    need(hasProcess(a)===hasReference(a)&&hasProcess(b)===hasReference(b),'JOURNAL_RECEIPT','Retained process evidence is incomplete');
    if(hasProcess(b)){
      need(hasProcess(a)&&equal(a.process,b.process)&&equal(a.process_observation,b.process_observation),'JOURNAL_RECEIPT','Previously produced process bytes or reference changed');
    }
    // A later first process may be absent from both producer snapshots. Resolve
    // its fixed identity before treating absence as evidence. A receipt remains
    // an older snapshot: future genuine production must not invalidate it.
    const absent=!hasProcess(a);
    const discovered=absent?tx.get('effects',digest(['runtime-observation',p.task_id,p.attempt_id,'task/process'])):null;
    if(absent&&!discovered)return;
    const r=exactRef(absent?reference('effects',discovered):a.process_observation,'effects');
    need(r.id===digest(['runtime-observation',p.task_id,p.attempt_id,'task/process']),'JOURNAL_RECEIPT','Process production belongs to a different task or attempt');
    const event=observationProduction(tx,r,'task/process');
    const command=productionCommand(tx,event,'task/process'),processRow=command.value.result;
    const processTask=productionTask(tx,event,processRow,p);
    need(processTask.attempt&&hasProcess(processTask.attempt)&&hasReference(processTask.attempt),'JOURNAL_RECEIPT','Process producer result lacks its complete process evidence');
    const process=absent?processTask.attempt.process:a.process;
    processIdentity(process);
    observation(tx,r,p,t,'task/process',process);
    need(equal(processTask.attempt.process,process)&&equal(processTask.attempt.process_observation,r),'JOURNAL_RECEIPT','Process producer result differs from retained process evidence');
    const args={task_id:p.task_id,attempt_id:p.attempt_id,observed_process:process};
    need(command.value.request_sha256===digest({channel:'runtime-observer',action:'task/process',args}),'JOURNAL_RECEIPT','Process producer lacks its exact protected request');
    if(absent){
      // currentClosureReceipt already verifies this exact command's creation
      // event and membership. Compare actual event order and exact task revision;
      // task.created_seq names initial creation and cannot date a later revision.
      need(event.seq>currentCommand.created_seq&&processRow.revision>taskRow.revision,'JOURNAL_RECEIPT','Retained task erased process production preceding its closure command');
    }else{
      need(processRow.revision<=taskRow.revision&&(hasProcess(b)?processRow.revision<=producedRow.revision:processRow.revision>producedRow.revision),'JOURNAL_RECEIPT','Process production is inconsistent with retained task revisions');
    }
    const changes=event.payload.changes.filter(change=>change.family==='tasks'&&change.id===p.task_id);
    need(changes.length===1&&processRow.revision>1&&changes[0].previous_sha256!==null,'JOURNAL_RECEIPT','Process production lacks its task predecessor');
    const beforeRef={family:'tasks',id:p.task_id,revision:processRow.revision-1,sha256:changes[0].previous_sha256};
    exactRef(beforeRef,'tasks');
    const before=tx.getVersion(beforeRef);
    need(before&&before.value.attempt?.id===p.attempt_id&&!own(before.value.attempt,'process')&&!own(before.value.attempt,'process_observation'),'JOURNAL_RECEIPT','Process production was not a first process observation');
    const expected={...before.value,attempt:{...before.value.attempt,process,process_observation:r}};
    need(equal(processTask,expected),'JOURNAL_RECEIPT','Process producer changed more than its exact first process fields');
    const admitted=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['process','process_observation','native_id','termination_confirmed'].includes(key)));
    need(equal(admitted(processTask.attempt),admitted(a))&&equal(processTask.definition,t.definition)&&processTask.definition_sha256===t.definition_sha256&&processTask.definition_revision===t.definition_revision&&processTask.scope===t.scope,'JOURNAL_RECEIPT','Process producer belongs to different admitted work');
    need(event.payload.changes.length===3&&event.payload.events.length===0,'JOURNAL_RECEIPT','Unexpected mutations in process production');
  }
  function retainedTaskBinding(tx,p,taskRow,producedRow,currentCommand){
    const t=taskRow.value,produced=producedRow.value;
    const attempt=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['process','process_observation'].includes(key)));
    need(t.attempt&&produced.attempt&&equal(attempt(t.attempt),attempt(produced.attempt))&&equal(t.definition,produced.definition)&&t.definition_sha256===produced.definition_sha256&&t.definition_revision===produced.definition_revision&&t.scope===produced.scope&&equal(t.result,produced.result),'JOURNAL_RECEIPT','Retained finish or admitted production differs from its actual producer result');
    // Existing process fields are immutable. An absent pair may acquire only
    // the independently verified first process transition above.
    retainedProcessBinding(tx,p,taskRow,producedRow,currentCommand);
  }
  function retainedProduction(tx,currentCommand,p,taskRow,t){
    // Use the original journaled finish payload, including optional fields;
    // never reconstruct it from a later task or the current closure packet.
    const entries=chain(tx,p.task_id,p.attempt_id).rows;
    const finishes=entries.filter(row=>row.value.payload.action==='task/finish');
    need(finishes.length===1&&finishes[0].value.status===OBSERVATION_STATUS.ack,'JOURNAL_RECEIPT','Historical finish delivery predecessor is unavailable');
    const first=finishes[0],finishReceipt=receipt(tx,first);
    checkAck(first,finishReceipt);
    const finishTask=finishReceipt.result.task,original=finishTask.value;
    need(equal(t.result,original.result),'JOURNAL_RECEIPT','Retained original finish was substituted');
    const finishEvent=observationProduction(tx,original.result.observation,'task/finish');
    const finishCommand=productionCommand(tx,finishEvent,'task/finish');
    need(equal(reference('commands',finishCommand),finishReceipt.command)&&equal(finishCommand.value.result,finishReceipt.result)&&digest(finishCommand.value.result)===finishReceipt.result_sha256,'JOURNAL_RECEIPT','Historical finish command does not produce the acknowledged original result');
    productionTask(tx,finishEvent,finishTask,p);
    retainedTaskBinding(tx,p,taskRow,finishTask,currentCommand);
    if(!t.closure){
      need(original.result.termination_confirmed===true,'JOURNAL_RECEIPT','Closed-finish no-op has no authentic original closed production');
      return;
    }
    const closureEvent=observationProduction(tx,t.closure.observation,'task/closure');
    need(closureEvent.seq>finishEvent.seq,'JOURNAL_RECEIPT','Historical closure does not follow its original finish');
    const closureCommand=productionCommand(tx,closureEvent,'task/closure');
    const produced=closureCommand.value.result;
    const closed=productionTask(tx,closureEvent,produced,p);
    retainedTaskBinding(tx,p,taskRow,produced,currentCommand);
    need(closed.closure&&equal(closed.closure,t.closure)&&equal(closed.closure.observation,t.closure.observation),'JOURNAL_RECEIPT','Retained closure differs from the actual producing command result');
    const args={task_id:p.task_id,attempt_id:p.attempt_id,observed_process:closed.closure.observed_process,termination_confirmed:true};
    need(closureCommand.value.request_sha256===digest({channel:'runtime-observer',action:'task/closure',args}),'JOURNAL_RECEIPT','Historical closure lacks the original protected request digest');
    need(taskRow.id===produced.id&&digest(closed.closure)===digest(t.closure),'JOURNAL_RECEIPT','Historical closure result identity or digest changed');
  }
  shape(options,['ledger','observer'],['principal_id','limits']);
  const {ledger,observer}=options,principal=text(options.principal_id??'scheduler','scheduler principal',200);
  need(ledger instanceof PeerLedger,'JOURNAL_HOST','Actual accepted PeerLedger required');
  need(observer&&typeof observer.record==='function','JOURNAL_HOST','Protected observer.record capability required');
  const company=text(ledger.company_id,'company id',300),configured=copy(options.limits??{});
  shape(configured,[],Object.keys(JOURNAL_LIMITS.defaults));
  const limits=Object.freeze({...JOURNAL_LIMITS.defaults,...configured});
  for(const [key,value] of Object.entries(limits))integer(value,JOURNAL_LIMITS.ceilings[key],key);
  need(limits.entry_bytes>JOURNAL_ENVELOPE_RESERVE,'JOURNAL_INPUT','Entry budget must include its envelope reserve');
  const inFlight=new Set();
  const keyFor=operation=>OBSERVATION_PREFIX+digest([OBSERVATION_PROTOCOL,company,principal,operation]);
  const filter=(states,task)=>({scope:OBSERVATION_PROTOCOL,principal_id:principal,status:states,...(task===undefined?{}:{task_id:task})});
  const host=tx=>{
    need(ledger.company_id===company,'JOURNAL_HOST','Company binding changed');
    const row=tx.get('principals',principal);
    need(row?.value.kind==='scheduler'&&row.value.principal_id===principal,'JOURNAL_HOST','Fixed scheduler binding unavailable');
    return row;
  };
  const probe=(tx,p)=>{
    const r=reference('principals',p),stored=tx.getVersion(r);
    need(stored&&equal(stored.value,p.value),'JOURNAL_INTEGRITY','Owning snapshot binding changed');
  };
  const read=fn=>ledger.read(tx=>{const p=host(tx),result=fn(tx);probe(tx,p);return result;});
  const write=(kind,fn)=>ledger.write('p3.observation.'+kind,principal,tx=>{const p=host(tx);return fn(tx,()=>probe(tx,p));});
  read(tx=>{need(tx.get('principals',principal).value.status==='active','JOURNAL_HOST','Active scheduler required at construction');return null;});

  function validate(tx,row){
    need(row,'JOURNAL_MISSING','Observation event unavailable');eventId(row.id);
    const v=row.value,p=v?.payload;
    shape(v,['protocol','scope','principal_id','task_id','status','payload','payload_sha256','ack','issue']);
    shape(p,['protocol','company_id','principal_id','task_id','attempt_id','action','operation_id','args','command_id','request_sha256','predecessor_event_id','ordinal']);
    const n=normalize({action:p.action,args:p.args,predecessor_event_id:p.predecessor_event_id});
    need(p.protocol===OBSERVATION_PROTOCOL&&p.company_id===company&&p.principal_id===principal&&p.task_id===n.args.task_id&&p.attempt_id===n.args.attempt_id&&p.operation_id===n.args.operation_id,'JOURNAL_INTEGRITY','Immutable event identity changed');
    need(v.protocol===OBSERVATION_PROTOCOL&&v.scope===OBSERVATION_PROTOCOL&&v.principal_id===principal&&v.task_id===p.task_id&&allStates.includes(v.status),'JOURNAL_INTEGRITY','Journal namespace or index binding changed');
    need(row.id===keyFor(p.operation_id)&&p.command_id===digest(['peer-command-v1',principal,p.operation_id]),'JOURNAL_INTEGRITY','Stable event or command key changed');
    const payload=copy(p.args);delete payload.operation_id;
    need(p.request_sha256===digest({channel:'runtime-observer',action:p.action,args:payload})&&v.payload_sha256===digest(p),'JOURNAL_INTEGRITY','Immutable request digest changed');
    integer(p.ordinal,3,'attempt ordinal');
    const initial=pendingValue(p),initialRef={family:'work_items',id:row.id,revision:1,sha256:peerDigest(initial)};
    const original=tx.getVersion(initialRef);
    need(original&&equal(original.value,initial),'JOURNAL_INTEGRITY','Original committed pending payload unavailable');
    need(row.sha256===peerDigest(v)&&bytes(v)<=1000000&&bytes(v)<=limits.entry_bytes&&bytes(v)<=charge(v)&&charge(v)<=limits.entry_bytes,'JOURNAL_CAPACITY','Complete journal value or reserved envelope exceeds entry capacity');
    if(v.status===OBSERVATION_STATUS.ack){
      shape(v.ack,['command','result_sha256']);exactRef(v.ack.command,'commands');sha(v.ack.result_sha256);
      need(v.ack.command.id===p.command_id&&v.ack.command.revision===1&&v.issue===null,'JOURNAL_INTEGRITY','Acknowledgment binding changed');
    }else{
      need(v.ack===null,'JOURNAL_INTEGRITY','Unacknowledged event carries an ACK');
      if(v.status===OBSERVATION_STATUS.pending)need(v.issue===null,'JOURNAL_INTEGRITY','Initial pending envelope changed');
      else{
        shape(v.issue,['phase','kind','details_persisted']);
        need(phases.includes(v.issue.phase)&&v.issue.kind==='unclassified_uncertainty'&&v.issue.details_persisted===false,'JOURNAL_INTEGRITY','Invalid unresolved diagnostic');
      }
    }
    return row;
  }
  const load=(tx,id)=>validate(tx,tx.get('work_items',eventId(id)));
  function collect(tx,selected,maxCount,maxBytes){
    const total=tx.count('work_items',selected);
    need(total<=maxCount,'JOURNAL_CAPACITY','Journal matching-row count exceeds capacity');
    const rows=[];let cursor,used=0;
    for(;;){
      const page=tx.list('work_items',{...selected,limit:100,...(cursor?{cursor}:{})});
      need(page.total===total,'JOURNAL_INTEGRITY','Journal membership changed');
      for(const item of page.items){const row=validate(tx,item);used+=charge(row.value);need(used<=maxBytes,'JOURNAL_CAPACITY','Journal reserved canonical bytes exceed capacity');rows.push(row);}
      if(page.complete){need(rows.length===total,'JOURNAL_INTEGRITY','Incomplete journal membership');break;}
      need(page.items.length&&page.next_cursor&&page.next_cursor!==cursor,'JOURNAL_INTEGRITY','Nonprogressing journal cursor');cursor=page.next_cursor;
    }
    return {rows,bytes:used};
  }
  const pending=tx=>collect(tx,filter(pendingStates),limits.pending_count,limits.pending_bytes);
  function chain(tx,task,attempt){
    const result=collect(tx,filter(allStates,task),limits.attempt_count,limits.attempt_bytes);
    const rows=result.rows.sort((a,b)=>a.value.payload.ordinal-b.value.payload.ordinal);
    let previous=null,rank=-1;
    for(let i=0;i<rows.length;i++){
      const p=rows[i].value.payload,next=actions.indexOf(p.action);
      need(p.attempt_id===attempt&&p.ordinal===i+1&&p.predecessor_event_id===previous&&next>rank,'JOURNAL_ORDER','Broken attempt predecessor chain');
      need(p.action!=='task/closure'||rank===1,'JOURNAL_ORDER','Closure requires a preceding finish');
      previous=rows[i].id;rank=next;
    }
    return {rows,bytes:result.bytes};
  }
  function historicalEnvelope(tx,family,row){
    shape(row,['id','revision','sha256','created_seq','value']);integer(row.created_seq,Number.MAX_SAFE_INTEGER,'creation sequence');
    const r=exactRef(reference(family,row),family),stored=tx.getVersion(r);
    need(stored&&peerDigest(row.value)===r.sha256&&equal(stored.value,row.value),'JOURNAL_RECEIPT','Receipt result differs from exact committed history');
    return row.value;
  }
  function observation(tx,r,p,t,action,process){
    exactRef(r,'effects');
    need(r.id===digest(['runtime-observation',p.task_id,p.attempt_id,action]),'JOURNAL_RECEIPT','Observation identity changed');
    const current=tx.get('effects',r.id),stored=tx.getVersion(r);
    need(current&&equal(reference('effects',current),r)&&equal(current.value,stored.value),'JOURNAL_RECEIPT','Protected observation head changed');
    const v=stored.value;
    need(v.kind==='runtime_observation'&&v.status==='recorded'&&v.action===action&&v.principal_id===principal&&v.task_id===p.task_id&&v.attempt_id===p.attempt_id&&v.scope===t.scope&&equal(v.process,process),'JOURNAL_RECEIPT','Protected observation binding changed');
    return v;
  }
  // getVersion proves canonical bytes, not event membership. Read the verified
  // event explicitly to distinguish a new closure write from P2's early no-op.
  // The command's creation sequence is a locator, not the membership proof.
  function closureChangedTask(tx,c,taskRow){
    const page=tx.events({after:c.created_seq-1,limit:1}),event=page.items[0];
    need(event?.seq===c.created_seq&&event.type==='task/closure'&&event.principal_id===principal,'JOURNAL_RECEIPT','Closure command event unavailable or changed');
    const changes=event.payload.changes,command=reference('commands',c),task=reference('tasks',taskRow);
    const matches=(change,r)=>change.family===r.family&&change.id===r.id&&change.revision===r.revision&&change.sha256===r.sha256;
    const commands=changes.filter(change=>change.family==='commands'&&change.id===c.id);
    need(commands.length===1&&matches(commands[0],command)&&commands[0].previous_sha256===null,'JOURNAL_RECEIPT','Closure command is not bound to its creation event');
    const tasks=changes.filter(change=>change.family==='tasks'&&change.id===taskRow.id);
    if(!tasks.length){
      // A supported P2 closure no-op writes only its new command receipt.
      need(changes.length===1,'JOURNAL_RECEIPT','Unexpected mutations in closure no-op');
      return false;
    }
    need(tasks.length===1&&matches(tasks[0],task)&&taskRow.value.closure,'JOURNAL_RECEIPT','Closure task write differs from exact receipt');
    const r=exactRef(taskRow.value.closure.observation,'effects'),observations=changes.filter(change=>change.family==='effects'&&change.id===r.id);
    need(r.revision===1&&observations.length===1&&matches(observations[0],r)&&observations[0].previous_sha256===null,'JOURNAL_RECEIPT','New closure lacks its exact newly recorded observation');
    return true;
  }
  function closureReceipt(tx,c,p,taskRow,t){
    const a=p.args,r=t.result;
    need(a.termination_confirmed===true&&r,'JOURNAL_RECEIPT','Closure result lacks original finish');
    const requested=processIdentity(a.observed_process,true),original=processIdentity(r.observed_process,r.termination_confirmed===true);
    need(equal(requested,original),'JOURNAL_RECEIPT','Closure process differs from retained finish identity');
    if(t.attempt.process)need(equal(requested,processIdentity(t.attempt.process)),'JOURNAL_RECEIPT','Closure process differs from retained process identity');
    // Validate the original finish against its own immutable observation. A
    // no-op is not a replacement finish, even if its raw alias layout differs.
    const finish=observation(tx,r.observation,p,t,'task/finish',r.observed_process);
    need(typeof r.termination_confirmed==='boolean'&&t.attempt.termination_confirmed===r.termination_confirmed&&finish.termination_confirmed===r.termination_confirmed&&finish.native_id===r.native_id&&t.attempt.native_id===r.native_id&&finish.output_sha256===r.output_sha256&&finish.context_sha256===t.attempt.context.sha256&&(r.output===null?r.output_sha256===null:typeof r.output==='string'&&digest(r.output)===r.output_sha256),'JOURNAL_RECEIPT','Retained finish observation aliases changed');
    const changed=closureChangedTask(tx,c,taskRow);
    if(t.closure){
      const retained=t.closure;
      need(retained.termination_confirmed===true&&equal(requested,processIdentity(retained.observed_process,true)),'JOURNAL_RECEIPT','Closure result differs from requested process identity');
      const o=observation(tx,retained.observation,p,t,'task/closure',retained.observed_process);
      need(o.termination_confirmed===true,'JOURNAL_RECEIPT','Closure observation changed');
      // For a newly written closure, P2 stores the current arguments exactly.
      // Only an event-proven no-op may retain a different valid alias layout.
      if(changed)need(equal(retained.observed_process,a.observed_process),'JOURNAL_RECEIPT','New closure did not retain the exact requested process');
    }else{
      need(!changed&&r.termination_confirmed===true,'JOURNAL_RECEIPT','Closed finish no-op lacks retained closure evidence');
    }
  }
  function receipt(tx,row){
    const p=row.value.payload,c=tx.get('commands',p.command_id);
    if(!c)return null;
    const v=c.value;
    shape(v,['principal_id','operation_id','action','request_sha256','result','created_at']);
    need(c.revision===1&&v.principal_id===principal&&v.operation_id===p.operation_id&&v.action===p.action&&v.request_sha256===p.request_sha256&&typeof v.created_at==='string'&&Number.isFinite(Date.parse(v.created_at)),'JOURNAL_RECEIPT','Committed command has a different immutable binding');
    const command=reference('commands',c),stored=tx.getVersion(command);
    need(equal(stored.value,v)&&bytes(v.result)<=800000,'JOURNAL_RECEIPT','Command history or result capacity changed');
    const result=v.result,taskRow=p.action==='task/finish'?result?.task:result;
    if(p.action==='task/finish')shape(result,['task','accepted','review']);
    const t=historicalEnvelope(tx,'tasks',taskRow);
    need(taskRow.id===p.task_id&&t.attempt?.id===p.attempt_id,'JOURNAL_RECEIPT','Result task or attempt changed');
    const a=p.args;
    if(p.action==='task/process'){
      need(equal(t.attempt.process,a.observed_process),'JOURNAL_RECEIPT','Process result differs from request');
      observation(tx,t.attempt.process_observation,p,t,p.action,a.observed_process);
    }else if(p.action==='task/finish'){
      const r=t.result;shape(r,['output','output_sha256','native_id','error','termination_confirmed','observed_process','observation','at']);
      const output=own(a,'output')?a.output:null,native=own(a,'native_id')?a.native_id:null,error=a.error||null,closed=a.termination_confirmed===true;
      need(equal(r.output,output)&&r.output_sha256===(output===null?null:digest(output))&&r.native_id===native&&equal(r.error,error)&&r.termination_confirmed===closed&&equal(r.observed_process,a.observed_process)&&t.attempt.native_id===native&&t.attempt.termination_confirmed===closed,'JOURNAL_RECEIPT','Finish result differs from exact request');
      need(typeof result.accepted==='boolean'&&result.accepted===(t.status==='returned')&&(!closed?t.status==='unknown':['returned','failed','quarantined'].includes(t.status)),'JOURNAL_RECEIPT','Retained acceptance or physical state changed');
      const o=observation(tx,r.observation,p,t,p.action,a.observed_process);
      need(o.output_sha256===r.output_sha256&&o.native_id===native&&o.termination_confirmed===closed&&o.context_sha256===t.attempt.context.sha256,'JOURNAL_RECEIPT','Finish observation aliases changed');
      if(result.review===null)need(t.review_id===null&&o.review===null,'JOURNAL_RECEIPT','Missing retained review');
      else{
        const review=historicalEnvelope(tx,'reviews',result.review);
        need(result.accepted&&result.review.id===t.review_id&&t.review_id===digest(['review',p.task_id,p.attempt_id]),'JOURNAL_RECEIPT','Review production changed');
        const parsed=JSON.parse(output),raw=parsed?.review;
        need(canonical(parsed)===output&&raw&&equal(raw.subject,t.review_of),'JOURNAL_RECEIPT','Raw review subject changed');
        const data={subject:raw.subject,verdict:raw.verdict,reason:raw.reason,blockers:raw.blockers};
        need(equal(o.review,data)&&['Pass','Fail','Blocked'].includes(raw.verdict)&&review.status==='accepted'&&review.task_id===p.task_id&&review.native_id===native&&review.context_sha256===o.context_sha256&&review.output_sha256===r.output_sha256&&review.reviewer_principal_id===t.owner_principal_id&&review.recorded_by===principal&&review.proof?.protocol==='peer-runtime-observation-v1'&&equal(review.proof.task,reference('tasks',taskRow))&&equal(review.proof.observation,r.observation),'JOURNAL_RECEIPT','Review proof binding changed');
        for(const k of ['subject','verdict','reason','blockers'])need(equal(review[k],data[k]),'JOURNAL_RECEIPT','Retained review differs from raw output');
      }
    }else closureReceipt(tx,c,p,taskRow,t);
    return {command,result_sha256:digest(result),result:copy(result)};
  }
  function checkAck(row,r){need(r&&equal(row.value.ack,{command:r.command,result_sha256:r.result_sha256}),'JOURNAL_RECEIPT','Journal ACK has no exact matching committed receipt');}
  function ready(tx,row){
    const p=row.value.payload,c=chain(tx,p.task_id,p.attempt_id);
    for(const before of c.rows){
      if(before.id===row.id)return;
      need(before.value.status===OBSERVATION_STATUS.ack,'JOURNAL_ORDER','Predecessor delivery is unresolved');checkAck(before,receipt(tx,before));
    }
    throw new ObservationJournalError('JOURNAL_ORDER','Event is absent from its attempt chain');
  }
  function enqueue(input){
    const n=normalize(input),id=keyFor(n.args.operation_id);
    return write('enqueue',(tx,check)=>{
      const existing=tx.get('work_items',id);
      if(existing){
        const row=validate(tx,existing),p=row.value.payload;
        need(p.action===n.action&&equal(p.args,n.args)&&p.predecessor_event_id===n.predecessor_event_id,'JOURNAL_COLLISION','Operation already names a different immutable observation');
        chain(tx,p.task_id,p.attempt_id);pending(tx);
        if(row.value.status===OBSERVATION_STATUS.ack)checkAck(row,receipt(tx,row));
        check();return row;
      }
      const task=tx.get('tasks',n.args.task_id),attempt=task?.value.attempt;
      need(attempt?.id===n.args.attempt_id,'JOURNAL_ATTEMPT','Exact admitted task attempt required');
      const effect=tx.get('effects',attempt.effect_id);
      need(effect?.value.kind==='native'&&effect.value.task_id===task.id,'JOURNAL_ATTEMPT','Actual native attempt reservation required');
      const c=chain(tx,task.id,attempt.id),last=c.rows.at(-1),rank=last?actions.indexOf(last.value.payload.action):-1;
      need(n.predecessor_event_id===(last?.id??null)&&actions.indexOf(n.action)>rank,'JOURNAL_ORDER','Predecessor must be the exact attempt tail with increasing action order');
      need(n.action!=='task/closure'||last?.value.payload.action==='task/finish','JOURNAL_ORDER','Closure requires a retained finish event');
      const args=copy(n.args);delete args.operation_id;
      const p={protocol:OBSERVATION_PROTOCOL,company_id:company,principal_id:principal,task_id:task.id,attempt_id:attempt.id,action:n.action,operation_id:n.args.operation_id,args:n.args,command_id:digest(['peer-command-v1',principal,n.args.operation_id]),request_sha256:digest({channel:'runtime-observer',action:n.action,args}),predecessor_event_id:n.predecessor_event_id,ordinal:c.rows.length+1};
      const value=pendingValue(p),cost=charge(value),global=pending(tx);
      need(cost<=limits.entry_bytes&&bytes(value)<=1000000,'JOURNAL_CAPACITY','Complete pending row and future envelope exceed entry capacity');
      need(c.rows.length+1<=limits.attempt_count&&c.bytes+cost<=limits.attempt_bytes,'JOURNAL_CAPACITY','Attempt journal capacity exceeded');
      need(global.rows.length+1<=limits.pending_count&&global.bytes+cost<=limits.pending_bytes,'JOURNAL_CAPACITY','Aggregate pending journal capacity exceeded');
      check();return tx.put('work_items',id,value,0);
    });
  }
  function inspectPending(input={}){
    const o=copy(input);shape(o,[],['limit','cursor','task_id']);
    const limit=integer(o.limit??50,100,'page limit');if(own(o,'task_id'))text(o.task_id,'task id',200);if(own(o,'cursor'))text(o.cursor,'cursor',16000);
    try{return read(tx=>{
      pending(tx);
      const page=tx.list('work_items',{...filter(pendingStates,o.task_id),limit,...(own(o,'cursor')?{cursor:o.cursor}:{})});
      return {...page,items:page.items.map(row=>validate(tx,row))};
    });}catch(cause){
      if(!own(o,'cursor'))throw cause;
      const error=new ObservationJournalError('JOURNAL_PAGE_UNAVAILABLE','Page unavailable; discard this cursor and explicitly restart from a fresh snapshot',{cause});error.restart_required=true;throw error;
    }
  }
  function unresolved(row,phase,errors,command_state){
    if(row){
      try{write('hold',(tx,check)=>{
        const current=load(tx,row.id);
        need(equal(current.value.payload,row.value.payload),'JOURNAL_COLLISION','Payload changed while holding delivery');
        if(current.value.status===OBSERVATION_STATUS.ack){check();return current;}
        need(current.revision===row.revision&&current.sha256===row.sha256,'JOURNAL_CAS','Delivery envelope changed concurrently');
        const value={...current.value,status:OBSERVATION_STATUS.held,issue:{phase,kind:'unclassified_uncertainty',details_persisted:false}};
        need(bytes(value)<=charge(value)&&bytes(value)<=limits.entry_bytes,'JOURNAL_CAPACITY','Uncertainty envelope exceeds reserved capacity');
        check();return tx.put('work_items',current.id,value,current.revision);
      });}catch(error){errors.push(error);}
    }
    // Error objects are deliberately returned without cloning, wrapping away,
    // string-code classification or loss of AggregateError/cause identity.
    return {acknowledged:false,event_id:row?.id??null,phase,command_state,error:errors[0]??null,errors};
  }
  function deliver(id){
    eventId(id);
    if(inFlight.has(id))return unresolved(null,'prepare',[new ObservationJournalError('JOURNAL_BUSY','Same-instance delivery is already active')],'unverified');
    inFlight.add(id);let row=null,observerError=null;
    try{
      let known;
      try{known=read(tx=>{row=load(tx,id);pending(tx);ready(tx,row);const r=receipt(tx,row);if(row.value.status===OBSERVATION_STATUS.ack)checkAck(row,r);return r;});}
      catch(error){return unresolved(row,'prepare',[error],'unverified');}
      if(!known){
        try{
          const returned=observer.record(row.value.payload.action,copy(row.value.payload.args));
          if(returned&&typeof returned.then==='function'){
            if(returned instanceof Promise)Promise.prototype.then.call(returned,undefined,()=>{});
            throw new ObservationJournalError('JOURNAL_HOST','Observer must finish synchronously; asynchronous outcome remains uncertain');
          }
        }catch(error){observerError=error;}
        try{known=read(tx=>{const current=load(tx,id);need(equal(current.value.payload,row.value.payload),'JOURNAL_COLLISION','Event changed during observer call');return receipt(tx,current);});}
        catch(error){return unresolved(row,'readback',observerError?[observerError,error]:[error],'unverified');}
        if(!known)return unresolved(row,'observer',observerError?[observerError]:[new ObservationJournalError('JOURNAL_NO_RECEIPT','Observer return is not committed delivery proof')],'absent');
      }
      try{
        write('ack',(tx,check)=>{
          const current=load(tx,id);pending(tx);ready(tx,current);
          need(equal(current.value.payload,row.value.payload),'JOURNAL_COLLISION','Event changed before ACK');
          const committed=receipt(tx,current);
          need(committed&&equal(committed.command,known.command)&&committed.result_sha256===known.result_sha256,'JOURNAL_RECEIPT','Receipt changed before ACK');
          if(current.value.status===OBSERVATION_STATUS.ack){checkAck(current,committed);check();return current;}
          need(current.revision===row.revision&&current.sha256===row.sha256,'JOURNAL_CAS','Delivery envelope changed concurrently');
          const value={...current.value,status:OBSERVATION_STATUS.ack,ack:{command:committed.command,result_sha256:committed.result_sha256},issue:null};
          need(bytes(value)<=charge(value)&&bytes(value)<=limits.entry_bytes&&bytes(value)<=1000000,'JOURNAL_CAPACITY','ACK exceeds reserved full-row capacity');
          check();return tx.put('work_items',id,value,current.revision);
        });
      }catch(error){return unresolved(row,'ack',observerError?[observerError,error]:[error],'matching_committed');}
      try{known=read(tx=>{const current=load(tx,id);const r=receipt(tx,current);need(current.value.status===OBSERVATION_STATUS.ack,'JOURNAL_RECEIPT','Durable ACK unavailable');checkAck(current,r);return r;});}
      catch(error){return unresolved(row,'verify',observerError?[observerError,error]:[error],'unverified');}
      return {acknowledged:true,event_id:id,command:known.command,result_sha256:known.result_sha256,result:known.result,observer_error:observerError,errors:observerError?[observerError]:[]};
    }finally{inFlight.delete(id);}
  }
  function recover(input={}){
    const o=copy(input);shape(o,[],['limit']);const limit=integer(o.limit??100,100,'recovery limit');
    const selected=read(tx=>pending(tx).rows).sort((a,b)=>a.value.task_id<b.value.task_id?-1:a.value.task_id>b.value.task_id?1:a.value.payload.ordinal-b.value.payload.ordinal).slice(0,limit);
    const outcomes=selected.map(row=>deliver(row.id));
    try{const remaining=read(tx=>pending(tx).rows.length);return {outcomes,remaining_count:remaining,complete:remaining===0,restart_required:remaining!==0};}
    catch(error){return {outcomes,remaining_count:null,complete:false,restart_required:true,error};}
  }
  return Object.freeze({enqueue,inspectPending,deliver,recover,get:id=>read(tx=>load(tx,eventId(id)))});
}

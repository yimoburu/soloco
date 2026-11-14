// Cold/prospective journal grammar DATA only. These synthetic immutable rows
// are not Original Store history, readiness, an admission, a private executor,
// Native qualification, or permission to execute. No process/provider is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {assertPeerOrdinaryTaskEventFrom} from '../plugins/soloco/runtime/peers/origin-ordinary-task-transition.mjs';

const copy=value=>JSON.parse(canonical(value));
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const row=(id,value,revision=1,created_seq=1)=>({id,revision,sha256:peerDigest(value),created_seq,value:copy(value)});
const changed=(family,after,before=null)=>({family,id:after.id,revision:after.revision,sha256:after.sha256,previous_sha256:before?.sha256??null});
const held=error=>typeof error?.code==='string'&&error.code.startsWith('ORIGIN_ORDINARY_TASK_');
const at=new Date(100000).toISOString();
const actor='SYNTHETIC-cold-owner';
const effectActions=['message/send','notice/create','home/propose','handoff/accept','handoff/reject'];

function event(seq,type,principal_id,changes,events=[],previous_sha256='0'.repeat(64)){
  const value={seq,type,principal_id,payload:{changes:copy(changes),events:copy(events)},previous_sha256};
  return {...value,sha256:peerDigest(value)};
}

function fixture(action='message/send',{kind='must_know'}={}){
  const qualification=row('SYNTHETIC-unissued-qualification',{kind:'origin_ordinary_task_qualification',deadline_at_ms:300000});
  const q=ref('work_items',qualification);
  const principal=row(actor,{principal_id:actor,kind:'cos',status:'active',generation:1,native_id:'SYNTHETIC-native',host:'codex',session_id:'SYNTHETIC-session'});
  const sender=row('SYNTHETIC-sender',{principal_id:'SYNTHETIC-sender',kind:'cos',status:'active',generation:1,native_id:'SYNTHETIC-sender-native',host:'codex',session_id:'SYNTHETIC-sender-session'});
  const control=row('company',{protocol:'peer-cos-v1',paused:false,pause_generation:2,policy_generation:1,founder_principal_id:'founder',ordinary_origin_qualification_ref:q,governance_sha256:peerDigest('SYNTHETIC-governance'),policy:{worker_cap:3,queue_limit:100,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:20}});
  const home=row('SYNTHETIC-home',{status:'current',scope:'alpha',principal_id:actor,content:'Existing synthetic base.',dependencies:[]});
  const dependency=row('SYNTHETIC-dependency',{status:'current',scope:'alpha',principal_id:sender.id,content:'Complete synthetic dependency.',dependencies:[]});
  const notice=row('SYNTHETIC-input-notice',{status:'pending',scope:'alpha',principal_id:sender.id,content:'Retain the complete synthetic input.',kind:'must_know',created_at:at});
  const sources=[['homes',dependency],['homes',home],['notices',notice]].map(([family,value])=>({...ref(family,value),value:copy(value.value)}));
  const membership={homes:[ref('homes',dependency),ref('homes',home)],notices:[ref('notices',notice)],conflicts:[]};
  const handoff=row('SYNTHETIC-handoff',{kind:'peer_handoff_v1',status:'pending',principal_id:actor,scope:'alpha',operation_id:'SYNTHETIC-send',sender:ref('principals',sender),receiver:ref('principals',principal),subject_ref:ref('homes',home),governing_refs:[ref('control',control)],evidence_refs:[ref('homes',dependency)],limitations:'Synthetic grammar only.',source_instruction:'Synthetic cold grammar input.',authority_control:ref('control',control),created_at:at});
  const isHandoff=action.startsWith('handoff/');
  const definition={owner_principal_id:actor,grant_id:'SYNTHETIC-task-grant',grant_generation:1,scope:'alpha',host:'codex',role:'engineer',stage:'produce',instructions:'Inspect only supplied synthetic evidence.',acceptance:'Retain attributable output.',resources:[{kind:'home',id:home.id,key:'home:'+home.id}],input_refs:[ref('notices',notice)],review_of:null,parent_task_id:null,parent_ref:null,outcome:null,origin_qualification_ref:q,...(isHandoff?{handoff_ref:ref('work_items',handoff),handoff_envelope:{protocol:'peer-task-handoff-envelope-v1',handoff_ref:ref('work_items',handoff),value:copy(handoff.value),governing_support:[]}}:{})};
  const pending=row('SYNTHETIC-task',{...definition,definition:copy(definition),definition_revision:1,definition_sha256:peerDigest(definition),status:'pending',authority_epoch:1,authority_previous:null,authority_event_seq:1,attempt:null,principal_id:actor,created_at:at});
  const body={protocol:'peer-task-context-v1',control:{policy_generation:1,pause_generation:2,paused:false,governance_sha256:control.value.governance_sha256,policy:copy(control.value.policy)},principal:ref('principals',principal),grant:{id:definition.grant_id,generation:1},ordinary_origin:{protocol:'peer-origin-ordinary-task-compulsory-context-v1',mode:'complete-raw',qualification_ref:q,deadline_at_ms:qualification.value.deadline_at_ms,complete_raw:[],incidence:[]},task:{id:pending.id,definition_revision:1,definition_sha256:pending.value.definition_sha256,definition:copy(definition),owner_principal_id:actor,grant_id:definition.grant_id,grant_generation:1},sources:copy(sources),membership:copy(membership)};
  const text=canonical(body),context={...body,text,sha256:peerDigest(body),hash:peerDigest(body),utf8_bytes:Buffer.byteLength(text)};
  const attemptId=peerDigest(['attempt',pending.id,1]),effectId=peerDigest(['native-effect',pending.id,1]);
  const request={kind:'native',task_id:pending.id,definition_sha256:pending.value.definition_sha256,context_sha256:context.sha256};
  const admitted=row(pending.id,{...pending.value,status:'running',authority_epoch:2,authority_previous:ref('tasks',pending),authority_event_seq:1,attempt:{id:attemptId,effect_id:effectId,request_sha256:peerDigest(request),definition_revision:1,admitted_at:at,model_calls:1,policy_generation:1,pause_generation:2,termination_confirmed:false,context:copy(context),effect_authority:{protocol:'peer-task-effect-authority-v1',epoch:2,issued_at:at,expires_at:new Date(220000).toISOString()}}},2);
  const admissionOperation='SYNTHETIC-admit',admissionCommand=row(peerDigest(['peer-command-v1','scheduler',admissionOperation]),{principal_id:'scheduler',operation_id:admissionOperation,action:'task/admit',request_sha256:peerDigest({task_id:pending.id}),result:{admitted:true,task:copy(admitted),context:copy(context),host:'codex'},created_at:at});
  const nativeEffect=row(effectId,{kind:'native',task_id:pending.id,principal_id:actor,scope:'alpha',status:'reserved',request,request_sha256:peerDigest(request),grant_id:definition.grant_id,grant_generation:1,policy_generation:1,pause_generation:2,termination_confirmed:false});
  const admission=event(1,'task/admit','scheduler',[changed('tasks',admitted,pending),changed('effects',nativeEffect),changed('commands',admissionCommand)],[{type:'dispatch_admitted',payload:{task_id:pending.id,attempt_id:attemptId,effect_id:effectId,pause_generation:2,policy_generation:1}}]);
  const namespace={protocol:'peer-task-effect-binding-v1',task_id:pending.id,attempt_id:attemptId,authority_epoch:2,context_sha256:context.sha256,admission_producer:{event_seq:1,event_sha256:admission.sha256,command:ref('commands',admissionCommand)},executor_incarnation_id:'SYNTHETIC-not-issued-incarnation',runtime_generation:1};
  const operation='SYNTHETIC-cold-effect',internalOperation=peerDigest(['peer-task-operation-v1',namespace,operation]);
  const attribution={task_id:pending.id,attempt_id:attemptId,task_effect:copy(namespace)};
  let family,value,id;
  if(action==='message/send'||action==='notice/create'){
    family=action==='message/send'?'messages':'notices';
    id=peerDigest([family,actor,internalOperation]);
    value={status:'pending',scope:'alpha',principal_id:actor,...(family==='messages'?{to_principal_id:sender.id}:{}),...attribution,content:'Synthetic grammar output 雪😀.',kind:copy(kind),created_at:at};
  }else if(action==='home/propose'){
    family='proposals';id=peerDigest(['proposal',actor,internalOperation]);
    value={status:'proposed',principal_id:actor,scope:'alpha',home_id:home.id,base:ref('homes',home),content:{retained:'Synthetic structured proposal.',unicode:'雪😀'},dependencies:[ref('homes',dependency)],readset:sources.map(({value,...source})=>copy(source)),membership:copy(membership),...attribution,created_at:at};
  }else{
    family='work_items';id=peerDigest(['peer-handoff-disposition-v1',ref('work_items',handoff),ref('principals',principal)]);
    value={kind:'peer_handoff_disposition_v1',status:action==='handoff/accept'?'accepted':'rejected',principal_id:actor,scope:'alpha',operation_id:internalOperation,handoff_ref:ref('work_items',handoff),sender:ref('principals',sender),receiver:ref('principals',principal),subject_ref:ref('homes',home),governing_refs:copy(handoff.value.governing_refs),evidence_refs:copy(handoff.value.evidence_refs),reason:'Synthetic receiver decision.',source_instruction:'Synthetic explicit receiver disposition.',authority_control:ref('control',control),created_at:at,...attribution};
  }
  const output=row(id,value,1,2);
  const command=row(peerDigest(['peer-task-command-v1',actor,namespace,operation]),{principal_id:actor,operation_id:operation,action,request_sha256:peerDigest({channel:'task-effect',authority:namespace,action,args:{synthetic:'Cold request digest only.'}}),...attribution,result:copy(output),created_at:at},1,2);
  const effect=event(2,action,actor,[changed(family,output),changed('commands',command)],[],admission.sha256);
  const support=[['work_items',qualification],['principals',principal],['principals',sender],['control',control],['homes',home],['homes',dependency],['notices',notice],['work_items',handoff],['tasks',pending],['tasks',admitted],['effects',nativeEffect],['commands',admissionCommand]];
  const f={action,family,q,qualification,principal,sender,control,home,dependency,notice,handoff,definition,pending,admitted,context,namespace,operation,admissionCommand,admission,output,command,event:effect,extra:[],later:[],customEvents:[],syncResult:true};
  // Keep all immutable versions, including an optional later current head.
  const records=()=>[...support,[f.family,f.output],['commands',f.command],...(f.outputBefore?[[f.family,f.outputBefore]]:[]),...(f.commandBefore?[['commands',f.commandBefore]]:[]),...f.extra,...f.later.flatMap(e=>e.rows??[])];
  f.tx={
    get(family,id){const matching=records().filter(([f,r])=>f===family&&r.id===id).map(([,r])=>r).sort((a,b)=>b.revision-a.revision);return matching.length?copy(matching[0]):null;},
    getVersion(r){const found=records().find(([family,value])=>family===r.family&&value.id===r.id&&value.revision===r.revision&&value.sha256===r.sha256);return found?{family:r.family,...copy(found[1])}:null;},
    events({after=0,limit=100}={}){assert(Number.isSafeInteger(limit)&&limit>0&&limit<=100);const all=[f.admission,f.event,...f.later.map(e=>e.event)].filter(e=>e.seq>after).sort((a,b)=>a.seq-b.seq),items=all.slice(0,limit);return {items:copy(items),complete:items.length===all.length,next_cursor:items.at(-1)?.seq??after};}
  };
  f.check=()=>assertPeerOrdinaryTaskEventFrom(f.tx,f.event,f.q);
  return f;
}

function refresh(f){
  f.output.sha256=peerDigest(f.output.value);
  if(f.syncResult)f.command.value.result=copy(f.output);
  f.command.sha256=peerDigest(f.command.value);
  f.event.payload={changes:[changed(f.family,f.output,f.outputBefore??null),changed('commands',f.command,f.commandBefore??null),...f.extra.map(([family,value])=>changed(family,value))],events:copy(f.customEvents)};
  const {sha256,...body}=f.event;f.event.sha256=peerDigest(body);
}

// Rehash the entire DATA linkage so a malformed lease reaches its semantic
// check rather than failing because its surrounding copied hash went stale.
function refreshAdmission(f){
  f.admitted.sha256=peerDigest(f.admitted.value);
  f.admissionCommand.value.result.task=copy(f.admitted);
  f.admissionCommand.value.result.context=copy(f.admitted.value.attempt.context);
  f.admissionCommand.sha256=peerDigest(f.admissionCommand.value);
  f.admission.payload.changes=f.admission.payload.changes.map(c=>c.family==='tasks'?changed('tasks',f.admitted,f.pending):c.family==='commands'?changed('commands',f.admissionCommand):c);
  const {sha256,...body}=f.admission;f.admission.sha256=peerDigest(body);
  f.namespace.admission_producer={event_seq:1,event_sha256:f.admission.sha256,command:ref('commands',f.admissionCommand)};
  for(const value of [f.output.value,f.command.value])value.task_effect=copy(f.namespace);
  f.command.id=peerDigest(['peer-task-command-v1',actor,f.namespace,f.operation]);
  f.output.id=peerDigest([f.family,actor,peerDigest(['peer-task-operation-v1',f.namespace,f.operation])]);
  f.event.previous_sha256=f.admission.sha256;refresh(f);
}

for(const action of effectActions)test(`cold task-effect grammar retains exact ${action} output without task or accounting writes`,()=>{
  const f=fixture(action),before=canonical({admission:f.admission,event:f.event,task:f.admitted});
  assert.equal(f.check(),undefined);
  assert.equal(canonical({admission:f.admission,event:f.event,task:f.admitted}),before);
  assert.equal(f.event.payload.changes.length,2);assert.deepEqual(f.event.payload.events,[]);
});

test('cold task notice grammar retains decision_required',()=>{assert.equal(fixture('notice/create',{kind:'decision_required'}).check(),undefined);});
test('cold task message kind remains arbitrary canonical DATA',()=>{assert.equal(fixture('message/send',{kind:{classification:['custom',7,null],unicode:'雪😀'}}).check(),undefined);});
test('cold proposal grammar retains complete context readset, membership, base and dependencies',()=>{
  const f=fixture('home/propose');assert.equal(f.check(),undefined);
  assert.deepEqual(f.output.value.readset,f.context.sources.map(({value,...source})=>source));
  assert.deepEqual(f.output.value.membership,f.context.membership);
  assert.deepEqual(f.output.value.dependencies,[ref('homes',f.dependency)]);
  assert.deepEqual(f.output.value.base,ref('homes',f.home));
});

test('cold earlier effect remains attributable after a later finish advances the current task epoch',()=>{
  const f=fixture(),finished=row(f.admitted.id,{...f.admitted.value,status:'returned',authority_epoch:3,authority_previous:ref('tasks',f.admitted),authority_event_seq:3,attempt:{...f.admitted.value.attempt,termination_confirmed:true},result:{output:'Synthetic later result.',termination_confirmed:true}},3,1);
  const op='SYNTHETIC-later-finish',command=row(peerDigest(['peer-command-v1','scheduler',op]),{principal_id:'scheduler',operation_id:op,action:'task/finish',request_sha256:'a'.repeat(64),result:{task:copy(finished),accepted:true,review:null},created_at:at},1,3);
  f.later.push({rows:[['tasks',finished],['commands',command]],event:event(3,'task/finish','scheduler',[changed('tasks',finished,f.admitted),changed('commands',command)],[],f.event.sha256)});
  assert.equal(f.tx.get('tasks',finished.id).value.authority_epoch,3);
  assert.equal(f.check(),undefined);
});

test('cold display timestamps do not redefine the original private authority clock',()=>{
  const f=fixture();f.output.value.created_at='2050-01-01T00:00:00.000Z';f.command.value.created_at='1990-01-01T00:00:00.000Z';refresh(f);assert.equal(f.check(),undefined);
});
test('cold task message preserves the existing canonical isolated-surrogate operation and content grammar',()=>{
  const f=fixture();f.operation='SYNTHETIC-operation-\ud800';f.command.value.operation_id=f.operation;f.output.value.content='Synthetic retained \ud800 content.';
  f.command.id=peerDigest(['peer-task-command-v1',actor,f.namespace,f.operation]);
  f.output.id=peerDigest([f.family,actor,peerDigest(['peer-task-operation-v1',f.namespace,f.operation])]);
  refresh(f);assert.equal(f.check(),undefined);
});
test('cold prospective effect validation does not require the uncommitted event in history',()=>{
  const f=fixture(),events=f.tx.events;
  f.tx.events=args=>{const page=events(args);return {...page,items:page.items.filter(e=>e.seq<f.event.seq),complete:true};};
  assert.equal(f.check(),undefined);
});
test('cold original process observation may precede the effect without changing its admission authority',()=>{
  const f=fixture(),observed=row('SYNTHETIC-process-observation',{kind:'runtime_observation',status:'recorded',principal_id:'scheduler',scope:'alpha',task_id:f.admitted.id,attempt_id:f.namespace.attempt_id,action:'task/process',process:{pid:45678,started_at:at,close_observed:false},at},1,2);
  const current=row(f.admitted.id,{...f.admitted.value,attempt:{...f.admitted.value.attempt,process:copy(observed.value.process),process_observation:ref('effects',observed)}},3,1);
  const op='SYNTHETIC-process',command=row(peerDigest(['peer-command-v1','scheduler',op]),{principal_id:'scheduler',operation_id:op,action:'task/process',request_sha256:'a'.repeat(64),result:copy(current),created_at:at},1,2);
  const processEvent=event(2,'task/process','scheduler',[changed('effects',observed),changed('tasks',current,f.admitted),changed('commands',command)],[],f.admission.sha256);
  f.later.push({rows:[['tasks',current],['effects',observed],['commands',command]],event:processEvent});
  f.event.seq=3;f.event.previous_sha256=processEvent.sha256;f.output.created_seq=3;f.command.created_seq=3;refresh(f);
  assert.equal(f.check(),undefined);
});
test('cold effect after cancellation cannot reuse the original running admission',()=>{
  const f=fixture(),cancelled=row(f.admitted.id,{...f.admitted.value,status:'cancelled',authority_epoch:3,authority_previous:ref('tasks',f.admitted),authority_event_seq:2,cancelled_at:at,cancellation:'Synthetic earlier cancellation.'},3,1);
  const op='SYNTHETIC-cancel',command=row(peerDigest(['peer-command-v1',actor,op]),{principal_id:actor,operation_id:op,action:'task/cancel',request_sha256:'a'.repeat(64),result:copy(cancelled),created_at:at},1,2);
  const cancellation=event(2,'task/cancel',actor,[changed('tasks',cancelled,f.admitted),changed('commands',command)],[],f.admission.sha256);
  f.later.push({rows:[['tasks',cancelled],['commands',command]],event:cancellation});
  f.event.seq=3;f.event.previous_sha256=cancellation.sha256;f.output.created_seq=3;f.command.created_seq=3;refresh(f);
  assert.throws(()=>f.check(),held);
});
test('cold effect after completed finish cannot reuse the original running admission',()=>{
  const f=fixture(),finished=row(f.admitted.id,{...f.admitted.value,status:'returned',authority_epoch:3,authority_previous:ref('tasks',f.admitted),authority_event_seq:2,attempt:{...f.admitted.value.attempt,termination_confirmed:true},result:{output:'Synthetic completed result.',termination_confirmed:true}},3,1);
  const op='SYNTHETIC-prior-finish',command=row(peerDigest(['peer-command-v1','scheduler',op]),{principal_id:'scheduler',operation_id:op,action:'task/finish',request_sha256:'a'.repeat(64),result:{task:copy(finished),accepted:true,review:null},created_at:at},1,2);
  const finish=event(2,'task/finish','scheduler',[changed('tasks',finished,f.admitted),changed('commands',command)],[],f.admission.sha256);
  f.later.push({rows:[['tasks',finished],['commands',command]],event:finish});
  f.event.seq=3;f.event.previous_sha256=finish.sha256;f.output.created_seq=3;f.command.created_seq=3;refresh(f);
  assert.throws(()=>f.check(),held);
});

for(const [name,mutate]of [
  ['missing command namespace',f=>{delete f.command.value.task_effect;}],
  ['partial output attribution',f=>{delete f.output.value.attempt_id;}],
  ['extra namespace field',f=>{f.output.value.task_effect.ready=true;f.command.value.task_effect.ready=true;}],
  ['wrong output task',f=>{f.output.value.task_id='SYNTHETIC-other-task';}],
  ['wrong output attempt',f=>{f.output.value.attempt_id='SYNTHETIC-other-attempt';}],
  ['wrong output principal',f=>{f.output.value.principal_id=f.sender.id;}],
  ['wrong output scope',f=>{f.output.value.scope='other';}],
  ['wrong command principal',f=>{f.command.value.principal_id=f.sender.id;}],
  ['wrong command action',f=>{f.command.value.action='notice/create';}],
  ['wrong command identity',f=>{f.command.id='SYNTHETIC-other-command';}],
  ['wrong output identity',f=>{f.output.id='SYNTHETIC-other-output';}],
  ['generic output operation identity',f=>{f.output.id=peerDigest([f.family,actor,f.operation]);}],
  ['non-hash request digest',f=>{f.command.value.request_sha256='not-a-sha256';}],
  ['extra command key',f=>{f.command.value.ready=true;}],
  ['extra output key',f=>{f.output.value.ready=true;}],
  ['rewritten output',f=>{f.outputBefore=copy(f.output);f.output.revision=2;f.output.value.content='Changed old output.';}],
  ['rewritten command',f=>{f.commandBefore=copy(f.command);f.command.revision=2;}],
  ['extra custom event',f=>{f.customEvents.push({type:'SYNTHETIC-unrelated',payload:{ready:true}});}],
  ['noncanonical output timestamp',f=>{f.output.value.created_at='1970-01-01';}],
  ['malformed command timestamp',f=>{f.command.value.created_at='not-a-time';}],
  ['missing exact receipt',f=>{f.syncResult=false;f.command.value.result={...copy(f.output),id:'SYNTHETIC-other-result'};}],
  ['changed receipt value',f=>{f.syncResult=false;f.command.value.result.value.content='Changed receipt only.';}],
  ['negative runtime generation',f=>{f.command.value.task_effect.runtime_generation=-1;f.output.value.task_effect.runtime_generation=-1;}]
])test(`cold task-effect grammar rejects ${name}`,()=>{const f=fixture();mutate(f);refresh(f);assert.throws(()=>f.check(),held);});

for(const [name,mutate]of [
  ['invalid lease expiry',a=>{a.effect_authority.expires_at='invalid';}],
  ['lease beyond qualification cutoff',a=>{a.effect_authority.expires_at=new Date(400000).toISOString();}],
  ['lease longer than original finite cap',a=>{a.effect_authority.expires_at=new Date(230001).toISOString();}],
  ['nonpositive lease',a=>{a.effect_authority.expires_at=a.effect_authority.issued_at;}],
  ['admitted timestamp differs from lease issue',a=>{a.admitted_at=new Date(100001).toISOString();}]
])test(`cold task-effect grammar rejects ${name}`,()=>{const f=fixture();mutate(f.admitted.value.attempt);refreshAdmission(f);assert.throws(()=>f.check(),held);});
for(const seq of [0,1,3,1.5])test(`cold task-effect grammar rejects changed event sequence ${seq}`,()=>{
  const f=fixture();f.event.seq=seq;assert.throws(()=>f.check(),held);
});
test('cold task-effect grammar rejects extra change-envelope fields',()=>{
  const f=fixture();f.event.payload.changes[0].ready=true;assert.throws(()=>f.check(),held);
});

for(const [name,change]of [
  ['admission reference',n=>{n.admission_producer.command.sha256='f'.repeat(64);}],
  ['admission event digest',n=>{n.admission_producer.event_sha256='f'.repeat(64);}],
  ['admission event sequence',n=>{n.admission_producer.event_seq=2;}],
  ['context digest',n=>{n.context_sha256='f'.repeat(64);}],
  ['authority epoch',n=>{n.authority_epoch++;}],
  ['attempt identity',n=>{n.attempt_id='SYNTHETIC-other-attempt';}],
  ['task identity',n=>{n.task_id='SYNTHETIC-other-task';}]
])test(`cold task-effect grammar rejects consistently copied wrong ${name}`,()=>{
  const f=fixture(),namespace=copy(f.namespace);change(namespace);
  for(const value of [f.output.value,f.command.value]){value.task_effect=copy(namespace);value.task_id=namespace.task_id;value.attempt_id=namespace.attempt_id;}
  f.command.id=peerDigest(['peer-task-command-v1',actor,namespace,f.operation]);
  f.output.id=peerDigest([f.family,actor,peerDigest(['peer-task-operation-v1',namespace,f.operation])]);
  refresh(f);assert.throws(()=>f.check(),held);
});

for(const family of ['tasks','slots','claims','effects','grants','control','messages'])test(`cold task-effect grammar rejects an extra ${family} mutation`,()=>{
  const f=fixture(),value=row('SYNTHETIC-extra-'+family,{task_id:f.admitted.id,model_calls:1},1,2);f.extra.push([family,value]);refresh(f);assert.throws(()=>f.check(),held);
});
for(const action of ['home/publish','task/transfer','handoff/send','task/effect','task/effect-bind','task/get','unsupported'])test(`cold task-effect namespace does not authorize ${action}`,()=>{
  const f=fixture();f.event.type=action;f.command.value.action=action;refresh(f);assert.throws(()=>f.check(),held);
});
test('cold unbound generic message remains outside the ordinary task-effect grammar',()=>{
  const f=fixture();for(const value of [f.output.value,f.command.value])for(const key of ['task_id','attempt_id','task_effect'])delete value[key];
  f.command.id=peerDigest(['peer-command-v1',actor,f.operation]);f.output.id=peerDigest([f.family,actor,f.operation]);refresh(f);assert.throws(()=>f.check(),held);
});
test('cold task-effect grammar does not accept a zero-row consumer event',()=>{
  const f=fixture();f.event.payload.changes=[];assert.throws(()=>f.check(),held);
});
test('cold task-effect grammar cannot substitute another qualification',()=>{
  const f=fixture();assert.throws(()=>assertPeerOrdinaryTaskEventFrom(f.tx,f.event,{...f.q,sha256:'f'.repeat(64)}),held);
});
test('cold effect history requires bounded progressing event pages',()=>{
  const f=fixture(),original=f.tx.events;f.tx.events=()=>({items:[],complete:false,next_cursor:0});assert.throws(()=>f.check(),held);f.tx.events=original;
});
test('cold effect history propagates provider errors by identity',()=>{
  const f=fixture(),error=new AggregateError([Error('Synthetic historical read unavailable.')],'Synthetic provider failure');f.tx.events=()=>{throw error;};assert.throws(()=>f.check(),e=>e===error);
});

for(const [name,mutate]of [
  ['unimplemented publication metadata',f=>{f.output.value.github_publication={synthetic:'Forbidden task-client capability.'};}],
  ['omitted admitted readset',f=>{f.output.value.readset=[];}],
  ['changed membership',f=>{f.output.value.membership.notices=[];}],
  ['foreign dependency',f=>{f.output.value.dependencies=[{...ref('homes',f.dependency),id:'SYNTHETIC-foreign-home'}];}],
  ['wrong base',f=>{f.output.value.base={...ref('homes',f.home),sha256:'f'.repeat(64)};}],
  ['unreserved home',f=>{f.output.value.home_id='SYNTHETIC-unreserved-home';}]
])test(`cold task proposal rejects ${name}`,()=>{const f=fixture('home/propose');mutate(f);refresh(f);assert.throws(()=>f.check(),held);});
test('cold task notice rejects an unsupported notice kind',()=>{const f=fixture('notice/create',{kind:{ready:true}});assert.throws(()=>f.check(),held);});
for(const [name,mutate]of [
  ['opposite status',f=>{f.output.value.status='rejected';}],
  ['wrong receiver',f=>{f.output.value.receiver=ref('principals',f.sender);}],
  ['wrong handoff',f=>{f.output.value.handoff_ref.id='SYNTHETIC-other-handoff';}],
  ['wrong subject',f=>{f.output.value.subject_ref=ref('homes',f.dependency);}],
  ['dropped governing input',f=>{f.output.value.governing_refs=[];}],
  ['dropped evidence',f=>{f.output.value.evidence_refs=[];}],
  ['external operation alias',f=>{f.output.value.operation_id=f.operation;}]
])test(`cold task handoff decision rejects ${name}`,()=>{const f=fixture('handoff/accept');mutate(f);refresh(f);assert.throws(()=>f.check(),held);});

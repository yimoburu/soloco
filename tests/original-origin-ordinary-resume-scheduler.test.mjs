// Cold grammar DATA only. The accepted shape below creates no original grant,
// qualification, owner acceptance, Native capability or production resume.
// The disposable PeerLedger case proves rollback of rejected synthetic writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {assertPeerOrdinaryOriginJournalEventFrom} from '../plugins/soloco/runtime/peers/origin-ordinary-task-transition.mjs';
import {peerFixture} from './peer-fixture.mjs';

const copy=value=>structuredClone(value);
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const row=(id,value,revision=1,created_seq=1)=>({id,revision,created_seq,sha256:peerDigest(value),value:copy(value)});
const held=kind=>({kind,principal_id:kind,status:'held',generation:1,internal:true});
const typedRejection=error=>typeof error?.code==='string'&&error.code.startsWith('ORIGIN_ORDINARY_TASK_');

// This reader intentionally has no private transaction/source identity. Passing
// the neutral event grammar cannot make these copied rows ready for execution.
function resumeGrammar(variant=null,seed=null){
  const connection=copy(seed?.connection??{company_id:'SYNTHETIC-company',root:'/SYNTHETIC-ordinary-resume',directory:'/SYNTHETIC-ordinary-resume/.company'});
  const founder=seed?.founder??row('founder',{kind:'founder',principal_id:'founder',status:'active',generation:1,host:'codex',native_id:'SYNTHETIC-owner',legacy_owner:{host:'codex',session_id:'SYNTHETIC-owner',epoch:7}});
  const actor={host:'codex',session_id:founder.value.native_id,native_id:founder.value.native_id};
  if(variant==='foreign-actor')actor.session_id=actor.native_id='SYNTHETIC-other-owner';
  if(variant==='foreign-host')actor.host='claude';
  const companyValue=copy(seed?.company.value??{protocol:'peer-cos-v1',paused:true,policy_generation:3,pause_generation:4,founder_principal_id:'founder'});
  const qualificationValue=copy(seed?.qualification.value??{kind:'origin_ordinary_task_qualification',protocol:'peer-origin-ordinary-task-qualification-v1',mode:'complete-raw',connection,policy_generation:companyValue.policy_generation,pause_generation:companyValue.pause_generation,owner_ref:ref('principals',founder),deadline_at_ms:200000});
  if(variant==='qualification-protocol')qualificationValue.protocol='SYNTHETIC-unchecked-qualification';
  if(variant==='qualification-owner')qualificationValue.owner_ref={...qualificationValue.owner_ref,sha256:'f'.repeat(64)};
  if(variant==='qualification-policy')qualificationValue.policy_generation++;
  if(variant==='qualification-pause')qualificationValue.pause_generation++;
  if(variant==='qualification-connection')qualificationValue.connection={...connection,root:connection.root+'-foreign',directory:connection.directory+'-foreign'};
  const qualification=row(seed?.qualification.id??'SYNTHETIC-format-only-qualification',qualificationValue,1,seed?.qualification.created_seq??1),qualification_ref=ref('work_items',qualification);
  companyValue.ordinary_origin_qualification_ref=qualification_ref;
  if(variant==='company-qualification')companyValue.ordinary_origin_qualification_ref={...qualification_ref,sha256:'e'.repeat(64)};
  const beforeCompany=row('company',companyValue,seed?.company.revision??1,seed?.company.created_seq??1);
  const operation_id='SYNTHETIC-resume',epoch=founder.value.legacy_owner.epoch+(variant==='foreign-epoch'?1:0),source_instruction='SYNTHETIC cold formatting only; no live authority or Native execution.';
  const request={operation_id,epoch,source_instruction,qualification_ref};
  if(variant==='request-extra-key')request.ready=true;
  if(variant==='request-operation')request.operation_id='SYNTHETIC-different-operation';
  const sequence=seed?.sequence??2;
  const resumeValue={kind:'origin_ordinary_task_resume',protocol:'peer-origin-ordinary-task-resume-v1',qualification_ref,before_company_ref:ref('control',beforeCompany),pause_generation:beforeCompany.value.pause_generation,epoch,source_instruction,resumed_at_ms:100000};
  if(variant==='resume-extra-key')resumeValue.ready=true;
  if(variant==='resume-source')resumeValue.source_instruction+=' changed';
  if(variant==='resume-epoch')resumeValue.epoch++;
  if(variant==='negative-time')resumeValue.resumed_at_ms=-1;
  if(variant==='fractional-time')resumeValue.resumed_at_ms=100000.5;
  if(variant==='deadline-equality')resumeValue.resumed_at_ms=qualificationValue.deadline_at_ms;
  const resumeId='origin-ordinary-task-resume:'+peerDigest(qualification_ref)+(variant==='resume-id'?':foreign':''),resume=row(resumeId,resumeValue,1,sequence);
  const afterCompany=row('company',{...beforeCompany.value,paused:false,pause_generation:beforeCompany.value.pause_generation+1,ordinary_origin_resume_ref:ref('work_items',resume)},beforeCompany.revision+1,beforeCompany.created_seq);
  const schedulerId=variant==='wrong-principal'?'SYNTHETIC-other-scheduler':'scheduler',schedulerBeforeValue=held('scheduler');
  schedulerBeforeValue.principal_id=schedulerId;
  if(variant==='before-status')schedulerBeforeValue.status='active';
  if(variant==='before-generation')schedulerBeforeValue.generation=2;
  if(variant==='before-identity')schedulerBeforeValue.native_id='SYNTHETIC-borrowed-native';
  const beforeScheduler=row(schedulerId,schedulerBeforeValue,variant==='before-revision'?2:1,seed?.scheduler.created_seq??1);
  const afterSchedulerValue={...beforeScheduler.value,status:'active',generation:2};
  if(variant==='after-status')afterSchedulerValue.status='held';
  if(variant==='after-generation')afterSchedulerValue.generation=3;
  if(variant==='after-identity')afterSchedulerValue.native_id='SYNTHETIC-borrowed-native';
  const afterScheduler=row(schedulerId,afterSchedulerValue,beforeScheduler.revision+1,beforeScheduler.created_seq);
  const publisher=seed?.publisher??row('publisher',held('publisher'));
  const commandId='origin-ordinary-task-operation:'+peerDigest([connection,actor,'resumed',operation_id]);
  const result={paused:false,epoch,control:ref('control',afterCompany),qualification_ref};
  const command=row(commandId,{kind:'origin_ordinary_task_command',protocol:'peer-origin-ordinary-task-command-v1',command_id:commandId,connection,actor,action:'resumed',operation_id,request,request_sha256:peerDigest(request),result},1,sequence);
  const changes=[{family:'principals',before:beforeScheduler,after:afterScheduler},{family:'work_items',before:null,after:resume},{family:'control',before:beforeCompany,after:afterCompany},{family:'commands',before:null,after:command}];
  if(variant==='missing-activation')changes.shift();
  if(variant==='publisher-change')changes.push({family:'principals',before:publisher,after:row('publisher',{...publisher.value,status:'active',generation:2},publisher.revision+1,publisher.created_seq)});
  const current=new Map(),versions=new Map();
  const keep=(family,value)=>{
    versions.set(canonical([family,value.id,value.revision,value.sha256]),value);
    const key=canonical([family,value.id]),prior=current.get(key);if(!prior||prior.revision<=value.revision)current.set(key,value);
  };
  keep('principals',founder);keep('work_items',qualification);keep('control',beforeCompany);
  if(variant!=='missing-publisher')keep('principals',publisher);
  keep('principals',beforeScheduler);
  for(const change of changes){if(change.before)keep(change.family,change.before);keep(change.family,change.after);}
  const tx={get:(family,id)=>current.get(canonical([family,id]))??null,getVersion:r=>versions.get(canonical([r.family,r.id,r.revision,r.sha256]))??null};
  const journal={protocol:'peer-origin-ordinary-task-journal-v1',step:'resumed',event_sequence:sequence,operation_ref:ref('commands',command),original_command_ref:null,changes:changes.map(change=>({family:change.family,id:change.after.id,before_ref:change.before?ref(change.family,change.before):null,after_ref:ref(change.family,change.after)}))};
  const event={seq:sequence,type:'origin.ordinary-task.resumed',principal_id:'founder',previous_sha256:'0'.repeat(64),payload:{changes:changes.map(change=>({family:change.family,id:change.after.id,revision:change.after.revision,previous_sha256:change.before?.sha256??null,sha256:change.after.sha256})),events:[{type:'origin.ordinary-task.journal',payload:journal}]}};
  if(variant==='wrong-writer')event.principal_id='scheduler';
  event.sha256=peerDigest(event);
  return {tx,event,changes};
}

test('cold resume format includes exactly the canonical held-to-active scheduler and leaves publisher held',()=>{
  const f=resumeGrammar(),proof=assertPeerOrdinaryOriginJournalEventFrom(f.tx,f.event);
  assert.equal(proof.step,'resumed');assert.equal(proof.changes.length,4);
  assert.deepEqual(f.tx.get('principals','scheduler').value,{...held('scheduler'),status:'active',generation:2});
  assert.deepEqual(f.tx.get('principals','publisher').value,held('publisher'));
  assert.equal(Object.hasOwn(f.tx,'connection'),false,'format DATA has no original transaction identity');
});

for(const variant of ['missing-activation','wrong-principal','before-revision','before-status','before-generation','before-identity','after-status','after-generation','after-identity','missing-publisher','publisher-change','foreign-actor','foreign-host','foreign-epoch','wrong-writer','qualification-protocol','qualification-owner','qualification-policy','qualification-pause','qualification-connection','company-qualification','request-extra-key','request-operation','resume-extra-key','resume-source','resume-epoch','resume-id','negative-time','fractional-time','deadline-equality']){
  test(`cold resume format rejects ${variant} without treating copied rows as authority`,()=>{
    const valid=resumeGrammar();assert.equal(assertPeerOrdinaryOriginJournalEventFrom(valid.tx,valid.event).step,'resumed','the baseline format must pass before a negative mutation is meaningful');
    const f=resumeGrammar(variant);assert.throws(()=>assertPeerOrdinaryOriginJournalEventFrom(f.tx,f.event),typedRejection);
  });
}

test('actual PeerLedger rolls back staged scheduler/company writes when the cold resume also activates publisher',t=>{
  const f=peerFixture({principalIds:['founder'],control:{paused:true},principals:{founder:{legacy_owner:{host:'codex',session_id:'founder-native',epoch:7}}}});t.after(()=>f.close());
  const connection={company_id:f.ledger.company_id,root:f.ledger.root,directory:f.ledger.directory};
  f.ledger.write('fixture.SYNTHETIC-resume-data','founder',tx=>{
    tx.put('principals','scheduler',held('scheduler'),0);tx.put('principals','publisher',held('publisher'),0);
    const company=tx.get('control','company'),founder=tx.get('principals','founder');
    const qualification=tx.put('work_items','SYNTHETIC-format-only-qualification',{kind:'origin_ordinary_task_qualification',protocol:'peer-origin-ordinary-task-qualification-v1',mode:'complete-raw',connection,policy_generation:company.value.policy_generation,pause_generation:company.value.pause_generation,owner_ref:ref('principals',founder),deadline_at_ms:200000},0);
    tx.put('control','company',{...company.value,ordinary_origin_qualification_ref:ref('work_items',qualification)},company.revision);
  });
  const snapshot=()=>f.ledger.read(tx=>({company:tx.get('control','company'),founder:tx.get('principals','founder'),scheduler:tx.get('principals','scheduler'),publisher:tx.get('principals','publisher'),qualification:tx.get('work_items','SYNTHETIC-format-only-qualification'),events:tx.events({after:0,limit:100})}));
  const before=snapshot(),seed={...before,connection,sequence:before.events.items.at(-1).seq+1};
  const valid=resumeGrammar(null,seed);assert.equal(assertPeerOrdinaryOriginJournalEventFrom(valid.tx,valid.event).step,'resumed');
  const bad=resumeGrammar('publisher-change',seed);let writes=0,validationReached=false;
  assert.throws(()=>f.ledger.guardedWrite('origin.ordinary-task.resumed','founder',tx=>{
    assert.equal(tx.sequence,seed.sequence);
    for(const change of bad.changes){const staged=tx.put(change.family,change.after.id,change.after.value,change.before?.revision??0);writes++;assert.deepEqual(ref(change.family,staged),ref(change.family,change.after));}
    assert.equal(tx.get('principals','scheduler').value.status,'active');assert.equal(tx.get('control','company').value.paused,false);assert.equal(tx.get('principals','publisher').value.status,'active');
    validationReached=true;assertPeerOrdinaryOriginJournalEventFrom(tx,bad.event);
  },()=>Date.now()+60000),typedRejection);
  assert.equal(writes,5,'all five real PeerLedger put calls must precede the intended validation failure');assert.equal(validationReached,true);
  assert.deepEqual(snapshot(),before,'rejected DATA must retain the prior rows and complete event head');
  f.ledger.read(tx=>{for(const change of bad.changes)assert.equal(tx.getVersion(ref(change.family,change.after)),null,'rolled-back immutable versions must not survive');});
  f.ledger.write('fixture.after-rejected-resume','founder',tx=>{assert.deepEqual(tx.get('principals','scheduler').value,held('scheduler'));assert.deepEqual(tx.get('principals','publisher').value,held('publisher'));});
});

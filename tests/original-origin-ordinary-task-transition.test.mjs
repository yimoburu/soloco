// Actual disposable P1 storage for rejection controls. Malicious fixture rows
// are explicitly forged DATA and never an original Native/approval producer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {peerFixture} from './peer-fixture.mjs';
import {peerDigest,inspectOriginalPeerTransactionIdentityFrom} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {assertPeerOrdinaryOriginReadyFrom,assertPeerOrdinaryOriginDecisionFrom,assertPeerOrdinaryTaskEventFrom} from '../plugins/soloco/runtime/peers/origin-ordinary-task-transition.mjs';
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
test('legacy marker and a copied qualification pointer do not qualify ordinary context',t=>{const f=peerFixture({control:{paused:true,legacy_ready:true}});t.after(()=>f.close());assert.throws(()=>f.ledger.read(tx=>assertPeerOrdinaryOriginReadyFrom(tx,{action:'task/context',qualification_ref:{family:'work_items',id:'forged',revision:1,sha256:'a'.repeat(64)}})));assert.equal(f.ledger.read(tx=>tx.list('slots',{limit:100}).items.length),0);});
test('same-company copied history at a different root fails before grant or Native interpretation',t=>{const f=peerFixture({control:{paused:true,legacy_ready:true}});t.after(()=>f.close());let q;f.ledger.write('fixture.forged-qualification','founder',tx=>{const c=tx.get('control','company'),p=tx.get('principals','founder');q=tx.put('work_items','SYNTHETIC-forged',{kind:'origin_ordinary_task_qualification',protocol:'peer-origin-ordinary-task-qualification-v1',mode:'complete-raw',connection:{company_id:f.ledger.company_id,root:f.root+'-foreign',directory:f.root+'-foreign/.company'},policy_generation:c.value.policy_generation,pause_generation:c.value.pause_generation,owner_ref:ref('principals',p),deadline_at_ms:Date.now()+60000},0);tx.put('control','company',{...c.value,ordinary_origin_qualification_ref:ref('work_items',q)},c.revision);});assert.throws(()=>f.ledger.read(tx=>assertPeerOrdinaryOriginReadyFrom(tx,{action:'task/context',qualification_ref:ref('work_items',q)})),e=>e.code==='ORIGIN_ORDINARY_TASK_CURRENT_CHANGED');});
test('zero-spend denied admission grammar preserves qualification while unexpected spending is rejected',()=>{const command={id:peerDigest(['peer-command-v1','scheduler','SYNTHETIC-denied']),revision:1,created_seq:1,value:{action:'task/admit',principal_id:'scheduler',operation_id:'SYNTHETIC-denied',request_sha256:'a'.repeat(64),result:{admitted:false,code:'NO_WORK',reason:'No pending task'}}};command.sha256=peerDigest(command.value);const changes=[{family:'commands',id:command.id,revision:1,previous_sha256:null,sha256:command.sha256}],event={type:'task/admit',principal_id:'scheduler',payload:{changes,events:[]}};const tx={get:()=>command,getVersion:r=>r.id===command.id?command:null};assert.equal(assertPeerOrdinaryTaskEventFrom(tx,event,{family:'work_items',id:'not-issued',revision:1,sha256:'b'.repeat(64)}),undefined);assert.throws(()=>assertPeerOrdinaryTaskEventFrom(tx,{...event,payload:{...event.payload,events:[{type:'SYNTHETIC-unrelated',payload:{ready:true}}]}},{family:'work_items',id:'not-issued',revision:1,sha256:'b'.repeat(64)}),e=>e.code==='ORIGIN_ORDINARY_TASK_DENIED_ADMISSION_CHANGED');assert.throws(()=>assertPeerOrdinaryTaskEventFrom(tx,{...event,payload:{...event.payload,changes:[...changes,{family:'control',id:'usage',revision:1,previous_sha256:null,sha256:'c'.repeat(64)}]}},{family:'work_items',id:'not-issued',revision:1,sha256:'b'.repeat(64)}));});

// These controls assert rejection by currentness BEFORE interpreting any grant,
// event lineage or Native receipt. Forged fixtures cannot stand in for positives.
for(const changed of ['expired','policy','owner'])test(`ordinary ${changed} currentness rejects copied qualification before Native interpretation`,t=>{
 const f=peerFixture({control:{paused:true,legacy_ready:true}});t.after(()=>f.close());let q;
 f.ledger.write('fixture.forged-currentness','founder',tx=>{
  const c=tx.get('control','company'),p=tx.get('principals','founder'),owner=ref('principals',p);
  q=tx.put('work_items','SYNTHETIC-currentness-'+changed,{kind:'origin_ordinary_task_qualification',protocol:'peer-origin-ordinary-task-qualification-v1',mode:'complete-raw',connection:{company_id:f.ledger.company_id,root:f.ledger.root,directory:f.ledger.directory},policy_generation:changed==='policy'?c.value.policy_generation+1:c.value.policy_generation,pause_generation:c.value.pause_generation,owner_ref:changed==='owner'?{...owner,sha256:'f'.repeat(64)}:owner,deadline_at_ms:Date.now()+(changed==='expired'?-1:60000)},0);
  tx.put('control','company',{...c.value,ordinary_origin_qualification_ref:ref('work_items',q)},c.revision);
 });
 assert.throws(()=>f.ledger.read(tx=>assertPeerOrdinaryOriginReadyFrom(tx,{action:'task/context',qualification_ref:ref('work_items',q)})),e=>e.code==='ORIGIN_ORDINARY_TASK_CURRENT_CHANGED');
 assert.equal(f.ledger.read(tx=>tx.list('slots',{limit:100}).items.length),0);
});

// A row-free/custom-event-free guard commits no peer event at all. It does
// not need a new history exemption or a copied original-event receipt.
test('row-free effect binding does not invent an ordinary history event',t=>{
 const f=peerFixture();t.after(()=>f.close());const before=f.ledger.events({after:0,limit:100});
 f.ledger.guardedWrite('task/effect-bind','scheduler',()=>{},()=>Date.now()+60000);
 assert.deepEqual(f.ledger.events({after:0,limit:100}),before);
});
test('original transaction identity comes from its live private handle and exposes no physical custody',t=>{
 const f=peerFixture();t.after(()=>f.close());let identity;
 f.ledger.read(tx=>{identity=inspectOriginalPeerTransactionIdentityFrom(tx);assert.deepEqual(Object.keys(identity).sort(),['assert','company_id','protocol','root','root_sha256']);assert.equal(identity.root,f.ledger.root);assert.equal(identity.company_id,f.ledger.company_id);identity.assert();assert.throws(()=>inspectOriginalPeerTransactionIdentityFrom({...tx,connection:{company_id:f.ledger.company_id,root:f.ledger.root}}),e=>e.code==='ORIGINAL_EXECUTION_PEER_TRANSACTION_REQUIRED');});
 assert.throws(()=>identity.assert());
});
test('physical terminal identity is get-only and expires with its exact guard',t=>{
 const f=peerFixture();t.after(()=>f.close());let identity;
 f.ledger.guardedWrite('fixture.identity','founder',tx=>{const c=tx.get('control','company');tx.put('control','company',{...c.value,SYNTHETIC_identity_control:true},c.revision);},view=>{assert.deepEqual(Object.keys(view),['get']);identity=inspectOriginalPeerTransactionIdentityFrom(view);identity.assert();assert.equal(identity.root,f.ledger.root);for(const key of ['ledger','db','pending','onCommit','onRollback','put'])assert.equal(Object.hasOwn(identity,key),false);return Date.now()+60000;});
 assert.throws(()=>identity.assert());
});

// Prospective/cold grammar DATA only. These copied rows cannot satisfy full
// readiness or recreate an original Native admission/grant.
for(const action of ['task/claim','task/closure'])test(`exact unchanged ${action} command receipt spends zero and preserves its captured task qualification`,()=>{
 const q={family:'work_items',id:'SYNTHETIC-q',revision:1,sha256:'a'.repeat(64)},definition={origin_qualification_ref:q},value={origin_qualification_ref:q,definition,definition_sha256:peerDigest(definition),status:action==='task/claim'?'pending':'returned',attempt:action==='task/claim'?null:{termination_confirmed:true},...(action==='task/closure'?{result:{termination_confirmed:true}}:{})},task={id:'SYNTHETIC-task',revision:2,created_seq:1,sha256:peerDigest(value),value},cv={action,principal_id:'scheduler',operation_id:'SYNTHETIC-noop',request_sha256:'b'.repeat(64),result:task},command={id:peerDigest(['peer-command-v1','scheduler','SYNTHETIC-noop']),revision:1,created_seq:3,sha256:peerDigest(cv),value:cv},event={type:action,principal_id:'scheduler',payload:{changes:[{family:'commands',id:command.id,revision:1,sha256:command.sha256,previous_sha256:null}],events:[]}},tx={get:(f,id)=>f==='tasks'?task:command,getVersion:r=>r.family==='tasks'?task:command};
 assert.equal(assertPeerOrdinaryTaskEventFrom(tx,event,q),undefined);
 assert.throws(()=>assertPeerOrdinaryTaskEventFrom(tx,event,{...q,sha256:'c'.repeat(64)}),e=>e.code==='ORIGIN_ORDINARY_TASK_NOOP_CHANGED');
 assert.throws(()=>assertPeerOrdinaryTaskEventFrom(tx,{...event,payload:{...event.payload,events:[{type:'SYNTHETIC-extra',payload:{}}]}},q),e=>e.code==='ORIGIN_ORDINARY_TASK_NOOP_CHANGED');
});

// Cold/prospective event grammar DATA only. A copied dispatch, task or q below
// cannot satisfy full readiness, a Native producer, spending or execution.
function ordinaryCustomEventGrammar(action='task/admit'){
 const q={family:'work_items',id:'SYNTHETIC-grammar-q',revision:1,sha256:'a'.repeat(64)},definition={origin_qualification_ref:q},base={origin_qualification_ref:q,definition,definition_sha256:peerDigest(definition),owner_principal_id:'SYNTHETIC-owner',status:action==='task/admit'?'pending':'planned',attempt:null},before={id:'SYNTHETIC-task',revision:1,created_seq:1,sha256:peerDigest(base),value:base},value=action==='task/admit'?{...base,status:'running',attempt:{id:'SYNTHETIC-attempt',effect_id:'SYNTHETIC-effect',pause_generation:4,policy_generation:7}}:{...base,status:'pending'},task={id:before.id,revision:2,created_seq:1,sha256:peerDigest(value),value},cv={action,principal_id:action==='task/admit'?'scheduler':'SYNTHETIC-owner',operation_id:'SYNTHETIC-grammar',request_sha256:'b'.repeat(64),result:action==='task/admit'?{admitted:true,task,context:{},host:'codex'}:task},command={id:peerDigest(['peer-command-v1',cv.principal_id,cv.operation_id]),revision:1,created_seq:2,sha256:peerDigest(cv),value:cv},dispatch={type:'dispatch_admitted',payload:{task_id:task.id,attempt_id:'SYNTHETIC-attempt',effect_id:'SYNTHETIC-effect',pause_generation:4,policy_generation:7}},event={type:action,principal_id:cv.principal_id,payload:{changes:[{family:'tasks',id:task.id,revision:2,sha256:task.sha256,previous_sha256:before.sha256},{family:'commands',id:command.id,revision:1,sha256:command.sha256,previous_sha256:null}],events:action==='task/admit'?[dispatch]:[]}},tx={get:(f,id)=>f==='tasks'?task:command,getVersion:r=>r.family==='tasks'?(r.revision===1?before:task):command};return {q,tx,event,dispatch};
}
test('successful admission event grammar requires the exact one original-producer dispatch shape',()=>{const f=ordinaryCustomEventGrammar();assert.equal(assertPeerOrdinaryTaskEventFrom(f.tx,f.event,f.q),undefined);});
for(const changed of ['missing','extra','foreign_type','wrong_effect','wrong_policy','extra_payload'])test(`admission custom-event grammar rejects ${changed} dispatch`,()=>{
 const f=ordinaryCustomEventGrammar(),d=f.dispatch,events=changed==='missing'?[]:changed==='extra'?[d,d]:changed==='foreign_type'?[{...d,type:'SYNTHETIC-unrelated'}]:changed==='wrong_effect'?[{...d,payload:{...d.payload,effect_id:'SYNTHETIC-other-effect'}}]:changed==='wrong_policy'?[{...d,payload:{...d.payload,policy_generation:8}}]:[{...d,payload:{...d.payload,ready:true}}];assert.throws(()=>assertPeerOrdinaryTaskEventFrom(f.tx,{...f.event,payload:{...f.event.payload,events}},f.q),e=>e.code==='ORIGIN_ORDINARY_TASK_CUSTOM_EVENT_CHANGED');
});
test('ordinary non-admission task grammar accepts no custom event and rejects dispatch injection',()=>{const f=ordinaryCustomEventGrammar('task/claim');assert.equal(assertPeerOrdinaryTaskEventFrom(f.tx,f.event,f.q),undefined);assert.throws(()=>assertPeerOrdinaryTaskEventFrom(f.tx,{...f.event,payload:{...f.event.payload,events:[f.dispatch]}},f.q),e=>e.code==='ORIGIN_ORDINARY_TASK_CUSTOM_EVENT_CHANGED');});

for(const action of ['task/get','task/context','task/peek','task/attempt/context','task/principal/context','task/effect','task/effect-bind','task/effect/raw-output','task/unsupported'])test(`consumer/helper name ${action} cannot produce an ordinary task-write journal`,()=>{const f=ordinaryCustomEventGrammar(action);assert.throws(()=>assertPeerOrdinaryTaskEventFrom(f.tx,f.event,f.q),e=>e.code==='ORIGIN_ORDINARY_TASK_MATERIAL_CHANGED');});
test('a zero-row read guard cannot be presented as a committed task-write producer',()=>{assert.throws(()=>assertPeerOrdinaryTaskEventFrom({}, {type:'task/get',principal_id:'scheduler',payload:{changes:[],events:[]}},null),e=>e.code==='ORIGIN_ORDINARY_TASK_MATERIAL_CHANGED');});

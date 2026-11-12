import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import * as actual from '../plugins/soloco/runtime/peers/owner-handover.mjs';
import {logicalSQLState} from './peer-task-effects-fixture.mjs';
import {ownerGateFixture,disposeOwnerGateFixture,core,qualify} from './peer-owner-operating-gate-fixture.mjs';

// Real owning SQLite/core transitions and original event/command history in
// disposable fictional companies. Native deployment/drain and primary-human
// messages are explicitly SYNTHETIC fixtures, not host/human attestation,
// installed adoption, actual transfer permission or live execution evidence.
test.after(disposeOwnerGateFixture);
const outgoing={host:'codex',session_id:'outgoing-chat',native_id:'outgoing-native'};
const target={host:'codex',session_id:'incoming-chat',native_id:'incoming-native'};
const hash=text=>createHash('sha256').update(text).digest('hex');
const reference=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const typedHold=error=>typeof error?.code==='string'&&/^OWNER_/.test(error.code);
const custody=(f,connection={root:f.ledger.root,company_id:f.ledger.company_id,directory:f.ledger.directory})=>f.ledger.read(tx=>core.assertPeerPublicOwnerCustody({...tx,connection}));

function unchanged(f,operation,predicate=typedHold){
  const before=logicalSQLState(f);assert.throws(operation,predicate);assert.deepEqual(logicalSQLState(f),before);
}
function countPuts(f,transform=raw=>raw){
  const original=f.ledger.guardedWrite;let calls=0;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){
    return Reflect.apply(original,this,[type,principal,raw=>{
      const base={...raw,put(...args){calls++;return raw.put(...args);}};
      return callback(Object.freeze(transform(base)));
    },terminal]);
  };
  return {get calls(){return calls;},restore:()=>{f.ledger.guardedWrite=original;}};
}
function noPuts(f,operation,predicate=typedHold){
  const before=logicalSQLState(f),watch=countPuts(f);
  try{assert.throws(operation,predicate);}finally{watch.restore();}
  assert.equal(watch.calls,0,'denial precedes the first physical row put');
  assert.deepEqual(logicalSQLState(f),before);
}
function fixture(t){
  const f=ownerGateFixture(t);f.privateOutgoing=f.outgoing;f.privateIncoming=f.incoming;
  f.outgoing=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:outgoing});
  f.incoming=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:target});
  f.pause();
  return f;
}
function decisionArgs(f,extra={}){
  const quote='SYNTHETIC primary founder message: transfer this fictional SoloCo company from outgoing-chat to incoming-chat / incoming-native after the existing independent reviewer accepts the exact reconstruction. Preserve all existing authority, limits and uncertainty.';
  return {operation_id:f.op(),epoch:7,source_instruction:'SYNTHETIC outgoing CoS records the complete fictional primary instruction for this exact target; human authenticity is not mechanically established.',basis:'explicit',target:{...target},reviewer_principal_id:'reviewer',review_grant_id:'owner-review-grant',review_grant_generation:1,expires_at:new Date(Date.now()+1800000).toISOString(),max_review_calls:2,
    primary_human_message:{host:'codex',chat_id:'11111111-1111-4111-8111-111111111111',turn_id:'22222222-2222-4222-8222-222222222222',message_id:'33333333-3333-4333-8333-333333333333',content_sha256:hash(quote),quote},...extra};
}
function record(f,extra={}){const args=decisionArgs(f,extra),result=f.outgoing.recordTransferDecision(args);return {args,result,ref:result.decision_ref};}
function issue(f,decision=record(f)){
  const args={operation_id:f.op(),epoch:7,source_instruction:'SYNTHETIC exact outgoing issuance under the recorded fictional primary instruction.',decision_ref:decision.ref};
  const result=f.outgoing.issueTransferIntent(args);return {args,result,ref:result.intent_ref,decision};
}
function beginArgs(f,intent){return {operation_id:f.op(),epoch:7,source_instruction:'SYNTHETIC actual incoming fixture requests only the target-bound pending custody.',intent_ref:intent.ref};}
function readSubject(f){
  const header=f.incoming.inspect({epoch:8});let text='';
  for(let offset=0;offset<header.total_characters;offset+=1024)text+=f.incoming.read({operation_id:f.op(),epoch:8,sha256:header.subject_sha256,offset,length:Math.min(1024,header.total_characters-offset)}).text;
  assert.equal(peerDigest(JSON.parse(text)),header.subject_sha256);return {header,body:JSON.parse(text),text};
}

test('an original outgoing decision and intent support complete public custody through independent review and dedicated resume',async t=>{
  const f=fixture(t),decision=record(f),intent=issue(f,decision);
  assert.equal(f.incoming.begin,undefined,'public callers cannot reach the source-private unbound begin');
  const d=f.get('work_items',decision.ref.id).value;
  assert.equal(d.status,'recorded');assert.equal(d.evidence_only,true,'the stored decision preserves its evidentiary status and is not human attestation');
  assert.equal(d.authority_basis_kind,'owning-cos-recorded-founder-instruction');assert.equal(d.human_producer_authenticity,'not mechanically established');
  const usage=f.get('control','usage'),grant=f.get('grants','owner-review-grant');
  const producerSequences=[f.get('work_items',decision.ref.id).created_seq,f.get('work_items',intent.ref.id).created_seq],seen=new Set();
  const guarded=f.ledger.guardedWrite;let puts=0;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){return Reflect.apply(guarded,this,[type,principal,raw=>callback(Object.freeze({...raw,
    events(options){const page=raw.events(options);for(const event of page.items)seen.add(event.seq);return page;},
    put(...args){assert(producerSequences.every(seq=>seen.has(seq)),'both original producer events are read in this same guarded transaction before its first put');puts++;return raw.put(...args);}
  })),terminal]);};
  let begun;try{begun=f.incoming.beginFromIntent(beginArgs(f,intent));}finally{f.ledger.guardedWrite=guarded;}
  assert(puts>0);assert.equal(begun.status,'pending');assert.equal(begun.epoch,8);
  assert.equal(f.get('principals','founder').value.native_id,target.native_id);
  assert.equal(f.get('principals','founder').value.legacy_owner.session_id,target.session_id);
  assert.deepEqual(f.get('control','usage'),usage);assert.deepEqual(f.get('grants','owner-review-grant'),grant);
  assert.equal(f.get('work_items',intent.ref.id).value.status,'consumed');
  const subject=readSubject(f);
  const originalIntent=subject.body.current.find(row=>row.family==='work_items'&&row.id===intent.ref.id);
  assert(originalIntent,'the complete original issued intent remains in the frozen business subject');assert.equal(originalIntent.value.status,'issued');
  f.incoming.submit({operation_id:f.op(),epoch:8,subject_sha256:subject.header.subject_sha256,content:'SYNTHETIC changed incoming reconstruction: preserve exact founder instruction, target, original decisions, intent, uncertainty, grants, deadlines and existing review limits.'});
  const reviewed=await qualify(f);
  assert.equal(f.incoming.activate({operation_id:f.op(),epoch:8,review_ref:reviewed.result.result_ref,source_instruction:'SYNTHETIC exact independent protected fixture review accepted.'}).status,'activated');
  assert.equal(f.incoming.resume({operation_id:f.op(),epoch:8,source_instruction:'SYNTHETIC dedicated resume after exact source fixture acceptance.'}).paused,false);
  assert.equal(custody(f).controlled,true);
  unchanged(f,()=>custody(f,{root:f.ledger.root,company_id:'fictional-different-company',directory:f.ledger.directory}),error=>error?.code==='OWNER_TRANSFER_CONNECTION_CHANGED');
  assert.equal(f.client.execute('message/send',f.messageArgs()).value.status,'pending');
  const clock=Date.now;Date.now=()=>Date.parse(decision.args.expires_at)+1;
  try{assert.equal(custody(f).controlled,true,'completed custody retains its historical authority after the original transition deadline');}
  finally{Date.now=clock;}
});

test('same-intent begin replay preserves delivery coverage and does not create another attempt or renew authority',t=>{
  const f=fixture(t),intent=issue(f),args=beginArgs(f,intent),first=f.incoming.beginFromIntent(args),header=f.incoming.inspect({epoch:8});
  f.incoming.read({operation_id:f.op(),epoch:8,sha256:header.subject_sha256,offset:0,length:Math.min(1024,header.total_characters)});
  const before=logicalSQLState(f);assert.deepEqual(f.incoming.beginFromIntent(args),first);assert.deepEqual(logicalSQLState(f),before);
  unchanged(f,()=>f.incoming.beginFromIntent({...args,operation_id:f.op()}));
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

test('intent inspection and exact bounded reads expose original terms without delivery credit or SQL writes',t=>{
  const f=fixture(t),intent=issue(f),before=logicalSQLState(f),header=f.outgoing.inspectTransferIntent({epoch:7,intent_ref:intent.ref});let text='';
  assert.equal(header.status,'issued');assert.equal(header.sha256,intent.ref.sha256);assert.equal(header.text,undefined);
  for(let offset=0;offset<header.total_characters;offset+=1024){
    const part=f.outgoing.readTransferIntent({epoch:7,intent_ref:intent.ref,sha256:header.sha256,offset,length:Math.min(1024,header.total_characters-offset)});
    assert.equal(part.offset,offset);assert(part.length<=1024);text+=part.text;
  }
  const body=JSON.parse(text);assert.equal(peerDigest(body),header.sha256);assert.deepEqual(body.terms.target,target);assert.deepEqual(body.decision_ref,intent.decision.ref);
  assert.deepEqual(logicalSQLState(f),before);
  unchanged(f,()=>f.outgoing.readTransferIntent({epoch:7,intent_ref:intent.ref,sha256:'0'.repeat(64),offset:0,length:1}));
  unchanged(f,()=>f.outgoing.readTransferIntent({epoch:7,intent_ref:intent.ref,sha256:header.sha256,offset:0,length:1025}));
});

test('only an original same-namespace lifecycle handle returns its exact owning ledger',t=>{
  const f=fixture(t),otherNamespace=actual.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:target});
  assert.equal(core.originalPeerOwnerLifecycleLedger(f.outgoing),f.ledger);assert.equal(core.originalPeerOwnerLifecycleLedger(f.incoming),f.ledger);
  const original=error=>error?.code==='OWNER_LIFECYCLE_ORIGINAL_REQUIRED';
  for(const forged of [{},JSON.parse(JSON.stringify(f.incoming)),Object.create(f.incoming),Object.freeze({...f.incoming}),otherNamespace])
    assert.throws(()=>core.originalPeerOwnerLifecycleLedger(forged),original);
  assert.throws(()=>actual.originalPeerOwnerLifecycleLedger(f.incoming),original);
});

test('inferred, mismatched, incomplete or caller-asserted human evidence cannot become a transfer decision',t=>{
  const f=fixture(t),base=decisionArgs(f);
  for(const patch of [
    {basis:'inferred'},
    {primary_human_message:{...base.primary_human_message,content_sha256:'0'.repeat(64)}},
    {primary_human_message:{...base.primary_human_message,quote:''}},
    {primary_human_message:{...base.primary_human_message,artifact_path:'/fictional/approval.md'}},
    {human_verified:true},
    {target:{...outgoing}}
  ])noPuts(f,()=>f.outgoing.recordTransferDecision({...base,operation_id:f.op(),...patch}));
});

test('issue loads the exact original canonical decision and rejects stale references or row-shaped substitutes',t=>{
  const f=fixture(t),decision=record(f),real=f.get('work_items',decision.ref.id);
  const fabricated=f.seed('work_items','fictional-copied-decision-without-original-producer',real.value);
  for(const {ref,predicate} of [
    {ref:{...decision.ref,sha256:'0'.repeat(64)},predicate:error=>error instanceof Error&&error.message==='Exact peer historical reference hash or identity mismatch'},
    {ref:{...decision.ref,revision:decision.ref.revision+1},predicate:error=>error instanceof Error&&error.message==='Exact peer historical version is unavailable in this snapshot'},
    {ref:reference('work_items',fabricated),predicate:typedHold}
  ])noPuts(f,()=>f.outgoing.issueTransferIntent({operation_id:f.op(),epoch:7,source_instruction:'No canonical producer substitution.',decision_ref:ref}),predicate);
  const changed=f.seed('work_items',real.id,{...real.value,target:{...target,native_id:'wrong-native'}});
  noPuts(f,()=>f.outgoing.issueTransferIntent({operation_id:f.op(),epoch:7,source_instruction:'No stale decision use.',decision_ref:decision.ref}));
  noPuts(f,()=>f.outgoing.issueTransferIntent({operation_id:f.op(),epoch:7,source_instruction:'A later changed row is not an original decision.',decision_ref:reference('work_items',changed)}));
});

test('incoming identity, outgoing epoch and closed begin inputs cannot override the issued target',t=>{
  const f=fixture(t),intent=issue(f),args=beginArgs(f,intent);
  const other=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:{...target,native_id:'another-incoming-native'}});
  noPuts(f,()=>other.beginFromIntent(args));
  noPuts(f,()=>f.incoming.beginFromIntent({...args,epoch:8}));
  noPuts(f,()=>f.outgoing.beginFromIntent(args));
  for(const patch of [{target:{...target}},{actor:target},{native_id:target.native_id},{expires_at:new Date(Date.now()+3600000).toISOString()},{max_review_calls:100},{ready:true}])
    noPuts(f,()=>f.incoming.beginFromIntent({...args,...patch}));
  assert.equal(f.get('principals','founder').value.status,'active');assert.equal(f.get('work_items',intent.ref.id).value.status,'issued');
});

test('outgoing revocation blocks consumption without changing the owner, reservations or spend',t=>{
  const f=fixture(t),intent=issue(f),args={operation_id:f.op(),epoch:7,source_instruction:'SYNTHETIC outgoing withdrawal of this exact unused transfer intent.',intent_ref:intent.ref};
  const revoked=f.outgoing.revokeTransferIntent(args);assert.equal(revoked.status,'revoked');
  const after=logicalSQLState(f);assert.deepEqual(f.outgoing.revokeTransferIntent(args),revoked);assert.deepEqual(logicalSQLState(f),after);
  noPuts(f,()=>f.incoming.beginFromIntent(beginArgs(f,intent)));
  assert.equal(f.get('principals','founder').value.status,'active');assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);
  assert.equal(f.get('control','usage'),null);
});

test('original expiry holds before the first put, and a new operation cannot reissue the same decision',t=>{
  const f=fixture(t),decision=record(f),intent=issue(f,decision),clock=Date.now;
  noPuts(f,()=>f.outgoing.issueTransferIntent({...intent.args,operation_id:f.op()}));
  noPuts(f,()=>f.outgoing.recordTransferDecision({...decision.args,operation_id:f.op(),max_review_calls:3,expires_at:new Date(Date.now()+2400000).toISOString()}));
  Date.now=()=>Date.parse(decision.args.expires_at);
  try{noPuts(f,()=>f.incoming.beginFromIntent(beginArgs(f,intent)));}finally{Date.now=clock;}
  assert.equal(f.get('work_items',intent.ref.id).value.status,'issued');assert.equal(f.get('principals','founder').value.status,'active');
});

test('a later control revision cannot silently widen the original decision at issuance',t=>{
  const f=fixture(t),decision=record(f);f.pause();
  noPuts(f,()=>f.outgoing.issueTransferIntent({operation_id:f.op(),epoch:7,source_instruction:'The original exact control binding is stale.',decision_ref:decision.ref}));
  assert.equal(f.get('principals','founder').value.status,'active');assert.equal(f.get('control','usage'),null);
});

test('a control change after issue holds incoming begin in the owning transaction',t=>{
  const f=fixture(t),intent=issue(f);f.pause();
  noPuts(f,()=>f.incoming.beginFromIntent(beginArgs(f,intent)));
  assert.equal(f.get('work_items',intent.ref.id).value.status,'issued');assert.equal(f.get('principals','founder').value.status,'active');
});

for(const kind of ['Error','AggregateError'])test(`original intent provider ${kind} identity survives without normalization or custody writes`,t=>{
  const f=fixture(t),intent=issue(f),cause=Error('Original fictional intent storage cause.'),member=Error('Original fictional grouped storage member.');
  const failure=Object.assign(kind==='Error'?new Error('Original intent provider failure.',{cause}):new AggregateError([member],'Original intent provider failures.',{cause}),{code:'OWNER_TRANSFER_INTENT_REQUIRED'});
  const original=f.ledger.guardedWrite;let reads=0,puts=0;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){return Reflect.apply(original,this,[type,principal,raw=>callback(Object.freeze({...raw,
    getVersion(ref){if(ref.id===intent.ref.id){reads++;throw failure;}return raw.getVersion(ref);},
    put(...args){puts++;return raw.put(...args);}
  })),terminal]);};
  try{unchanged(f,()=>f.incoming.beginFromIntent(beginArgs(f,intent)),error=>{assert.equal(error,failure);assert.equal(error.cause,cause);if(kind==='AggregateError')assert.equal(error.errors[0],member);return true;});}
  finally{f.ledger.guardedWrite=original;}
  assert(reads>0,'the original immutable intent provider was actually consulted');assert.equal(puts,0);
});

test('expiry after final metadata staging rolls back consumed intent and owner revocation before physical COMMIT',t=>{
  const f=fixture(t),decision=record(f),intent=issue(f,decision),query=f.ledger.query,clock=Date.now;let crossed=0;
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(query,this,[sql,...parameters]);
    if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
    return new Proxy(statement,{get(object,key){if(key==='run')return(...values)=>{const result=object.run(...values);crossed++;Date.now=()=>Date.parse(decision.args.expires_at);return result;};const value=Reflect.get(object,key,object);return typeof value==='function'?value.bind(object):value;}});
  };
  try{unchanged(f,()=>f.incoming.beginFromIntent(beginArgs(f,intent)),error=>error?.code==='TASK_EFFECT_EXPIRED');}
  finally{f.ledger.query=query;Date.now=clock;}
  assert.equal(crossed,1);assert.equal(f.get('work_items',intent.ref.id).value.status,'issued');assert.equal(f.get('principals','founder').value.status,'active');
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

test('legacy unbound custody cannot be accepted through the fixed public facade or maintenance admission',t=>{
  const f=ownerGateFixture(t);f.pause();f.begin();f.reconstruct();
  const incoming=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:target});
  const unbound=error=>error?.code==='OWNER_PUBLIC_TRANSFER_REQUIRED';
  unchanged(f,()=>incoming.inspect({epoch:8}),unbound);
  unchanged(f,()=>custody(f),unbound);
  noPuts(f,()=>core.prepareOriginalPeerOwnerMaintenance(incoming,{operation_id:f.op(),epoch:8}),unbound);
  assert.equal(f.get('control','company').value.paused,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonical,PeerLedger,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {pendingHandoffs} from '../plugins/soloco/runtime/peers/handoff.mjs';
import * as model from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {peerTaskEffectsFixture,logicalSQLState,reference,rows} from './peer-task-effects-fixture.mjs';

// Actual temporary P1 commands and immutable source provenance. The protected
// process/identity observations below are explicitly SYNTHETIC and perform no
// native, account, provider, controller or live-company operation. Source tests
// establish enforcement mechanics, never business/native receiver acceptance.
const actor=principal_id=>({principal_id});
const code=expected=>error=>error?.code===expected;
const copy=value=>JSON.parse(canonical(value));

function fixture(t){
  let clock=Date.now(),sequence=0,pid=72000;
  t.mock.method(Date,'now',()=>clock);
  const f=peerFixture({principals:{founder:{legacy_owner:{host:'codex',session_id:'synthetic-owner',epoch:1}}}});
  const other=new PeerLedger(f.root);t.after(()=>{other.close();f.close();});
  const op=prefix=>`${prefix}-${++sequence}`;
  const run=(who,action,args={},ledger=f.ledger)=>model.execute(ledger,actor(who),action,{operation_id:op(action),...args});
  const get=(family,id,ledger=f.ledger)=>ledger.read(tx=>tx.get(family,id));
  const corrupt=(family,id,change)=>other.write('synthetic-handoff-negative-control','founder',tx=>{
    const old=tx.get(family,id);return tx.put(family,id,change(copy(old.value)),old.revision);
  });
  const grant=(who,args={})=>run('founder','grant/create',{
    grant_id:`handoff-grant-${who}`,to_principal_id:who,scope:'*',
    actions:['task/*','home/*','message/*','handoff/*'],resources:['home:fact','home:other'],
    expires_at:new Date(clock+3600000).toISOString(),source_instruction:'Fictional bounded source handoff authority.',...args
  });
  for(const who of ['cos-a','cos-b','reviewer'])grant(who);
  const bind=who=>{const p=get('principals',who);return model.bindPeerPrincipal(f.ledger,{principal_id:who,generation:p.value.generation,native_id:p.value.native_id});};
  const clients=Object.fromEntries(['cos-a','cos-b','reviewer'].map(who=>[who,bind(who)]));
  const exec=(who,action,args={})=>clients[who].execute(action,{operation_id:op(action),...args});
  const propose=(who='cos-a',args={})=>exec(who,'home/propose',{
    grant_id:`handoff-grant-${who}`,scope:'alpha',home_id:'fact',expected_revision:0,
    content:{claim:'Fictional result with retained uncertainty.',unicode:'雪😀',unknown:{retained:true}},...args
  });
  const subject=propose(),evidence=propose('cos-a',{home_id:'other',content:'Separate exact fictional evidence.'});
  const sendArgs=(args={})=>({operation_id:op('send'),grant_id:'handoff-grant-cos-a',to_principal_id:'cos-b',scope:'alpha',
    subject_ref:reference('proposals',subject),governing_refs:[],evidence_refs:[reference('proposals',evidence)],
    limitations:'Synthetic source evidence only; no execution or native qualification.',
    source_instruction:'Ask the named receiver to decide this exact bounded handoff.',...args});
  const send=(args={})=>clients['cos-a'].execute('handoff/send',sendArgs(args));
  const decisionArgs=(handoff,args={})=>({operation_id:op('decision'),handoff_ref:reference('work_items',handoff),
    grant_id:'handoff-grant-cos-b',reason:'Receiver reviewed the exact evidence and limitations.',
    source_instruction:'Record my explicit receiver decision only.',...args});
  const decide=(handoff,action='handoff/accept',args={},who='cos-b')=>clients[who].execute(action,decisionArgs(handoff,args));
  const pending=(who='cos-b',args={})=>clients[who].inspect('handoff/pending',{family:'work_items',limit:50,...args});
  const start=(who='cos-a',args={})=>{
    const task=exec(who,'task/submit',{grant_id:`handoff-grant-${who}`,scope:'alpha',role:'engineer',
      instructions:'Produce bounded synthetic source evidence.',acceptance:'Retain exact evidence and limitations.',...args});
    exec(who,'task/claim',{task_id:task.id});
    const admitted=run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);return admitted;
  };
  const finish=(a,args={})=>model.createRuntimeObserver(f.ledger).record('task/finish',{
    operation_id:op('observed-finish'),task_id:a.task.id,attempt_id:a.task.value.attempt.id,
    output:'SYNTHETIC observed source result.',native_id:`synthetic-handoff-${a.task.id}`,termination_confirmed:true,
    observed_process:{pid:++pid,started_at:a.task.value.attempt.admitted_at,close_observed:true},...args
  });
  const review=(proposal=subject,verdict='Pass')=>{
    const a=start('reviewer',{role:'qa',stage:'review',review_of:reference('proposals',proposal)});
    const output=canonical({review:{subject:reference('proposals',proposal),verdict,reason:'Independent SYNTHETIC source review.',blockers:verdict==='Pass'?[]:['Retained adverse finding.']}});
    const result=finish(a,{output});assert.equal(result.accepted,true);return {admitted:a,...result};
  };
  Object.defineProperty(f,'clock',{get:()=>clock,set:value=>{clock=value;}});
  return Object.assign(f,{other,op,run,get,corrupt,grant,bind,clients,exec,propose,subject,evidence,sendArgs,send,decisionArgs,decide,pending,start,finish,review});
}
function unchanged(f,operation,predicate){
  const before=logicalSQLState(f);assert.throws(operation,typeof predicate==='string'?code(predicate):predicate);assert.deepEqual(logicalSQLState(f),before);
}
function noCandidateList(f,operation,predicate='INTAKE_CURSOR_INVALID'){
  const original=f.ledger.query,seen=[];
  f.ledger.query=function(sql,...parameters){if(sql==='SELECT generation FROM peer_generations WHERE family=?')seen.push(parameters[0]);return Reflect.apply(original,this,[sql,...parameters]);};
  try{unchanged(f,operation,predicate);}finally{f.ledger.query=original;}
  assert.deepEqual(seen,[],'the receiver/source cursor must be checked before tx.list');
}
// Explicitly SYNTHETIC returned-row DATA for informational selectors only.
// Real ledger writes retain canonical bytes, indexes, generations and cursors;
// these rows provide no admission, execution, observation or Native proof.
function seedSyntheticReturnedTask(f,who='cos-a'){
  assert(['cos-a','cos-b'].includes(who),'SYNTHETIC selector owner must be a fixture CoS');
  return f.ledger.write('fixture.synthetic-handoff-selector-data','founder',tx=>{
    assert.equal(tx.get('principals',who)?.value.status,'active');
    return tx.put('tasks',f.op('synthetic-returned-selector'),{
      kind:'SYNTHETIC_RETURNED_TASK_SELECTOR_DATA',status:'returned',scope:'alpha',owner_principal_id:who,
      result:{output:'SYNTHETIC returned selector output: 雪😀'},
      limitations:'Informational selector DATA only; no task execution, observation, review, reservation or Native provenance.'
    },0);
  });
}
function cursorCandidates(f,family){
  if(family==='work_items'){f.send();f.send();return 'cos-b';}
  if(family==='messages'){
    for(let n=0;n<3;n++)f.exec('cos-a','message/send',{grant_id:'handoff-grant-cos-a',scope:'alpha',to_principal_id:n%2?'cos-a':'cos-b',content:`Fictional receiver cursor message ${n}.`});
    return 'cos-b';
  }
  if(family==='tasks'){for(const who of ['cos-a','cos-b'])seedSyntheticReturnedTask(f,who);return 'cos-a';}
  return 'cos-a'; // The fixture already contains two authored proposals.
}
function commandFor(f,who,operation_id){
  const found=rows(f,'commands',{principal_id:who}).filter(row=>row.value.operation_id===operation_id);
  assert.equal(found.length,1);return found[0];
}
function assertDescriptor(item,family,row){
  assert.deepEqual({family:item.family,id:item.id,revision:item.revision,sha256:item.sha256},reference(family,row));
  assert.equal(item.part,'value');assert.equal(item.available,true);
  const bytes=canonical(row.value);assert.equal(item.content_sha256,model.digest(bytes));
  assert.equal(item.total_characters,bytes.length);assert.equal(item.utf8_bytes,Buffer.byteLength(bytes));
  assert.deepEqual(item.read,{tool:'company_peers',action:'read'});
}
function afterFinalMetadata(f,change){
  const original=f.ledger.query;let hits=0;
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='run')return(...values)=>{const result=target.run(...values);hits++;change();return result;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  return {get hits(){return hits;},restore:()=>{f.ledger.query=original;}};
}
function afterOwnedCallback(f,action,change){
  const original=f.ledger.guardedWrite;let hits=0;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){
    return Reflect.apply(original,this,[type,principal,tx=>{const result=callback(tx);if(type===action){hits++;change(tx);}return result;},terminal]);
  };
  return {get hits(){return hits;},restore:()=>{f.ledger.guardedWrite=original;}};
}

test('actual sender creates a typed immutable pending handoff and the exact receiver explicitly accepts',t=>{
  const f=fixture(t),args=f.sendArgs(),subjectBytes=canonical(f.subject.value),sender=f.get('principals','cos-a'),receiver=f.get('principals','cos-b');
  const handoff=f.clients['cos-a'].execute('handoff/send',args);
  assert.equal(handoff.value.kind,'peer_handoff_v1');assert.equal(handoff.value.status,'pending');assert.equal(handoff.value.principal_id,'cos-b');
  assert.deepEqual(handoff.value.sender,reference('principals',sender));assert.deepEqual(handoff.value.receiver,reference('principals',receiver));
  assert.deepEqual(handoff.value.subject_ref,args.subject_ref);assert.deepEqual(handoff.value.governing_refs,args.governing_refs);
  assert.deepEqual(handoff.value.evidence_refs,args.evidence_refs);assert.equal(handoff.value.limitations,args.limitations);
  assert.equal(canonical(f.get('proposals',f.subject.id).value),subjectBytes);
  const sent=commandFor(f,'cos-a',args.operation_id);assert.deepEqual(sent.value.result,handoff);
  const beforeRead=logicalSQLState(f),page=f.pending();
  assert.equal(page.items.length,1);assertDescriptor(page.items[0],'work_items',handoff);assert.equal(page.items[0].state,'pending');
  assert.equal(page.scanned_count,1);assert.equal(page.total_candidates,1);assert.equal(page.complete,true);assert.equal(page.next_cursor,null);
  assert.deepEqual(logicalSQLState(f),beforeRead,'inspection does not manufacture receiver decisions');
  const decisionArgs=f.decisionArgs(handoff),decision=f.clients['cos-b'].execute('handoff/accept',decisionArgs);
  assert.equal(decision.id,peerDigest(['peer-handoff-disposition-v1',reference('work_items',handoff),reference('principals',receiver)]));
  assert.equal(decision.value.kind,'peer_handoff_disposition_v1');assert.equal(decision.value.status,'accepted');
  assert.equal(decision.value.principal_id,'cos-b');assert.deepEqual(decision.value.receiver,reference('principals',receiver));
  assert.deepEqual(decision.value.handoff_ref,reference('work_items',handoff));assert.equal(decision.value.reason,decisionArgs.reason);
  assert.deepEqual(f.get('work_items',handoff.id),handoff,'disposition preserves the exact original handoff');
  assert.deepEqual(commandFor(f,'cos-b',decisionArgs.operation_id).value.result,decision);
  assert.deepEqual(f.pending().items,[]);assert.equal(f.pending().total_candidates,1,'a decided handoff remains a source candidate, not a pending-decision count');
  assert.equal(f.get('homes','fact'),null);assert.equal(f.get('control','usage'),null);assert.equal(rows(f,'slots').length,0);
  const events=f.ledger.db.prepare('SELECT type,principal_id,bytes FROM peer_events ORDER BY seq DESC LIMIT 2').all();
  assert.deepEqual(events.map(row=>[row.type,row.principal_id]),[['handoff/accept','cos-b'],['handoff/send','cos-a']]);
  assert(JSON.parse(events[0].bytes).changes.some(change=>change.family==='work_items'&&change.id===decision.id));
});

test('explicit rejection preserves the handoff and has no publication, QA or notice-resolution side effect',t=>{
  const f=fixture(t),notice=f.run('cos-a','notice/create',{scope:'alpha',content:'Required independent condition.'}),handoff=f.send();
  const decision=f.decide(handoff,'handoff/reject',{reason:'The evidence is insufficient for this receiver.'});
  assert.equal(decision.value.status,'rejected');assert.deepEqual(f.get('work_items',handoff.id),handoff);
  assert.equal(f.get('notices',notice.id).value.status,'pending');assert.equal(f.get('homes','fact'),null);
  assert.equal(rows(f,'reviews').length,0);assert.deepEqual(f.pending().items,[]);
  unchanged(f,()=>f.decide(handoff),'HANDOFF_DECIDED');
});

test('sending, ordinary incoming messages and reading do not imply receiver acceptance',t=>{
  const f=fixture(t),message=f.exec('cos-a','message/send',{grant_id:'handoff-grant-cos-a',scope:'alpha',to_principal_id:'cos-b',content:'Informational only: 雪😀'}),handoff=f.send();
  const before=logicalSQLState(f),messages=f.pending('cos-b',{family:'messages'});
  assert.equal(messages.items.length,1);assertDescriptor(messages.items[0],'messages',message);
  assert.notEqual(messages.items[0].intake_kind,'handoff');
  assert.equal(f.pending().items[0].id,handoff.id);assert.deepEqual(logicalSQLState(f),before);
  assert.equal(rows(f,'work_items').filter(row=>row.value.kind==='peer_handoff_disposition_v1').length,0);
});

test('receiver pending intake is isolated while the sender retains its source-attributed outgoing history',t=>{
  const f=fixture(t),handoff=f.send(),before=logicalSQLState(f);
  assert.deepEqual(f.pending('reviewer').items,[]);assert.deepEqual(f.pending('cos-a').items,[]);
  assert.equal(handoff.value.sender.id,'cos-a');
  const command=commandFor(f,'cos-a',rows(f,'commands',{principal_id:'cos-a'}).find(row=>row.value.action==='handoff/send').value.operation_id);
  assert.deepEqual(command.value.result,handoff);assert.deepEqual(logicalSQLState(f),before);
  unchanged(f,()=>f.decide(handoff,'handoff/accept',{grant_id:'handoff-grant-cos-a'},'cos-a'),'HANDOFF_RECEIVER');
  unchanged(f,()=>f.decide(handoff,'handoff/reject',{grant_id:'handoff-grant-reviewer'},'reviewer'),'HANDOFF_RECEIVER');
});

test('exact send and decision replay return immutable receipts; changed operations cannot rewrite them',t=>{
  const f=fixture(t),args=f.sendArgs({operation_id:'exact-send'}),handoff=f.clients['cos-a'].execute('handoff/send',args),sent=logicalSQLState(f);
  assert.deepEqual(f.clients['cos-a'].execute('handoff/send',args),handoff);assert.deepEqual(logicalSQLState(f),sent);
  unchanged(f,()=>f.clients['cos-a'].execute('handoff/send',{...args,limitations:'Changed scope of claim.'}),'REPLAY_MISMATCH');
  const decisionArgs=f.decisionArgs(handoff,{operation_id:'exact-decision'}),decision=f.clients['cos-b'].execute('handoff/accept',decisionArgs),accepted=logicalSQLState(f);
  assert.deepEqual(f.clients['cos-b'].execute('handoff/accept',decisionArgs),decision);assert.deepEqual(logicalSQLState(f),accepted);
  unchanged(f,()=>f.clients['cos-b'].execute('handoff/reject',decisionArgs),'REPLAY_MISMATCH');
  unchanged(f,()=>f.clients['cos-b'].execute('handoff/accept',{...decisionArgs,reason:'Changed historical reason.'}),'REPLAY_MISMATCH');
  unchanged(f,()=>f.decide(handoff),'HANDOFF_DECIDED');
});

test('exact replay remains historical DATA after grant revocation and source advancement without granting fresh permission',t=>{
  const f=fixture(t),sendArgs=f.sendArgs({operation_id:'historical-send'}),handoff=f.clients['cos-a'].execute('handoff/send',sendArgs),
    decisionArgs=f.decisionArgs(handoff,{operation_id:'historical-decision'}),decision=f.clients['cos-b'].execute('handoff/accept',decisionArgs);
  f.run('founder','grant/revoke',{grant_id:'handoff-grant-cos-a',source_instruction:'End the original sending authority.'});
  f.run('founder','grant/revoke',{grant_id:'handoff-grant-cos-b',source_instruction:'End the original receiver decision authority.'});
  const changed=f.corrupt('proposals',f.subject.id,value=>({...value,content:'A newer candidate cannot be accepted by an old receipt.'}));
  const before=logicalSQLState(f);
  assert.deepEqual(f.clients['cos-a'].execute('handoff/send',sendArgs),handoff);
  assert.deepEqual(f.clients['cos-b'].execute('handoff/accept',decisionArgs),decision);
  assert.deepEqual(logicalSQLState(f),before,'historical replay creates no new work, decision, charge or events');
  unchanged(f,()=>f.send({subject_ref:reference('proposals',changed)}),'GRANT_INVALID');
});

test('fresh send and decision require their actual named actor grant and scope',t=>{
  const f=fixture(t),handoff=f.send();
  unchanged(f,()=>f.send({grant_id:'handoff-grant-reviewer'}),'GRANT_INVALID');
  unchanged(f,()=>f.decide(handoff,'handoff/accept',{grant_id:'handoff-grant-cos-a'}),'GRANT_INVALID');
  const wrongScope=f.grant('cos-a',{grant_id:'handoff-wrong-scope',scope:'beta'});
  unchanged(f,()=>f.send({grant_id:wrongScope.id}),'GRANT_INVALID');
  const noAction=f.grant('cos-a',{grant_id:'handoff-messages-only',actions:['message/*']});
  unchanged(f,()=>f.send({grant_id:noAction.id}),'GRANT_INVALID');
});

test('fresh receiver acceptance requires the exact handoff subject to remain current',t=>{
  const f=fixture(t),handoff=f.send();
  f.corrupt('proposals',f.subject.id,value=>({...value,content:'Changed after this handoff was offered.'}));
  unchanged(f,()=>f.decide(handoff),'SOURCE_CHANGED');
  assert.deepEqual(f.get('work_items',handoff.id),handoff);
});

for(const field of ['subject_ref','governing_refs','evidence_refs'])test(`handoff send resolves exact ${field} before any mutation`,t=>{
  const f=fixture(t),wrong={...reference('proposals',f.subject),sha256:'0'.repeat(64)};
  unchanged(f,()=>f.send({[field]:field==='subject_ref'?wrong:[wrong]}),'SOURCE_CHANGED');
});

test('decision requires the exact handoff family, revision and hash',t=>{
  const f=fixture(t),handoff=f.send(),exact=reference('work_items',handoff);
  for(const wrong of [{...exact,revision:exact.revision+1},{...exact,sha256:'0'.repeat(64)}])
    unchanged(f,()=>f.decide(handoff,'handoff/accept',{handoff_ref:wrong}),'SOURCE_CHANGED');
  unchanged(f,()=>f.decide(handoff,'handoff/accept',{handoff_ref:reference('proposals',f.subject)}),'SOURCE_INVALID');
});

test('request identity fields cannot impersonate the designated receiver',t=>{
  const f=fixture(t),handoff=f.send();
  for(const key of ['principal_id','actor','session_id','native_id','generation','runtime_observer','observer_capability'])
    unchanged(f,()=>f.clients['cos-a'].execute('handoff/accept',{...f.decisionArgs(handoff),[key]:'cos-b'}),'ACTOR_ARGUMENT');
});

test('kind-shaped work items cannot manufacture handoffs or receiver acceptance provenance',t=>{
  const f=fixture(t),handoff=f.send(),fake=f.other.write('synthetic-handoff-counterfeit','founder',tx=>tx.put('work_items','counterfeit-handoff',copy(handoff.value),0));
  unchanged(f,()=>f.decide(fake),'HANDOFF_PROVENANCE');
  const receiver=f.get('principals','cos-b'),fakeDecision=peerDigest(['peer-handoff-disposition-v1',reference('work_items',handoff),reference('principals',receiver)]);
  f.other.write('synthetic-handoff-counterfeit','founder',tx=>tx.put('work_items',fakeDecision,{kind:'peer_handoff_disposition_v1',status:'accepted',principal_id:'cos-b',receiver:reference('principals',receiver),handoff_ref:reference('work_items',handoff)},0));
  const before=logicalSQLState(f),page=f.pending();
  assert(page.items.some(item=>item.id===handoff.id),'a forged decision cannot remove a genuine pending obligation');
  assert.deepEqual(logicalSQLState(f),before);
});

test('a replaced receiver sees the original pending handoff held and cannot accept its predecessor\'s obligation',t=>{
  const f=fixture(t),handoff=f.send();
  f.corrupt('principals','cos-b',value=>({...value,generation:value.generation+1,native_id:'cos-b-successor-native'}));
  unchanged(f,()=>f.decide(handoff),'PRINCIPAL_CHANGED');
  f.clients['cos-b']=f.bind('cos-b');const before=logicalSQLState(f),page=f.pending();
  assert.equal(page.items.length,1);assert.equal(page.items[0].id,handoff.id);assert.equal(page.items[0].state,'held');
  assert.deepEqual(logicalSQLState(f),before);unchanged(f,()=>f.decide(handoff),'RECEIVER_CHANGED');
  assert.deepEqual(f.get('work_items',handoff.id),handoff);
});

test('source incarnation checks precede an existing receiver decision receipt',t=>{
  const f=fixture(t),handoff=f.send(),args=f.decisionArgs(handoff,{operation_id:'receiver-old-replay'});
  f.clients['cos-b'].execute('handoff/accept',args);
  f.corrupt('principals','cos-b',value=>({...value,generation:value.generation+1,native_id:'cos-b-new-native'}));
  unchanged(f,()=>f.clients['cos-b'].execute('handoff/accept',args),'PRINCIPAL_CHANGED');
});

test('cold reopening preserves real handoff provenance and permits the current exact receiver decision',t=>{
  const f=fixture(t),handoff=f.send(),cold=new PeerLedger(f.root);t.after(()=>cold.close());
  const client=model.bindPeerPrincipal(cold,{principal_id:'cos-b',generation:1,native_id:'cos-b-native'}),before=logicalSQLState(f);
  const page=client.inspect('handoff/pending',{family:'work_items',limit:50});assertDescriptor(page.items[0],'work_items',handoff);
  assert.deepEqual(logicalSQLState(f),before);
  const decision=client.execute('handoff/accept',f.decisionArgs(handoff));assert.equal(decision.value.status,'accepted');
  assert.deepEqual(f.get('work_items',handoff.id),handoff);assert.deepEqual(f.pending().items,[]);
});

test('accepted historical handoff does not accept a new source revision or erase its original decision',t=>{
  const f=fixture(t),handoff=f.send(),decision=f.decide(handoff);
  const changed=f.corrupt('proposals',f.subject.id,value=>({...value,content:'A materially changed source candidate.'}));
  const next=f.send({subject_ref:reference('proposals',changed)}),page=f.pending();
  assert.deepEqual(page.items.map(item=>item.id),[next.id]);assert.deepEqual(f.get('work_items',decision.id),decision);
  assert.deepEqual(f.get('work_items',handoff.id),handoff);
});

test('a genuine negative QA verdict cannot be laundered through receiver acceptance into publication',t=>{
  const f=fixture(t),negative=f.review(f.subject,'Fail'),handoff=f.send(),decision=f.decide(handoff),positive=f.review(f.subject,'Pass');
  assert.equal(decision.value.status,'accepted');assert.equal(f.get('reviews',negative.review.id).value.verdict,'Fail');
  unchanged(f,()=>f.exec('cos-a','home/publish',{grant_id:'handoff-grant-cos-a',proposal_id:f.subject.id,review_id:positive.review.id}),'REVIEW_HELD');
  assert.equal(f.get('homes','fact'),null);assert.deepEqual(f.get('work_items',decision.id),decision);
});

test('returned own output and unpublished own proposals are informational intake without receiver obligations',t=>{
  const f=fixture(t),finished={task:seedSyntheticReturnedTask(f)},before=logicalSQLState(f);
  const tasks=f.pending('cos-a',{family:'tasks'}),proposals=f.pending('cos-a',{family:'proposals'});
  const returned=tasks.items.find(item=>item.id===finished.task.id);assert(returned);assertDescriptor(returned,'tasks',finished.task);
  assert.notEqual(returned.intake_kind,'handoff');assert(proposals.items.some(item=>item.id===f.subject.id));
  assert.deepEqual(f.pending().items,[]);assert.deepEqual(logicalSQLState(f),before);
});

test('handoff decisions do not spend another model call or release genuinely UNKNOWN task reservations',t=>{
  const f=fixture(t),admitted=f.start('cos-a',{resources:['home:fact']});
  const unknown=f.finish(admitted,{error:{code:'SYNTHETIC_TIMEOUT'},termination_confirmed:false,
    observed_process:{pid:74000,started_at:admitted.task.value.attempt.admitted_at,close_observed:false}});
  assert.equal(unknown.task.value.status,'unknown');
  const retained=Object.fromEntries(['tasks','slots','claims','effects','grants'].map(family=>[family,rows(f,family)])),usage=f.get('control','usage');
  const handoff=f.send(),decision=f.decide(handoff);assert.equal(decision.value.status,'accepted');
  for(const [family,before]of Object.entries(retained))assert.deepEqual(rows(f,family),before,`${family} must not change through a handoff decision`);
  assert.deepEqual(f.get('control','usage'),usage);assert.equal(usage.value.model_calls,1);
  assert(rows(f,'claims').some(row=>row.value.status==='held'));assert(rows(f,'slots').some(row=>row.value.status==='unknown'));
});

test('an ordinary task cannot decide a handoff or access sending, publication and intake controls',t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),before=logicalSQLState(f);
  for(const action of ['handoff/send','home/publish'])
    assert.throws(()=>a.client.execute(action,{operation_id:`task-held-${action}`}),code('TASK_EFFECT_ACTION_HELD'));
  for(const action of ['handoff/accept','handoff/reject'])
    assert.throws(()=>a.client.execute(action,{operation_id:`task-held-${action}`}),code('HANDOFF_REQUIRED'));
  assert.throws(()=>a.client.inspect('handoff/pending',{family:'work_items'}),code('TASK_EFFECT_ACTION_HELD'));
  assert.deepEqual(logicalSQLState(f),before);
});

test('bounded candidate pagination crosses already-decided handoffs without losing later pending work',t=>{
  const f=fixture(t),handoffs=Array.from({length:4},()=>f.send());f.decide(handoffs[0]);f.decide(handoffs[1],'handoff/reject');
  const before=logicalSQLState(f),seen=[],cursors=new Set();let cursor,total,scanned=0,pages=0;
  for(;;){
    const page=f.pending('cos-b',{limit:1,...(cursor?{cursor}:{})});pages++;assert(page.scanned_count<=1);scanned+=page.scanned_count;
    if(total===undefined)total=page.total_candidates;else assert.equal(page.total_candidates,total);
    seen.push(...page.items.map(item=>item.id));if(page.complete){assert.equal(page.next_cursor,null);break;}
    assert(page.next_cursor);assert(!cursors.has(page.next_cursor));cursors.add(page.next_cursor);cursor=page.next_cursor;assert(pages<20);
  }
  assert.equal(scanned,total);assert.deepEqual(seen.sort(),handoffs.slice(2).map(row=>row.id).sort());
  assert.equal(new Set(seen).size,seen.length);assert.deepEqual(logicalSQLState(f),before);
});

test('pending selectors are bounded and a cursor cannot be replayed for another receiver or scope',t=>{
  const f=fixture(t);f.send();f.send();const page=f.pending('cos-b',{limit:1});assert(page.next_cursor);
  for(const limit of [0,51,1.5])unchanged(f,()=>f.pending('cos-b',{limit}),'INVALID_INPUT');
  unchanged(f,()=>f.pending('cos-b',{family:'principals'}),'INVALID_INPUT');
  unchanged(f,()=>f.pending('reviewer',{limit:1,cursor:page.next_cursor}),/Stale or mismatched peer cursor/);
  unchanged(f,()=>f.pending('cos-b',{limit:1,cursor:page.next_cursor,scope:'beta'}),/Stale or mismatched peer cursor/);
});

for(const family of ['work_items','tasks','proposals','messages'])test(`${family} intake rejects another actual receiver's cursor before listing candidates`,t=>{
  const f=fixture(t),who=cursorCandidates(f,family),page=f.pending(who,{family,limit:1});assert(page.next_cursor);
  noCandidateList(f,()=>f.pending(who==='cos-a'?'cos-b':'cos-a',{family,limit:1,cursor:page.next_cursor}));
  assert.doesNotThrow(()=>f.pending(who,{family,limit:1,cursor:page.next_cursor}));
});

for(const family of ['work_items','tasks','proposals','messages'])test(`${family} intake rejects a predecessor incarnation's cursor after a genuine rebind`,t=>{
  const f=fixture(t),who=cursorCandidates(f,family),page=f.pending(who,{family,limit:1});assert(page.next_cursor);
  f.corrupt('principals',who,value=>({...value,generation:value.generation+1,native_id:`${who}-cursor-successor`}));
  f.clients[who]=f.bind(who);
  noCandidateList(f,()=>f.pending(who,{family,limit:1,cursor:page.next_cursor}));
  assert.doesNotThrow(()=>f.pending(who,{family,limit:1}));
});

test('intake cursor family, scope and founder view cannot be relabelled by the caller',t=>{
  const f=fixture(t);cursorCandidates(f,'messages');
  const page=f.pending('cos-b',{family:'messages',scope:'alpha',limit:1});assert(page.next_cursor);
  noCandidateList(f,()=>f.pending('cos-b',{family:'tasks',scope:'alpha',limit:1,cursor:page.next_cursor}));
  noCandidateList(f,()=>f.pending('cos-b',{family:'messages',scope:'beta',limit:1,cursor:page.next_cursor}));
  noCandidateList(f,()=>f.pending('cos-b',{family:'messages',limit:1,cursor:page.next_cursor}));
  const founder=model.bindPeerProductionScheduler(f.ledger),founderPage=founder.inspect(f.ledger,actor('founder'),'handoff/pending',{family:'proposals',limit:1});assert(founderPage.next_cursor);
  f.corrupt('control','company',value=>({...value,founder_principal_id:'cos-a'}));
  // The production facade itself also fences this owner change. Exercise the
  // pure selector directly to prove its view binding without inventing a new
  // public founder/peer authentication path.
  noCandidateList(f,()=>f.ledger.read(tx=>pendingHandoffs(tx,tx.get('principals','founder'),tx.get('control','company'),{family:'proposals',limit:1,cursor:founderPage.next_cursor},{company_id:f.ledger.company_id,root_sha256:model.digest(f.ledger.root)})));
});

test('intake cursor signature rejects altered receiver, selection and inner P1 cursor',t=>{
  const f=fixture(t);cursorCandidates(f,'messages');
  const cursor=f.pending('cos-b',{family:'messages',limit:1}).next_cursor;assert(cursor);
  const [body,signature]=cursor.split('.'),original=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  for(const change of [value=>{value.binding.receiver.id='cos-a';},value=>{value.binding.selector.family='tasks';},value=>{value.inner+='A';}]){
    const altered=copy(original);change(altered);
    const token=Buffer.from(canonical(altered)).toString('base64url')+'.'+signature;
    noCandidateList(f,()=>f.pending('cos-b',{family:'messages',limit:1,cursor:token}));
  }
  const wrongSignature=signature[0]==='A'?'B'+signature.slice(1):'A'+signature.slice(1);
  for(const token of [body+'.'+wrongSignature,body,original.inner,cursor+'.extra'])noCandidateList(f,()=>f.pending('cos-b',{family:'messages',limit:1,cursor:token}));
});

test('identical receiver and company labels in another root cannot reuse an intake cursor',t=>{
  const f=fixture(t),other=fixture(t);cursorCandidates(f,'messages');cursorCandidates(other,'messages');
  assert.equal(f.ledger.company_id,other.ledger.company_id);assert.deepEqual(f.get('principals','cos-b'),other.get('principals','cos-b'));
  const cursor=f.pending('cos-b',{family:'messages',limit:1}).next_cursor;assert(cursor);
  noCandidateList(other,()=>other.pending('cos-b',{family:'messages',limit:1,cursor}));
  assert.doesNotThrow(()=>other.pending('cos-b',{family:'messages',limit:1}));
});

test('empty filtered incoming-message pages keep a valid continuation and do not use a sender filter',t=>{
  const f=fixture(t),operations=Array.from({length:4},(_,n)=>`incoming-page-${n}`).sort((a,b)=>peerDigest(['messages','cos-a',a]).localeCompare(peerDigest(['messages','cos-a',b])));
  const messages=operations.map((operation_id,n)=>f.exec('cos-a','message/send',{operation_id,grant_id:'handoff-grant-cos-a',scope:'alpha',to_principal_id:n===0?'cos-a':'cos-b',content:`Fictional ordered incoming message ${n}.`}));
  const before=logicalSQLState(f),first=f.pending('cos-b',{family:'messages',limit:1});
  assert.deepEqual(first.items,[]);assert.equal(first.scanned_count,1);assert.equal(first.total_candidates,4);assert.equal(first.complete,false);assert(first.next_cursor);
  const seen=[];let cursor=first.next_cursor,scanned=first.scanned_count;
  for(;;){const page=f.pending('cos-b',{family:'messages',limit:2,cursor});scanned+=page.scanned_count;seen.push(...page.items.map(item=>item.id));if(page.complete){assert.equal(page.next_cursor,null);break;}cursor=page.next_cursor;}
  assert.equal(scanned,4);assert.deepEqual(seen.sort(),messages.slice(1).map(row=>row.id).sort());assert.deepEqual(logicalSQLState(f),before);
});

test('intake preserves the inner P1 generation guard after the outer binding validates',t=>{
  const f=fixture(t);cursorCandidates(f,'messages');const page=f.pending('cos-b',{family:'messages',limit:1});assert(page.next_cursor);
  f.exec('cos-a','message/send',{grant_id:'handoff-grant-cos-a',scope:'alpha',to_principal_id:'cos-b',content:'A later source message invalidates the P1 generation.'});
  unchanged(f,()=>f.pending('cos-b',{family:'messages',limit:1,cursor:page.next_cursor}),error=>error.code===undefined&&/Stale or mismatched peer cursor/.test(error.message));
});

test('intake continuation survives a full temporary database reopen in the same source process',t=>{
  const f=peerFixture();let ledger=f.ledger;
  t.after(()=>{ledger.close();fs.rmSync(f.root,{recursive:true,force:true});});
  model.execute(ledger,actor('founder'),'grant/create',{operation_id:'reopen-grant',grant_id:'reopen-message-grant',to_principal_id:'cos-a',scope:'alpha',actions:['message/send'],resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional cold-reopen source fixture.'});
  const bind=who=>{const p=ledger.read(tx=>tx.get('principals',who));return model.bindPeerPrincipal(ledger,{principal_id:who,generation:p.value.generation,native_id:p.value.native_id});};
  const sender=bind('cos-a'),messages=Array.from({length:3},(_,n)=>sender.execute('message/send',{operation_id:`reopen-message-${n}`,grant_id:'reopen-message-grant',scope:'alpha',to_principal_id:'cos-b',content:`Fictional cold-reopen message ${n}.`}));
  const first=bind('cos-b').inspect('handoff/pending',{family:'messages',limit:1});assert(first.next_cursor);ledger.close();ledger=new PeerLedger(f.root);
  const next=bind('cos-b').inspect('handoff/pending',{family:'messages',limit:50,cursor:first.next_cursor});
  assert.equal(next.complete,true);assert.equal(next.total_candidates,3);assert.equal(next.scanned_count,2);
  assert.deepEqual([...first.items,...next.items].map(item=>item.id).sort(),messages.map(row=>row.id).sort());
});

test('a fresh source-module cursor key requires an explicit first-page restart',async t=>{
  const f=fixture(t);cursorCandidates(f,'messages');const cursor=f.pending('cos-b',{family:'messages',limit:1}).next_cursor;assert(cursor);
  const fresh=await import('../plugins/soloco/runtime/peers/handoff.mjs?fresh-cursor-source-key');
  noCandidateList(f,()=>f.ledger.read(tx=>fresh.pendingHandoffs(tx,tx.get('principals','cos-b'),tx.get('control','company'),{family:'messages',limit:1,cursor},{company_id:f.ledger.company_id,root_sha256:model.digest(f.ledger.root)})),error=>error.code==='INTAKE_CURSOR_INVALID'&&/restart from a fresh first page/.test(error.message));
});

for(const kind of ['Error','AggregateError'])test(`handoff preserves original provider ${kind} identity and rolls back every staged row`,t=>{
  const f=fixture(t),handoff=f.send(),cause=Error('Original backend cause.'),member=Error('Original grouped backend member.');
  const failure=Object.assign(kind==='Error'?new Error('Original backend error.',{cause}):new AggregateError([member],'Original backend errors.',{cause}),{code:'SOURCE_CHANGED'});
  const original=f.ledger.query,hook=afterFinalMetadata(f,()=>{throw failure;}),before=logicalSQLState(f);
  try{assert.throws(()=>f.decide(handoff),error=>{assert.equal(error,failure);assert.equal(error.cause,cause);if(kind==='AggregateError')assert.equal(error.errors[0],member);return true;});}
  finally{hook.restore();assert.equal(f.ledger.query,original);}
  assert.equal(hook.hits,1);assert.deepEqual(logicalSQLState(f),before);assert.equal(f.pending().items[0].id,handoff.id);
});

for(const action of ['handoff/send','handoff/accept'])test(`${action} honors grant expiry after actual final metadata SQL and before physical COMMIT`,t=>{
  const f=fixture(t),handoff=action==='handoff/accept'?f.send():null,who=handoff?'cos-b':'cos-a';
  const before=logicalSQLState(f),expires=Date.parse(f.get('grants',`handoff-grant-${who}`).value.expires_at),boundary=f.ledger.db.exec,seen=[];
  f.ledger.db.exec=function(sql){seen.push(sql);return Reflect.apply(boundary,this,[sql]);};
  const hook=afterFinalMetadata(f,()=>{f.clock=expires;});
  try{assert.throws(()=>handoff?f.decide(handoff):f.send(),code('TASK_EFFECT_EXPIRED'));}
  finally{hook.restore();f.ledger.db.exec=boundary;}
  assert.equal(hook.hits,1);assert(seen.some(sql=>/^ROLLBACK\b/.test(sql)));assert(!seen.some(sql=>/^COMMIT\b/.test(sql)));
  assert.deepEqual(logicalSQLState(f),before);
});

for(const action of ['handoff/send','handoff/accept'])test(`${action} seals public writes and poisons even a caught late mutation`,t=>{
  const f=fixture(t),handoff=action==='handoff/accept'?f.send():null,before=logicalSQLState(f);let caught;
  const hook=afterOwnedCallback(f,action,tx=>{
    try{const receiver=tx.get('principals','cos-b');tx.put('principals','cos-b',{...receiver.value,native_id:'late-successor'},receiver.revision);}
    catch(error){caught=error;}
  });
  try{assert.throws(()=>handoff?f.decide(handoff):f.send(),code('AUTHORITY_CHANGED'));}
  finally{hook.restore();}
  assert.equal(hook.hits,1);assert.equal(caught?.code,'AUTHORITY_CHANGED');assert.deepEqual(logicalSQLState(f),before);
});

test('production operator cannot impersonate a peer receiver but can decide a handoff addressed to the actual founder',t=>{
  const f=fixture(t),facade=model.bindPeerProductionScheduler(f.ledger),peerHandoff=f.send();
  unchanged(f,()=>facade.execute(f.ledger,actor('cos-b'),'handoff/accept',f.decisionArgs(peerHandoff)),error=>['FOUNDER_REQUIRED','PRODUCTION_ACTION_HELD'].includes(error.code));
  unchanged(f,()=>facade.execute(f.ledger,actor('founder'),'handoff/accept',f.decisionArgs(peerHandoff)),'HANDOFF_RECEIVER');
  const founderHandoff=f.send({to_principal_id:'founder'}),args=f.decisionArgs(founderHandoff);delete args.grant_id;
  const decision=facade.execute(f.ledger,actor('founder'),'handoff/accept',args);assert.equal(decision.value.status,'accepted');assert.equal(decision.value.principal_id,'founder');
  assert.deepEqual(f.get('work_items',founderHandoff.id),founderHandoff);
});

test('production founder sending is source-attributed and owner replacement fences even exact replay',t=>{
  const f=fixture(t),facade=model.bindPeerProductionScheduler(f.ledger),args=f.sendArgs({operation_id:'production-founder-send'});delete args.grant_id;
  const handoff=facade.execute(f.ledger,actor('founder'),'handoff/send',args);
  assert.deepEqual(handoff.value.sender,reference('principals',f.get('principals','founder')));
  assert.equal(f.pending().items[0].id,handoff.id);
  f.corrupt('principals','founder',value=>({...value,legacy_owner:{...value.legacy_owner,epoch:2}}));
  unchanged(f,()=>facade.execute(f.ledger,actor('founder'),'handoff/send',args),'PRODUCTION_OWNER_CHANGED');
  assert.deepEqual(f.get('work_items',handoff.id),handoff);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,FAMILIES} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {bindPeerProductionScheduler,createRuntimeObserver,digest,execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {peerTaskEffectsFixture} from './peer-task-effects-fixture.mjs';

// Real isolated SQLite proposals, task admissions and protected observer
// mechanics. Every native identity/process/observation is explicitly SYNTHETIC;
// these tests establish no native qualification or receiver acceptance.
const actor=principal_id=>({principal_id});
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const code=expected=>error=>error?.code===expected;
const codes=(...expected)=>error=>expected.includes(error?.code);

function sqlState(f){
  const tables=f.ledger.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({name})=>[name,f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>JSON.parse(JSON.stringify(row))).sort((a,b)=>canonical(a).localeCompare(canonical(b)))]));
}
function rejectedUnchanged(f,operation,predicate){const before=sqlState(f);assert.throws(operation,predicate);assert.deepEqual(sqlState(f),before);}
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
function afterPublicationStaging(f,change){
  const original=f.ledger.guardedWrite;let hits=0;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){
    return Reflect.apply(original,this,[type,principal,tx=>{
      const result=callback(tx);
      if(type==='home/publish'){
        assert.equal(tx.get('homes',result.home.id).sha256,result.home.sha256);
        assert.equal(tx.get('work_items',result.publication.id).sha256,result.publication.sha256);
        hits++;change(tx,result);
      }
      return result;
    },terminal]);
  };
  return {get hits(){return hits;},restore:()=>{f.ledger.guardedWrite=original;}};
}
function fixture(t,{maxCalls=100,grantExpirations={}}={}){
  const f=peerFixture({principals:{founder:{legacy_owner:{host:'codex',session_id:'SYNTHETIC-founder-home-publication',epoch:1}}},
    control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:maxCalls}}});
  t.after(()=>f.close());let n=0;
  f.op=prefix=>`${prefix}-${++n}`;
  f.get=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
  f.rows=(family,filters={})=>f.ledger.read(tx=>{
    const values=[];let cursor;
    for(;;){const page=tx.list(family,{...filters,limit:100,...(cursor?{cursor}:{})});values.push(...page.items);if(page.complete)return values;cursor=page.next_cursor;assert.ok(cursor);}
  });
  f.seed=(family,id,value)=>f.ledger.write('SYNTHETIC-publication-counterexample','founder',tx=>tx.put(family,id,value,tx.get(family,id)?.revision??0));
  f.run=(who,action,args={})=>execute(f.ledger,actor(who),action,{operation_id:f.op(action),...args});
  for(const who of ['cos-a','cos-b','reviewer'])f.run('founder','grant/create',{grant_id:`g-${who}`,to_principal_id:who,scope:'*',actions:['task/*','home/*','conflict/*','message/*','notice/*'],resources:['home:fact','home:other'],max_model_calls:maxCalls,expires_at:grantExpirations[who]??new Date(Date.now()+3600000).toISOString(),source_instruction:'SYNTHETIC bounded source fixture authority.'});
  f.production=bindPeerProductionScheduler(f.ledger);f.observer=createRuntimeObserver(f.ledger);
  f.propose=(args={})=>f.run('cos-a','home/propose',{grant_id:'g-cos-a',scope:'alpha',home_id:'fact',expected_revision:0,content:{text:'SYNTHETIC reviewed home content.',uncertainty:'Source-only evidence.'},...args});
  f.review=(proposal,{verdict='Pass',who='cos-b',scope=proposal.value.scope}={})=>{
    const task=f.run(who,'task/submit',{grant_id:`g-${who}`,scope,role:'qa',stage:'review',instructions:'Review complete exact SYNTHETIC source evidence.',acceptance:'Preserve exact subject, blockers and independence.',review_of:ref('proposals',proposal)});
    f.run(who,'task/claim',{task_id:task.id});
    const admitted=f.run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
    const output=canonical({review:{subject:ref('proposals',proposal),verdict,reason:'SYNTHETIC protected source review; no native qualification.',blockers:verdict==='Pass'?[]:['Retained SYNTHETIC source finding.']}});
    const finished=f.observer.record('task/finish',{operation_id:f.op('finish'),task_id:task.id,attempt_id:admitted.task.value.attempt.id,output,native_id:`SYNTHETIC-publication-review-${task.id}`,termination_confirmed:true,observed_process:{pid:16100+n,started_at:admitted.task.value.attempt.admitted_at,close_observed:true}});
    assert.equal(finished.accepted,true);assert.ok(finished.review);return {admitted,finished,output};
  };
  f.prepare=()=>{const proposal=f.propose(),produced=f.review(proposal);return {proposal,review:produced.finished.review,produced};};
  f.request=(prepared,args={})=>({operation_id:f.op('founder-publish'),proposal_ref:ref('proposals',prepared.proposal),review_ref:ref('reviews',prepared.review),source_instruction:'SYNTHETIC actual founder publishes this exact independently reviewed logical home.',...args});
  f.publish=(request,who='founder')=>f.production.execute(f.ledger,actor(who),'home/publish',request);
  return f;
}

test('founder publishes an exact protected-reviewed home at exhausted model capacity without charging or accepting intake',t=>{
  const f=fixture(t,{maxCalls:1}),prepared=f.prepare(),request=f.request(prepared);
  assert.equal(f.get('control','usage').value.model_calls,1);assert.equal(f.get('grants','g-cos-b').value.used_model_calls,1);
  const before=Object.fromEntries(FAMILIES.map(family=>[family,f.rows(family)])),result=f.publish(request);
  assert.deepEqual(Object.keys(result).sort(),['home','publication']);
  const home=result.home;assert.deepEqual(f.get('homes',home.id),home);assert.equal(home.value.status,'current');assert.equal(home.value.principal_id,'founder');
  assert.deepEqual(home.value.content,prepared.proposal.value.content);assert.deepEqual(home.value.dependencies,prepared.proposal.value.dependencies);
  assert.deepEqual(home.value.proposal,request.proposal_ref);assert.deepEqual(home.value.review,request.review_ref);assert.equal(home.value.previous,null);
  assert.deepEqual(home.value.scope_qualification,{protocol:'peer-home-scope-v1',home_binding_sha256:digest({id:home.id,scope:home.value.scope,content:home.value.content,dependencies:home.value.dependencies}),proposal:request.proposal_ref,review:request.review_ref});
  assert.deepEqual(f.get('work_items',result.publication.id),result.publication);assert.equal(result.publication.revision,1);
  const founder=f.get('principals','founder');
  assert.deepEqual(result.publication.value,{kind:'founder_home_publication_v1',status:'recorded',scope:home.value.scope,principal_id:'founder',home:ref('homes',home),proposal:request.proposal_ref,review:request.review_ref,
    operator:ref('principals',founder),production_authority:{protocol:'peer-production-authority-v1',company_id:f.ledger.company_id,root_sha256:digest(f.ledger.root),founder:ref('principals',founder),legacy_owner:founder.value.legacy_owner},source_instruction:request.source_instruction,at:result.publication.value.at});
  assert.equal(typeof result.publication.value.at,'string');assert(Number.isFinite(Date.parse(result.publication.value.at)));
  assert.equal(f.rows('work_items').length,before.work_items.length+1);assert.equal(f.rows('commands').length,before.commands.length+1);
  const command=f.rows('commands').find(row=>row.value.operation_id===request.operation_id);
  assert.equal(command.value.principal_id,'founder');assert.equal(command.value.action,'home/publish');assert.deepEqual(command.value.result,result);
  for(const family of FAMILIES.filter(name=>!['homes','work_items','commands'].includes(name)))assert.deepEqual(f.rows(family),before[family],family+' remains unchanged by software publication');
  for(const field of ['receiver_acceptance','receiver_accepted','qa_accepted','native_qualified'])assert([undefined,null,false].includes(result.publication.value[field]));
});

test('legacy generic home publication still accepts IDs and returns its original qualified home shape',t=>{
  const f=fixture(t),prepared=f.prepare(),home=f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:prepared.proposal.id,review_id:prepared.review.id});
  assert.equal(home.value.status,'current');assert.deepEqual(home.value.content,prepared.proposal.value.content);assert.equal(Object.hasOwn(home,'publication'),false);
  assert.equal(f.rows('work_items').length,0);
});

test('generic exact-reference fields require the private production publication boundary',t=>{
  const f=fixture(t),request=f.request(f.prepare());
  rejectedUnchanged(f,()=>execute(f.ledger,actor('founder'),'home/publish',request),codes('INVALID_INPUT','PRODUCTION_ACTION_HELD','PRODUCTION_OWNER_CHANGED','FOUNDER_PUBLICATION_REQUIRED'));
  assert.equal(f.get('homes','fact'),null);assert.equal(f.rows('work_items').length,0);
  assert.equal(f.rows('commands').some(row=>row.value.operation_id===request.operation_id),false);
});

test('production replay cannot return a generic exact-reference receipt as its audit wrapper',t=>{
  const f=fixture(t),request=f.request(f.prepare());let generic,denial;
  try{generic=execute(f.ledger,actor('founder'),'home/publish',request);}catch(error){denial=error;}
  if(denial)assert(codes('INVALID_INPUT','PRODUCTION_ACTION_HELD','PRODUCTION_OWNER_CHANGED','FOUNDER_PUBLICATION_REQUIRED')(denial));
  else assert.equal(generic?.value?.status,'current','the pre-fix producer creates an ordinary raw home receipt');
  const before=sqlState(f);let result,replayFailure;
  try{result=f.publish(request);}catch(error){replayFailure=error;}
  if(replayFailure){
    assert.equal(denial,undefined,'denying a generic attempt must leave a fresh valid production request usable');
    assert(codes('REPLAY_MISMATCH','PRODUCTION_ACTION_HELD','PRODUCTION_OWNER_CHANGED','FOUNDER_PUBLICATION_REQUIRED','PUBLICATION_PRODUCER_REQUIRED')(replayFailure));
    assert.deepEqual(sqlState(f),before);
  }else{
    assert.deepEqual(Object.keys(result).sort(),['home','publication'],'the protected boundary never reports a raw generic receipt as an audited founder publication');
    assert.deepEqual(f.get('work_items',result.publication.id),result.publication);
    assert.deepEqual(result.publication.value.home,ref('homes',result.home));
    assert.deepEqual(result.publication.value.proposal,request.proposal_ref);assert.deepEqual(result.publication.value.review,request.review_ref);
  }
});

test('legacy ID operation cannot be replayed through the exact-reference production boundary',t=>{
  const f=fixture(t),prepared=f.prepare(),request=f.request(prepared);
  const generic=execute(f.ledger,actor('founder'),'home/publish',{operation_id:request.operation_id,proposal_id:prepared.proposal.id,review_id:prepared.review.id});
  assert.equal(generic.value.status,'current');assert.equal(f.rows('work_items').length,0);
  rejectedUnchanged(f,()=>f.publish(request),code('REPLAY_MISMATCH'));
});

test('an actual task client retains its closed action set for founder publication',t=>{
  const f=peerTaskEffectsFixture(t),admitted=f.start(),before=sqlState(f);
  assert.throws(()=>admitted.client.execute('home/publish',{operation_id:'SYNTHETIC-task-cannot-publish',proposal_ref:{family:'proposals',id:'p',revision:1,sha256:'0'.repeat(64)},review_ref:{family:'reviews',id:'r',revision:1,sha256:'0'.repeat(64)},source_instruction:'No task-bound capability can become founder publication.'}),code('TASK_EFFECT_ACTION_HELD'));
  assert.deepEqual(sqlState(f),before);
});

test('nonfounder production callers are denied before any cached command lookup',t=>{
  const f=fixture(t),request=f.request(f.prepare());f.publish(request);
  const original=f.ledger.query;let reads=0;
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='get')return(...values)=>{if(values[0]==='commands')reads++;return target.get(...values);};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  try{for(const who of ['cos-a','scheduler','publisher'])rejectedUnchanged(f,()=>f.publish(request,who),code('FOUNDER_REQUIRED'));}
  finally{f.ledger.query=original;}
  assert.equal(reads,0);
});

test('foreign ledger identity and caller authority aliases cannot enter founder publication',t=>{
  const f=fixture(t),request=f.request(f.prepare());
  for(const foreign of [{...f.ledger},new Proxy(f.ledger,{})])rejectedUnchanged(f,()=>f.production.execute(foreign,actor('founder'),'home/publish',request),code('PRODUCTION_OWNER_CHANGED'));
  for(const field of ['proposal_id','review_id','grant_id','scope','content','receiver_accepted','production_authority','actor','principal_id'])
    rejectedUnchanged(f,()=>f.publish({...request,[field]:'SYNTHETIC-forged'}),codes('INVALID_INPUT','ACTOR_ARGUMENT'));
});

for(const field of ['proposal_ref','review_ref'])test('founder publication requires an exact current '+field,t=>{
  const f=fixture(t),request=f.request(f.prepare());
  const missing={...request};delete missing[field];rejectedUnchanged(f,()=>f.publish(missing),codes('INVALID_INPUT','SOURCE_INVALID'));
  rejectedUnchanged(f,()=>f.publish({...request,[field]:{...request[field],sha256:'0'.repeat(64)}}),code('SOURCE_CHANGED'));
  rejectedUnchanged(f,()=>f.publish({...request,[field]:{...request[field],revision:request[field].revision+1}}),code('SOURCE_CHANGED'));
  rejectedUnchanged(f,()=>f.publish({...request,[field]:{...request[field],family:'homes'}}),codes('INVALID_INPUT','SOURCE_INVALID','PROPOSAL_INVALID','REVIEW_REQUIRED'));
});

test('an exact but manually forged Pass supplies no protected producing task or observation',t=>{
  const f=fixture(t),prepared=f.prepare();
  const forged=f.seed('reviews','SYNTHETIC-manual-pass',{status:'accepted',scope:'alpha',subject:ref('proposals',prepared.proposal),verdict:'Pass',blockers:[],reviewer_principal_id:'cos-b',termination_confirmed:true,proof:{protocol:'peer-native-review-v1'}});
  rejectedUnchanged(f,()=>f.publish(f.request({...prepared,review:forged})),code('REVIEW_REQUIRED'));
});

test('an exact protected Pass for a different proposal cannot authorize this publication',t=>{
  const f=fixture(t),proposal=f.propose(),other=f.propose({home_id:'other'}),review=f.review(other).finished.review;
  rejectedUnchanged(f,()=>f.publish(f.request({proposal,review})),code('REVIEW_REQUIRED'));
});

test('a genuine Pass loses publication eligibility when the author shares its observed reviewer native identity',t=>{
  const f=fixture(t),prepared=f.prepare(),author=f.get('principals','cos-a');
  f.seed('principals',author.id,{...author.value,native_id:prepared.review.value.native_id});
  rejectedUnchanged(f,()=>f.publish(f.request(prepared)),codes('REVIEW_REQUIRED','LINEAGE_REQUIRED','REVIEW_INDEPENDENCE'));
});

for(const verdict of ['Fail','Blocked'])test('cross-scope protected '+verdict+' remains a veto after a later independent Pass',t=>{
  const f=fixture(t),proposal=f.propose(),negative=f.review(proposal,{verdict,scope:'gamma'}),positive=f.review(proposal,{who:'reviewer'});
  rejectedUnchanged(f,()=>f.publish(f.request({proposal,review:positive.finished.review})),code('REVIEW_HELD'));
  assert.deepEqual(f.get('reviews',negative.finished.review.id),negative.finished.review);
});

test('current unresolved conflict blocks founder publication without recording an audit receipt',t=>{
  const f=fixture(t),prepared=f.prepare(),notice=f.run('cos-a','notice/create',{grant_id:'g-cos-a',scope:'alpha',content:'SYNTHETIC conflicting condition.'});
  f.run('cos-a','conflict/create',{grant_id:'g-cos-a',scope:'alpha',input_refs:[ref('proposals',prepared.proposal),ref('notices',notice)],summary:'SYNTHETIC current dispute.',clearing_condition:'Independent disposition with complete evidence.'});
  rejectedUnchanged(f,()=>f.publish(f.request(prepared)),code('CONTEXT_CONFLICT'));
});

test('current reviewer grant revocation and applicable source changes retain their publication Holds',t=>{
  for(const change of ['reviewer-grant','required-notice']){
    const f=fixture(t),prepared=f.prepare();
    if(change==='reviewer-grant')f.run('founder','grant/revoke',{grant_id:'g-cos-b'});
    else f.run('cos-a','notice/create',{grant_id:'g-cos-a',scope:'alpha',content:'SYNTHETIC required condition committed after review.'});
    rejectedUnchanged(f,()=>f.publish(f.request(prepared)),change==='reviewer-grant'?codes('GRANT_INVALID','REVIEW_REQUIRED'):code('CONTEXT_CHANGED'));
  }
});

test('a changed base home is not silently substituted beneath the exact founder request',t=>{
  const f=fixture(t),prepared=f.prepare(),request=f.request(prepared);
  f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:prepared.proposal.id,review_id:prepared.review.id});
  rejectedUnchanged(f,()=>f.publish(request),code('HOME_CHANGED'));
});

test('exact publication replay returns the original wrapper after later source and reviewer grant changes',t=>{
  const f=fixture(t),request=f.request(f.prepare()),result=f.publish(request);
  f.run('founder','grant/revoke',{grant_id:'g-cos-b'});
  f.run('cos-a','notice/create',{grant_id:'g-cos-a',scope:'alpha',content:'SYNTHETIC later condition does not republish old work.'});
  const before=sqlState(f);assert.deepEqual(f.publish(request),result);assert.deepEqual(sqlState(f),before);
  rejectedUnchanged(f,()=>f.publish({...request,source_instruction:'Different source instruction on the same operation.'}),code('REPLAY_MISMATCH'));
});

test('replaced production owner fences original publication replay before it can return success',t=>{
  const f=fixture(t),request=f.request(f.prepare());f.publish(request);
  const founder=f.get('principals','founder');f.seed('principals',founder.id,{...founder.value,legacy_owner:{...founder.value.legacy_owner,epoch:2}});
  rejectedUnchanged(f,()=>f.publish(request),code('PRODUCTION_OWNER_CHANGED'));
});

for(const atExpiry of [false,true])test('physical founder publication '+(atExpiry?'at reviewer grant expiry rolls back all staged output':'before reviewer grant expiry succeeds without a new model call'),t=>{
  const original=Date.now;let clock=original();Date.now=()=>clock;let hook;
  try{
    const expires=clock+1000,f=fixture(t,{grantExpirations:{'cos-b':new Date(expires).toISOString()}}),request=f.request(f.prepare()),before=sqlState(f),used=f.get('control','usage');
    hook=afterFinalMetadata(f,()=>{clock=expires-(atExpiry?0:1);});
    if(atExpiry){assert.throws(()=>f.publish(request),code('TASK_EFFECT_EXPIRED'));assert.deepEqual(sqlState(f),before);}
    else{const result=f.publish(request);assert.equal(result.home.value.status,'current');assert.deepEqual(f.get('control','usage'),used);}
    assert.equal(hook.hits,1,'actual final metadata SQL completes before the clock crosses the grant boundary');
  }finally{hook?.restore();Date.now=original;}
});

test('an unused proposal-author grant expiry is not added as current founder publication authority',t=>{
  const original=Date.now;let clock=original();Date.now=()=>clock;let hook;
  try{
    const expires=clock+1000,f=fixture(t,{grantExpirations:{'cos-a':new Date(expires).toISOString()}}),request=f.request(f.prepare()),used=f.get('control','usage');
    hook=afterFinalMetadata(f,()=>{clock=expires;});
    assert.equal(f.publish(request).home.value.status,'current');assert.equal(hook.hits,1);assert.deepEqual(f.get('control','usage'),used);
  }finally{hook?.restore();Date.now=original;}
});

for(const addition of ['reviewer grant revocation','required source notice','negative review'])test('caught postplanner '+addition+' write still poisons founder publication and audit staging',t=>{
  const f=fixture(t),prepared=f.prepare(),request=f.request(prepared),before=sqlState(f);let attempted;
  const hook=afterPublicationStaging(f,tx=>{
    try{
      if(addition==='reviewer grant revocation'){
        const grant=tx.get('grants','g-cos-b');tx.put('grants',grant.id,{...grant.value,status:'revoked',generation:grant.value.generation+1},grant.revision);
      }else if(addition==='required source notice'){
        tx.put('notices','SYNTHETIC-postplanner-publication-notice',{status:'pending',scope:'alpha',principal_id:'cos-a',content:'SYNTHETIC attempted late required condition.',kind:'must_know'},0);
      }else{
        // Mutation attempt only: this never manufactures a positive review
        // producer. Genuine cross-scope vetoes are exercised above.
        tx.put('reviews','SYNTHETIC-postplanner-negative',{...prepared.review.value,verdict:'Blocked',blockers:['SYNTHETIC attempted late counterevidence.']},0);
      }
    }catch(error){attempted=error;}
  });
  try{assert.throws(()=>f.publish(request),code('AUTHORITY_CHANGED'));}
  finally{hook.restore();}
  assert.equal(hook.hits,1);assert.equal(attempted?.code,'AUTHORITY_CHANGED');
  assert.deepEqual(sqlState(f),before,'caught late writes cannot commit a home, publication receipt, command, history, event or outbox');
});

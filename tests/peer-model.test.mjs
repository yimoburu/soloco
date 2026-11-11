import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest,FAMILIES,PeerLedger} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute,inspect,buildContext,validateContext,canonicalResources,resourceOverlap,digest,createRuntimeObserver} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';

// All behavior tests use the immutable accepted P1 SQLite implementation.
// The observer below is a synthetic trusted-host fixture, not native evidence.
const actor=principal_id=>({principal_id});
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const code=expected=>e=>e.code===expected;
function rows(ledger,family,filter={}){return ledger.read(tx=>{const result=[];let cursor;for(;;){const p=tx.list(family,{...filter,limit:100,...(cursor?{cursor}:{})});result.push(...p.items);if(p.complete)return result;cursor=p.next_cursor;}});}
function get(f,family,id){return f.ledger.read(tx=>tx.get(family,id));}
function seed(f,family,id,value){return f.ledger.write('fixture.only','founder',tx=>{const old=tx.get(family,id);return tx.put(family,id,value,old?.revision??0);});}
function state(f){return {families:Object.fromEntries(FAMILIES.map(family=>[family,rows(f.ledger,family)])),head:f.ledger.db.prepare('SELECT * FROM peer_meta').all(),events:f.ledger.db.prepare('SELECT * FROM peer_events ORDER BY seq').all(),outbox:f.ledger.db.prepare('SELECT * FROM peer_outbox ORDER BY seq').all(),versions:f.ledger.db.prepare('SELECT * FROM peer_versions ORDER BY family,id,revision').all(),membership:f.ledger.db.prepare('SELECT * FROM peer_membership ORDER BY family,selector').all(),generations:f.ledger.db.prepare('SELECT * FROM peer_generations ORDER BY family').all()};}
function fixture(t,options={}){
  const f=peerFixture(options);t.after(()=>f.close());let n=0;
  f.run=(who,action,args={})=>execute(f.ledger,actor(who),action,{operation_id:`op-${++n}`,...args});
  f.observer=createRuntimeObserver(f.ledger);
  f.observe=(action,args={})=>f.observer.record(action,{operation_id:`ob-${++n}`,...args});
  seed(f,'control','resources',{worktrees:[{id:'tree1',repository:'owner/repo',aliases:['alias1']},{id:'tree2',repository:'OWNER/REPO'}]});
  for(const id of ['cos-a','cos-b','reviewer'])f.run('founder','grant/create',{grant_id:`g-${id}`,to_principal_id:id,scope:'*',actions:['task/*','home/*','conflict/*','message/*'],resources:['repo:owner/repo','home:fact','home:other','home:dependency'],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional bounded fixture authority.'});
  f.submit=(who='cos-a',args={})=>f.run(who,'task/submit',{grant_id:`g-${who}`,scope:'alpha',role:'engineer',instructions:'Inspect supplied fictional evidence.',acceptance:'Return an attributable bounded result.',...args});
  f.claim=(task,who=task.value.owner_principal_id)=>f.run(who,'task/claim',{task_id:task.id});
  f.admit=(task,args={})=>f.run('scheduler','task/admit',{...(task?{task_id:task.id}:{}),...args});
  f.start=(who='cos-a',args={})=>{const task=f.submit(who,args);f.claim(task);const admitted=f.admit(task);assert.equal(admitted.admitted,true);return admitted;};
  f.process=(admitted,closed=true)=>({pid:123,started_at:admitted.task.value.attempt.admitted_at,close_observed:closed});
  f.finish=(admitted,args={})=>f.observe('task/finish',{task_id:admitted.task.id,attempt_id:admitted.task.value.attempt.id,output:'Observed fictional output.',native_id:`observed-${admitted.task.id}`,termination_confirmed:true,observed_process:f.process(admitted),...args});
  f.propose=(who='cos-a',args={})=>f.run(who,'home/propose',{grant_id:`g-${who}`,scope:'alpha',home_id:'fact',expected_revision:0,content:'Proposed fictional fact.',...args});
  f.review=(proposal,verdict='Pass',args={})=>{const admitted=f.start('cos-b',{role:'qa',stage:'review',scope:proposal.value.scope,review_of:ref('proposals',proposal)}),output=canonical({review:{subject:ref('proposals',proposal),verdict,reason:'Mechanical fixture review only.',blockers:verdict==='Pass'?[]:['Retained negative finding.']}});return {admitted,output,finished:f.finish(admitted,{output,...args})};};
  return f;
}

test('v3 creation DATA without original interpreter support holds before task admission puts or model charge',t=>{
  const f=fixture(t),task=f.submit();f.claim(task);
  const owner=get(f,'principals','cos-a');
  // This deliberately incomplete source-only trigger is NOT a genuine sealed
  // thread. It must never turn serialized profile DATA into runtime support.
  seed(f,'work_items','p8e:codex-thread:'+peerDigest(owner.value.native_id),{protocol:'p8e-stable-five-v3-context-contract-v1',evidence_scope:'SYNTHETIC_NEGATIVE_CONTROL_ONLY'});
  const before=state(f);let puts=0;const write=f.ledger.write;
  f.ledger.write=function(type,principal,callback){return write.call(this,type,principal,tx=>callback(type==='task/admit'?Object.freeze({...tx,put(...args){puts++;return tx.put(...args);}}):tx));};
  try{assert.throws(()=>f.admit(task),code('CONTEXT_INTERPRETER_UNAVAILABLE'));}finally{f.ledger.write=write;}
  assert.equal(puts,0);assert.deepEqual(state(f),before);
  assert.equal(get(f,'control','usage'),null);assert.equal(get(f,'tasks',task.id).value.attempt,null);
});

test('strict canonical request semantics preserve own __proto__, Unicode and raw text hashes',t=>{
  const f=fixture(t),content=JSON.parse('{"__proto__":{"kept":true},"unicode":"雪😀","nested":{"unknown":{"x":1}}}');
  const p=f.propose('cos-a',{content});assert.equal(Object.hasOwn(p.value.content,'__proto__'),true);assert.equal(p.value.content.__proto__.kept,true);assert.equal(p.sha256,peerDigest(p.value));assert.equal(digest('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');assert.equal(digest(content),peerDigest(content));
  const bad=[undefined,NaN,Infinity,-0,()=>{},Symbol('x'),new Date(),Object.assign(Object.create({inherited:true}),{x:1}),[,1]];
  for(const value of bad){const before=state(f);assert.throws(()=>f.run('cos-a','home/propose',{grant_id:'g-cos-a',scope:'alpha',home_id:'other',content:{value}}));assert.deepEqual(state(f),before);}
  const getter={};Object.defineProperty(getter,'x',{enumerable:true,get(){throw Error('getter must not execute');}});assert.throws(()=>f.propose('cos-a',{content:getter}),/data properties/);
  const symbol={};symbol[Symbol('hidden')]=1;assert.throws(()=>f.propose('cos-a',{content:symbol}),/symbol/);
});

test('actor-namespaced replay is exact and rejects forged authority fields',t=>{
  const f=fixture(t),args={operation_id:'shared',grant_id:'g-cos-a',scope:'alpha',role:'engineer',instructions:'Bounded work.',acceptance:'Evidence.'};
  const a=f.run('cos-a','task/submit',args),before=state(f),again=f.run('cos-a','task/submit',args);assert.deepEqual(again,a);assert.deepEqual(state(f),before);
  const b=f.run('cos-b','task/submit',{...args,grant_id:'g-cos-b'});assert.notEqual(a.id,b.id);
  assert.throws(()=>f.run('cos-a','task/submit',{...args,instructions:'Changed'}),code('REPLAY_MISMATCH'));
  for(const key of ['actor','principal_id','session_id','runtime_observer','observer_capability'])assert.throws(()=>f.run('cos-a','task/submit',{...args,operation_id:`forge-${key}`,[key]:'founder'}),code('ACTOR_ARGUMENT'));
  assert.throws(()=>execute(f.ledger,{principal_id:'cos-a',session_id:'founder'},'task/submit',args),code('AUTHENTICATION_REQUIRED'));
  assert.throws(()=>execute(f.ledger,actor('missing'),'task/submit',args),code('PRINCIPAL_INACTIVE'));
});

test('SQLite nonempty resource claim, admission, process and finish avoid list-after-write',t=>{
  const f=fixture(t),a=f.start('cos-a',{resources:['path:alias1:src']});assert.equal(rows(f.ledger,'claims',{status:'held'}).length,1);assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(get(f,'control','usage:cos-a').value.model_calls,1);
  f.observe('task/process',{task_id:a.task.id,attempt_id:a.task.value.attempt.id,observed_process:f.process(a,false)});
  const result=f.finish(a);assert.equal(result.accepted,true);assert.equal(result.task.value.status,'returned');assert.equal(rows(f.ledger,'claims',{status:'held'}).length,0);assert.equal(inspect(f.ledger,actor('scheduler'),'runtime/status').active_slots,0);assert.equal(get(f,'effects',a.task.value.attempt.effect_id).value.status,'succeeded');
  let after=0;for(;;){const page=f.ledger.verify({after,limit:100});if(page.complete)break;after=page.next_cursor;}
});

test('unstarted cancellation releases claims; attempted cancellation retains them',t=>{
  const f=fixture(t),a=f.submit('cos-a',{resources:['path:tree1:src']});f.claim(a);const cancelled=f.run('cos-a','task/cancel',{task_id:a.id,reason:'Cancel before admission.'});assert.equal(cancelled.value.status,'cancelled');assert.equal(rows(f.ledger,'claims',{status:'held'}).length,0);assert.equal(get(f,'control','usage'),null);
  const b=f.start('cos-a',{resources:['path:tree1:src']});f.run('cos-a','task/cancel',{task_id:b.task.id});assert.equal(rows(f.ledger,'claims',{status:'held'}).length,1);assert.equal(inspect(f.ledger,actor('scheduler'),'runtime/status').active_slots,1);assert.throws(()=>f.claim(b.task),code('ATTEMPT_CONSUMED'));
  const result=f.finish(b);assert.equal(result.accepted,false);assert.equal(result.task.value.status,'quarantined');assert.equal(rows(f.ledger,'claims',{status:'held'}).length,0);
});

test('unknown execution and transfer preserve attempts, context, budgets and reservations until protected closure',t=>{
  const f=fixture(t),a=f.start('cos-a',{resources:['path:tree1:src']}),attempt=a.task.value.attempt;
  const finished=f.finish(a,{error:{code:'TIMEOUT',message:'Closure unknown.'},termination_confirmed:false,observed_process:f.process(a,false)});assert.equal(finished.task.value.status,'unknown');
  const transferred=f.run('cos-a','task/transfer',{task_id:a.task.id,to_principal_id:'cos-b',to_grant_id:'g-cos-b'});assert.deepEqual(transferred.value.attempt,finished.task.value.attempt);assert.deepEqual(transferred.value.attempt.context,attempt.context);assert.equal(transferred.value.definition_sha256,a.task.value.definition_sha256);assert.equal(rows(f.ledger,'claims',{status:'held'})[0].value.principal_id,'cos-b');assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(get(f,'grants','g-cos-a').value.used_model_calls,1);
  assert.equal(inspect(f.ledger,actor('scheduler'),'runtime/status').active_slots,1);assert.throws(()=>f.claim(transferred),code('ATTEMPT_CONSUMED'));
  const competitor=f.submit('cos-a',{resources:['path:alias1:src/file.mjs']});assert.throws(()=>f.claim(competitor),code('RESOURCE_BUSY'));
  assert.throws(()=>f.run('scheduler','task/closure',{task_id:a.task.id,attempt_id:attempt.id,termination_confirmed:true}),code('OBSERVER_REQUIRED'));
  const closed=f.observe('task/closure',{task_id:a.task.id,attempt_id:attempt.id,termination_confirmed:true,observed_process:f.process(a)});assert.equal(closed.value.status,'quarantined');assert.equal(closed.value.result.termination_confirmed,false);assert.equal(get(f,'effects',attempt.effect_id).value.status,'failed');assert.equal(inspect(f.ledger,actor('scheduler'),'runtime/status').active_slots,0);assert.equal(rows(f.ledger,'claims',{status:'held'}).length,0);assert.equal(f.claim(competitor).value.status,'pending');
});

test('late flush failure rolls back task/effect/slot/claim/budget/events and immutable history',t=>{
  const f=fixture(t),task=f.submit('cos-a',{resources:['path:tree1:src']});f.claim(task);const before=state(f);
  f.ledger.db.exec("CREATE TEMP TRIGGER reject_admission BEFORE INSERT ON peer_events WHEN NEW.type='task/admit' BEGIN SELECT RAISE(ABORT,'injected late validation failure'); END");
  assert.throws(()=>f.admit(task),/injected late validation failure/);assert.deepEqual(state(f),before);f.ledger.db.exec('DROP TRIGGER reject_admission');
  const admitted=f.admit(task);assert.equal(admitted.admitted,true);const running=state(f);
  f.ledger.db.exec("CREATE TEMP TRIGGER reject_finish BEFORE INSERT ON peer_events WHEN NEW.type='task/finish' BEGIN SELECT RAISE(ABORT,'injected finish failure'); END");
  assert.throws(()=>f.finish(admitted),/injected finish failure/);assert.deepEqual(state(f),running);f.ledger.db.exec('DROP TRIGGER reject_finish');assert.equal(f.finish(admitted).accepted,true);
});

test('claim validation and context capacity fail without leaked claims or consumed attempts',t=>{
  const f=fixture(t),task=f.submit('cos-a',{resources:['path:tree1:src']});f.claim(task);const c=get(f,'control','company');seed(f,'control','company',{...c.value,policy:{...c.value.policy,max_context_bytes:512}});const before=state(f),result=f.admit(task);assert.equal(result.code,'CONTEXT_CAPACITY');assert.equal(get(f,'tasks',task.id).value.attempt,null);assert.equal(get(f,'control','usage'),null);assert.deepEqual(rows(f.ledger,'claims'),before.families.claims);assert.equal(rows(f.ledger,'effects').length,0);assert.equal(rows(f.ledger,'slots').length,0);
});

test('pause and dispatch admission have ordered atomic boundaries across connections',t=>{
  const f=fixture(t),other=new PeerLedger(f.root);t.after(()=>other.close());const task=f.submit();f.claim(task);
  execute(other,actor('founder'),'company/pause',{operation_id:'other-pause',source_instruction:'Pause before admission.'});assert.equal(f.admit(task).code,'PAUSED');assert.equal(get(f,'tasks',task.id).value.attempt,null);assert.equal(get(f,'control','usage'),null);assert.equal(rows(f.ledger,'effects').length,0);
  f.run('founder','company/resume',{source_instruction:'Resume bounded fixture.'});const admitted=f.admit(task);assert.equal(admitted.admitted,true);
  execute(other,actor('founder'),'company/pause',{operation_id:'other-pause-after',source_instruction:'Pause after admission.'});const result=f.finish(admitted);assert.equal(result.accepted,false);assert.equal(result.task.value.status,'quarantined');assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('revoked, expired, changed policy and resource authority fence admission',t=>{
  const f=fixture(t),task=f.submit();f.claim(task);f.run('founder','grant/revoke',{grant_id:'g-cos-a'});assert.equal(f.admit(task).code,'GRANT_INVALID');assert.equal(get(f,'tasks',task.id).value.attempt,null);
  const b=f.submit('cos-b');f.claim(b);const g=get(f,'grants','g-cos-b');seed(f,'grants',g.id,{...g.value,expires_at:'2000-01-01T00:00:00.000Z'});assert.equal(f.admit(b,{exclude_task_ids:[task.id]}).code,'GRANT_INVALID');
  assert.throws(()=>f.submit('reviewer',{resources:['repo:other/repository']}),code('RESOURCE_AUTHORITY'));
  const c=get(f,'control','company');seed(f,'control','company',{...c.value,policy_generation:c.value.policy_generation+1});assert.throws(()=>f.submit('reviewer'),code('GRANT_INVALID'));assert.equal(get(f,'control','usage'),null);
});

test('resource aliases, parents, branch identity and isolated worktrees retain distinctions',t=>{
  const f=fixture(t),a=f.submit('cos-a',{resources:['path:tree1:src']});f.claim(a);const b=f.submit('cos-b',{resources:['path:alias1:src/file.mjs']});assert.throws(()=>f.claim(b),code('RESOURCE_BUSY'));const separate=f.submit('cos-b',{resources:['path:tree2:src/file.mjs']});assert.equal(f.claim(separate).value.status,'pending');
  f.ledger.read(tx=>{const [one]=canonicalResources(tx,[{kind:'ref',repository:'https://github.com/OWNER/Repo.git',ref:'refs/heads/main'}]),[two]=canonicalResources(tx,['ref:owner/repo:refs/heads/main']);assert(resourceOverlap(one,two));for(const resource of ['path:tree1:src/../escape','path:tree1:src%2ffile','path:missing:src'])assert.throws(()=>canonicalResources(tx,[resource]),code('RESOURCE_INVALID'));});
});

test('three active plus unknown slots prevent a fourth and preserve fair rotation',t=>{
  const f=fixture(t),tasks=[f.submit(),f.submit(),f.submit(),f.submit('cos-b')];for(const task of tasks)f.claim(task);const first=f.admit(),second=f.admit(),third=f.admit();assert.equal(first.task.value.owner_principal_id,'cos-a');assert.equal(second.task.value.owner_principal_id,'cos-b');assert.equal(third.task.value.owner_principal_id,'cos-a');
  f.finish(second,{error:{code:'TIMEOUT'},termination_confirmed:false,observed_process:f.process(second,false)});assert.equal(f.admit().code,'CAPACITY_BUSY');assert.equal(inspect(f.ledger,actor('scheduler'),'runtime/status').active_slots,3);assert.equal(get(f,'control','usage').value.model_calls,3);
});

test('finite principal and grant call budgets are retained after completed work',t=>{
  const f=fixture(t),c=get(f,'control','company');seed(f,'control','company',{...c.value,policy:{...c.value.policy,principal_model_calls:1}});const a=f.start();f.finish(a);const next=f.submit();f.claim(next);assert.equal(f.admit(next).code,'MODEL_BUDGET');assert.equal(get(f,'tasks',next.id).value.attempt,null);assert.equal(get(f,'control','usage').value.model_calls,1);
  const g=get(f,'grants','g-cos-b');seed(f,'grants',g.id,{...g.value,max_model_calls:1});const b=f.start('cos-b');f.finish(b);const b2=f.submit('cos-b');f.claim(b2);assert.equal(f.admit(b2,{exclude_task_ids:[next.id]}).code,'MODEL_BUDGET');
});

test('every active role can raise required notices without grants while paused',t=>{
  const f=fixture(t);f.run('founder','company/pause',{source_instruction:'Pause fixture.'});const first=f.run('publisher','notice/create',{scope:'alpha',kind:'decision_required',content:'A founder decision is required.'});assert.equal(first.value.principal_id,'publisher');
  const expired=get(f,'grants','g-cos-a');seed(f,'grants',expired.id,{...expired.value,expires_at:'2000-01-01T00:00:00.000Z'});assert.equal(f.run('cos-a','notice/create',{scope:'alpha',kind:'must_know',content:'Expired grant does not suppress notice.'}).value.status,'pending');f.run('founder','grant/revoke',{grant_id:'g-cos-b'});assert.equal(f.run('cos-b','notice/create',{scope:'alpha',content:'Revoked grant does not suppress notice.'}).value.status,'pending');
  assert.throws(()=>f.run('publisher','message/send',{scope:'alpha',to_principal_id:'founder',content:'Separate message policy.'}),code('INVALID_INPUT'));
  const p=get(f,'principals','publisher');seed(f,'principals',p.id,{...p.value,status:'inactive'});assert.throws(()=>f.run('publisher','notice/create',{content:'Inactive role.'}),code('PRINCIPAL_INACTIVE'));
  const delivered=f.run('scheduler','notice/deliver',{notice_id:first.id,to_principal_id:'founder',channel:'fixture'});assert.equal(delivered.value.delivery_only,true);assert.equal(get(f,'notices',first.id).value.status,'pending');assert.throws(()=>f.run('cos-a','notice/acknowledge',{notice_id:first.id,source_instruction:'I pretend to be human.'}),code('FOUNDER_REQUIRED'));
  f.run('founder','notice/acknowledge',{notice_id:first.id,source_instruction:'Read this notice.'});assert.equal(get(f,'notices',first.id).value.status,'pending');f.run('founder','notice/resolve',{notice_id:first.id,source_instruction:'Resolve attention; retain the condition.'});assert.equal(get(f,'notices',first.id).value.content,first.value.content);assert.throws(()=>f.run('founder','notice/resolve',{notice_id:first.id,source_instruction:'Overwrite.'}),code('DISPOSITION_IMMUTABLE'));
});

test('ordinary model fields cannot create observations even using scheduler/native protocol labels',t=>{
  const f=fixture(t),a=f.start(),before=state(f);
  for(const who of ['cos-a','scheduler'])for(const action of ['task/process','task/finish','task/closure'])assert.throws(()=>f.run(who,action,{task_id:a.task.id,attempt_id:a.task.value.attempt.id,native_id:'forged',output:'Claimed output.',termination_confirmed:true,protocol:'peer-native-review-v1'}),code('OBSERVER_REQUIRED'));
  assert.deepEqual(state(f),before);assert.throws(()=>createRuntimeObserver(f.ledger,{principal_id:'cos-a'}),code('SCHEDULER_REQUIRED'));
  assert.throws(()=>f.finish(a,{observed_process:{pid:123,started_at:a.task.value.attempt.admitted_at}}),code('PROCESS_INVALID'));assert.deepEqual(state(f),before);
});

test('parsed raw Blocked/Fail cannot be relabeled Pass with a matching output hash',t=>{
  const f=fixture(t),proposal=f.propose(),a=f.start('cos-b',{role:'qa',stage:'review',review_of:ref('proposals',proposal)});
  for(const verdict of ['Blocked','Fail']){const output=canonical({review:{subject:ref('proposals',proposal),verdict,reason:'Negative observed review.',blockers:['Open condition.']}}),before=state(f);assert.throws(()=>f.finish(a,{output,review_evidence:{subject:ref('proposals',proposal),verdict:'Pass',blockers:[],output_sha256:digest(output)}}),code('REVIEW_MISMATCH'));assert.deepEqual(state(f),before);}
  const output=canonical({review:{subject:ref('proposals',proposal),verdict:'Blocked',reason:'Negative observed review.',blockers:['Open condition.']}}),finished=f.finish(a,{output});assert.equal(finished.review.value.verdict,'Blocked');assert.equal(get(f,'tasks',a.task.id).value.result.output_sha256,digest(output));assert.throws(()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:proposal.id,review_id:finished.review.id}),code('REVIEW_REQUIRED'));
});

test('review parser binds exact subject, context, identity and raw output bytes atomically',t=>{
  const f=fixture(t),p=f.propose(),a=f.start('cos-b',{stage:'review',role:'qa',review_of:ref('proposals',p)}),output=canonical({review:{subject:ref('proposals',p),verdict:'Pass',reason:'Mechanical review.',blockers:[]}}),before=state(f);
  assert.throws(()=>f.finish(a,{output,review_evidence:{context_sha256:'forged'}}),code('REVIEW_MISMATCH'));assert.deepEqual(state(f),before);
  assert.throws(()=>f.finish(a,{output,review_evidence:{native_id:'another-native'}}),code('REVIEW_MISMATCH'));assert.deepEqual(state(f),before);
  const wrong=canonical({review:{subject:{...ref('proposals',p),sha256:'0'.repeat(64)},verdict:'Pass',reason:'Wrong subject.',blockers:[]}});assert.throws(()=>f.finish(a,{output:wrong}),code('REVIEW_INVALID'));assert.deepEqual(state(f),before);
  assert.throws(()=>f.finish(a,{output:' '+output}),code('REVIEW_INVALID'));assert.deepEqual(state(f),before);
  const result=f.finish(a,{output,review_evidence:{subject:ref('proposals',p),verdict:'Pass',blockers:[],output_sha256:digest(output),context_sha256:a.context.sha256,native_id:`observed-${a.task.id}`}});assert.equal(result.review.value.proof.protocol,'peer-runtime-observation-v1');
});

test('protected exact independent review permits publication; manually seeded protocol does not',t=>{
  const f=fixture(t),p=f.propose(),manual=seed(f,'reviews','manual',{status:'accepted',scope:'alpha',subject:ref('proposals',p),verdict:'Pass',blockers:[],reviewer_principal_id:'cos-b',termination_confirmed:true,proof:{protocol:'peer-native-review-v1'}});
  assert.throws(()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:manual.id}),code('REVIEW_REQUIRED'));
  const {finished}=f.review(p),home=f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:finished.review.id});assert.equal(home.value.status,'current');assert.equal(home.value.content,p.value.content);
  const task=f.submit('cos-a',{scope:'beta'}),context=f.ledger.read(tx=>buildContext(tx,actor('cos-a'),task));assert(!context.sources.some(s=>s.family==='homes'&&s.id===home.id),'independently qualified foreign home can be omitted');
});

test('review independence checks contributing principal and author principal native identity absent from proposal',t=>{
  const f=fixture(t),p=f.propose();assert.equal(Object.hasOwn(p.value,'native_id'),false);
  const sameAuthor=f.start('cos-a',{role:'qa',stage:'review',review_of:ref('proposals',p)}),output=canonical({review:{subject:ref('proposals',p),verdict:'Pass',reason:'Self review.',blockers:[]}});assert.throws(()=>f.finish(sameAuthor,{output}),code('REVIEW_INDEPENDENCE'));
  const a=f.start('cos-b',{role:'qa',stage:'review',review_of:ref('proposals',p)});assert.throws(()=>f.finish(a,{output,native_id:get(f,'principals','cos-a').value.native_id}),code('REVIEW_INDEPENDENCE'));
});

test('observed contributing native sessions also prevent review through a different principal',t=>{
  const f=fixture(t),production=f.start('cos-a'),produced=f.finish(production,{native_id:'shared-observed-native'}),p=f.propose('cos-a',{input_refs:[ref('tasks',produced.task)]}),a=f.start('cos-b',{role:'qa',stage:'review',review_of:ref('proposals',p)}),output=canonical({review:{subject:ref('proposals',p),verdict:'Pass',reason:'Shared session.',blockers:[]}});
  assert.throws(()=>f.finish(a,{output,native_id:'shared-observed-native'}),code('REVIEW_INDEPENDENCE'));
});

test('global and unknown membership changes quarantine completion and invalidate publication',t=>{
  const f=fixture(t),a=f.start();seed(f,'homes','unknown',{status:'current',scope:'unknown',principal_id:'founder',content:'New mandatory restriction.'});assert.equal(f.ledger.read(tx=>validateContext(tx,a.context)),false);assert.equal(f.finish(a).task.value.status,'quarantined');
  const p=f.propose('cos-a',{home_id:'other'}),review=f.review(p);seed(f,'homes','global',{status:'current',scope:'*',principal_id:'founder',content:'New global condition.'});assert.throws(()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id}),code('CONTEXT_CHANGED'));
});

test('unqualified foreign homes and exact cross-scope dependencies remain compulsory',t=>{
  const f=fixture(t),foreign=seed(f,'homes','foreign',{status:'current',scope:'beta',principal_id:'founder',content:'Unqualified foreign assertion.'}),dependency=seed(f,'homes','dependency',{status:'current',scope:'beta',principal_id:'founder',content:'Dependency v1.'}),local=seed(f,'homes','local',{status:'current',scope:'alpha',principal_id:'cos-a',content:'Local condition.',dependencies:[ref('homes',dependency)]});
  const a=f.start();assert(a.context.sources.some(r=>r.id===foreign.id));assert(a.context.sources.some(r=>r.id===dependency.id));assert.equal(f.ledger.read(tx=>validateContext(tx,a.context)),true);
  const changed=seed(f,'homes',dependency.id,{...dependency.value,content:'Dependency v2.'});assert.notEqual(changed.sha256,dependency.sha256);assert.equal(f.ledger.read(tx=>validateContext(tx,a.context)),false);
  // The current local home still names the old exact dependency. Rebuilding
  // context or proposing unrelated work must hold, not silently refresh it.
  const before=state(f),stale=e=>e.code==='SOURCE_CHANGED'&&e.message==='Exact source changed: homes/dependency';
  assert.throws(()=>f.ledger.read(tx=>buildContext(tx,actor('cos-a'),tx.get('tasks',a.task.id))),stale);assert.deepEqual(state(f),before);
  assert.throws(()=>f.propose('cos-a',{home_id:'other',scope:'beta'}),stale);assert.deepEqual(state(f),before);
  assert.deepEqual(get(f,'homes',local.id),local);assert.deepEqual(get(f,'homes',local.id).value.dependencies,[ref('homes',dependency)]);assert.deepEqual(get(f,'tasks',a.task.id).value.attempt.context,a.context);
});

test('current cross-scope dependencies permit review but inactive reviewer cannot publish',t=>{
  // Separate current fixture: the stale-home case above must remain held.
  const f=fixture(t),dependency=seed(f,'homes','dependency',{status:'current',scope:'beta',principal_id:'founder',content:'Current dependency.'}),local=seed(f,'homes','local',{status:'current',scope:'alpha',principal_id:'cos-a',content:'Current local condition.',dependencies:[ref('homes',dependency)]});
  const p=f.propose('cos-a',{home_id:'other',scope:'beta'}),review=f.review(p);assert.equal(review.finished.accepted,true);assert.equal(review.finished.review.value.verdict,'Pass');
  assert(review.admitted.context.sources.some(r=>r.family==='homes'&&r.id===local.id&&r.sha256===local.sha256));assert(review.admitted.context.sources.some(r=>r.family==='homes'&&r.id===dependency.id&&r.sha256===dependency.sha256));assert.equal(f.ledger.read(tx=>validateContext(tx,review.admitted.context)),true);
  const current=get(f,'principals','cos-b');seed(f,'principals',current.id,{...current.value,status:'inactive'});const before=state(f);
  assert.throws(()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id}),code('REVIEW_REQUIRED'));assert.deepEqual(state(f),before);assert.equal(get(f,'homes','other'),null);
});

test('home scope cannot be relabeled and retained negative counterevidence blocks later Pass',t=>{
  const f=fixture(t),base=seed(f,'homes','fact',{status:'current',scope:'*',principal_id:'founder',content:'Global condition.'});assert.throws(()=>f.propose('cos-a',{expected_revision:base.revision,scope:'alpha'}),code('HOME_SCOPE'));
  const p=f.propose('cos-a',{home_id:'other'}),negative=f.review(p,'Fail');assert.equal(negative.finished.review.value.verdict,'Fail');const positive=f.review(p);assert.throws(()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:positive.finished.review.id}),code('REVIEW_HELD'));assert.equal(get(f,'reviews',negative.finished.review.id).value.verdict,'Fail');
});

test('conflict resolution excludes every evidence contributor, not only the reporter',t=>{
  const f=fixture(t),a=f.propose('cos-a',{home_id:'fact',content:'Direction A.'}),b=f.propose('cos-b',{home_id:'other',content:'Direction B.'});
  for(const id of ['cos-b','reviewer']){const p=get(f,'principals',id);seed(f,'principals',id,{...p.value,qualifications:['conflict/resolve']});}
  const conflict=f.run('reviewer','conflict/create',{grant_id:'g-reviewer',scope:'alpha',input_refs:[ref('proposals',a),ref('proposals',b)],summary:'Contradictory contributions.',clearing_condition:'Independent applicable decision.'});
  for(const who of ['cos-b','reviewer'])assert.throws(()=>f.run(who,'conflict/resolve',{grant_id:`g-${who}`,conflict_id:conflict.id,source_instruction:'I clear it.'}),code('INDEPENDENT_RESOLUTION'));
  const task=f.submit();f.claim(task);assert.equal(f.admit(task).code,'CONTEXT_CONFLICT');const resolved=f.run('founder','conflict/resolve',{conflict_id:conflict.id,source_instruction:'Actual fictional founder chooses narrower direction.',evidence_refs:[ref('proposals',a)]});assert.equal(resolved.value.status,'resolved');assert.equal(f.admit(task).admitted,true);
});

test('qualified uninvolved conflict resolver works; shared session or unknown lineage holds',t=>{
  const f=fixture(t),a=f.propose('cos-a'),b=f.propose('cos-b',{home_id:'other'}),conflict=f.run('cos-a','conflict/create',{grant_id:'g-cos-a',scope:'alpha',input_refs:[ref('proposals',a),ref('proposals',b)],summary:'Opposed evidence.',clearing_condition:'Independent resolution.'});
  assert.throws(()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Unqualified.'}),code('RESOLVER_UNQUALIFIED'));
  const reviewer=get(f,'principals','reviewer');seed(f,'principals','reviewer',{...reviewer.value,qualifications:['conflict/resolve'],native_id:get(f,'principals','cos-b').value.native_id});assert.throws(()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Shared contributor session.'}),code('INDEPENDENT_RESOLUTION'));
  seed(f,'principals','reviewer',{...reviewer.value,qualifications:['conflict/resolve']});assert.equal(f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Uninvolved qualified disposition.'}).value.status,'resolved');
  const unknown=seed(f,'homes','unknown-author',{status:'current',scope:'alpha',content:'No contributor lineage.'}),second=f.run('cos-a','conflict/create',{grant_id:'g-cos-a',scope:'alpha',input_refs:[ref('proposals',a),ref('homes',unknown)],summary:'Unknown contributor.',clearing_condition:'Supply lineage or founder decision.'});assert.throws(()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:second.id,source_instruction:'Cannot assume independence.'}),code('LINEAGE_REQUIRED'));
});

test('changed dispute evidence cannot be resolved through a stale exact reference',t=>{
  const f=fixture(t),a=f.propose(),b=f.propose('cos-b',{home_id:'other'}),conflict=f.run('cos-a','conflict/create',{grant_id:'g-cos-a',scope:'alpha',input_refs:[ref('proposals',a),ref('proposals',b)],summary:'Conflicting exact evidence.',clearing_condition:'Independent decision.'}),reviewer=get(f,'principals','reviewer');seed(f,'principals',reviewer.id,{...reviewer.value,qualifications:['conflict/resolve']});seed(f,'proposals',b.id,{...b.value,content:'Changed evidence.'});assert.throws(()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Stale resolution.'}),code('SOURCE_CHANGED'));assert.equal(get(f,'conflicts',conflict.id).value.status,'open');
});

test('queue continuation reaches ready work beyond 100 held tasks without deleting holds or advancing fairness',t=>{
  const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:500,max_context_bytes:65536,max_model_calls:500}}}),tasks=[];
  // Seed fictional planned definitions in one transaction to keep fixture setup
  // independent of command overhead; execution still uses real P1 transitions.
  f.ledger.write('fixture.queue','founder',tx=>{for(let i=0;i<122;i++){const id=`queue-${String(i).padStart(4,'0')}`,definition={owner_principal_id:'cos-a',grant_id:'g-cos-a',grant_generation:1,scope:'alpha',host:'codex',role:'engineer',stage:'produce',instructions:'Fictional queued work.',acceptance:'Bounded result.',resources:[],input_refs:[],review_of:null,parent_task_id:null,parent_ref:null,outcome:null};tasks.push(tx.put('tasks',id,{...definition,definition,definition_revision:1,definition_sha256:digest(definition),status:'pending',principal_id:'cos-a',attempt:null,created_at:`2020-01-01T00:00:${String(Math.floor(i/10)).padStart(2,'0')}.${String(i%10).padStart(3,'0')}Z`},0));}});
  const excluded=[];for(let i=0;i<121;i++){const selected=inspect(f.ledger,actor('scheduler'),'task/peek',{exclude_task_ids:excluded});assert.equal(selected.task.id,tasks[i].id);excluded.push(selected.task.id);}
  assert.equal(get(f,'control','fairness'),null);const selected=inspect(f.ledger,actor('scheduler'),'task/peek',{exclude_task_ids:excluded});assert.equal(selected.task.id,tasks[121].id);assert.equal(selected.traversal.exclusion_limit,10000);const admitted=f.admit(selected.task,{exclude_task_ids:excluded});assert.equal(admitted.admitted,true);assert.equal(rows(f.ledger,'tasks',{status:'pending'}).length,121);assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(get(f,'control','fairness').value.last_principal_id,'cos-a');
  assert.throws(()=>inspect(f.ledger,actor('scheduler'),'task/peek',{exclude_task_ids:['duplicate','duplicate']}),code('INVALID_INPUT'));assert.throws(()=>inspect(f.ledger,actor('scheduler'),'task/peek',{exclude_task_ids:Array.from({length:10001},(_,i)=>String(i))}),code('INVALID_INPUT'));
});

test('P1 transaction handles remain scoped and model planning cannot weaken accepted ledger rules',t=>{
  const f=fixture(t);let escaped;f.ledger.read(tx=>{escaped=tx;});assert.throws(()=>escaped.get('control','company'),/expired/);
  assert.throws(()=>f.ledger.write('fixture.async','founder',async()=>{}),/asynchronous/);
  const before=state(f);assert.throws(()=>f.ledger.write('fixture.list-after','founder',tx=>{tx.put('homes','forbidden',{status:'current',scope:'alpha',content:'Rollback.'},0);tx.list('homes');}),/pending writes/);assert.deepEqual(state(f),before);
});

// Historical rows below are fictional, ledger-valid terminal task versions and
// exact actor/operation cancellation receipts. No process or native execution
// is represented by these unattempted cancellations. Setup uses accepted P1.
function seedUnrelatedTerminalHistory(f,total=10001){
  const commandIds=new Set(),at='2020-01-01T00:00:00.000Z';
  for(let start=0;start<total;start+=200){
    f.ledger.write('fixture.terminal-history','founder',tx=>{
      for(let i=start;i<Math.min(start+200,total);i++){
        const id=`archive-task-${String(i).padStart(5,'0')}`,operation=`archive-cancel-${i}`;
        const definition={owner_principal_id:'founder',grant_id:null,grant_generation:null,scope:'archive',host:'codex',role:'engineer',stage:'produce',instructions:'Fictional archived work cancelled before admission.',acceptance:'No execution authorized by this fixture.',resources:[],input_refs:[],review_of:null,parent_task_id:null,parent_ref:null,outcome:null};
        const planned=tx.put('tasks',id,{...definition,definition,status:'planned',definition_revision:1,definition_sha256:digest(definition),attempt:null,principal_id:'founder',created_at:at},0);
        const reason='Archived unstarted cancellation.';
        const cancelled=tx.put('tasks',id,{...planned.value,status:'cancelled',cancelled_at:at,cancellation:reason},planned.revision);
        const commandId=digest(['peer-command-v1','founder',operation]);commandIds.add(commandId);
        tx.put('commands',commandId,{principal_id:'founder',operation_id:operation,action:'task/cancel',request_sha256:digest({channel:'model',action:'task/cancel',args:{task_id:id,reason}}),result:cancelled,created_at:at},0);
      }
    });
  }
  return commandIds;
}

// This seam delegates every operation to the real SQLite transaction. It
// observes model-level body access, while leaving P1's internal immutable
// history/event/index integrity checks intact. Mandatory keyed controls have
// no reason to enumerate task/effect/command bodies or fetch archive bodies.
function controlAccessSeam(ledger,archiveCommandIds=new Set()){
  const accesses=[];
  const forbiddenCollections=new Set(['tasks','effects','commands']);
  const wrap=tx=>Object.freeze({...tx,
    get:(family,id)=>{
      accesses.push({method:'get',family,id});
      assert(!(family==='tasks'||family==='effects'||family==='commands'&&archiveCommandIds.has(id)),`Unrelated body hydration: ${family}/${id}`);
      return tx.get(family,id);
    },
    list:(family,options)=>{
      accesses.push({method:'list',family});
      assert(!forbiddenCollections.has(family),`Unrelated collection hydration: ${family}`);
      return tx.list(family,options);
    },
    count:(family,options)=>{
      accesses.push({method:'count',family});
      assert(!forbiddenCollections.has(family),`Unrelated collection count: ${family}`);
      return tx.count(family,options);
    }
  });
  return {accesses,
    read:fn=>ledger.read(tx=>fn(wrap(tx))),
    write:(type,principal,fn)=>ledger.write(type,principal,tx=>fn(wrap(tx)))
  };
}

function protectedHistoryState(f){
  // Metadata assertions deliberately avoid unfiltered P1 body enumeration,
  // which correctly retains its 10,000 matching-row limit.
  return {
    rows:f.ledger.db.prepare("SELECT family,id,revision,sha256 FROM peer_rows WHERE family IN ('tasks','effects','slots','claims','grants') ORDER BY family,id").all(),
    usage:f.ledger.db.prepare("SELECT id,revision,sha256 FROM peer_rows WHERE family='control' AND (id='usage' OR id LIKE 'usage:%') ORDER BY id").all()
  };
}
function controlCommitState(f){
  return {
    head:f.ledger.db.prepare('SELECT * FROM peer_meta').all(),
    events:f.ledger.db.prepare('SELECT COUNT(*) AS n FROM peer_events').get().n,
    commands:f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='commands'").get().n,
    notices:f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='notices'").get().n
  };
}

test('mandatory notices, founder pause and exact replay avoid more than 10000 unrelated terminal task and command bodies',t=>{
  const f=fixture(t),replayArgs={operation_id:'history-bound-replay',grant_id:'g-cos-a',scope:'alpha',role:'engineer',instructions:'Exact fictional replay subject.',acceptance:'Preserve original receipt.',resources:[]};
  const original=execute(f.ledger,actor('cos-a'),'task/submit',replayArgs);
  const archiveCommands=seedUnrelatedTerminalHistory(f);
  assert.equal(archiveCommands.size,10001);
  assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='tasks' AND status='cancelled'").get().n,10001);
  assert(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='commands'").get().n>10000);
  assert.equal(rows(f.ledger,'claims',{status:'held'}).length,0);
  assert.equal(rows(f.ledger,'slots',{status:['active','unknown']}).length,0);
  assert.equal(rows(f.ledger,'effects',{status:['reserved','sent','unknown']}).length,0);
  // The underlying capacity fence is unchanged; controls must avoid it through
  // necessary keyed access, rather than relaxing or hiding this failure.
  assert.throws(()=>f.ledger.read(tx=>tx.list('tasks',{limit:1})),/overflow/);
  assert.throws(()=>f.ledger.read(tx=>tx.count('commands')),/overflow/);
  const before=protectedHistoryState(f),checked=controlAccessSeam(f.ledger,archiveCommands);
  const paused=execute(checked,actor('founder'),'company/pause',{operation_id:'history-pause',source_instruction:'Pause fictional fixture with unrelated terminal archive.'});
  assert.equal(paused.value.paused,true);
  // Publisher is active and has no discretionary grant in this fixture.
  assert.equal(get(f,'grants','g-publisher'),null);
  for(const kind of ['must_know','decision_required']){
    const notice=execute(checked,actor('publisher'),'notice/create',{operation_id:`history-notice-${kind}`,scope:'alpha',kind,content:'Required fictional notice remains available while paused.'});
    assert.equal(notice.value.status,'pending');assert.equal(notice.value.kind,kind);assert.equal(notice.value.principal_id,'publisher');
    assert.equal(notice.value.resolution,undefined);
  }
  const committed=controlCommitState(f);
  assert.deepEqual(execute(checked,actor('cos-a'),'task/submit',replayArgs),original);
  assert.deepEqual(execute(checked,actor('cos-a'),'task/submit',replayArgs),original);
  assert.deepEqual(controlCommitState(f),committed);
  assert.throws(()=>execute(checked,actor('cos-a'),'task/submit',{...replayArgs,instructions:'Changed replay request.'}),code('REPLAY_MISMATCH'));
  assert.deepEqual(controlCommitState(f),committed);
  assert.deepEqual(protectedHistoryState(f),before);
  assert.equal(get(f,'tasks',original.id).value.attempt,null);
  assert.equal(get(f,'control','usage'),null);
  assert(checked.accesses.some(a=>a.method==='get'&&a.family==='commands'),'Exact replay uses its keyed command record');
  assert(!checked.accesses.some(a=>['list','count'].includes(a.method)&&['tasks','effects','commands'].includes(a.family)));
});

test('genuinely oversized relevant context holds without consuming an attempt or releasing unknown reservations while controls remain available',t=>{
  const f=fixture(t),unknown=f.start('cos-a',{resources:['path:tree1:reserved']});
  const retained=f.finish(unknown,{error:{code:'TIMEOUT',message:'Fictional closure remains unknown.'},termination_confirmed:false,observed_process:f.process(unknown,false)});
  assert.equal(retained.task.value.status,'unknown');
  const next=f.submit('cos-b');f.claim(next);
  // This is relevant current company meaning, not unrelated archive history.
  const relevant=seed(f,'homes','large-current-rule',{status:'current',scope:'alpha',principal_id:'founder',content:'x'.repeat(70000)});
  assert(Buffer.byteLength(canonical(relevant.value))>65536);
  const before=protectedHistoryState(f),attemptContext=get(f,'tasks',unknown.task.id).value.attempt.context;
  const held=f.admit(next);assert.equal(held.admitted,false);assert.equal(held.code,'CONTEXT_CAPACITY');
  assert.equal(get(f,'tasks',next.id).value.attempt,null);
  assert.deepEqual(protectedHistoryState(f),before);
  assert.equal(get(f,'control','usage').value.model_calls,1);
  assert.equal(get(f,'control','usage:cos-b'),null);
  assert.equal(get(f,'grants','g-cos-b').value.used_model_calls,0);
  assert.equal(get(f,'effects',unknown.task.value.attempt.effect_id).value.status,'unknown');
  assert.equal(get(f,'slots',unknown.task.id).value.status,'unknown');
  assert.equal(rows(f.ledger,'claims',{task_id:unknown.task.id,status:'held'}).length,1);
  assert.deepEqual(get(f,'tasks',unknown.task.id).value.attempt.context,attemptContext);
  const checked=controlAccessSeam(f.ledger);
  for(const kind of ['must_know','decision_required']){
    const notice=execute(checked,actor('publisher'),'notice/create',{operation_id:`capacity-notice-${kind}`,scope:'alpha',kind,content:'Relevant context is held; the unknown attempt remains reserved.'});
    assert.equal(notice.value.status,'pending');assert.equal(notice.value.principal_id,'publisher');
  }
  assert.equal(execute(checked,actor('founder'),'company/pause',{operation_id:'capacity-safe-pause',source_instruction:'Pause admissions while preserving unknown reservations and oversized relevant source.'}).value.paused,true);
  const pausedNotice=execute(checked,actor('publisher'),'notice/create',{operation_id:'capacity-paused-notice',scope:'alpha',kind:'must_know',content:'Required attention remains available after pause.'});
  assert.equal(pausedNotice.value.status,'pending');
  assert.deepEqual(protectedHistoryState(f),before);
  assert.deepEqual(get(f,'homes',relevant.id),relevant);
  assert.deepEqual(get(f,'tasks',unknown.task.id).value.attempt.context,attemptContext);
  assert.equal(get(f,'tasks',next.id).value.attempt,null);
});

// New tests remain fictional protected-host observations over accepted SQLite.
// They are regression specifications, not execution or native qualification.
test('first unknown finish binds later closure and process observations to its exact pid and start',t=>{
  const f=fixture(t),a=f.start('cos-a',{resources:['path:tree1:original-process']}),process=f.process(a,false);
  const finished=f.finish(a,{error:{code:'TIMEOUT'},termination_confirmed:false,observed_process:process});
  assert.equal(finished.task.value.attempt.process,undefined);
  assert.deepEqual(finished.task.value.result.observed_process,process);
  const observation=get(f,'effects',finished.task.value.result.observation.id);
  assert.deepEqual(observation.value.process,process);
  const before=state(f);
  const alternatives=[{...process,pid:process.pid+1},{...process,started_at:new Date(Date.parse(process.started_at)+1).toISOString()}];
  for(const wrong of alternatives){
    for(const action of ['task/closure','task/process']){
      assert.throws(()=>f.observe(action,{task_id:a.task.id,attempt_id:a.task.value.attempt.id,termination_confirmed:true,observed_process:{...wrong,close_observed:true}}),code('PROCESS_CHANGED'));
      assert.deepEqual(state(f),before,'Rejected evidence must not change command receipts, reservations, budgets or history');
    }
  }
  assert.equal(get(f,'effects',a.task.value.attempt.effect_id).value.status,'unknown');
  assert.equal(get(f,'slots',a.task.id).value.status,'unknown');
  assert.equal(rows(f.ledger,'claims',{task_id:a.task.id,status:'held'}).length,1);
  const closed=f.observe('task/closure',{operation_id:'matching-first-finish-closure',task_id:a.task.id,attempt_id:a.task.value.attempt.id,termination_confirmed:true,observed_process:{...process,close_observed:true}});
  assert.equal(closed.value.status,'quarantined');
  assert.deepEqual(closed.value.result,finished.task.value.result);
  assert.deepEqual(closed.value.attempt,finished.task.value.attempt);
  assert.equal(get(f,'effects',a.task.value.attempt.effect_id).value.status,'failed');
  assert.equal(get(f,'slots',a.task.id).value.status,'released');
  assert.equal(rows(f.ledger,'claims',{task_id:a.task.id,status:'held'}).length,0);
  assert.equal(get(f,'control','usage').value.model_calls,1);
  const committed=state(f);
  assert.deepEqual(f.observe('task/closure',{operation_id:'matching-first-finish-closure',task_id:a.task.id,attempt_id:a.task.value.attempt.id,termination_confirmed:true,observed_process:{...process,close_observed:true}}),closed);
  assert.deepEqual(state(f),committed);
});

test('matching late process preserves first finish identity and rejects conflicting closure',t=>{
  const f=fixture(t),a=f.start('cos-a',{resources:['path:tree1:late-process']}),process=f.process(a,false);
  const finished=f.finish(a,{error:{code:'TIMEOUT'},termination_confirmed:false,observed_process:process});
  const recorded=f.observe('task/process',{task_id:a.task.id,attempt_id:a.task.value.attempt.id,observed_process:process});
  assert.deepEqual(recorded.value.attempt.process,process);
  assert.deepEqual(recorded.value.result,finished.task.value.result);
  const before=state(f);
  assert.throws(()=>f.observe('task/closure',{task_id:a.task.id,attempt_id:a.task.value.attempt.id,termination_confirmed:true,observed_process:{...process,pid:999,close_observed:true}}),code('PROCESS_CHANGED'));
  assert.deepEqual(state(f),before);
  const closed=f.observe('task/closure',{task_id:a.task.id,attempt_id:a.task.value.attempt.id,termination_confirmed:true,observed_process:{...process,close_observed:true}});
  assert.deepEqual(closed.value.result,finished.task.value.result);
  assert.equal(get(f,'slots',a.task.id).value.status,'released');
  assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('ambiguous process start aliases cannot release an unknown reservation',t=>{
  const f=fixture(t),a=f.start(),process=f.process(a,false);
  f.finish(a,{error:{code:'TIMEOUT'},termination_confirmed:false,observed_process:process});
  const before=state(f);
  assert.throws(()=>f.observe('task/closure',{task_id:a.task.id,attempt_id:a.task.value.attempt.id,termination_confirmed:true,observed_process:{...process,execution_started_at:new Date(Date.parse(process.started_at)+1).toISOString(),close_observed:true}}),code('PROCESS_INVALID'));
  assert.deepEqual(state(f),before);
});

test('transferred returned output retains original principal and observed native for review and dispute independence',t=>{
  const f=fixture(t),a=f.start('cos-a',{resources:['path:tree1:produced']}),produced=f.finish(a,{native_id:'producer-native-N'});
  const usage=get(f,'control','usage'),grant=get(f,'grants','g-cos-a');
  const transferred=f.run('cos-a','task/transfer',{task_id:a.task.id,to_principal_id:'cos-b',to_grant_id:'g-cos-b'});
  assert.deepEqual(transferred.value.attempt,produced.task.value.attempt);
  assert.deepEqual(transferred.value.result,produced.task.value.result);
  assert.deepEqual(transferred.value.definition,produced.task.value.definition);
  assert.deepEqual(get(f,'control','usage'),usage);
  assert.deepEqual(get(f,'grants','g-cos-a'),grant);
  assert.equal(get(f,'effects',a.task.value.attempt.effect_id).value.principal_id,'cos-a');
  const p=f.propose('cos-b',{input_refs:[ref('tasks',transferred)]});
  const self=f.start('cos-a',{role:'qa',stage:'review',review_of:ref('proposals',p)});
  const output=canonical({review:{subject:ref('proposals',p),verdict:'Pass',reason:'Fictional review.',blockers:[]}});
  const before=state(f);
  assert.throws(()=>f.finish(self,{output,native_id:'different-producer-session-M'}),code('REVIEW_INDEPENDENCE'));
  assert.deepEqual(state(f),before);
  assert.equal(rows(f.ledger,'reviews').length,0);
  assert.equal(get(f,'homes','fact'),null);
  assert.throws(()=>f.run('cos-b','home/publish',{grant_id:'g-cos-b',proposal_id:p.id,review_id:'missing-interested-review'}),code('REVIEW_REQUIRED'));
  assert.deepEqual(state(f),before);
  const independent=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',p)});
  const reviewed=f.finish(independent,{output,native_id:'uninvolved-review-native'});
  assert.equal(reviewed.accepted,true);
  const home=f.run('cos-b','home/publish',{grant_id:'g-cos-b',proposal_id:p.id,review_id:reviewed.review.id});
  assert.equal(home.value.status,'current');
  // The original principal is interested even when its registered and newly
  // observed native identities both differ from the original observed N.
  for(const id of ['cos-a','reviewer']){const member=get(f,'principals',id);seed(f,'principals',id,{...member.value,qualifications:['conflict/resolve']});}
  const conflict=f.run('cos-b','conflict/create',{grant_id:'g-cos-b',scope:'alpha',input_refs:[ref('tasks',transferred),ref('proposals',p)],summary:'Fictional dispute involving transferred production.',clearing_condition:'Independent qualified disposition.'});
  const disputed=state(f);
  assert.throws(()=>f.run('cos-a','conflict/resolve',{grant_id:'g-cos-a',conflict_id:conflict.id,source_instruction:'Original producer cannot independently clear this.'}),code('INDEPENDENT_RESOLUTION'));
  assert.deepEqual(state(f),disputed);
  assert.equal(f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Uninvolved qualified fixture disposition.'}).value.status,'resolved');
});

test('transfer before admission binds actual producer separately from original definition author',t=>{
  const f=fixture(t),original=f.submit('cos-a',{resources:['path:tree1:before-admission']});
  const transferred=f.run('cos-a','task/transfer',{task_id:original.id,to_principal_id:'cos-b',to_grant_id:'g-cos-b'});
  assert.equal(transferred.value.attempt,null);
  assert.equal(get(f,'control','usage'),null);
  assert.equal(transferred.value.definition.owner_principal_id,'cos-a');
  f.claim(transferred);const admitted=f.admit(transferred);assert.equal(admitted.admitted,true);
  assert.equal(admitted.context.task.owner_principal_id,'cos-b');
  const produced=f.finish(admitted,{native_id:'actual-B-production'});
  assert.equal(produced.accepted,true);
  assert.equal(get(f,'effects',admitted.task.value.attempt.effect_id).value.principal_id,'cos-b');
  assert.equal(get(f,'grants','g-cos-a').value.used_model_calls,0);
  assert.equal(get(f,'grants','g-cos-b').value.used_model_calls,1);
  const returned=f.run('cos-b','task/transfer',{task_id:original.id,to_principal_id:'cos-a',to_grant_id:'g-cos-a'});
  assert.deepEqual(returned.value.attempt,produced.task.value.attempt);
  assert.deepEqual(returned.value.result,produced.task.value.result);
  const p=f.propose('cos-a',{input_refs:[ref('tasks',returned)]});
  const interested=f.start('cos-b',{role:'qa',stage:'review',review_of:ref('proposals',p)});
  const output=canonical({review:{subject:ref('proposals',p),verdict:'Pass',reason:'Fictional transferred review.',blockers:[]}}),before=state(f);
  assert.throws(()=>f.finish(interested,{output,native_id:'B-new-session'}),code('REVIEW_INDEPENDENCE'));
  assert.deepEqual(state(f),before);
  const independent=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',p)});
  assert.equal(f.finish(independent,{output,native_id:'independent-before-transfer-review'}).accepted,true);
  assert.equal(get(f,'control','usage').value.model_calls,3);
  assert.equal(rows(f.ledger,'claims',{task_id:original.id,status:'held'}).length,0);
});

test('transferred output with missing admitted provenance cannot qualify a review or dispute resolver',t=>{
  const f=fixture(t),a=f.start(),produced=f.finish(a,{native_id:'retained-production'});
  const transferred=f.run('cos-a','task/transfer',{task_id:a.task.id,to_principal_id:'cos-b',to_grant_id:'g-cos-b'});
  // Ledger-valid fictional corruption models unavailable reconstruction data;
  // it must hold rather than infer a producer from the new ownership label.
  const unknown=seed(f,'tasks',a.task.id,{...transferred.value,attempt:{...transferred.value.attempt,context:null}});
  const p=f.propose('cos-b',{input_refs:[ref('tasks',unknown)]});
  const review=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',p)});
  const output=canonical({review:{subject:ref('proposals',p),verdict:'Pass',reason:'Cannot infer missing provenance.',blockers:[]}}),before=state(f);
  assert.throws(()=>f.finish(review,{output,native_id:'unrelated-review'}),code('LINEAGE_REQUIRED'));
  assert.deepEqual(state(f),before);
  const resolver=get(f,'principals','reviewer');seed(f,'principals','reviewer',{...resolver.value,qualifications:['conflict/resolve']});
  const conflict=f.run('cos-b','conflict/create',{grant_id:'g-cos-b',scope:'alpha',input_refs:[ref('tasks',unknown),ref('proposals',p)],summary:'Unknown production lineage.',clearing_condition:'Recover exact protected provenance.'});
  const held=state(f);
  assert.throws(()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Unknown lineage cannot establish independence.'}),code('LINEAGE_REQUIRED'));
  assert.deepEqual(state(f),held);
  assert.deepEqual(get(f,'tasks',a.task.id).value.result,produced.task.value.result);
});

test('stale protected finish reference and changed transfer chain hold exact transferred-output review',t=>{
  for(const defect of ['stale-observation','broken-transfer']){
    const f=fixture(t),a=f.start(),produced=f.finish(a,{native_id:`production-${defect}`});
    const transferred=f.run('cos-a','task/transfer',{task_id:a.task.id,to_principal_id:'cos-b',to_grant_id:'g-cos-b'});
    const value=defect==='stale-observation'?{...transferred.value,result:{...transferred.value.result,observation:{...transferred.value.result.observation,sha256:'0'.repeat(64)}}}:{...transferred.value,transfers:[{...transferred.value.transfers[0],from:'reviewer'}]};
    const bad=seed(f,'tasks',a.task.id,value),p=f.propose('cos-b',{input_refs:[ref('tasks',bad)]});
    const review=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',p)});
    const output=canonical({review:{subject:ref('proposals',p),verdict:'Pass',reason:'Invalid provenance must hold.',blockers:[]}}),before=state(f);
    assert.throws(()=>f.finish(review,{output,native_id:`unrelated-${defect}`}),code(defect==='stale-observation'?'SOURCE_CHANGED':'LINEAGE_REQUIRED'));
    assert.deepEqual(state(f),before);
    assert.equal(get(f,'homes','fact'),null);
    assert.deepEqual(get(f,'tasks',a.task.id).value.attempt,produced.task.value.attempt);
  }
});

// Parent-lineage regressions use only the existing accepted-P1 fixture and
// fictional protected observations. No result here claims test execution.
function qualifyParentResolver(f,id){
  const p=get(f,'principals',id);
  seed(f,'principals',id,{...p.value,qualifications:['conflict/resolve']});
}
function parentReviewOutput(proposal){
  return canonical({review:{subject:ref('proposals',proposal),verdict:'Pass',reason:'Fictional exact parent-lineage review.',blockers:[]}});
}
function transferredParentChild(f,{parentDefect=null,nested=false}={}){
  const admitted=f.start('cos-a'),produced=f.finish(admitted,{native_id:'ancestor-observed-N'});
  assert.equal(produced.accepted,true);
  let parent=f.run('cos-a','task/transfer',{task_id:admitted.task.id,to_principal_id:'cos-b',to_grant_id:'g-cos-b'});
  if(parentDefect==='missing-context')parent=seed(f,'tasks',parent.id,{...parent.value,attempt:{...parent.value.attempt,context:null}});
  if(parentDefect==='missing-observation')parent=seed(f,'tasks',parent.id,{...parent.value,result:{...parent.value.result,observation:null}});
  const childAdmission=f.start('cos-b',{parent_task_id:parent.id});
  assert.deepEqual(childAdmission.task.value.parent_ref,ref('tasks',parent));
  const supplied=childAdmission.context.sources.find(s=>s.family==='tasks'&&s.id===parent.id);
  assert(supplied);assert.equal(supplied.sha256,parent.sha256);assert.deepEqual(supplied.value,parent.value);
  const child=f.finish(childAdmission,{native_id:'intermediate-observed-Q'});
  assert.equal(child.accepted,true);
  if(!nested)return {parent,child:child.task,leaf:child.task,owner:'cos-b'};
  const transferred=f.run('cos-b','task/transfer',{task_id:child.task.id,to_principal_id:'reviewer',to_grant_id:'g-reviewer'});
  const grandchildAdmission=f.start('reviewer',{parent_task_id:transferred.id});
  assert.deepEqual(grandchildAdmission.task.value.parent_ref,ref('tasks',transferred));
  const grandchild=f.finish(grandchildAdmission,{native_id:'leaf-observed-R'});
  assert.equal(grandchild.accepted,true);
  return {parent,child:transferred,leaf:grandchild.task,owner:'reviewer'};
}
function parentConflict(f,chain,proposal){
  return f.run(chain.owner,'conflict/create',{grant_id:`g-${chain.owner}`,scope:'alpha',input_refs:[ref('tasks',chain.leaf),ref('proposals',proposal)],summary:'Fictional dispute over exact parent-derived evidence.',clearing_condition:'Uninvolved qualified disposition with complete parent provenance.'});
}

test('transferred parent remains a principal contributor through child review publication and dispute resolution',t=>{
  const f=fixture(t);
  for(const id of ['cos-a','reviewer'])qualifyParentResolver(f,id);
  const chain=transferredParentChild(f),p=f.propose(chain.owner,{input_refs:[ref('tasks',chain.leaf)]});
  assert.notEqual(get(f,'principals','cos-a').value.native_id,'ancestor-observed-N');
  assert.notEqual(get(f,'principals','cos-a').value.native_id,'ancestor-new-review-M');
  assert.equal(chain.leaf.value.owner_principal_id,'cos-b');
  assert.equal(chain.parent.value.owner_principal_id,'cos-b');
  assert.equal(chain.parent.value.definition.owner_principal_id,'cos-a');
  const interested=f.start('cos-a',{stage:'review',role:'qa',review_of:ref('proposals',p)}),output=parentReviewOutput(p);
  const before=state(f);
  assert.throws(()=>f.finish(interested,{output,native_id:'ancestor-new-review-M'}),code('REVIEW_INDEPENDENCE'));
  assert.deepEqual(state(f),before,'Review rejection retains receipts, claims, slots, usage and immutable history');
  assert.equal(get(f,'tasks',interested.task.id).value.result,undefined);
  assert.equal(get(f,'slots',interested.task.id).value.status,'active');
  assert.equal(rows(f.ledger,'reviews').length,0);
  assert.throws(()=>f.run(chain.owner,'home/publish',{grant_id:`g-${chain.owner}`,proposal_id:p.id,review_id:'rejected-parent-review'}),code('REVIEW_REQUIRED'));
  assert.deepEqual(state(f),before);
  assert.equal(get(f,'homes','fact'),null);
  const independent=f.start('reviewer',{stage:'review',role:'qa',review_of:ref('proposals',p)});
  const reviewed=f.finish(independent,{output,native_id:'uninvolved-parent-review-S'});
  assert.equal(reviewed.accepted,true);
  const home=f.run(chain.owner,'home/publish',{grant_id:`g-${chain.owner}`,proposal_id:p.id,review_id:reviewed.review.id});
  assert.equal(home.value.status,'current');
  const unrelated=f.submit('cos-b',{scope:'beta'});
  const context=f.ledger.read(tx=>buildContext(tx,actor('cos-b'),unrelated));
  assert(!context.sources.some(s=>s.family==='homes'&&s.id===home.id),'Exact independent parent-aware review still permits qualified scope omission');
  const conflict=parentConflict(f,chain,p),held=state(f);
  assert.throws(()=>f.run('cos-a','conflict/resolve',{grant_id:'g-cos-a',conflict_id:conflict.id,source_instruction:'Ancestor cannot clear its own contribution.'}),code('INDEPENDENT_RESOLUTION'));
  assert.deepEqual(state(f),held);
  assert.equal(f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Uninvolved qualified parent-aware disposition.'}).value.status,'resolved');
  assert.deepEqual(get(f,'tasks',chain.parent.id),chain.parent);
  assert.deepEqual(get(f,'tasks',chain.leaf.id),chain.leaf);
});

test('nested exact parents retain original and intermediate producers while an uninvolved reviewer and resolver remain eligible',t=>{
  const f=fixture(t);
  f.run('founder','grant/create',{grant_id:'g-publisher',to_principal_id:'publisher',scope:'*',actions:['task/*','home/*','conflict/*'],resources:['repo:owner/repo','home:fact'],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional bounded uninvolved parent-lineage reviewer authority.'});
  for(const id of ['cos-a','cos-b','publisher'])qualifyParentResolver(f,id);
  const chain=transferredParentChild(f,{nested:true}),p=f.propose(chain.owner,{input_refs:[ref('tasks',chain.leaf)]}),output=parentReviewOutput(p);
  assert.equal(chain.leaf.value.definition.owner_principal_id,'reviewer');
  assert.equal(chain.child.value.owner_principal_id,'reviewer');
  assert.equal(chain.child.value.definition.owner_principal_id,'cos-b');
  assert.equal(chain.parent.value.definition.owner_principal_id,'cos-a');
  for(const who of ['cos-a','cos-b']){
    const review=f.start(who,{stage:'review',role:'qa',review_of:ref('proposals',p)}),before=state(f);
    assert.throws(()=>f.finish(review,{output,native_id:`fresh-noncontributing-label-${who}`}),code('REVIEW_INDEPENDENCE'));
    assert.deepEqual(state(f),before);
  }
  const independent=f.start('publisher',{stage:'review',role:'qa',review_of:ref('proposals',p)});
  const reviewed=f.finish(independent,{output,native_id:'uninvolved-nested-review-T'});
  assert.equal(reviewed.accepted,true);
  assert.equal(f.run(chain.owner,'home/publish',{grant_id:`g-${chain.owner}`,proposal_id:p.id,review_id:reviewed.review.id}).value.status,'current');
  const conflict=parentConflict(f,chain,p);
  for(const who of ['cos-a','cos-b']){
    const before=state(f);
    assert.throws(()=>f.run(who,'conflict/resolve',{grant_id:`g-${who}`,conflict_id:conflict.id,source_instruction:'An ancestor cannot independently resolve this dispute.'}),code('INDEPENDENT_RESOLUTION'));
    assert.deepEqual(state(f),before);
  }
  assert.equal(f.run('publisher','conflict/resolve',{grant_id:'g-publisher',conflict_id:conflict.id,source_instruction:'Uninvolved qualified nested-parent disposition.'}).value.status,'resolved');
  assert.deepEqual(get(f,'tasks',chain.parent.id),chain.parent);
  assert.deepEqual(get(f,'tasks',chain.child.id),chain.child);
  assert.deepEqual(get(f,'tasks',chain.leaf.id),chain.leaf);
});

test('observed ancestor native identity cannot review child evidence through an otherwise uninvolved principal',t=>{
  const f=fixture(t),chain=transferredParentChild(f),p=f.propose(chain.owner,{input_refs:[ref('tasks',chain.leaf)]});
  const review=f.start('reviewer',{stage:'review',role:'qa',review_of:ref('proposals',p)}),before=state(f);
  assert.throws(()=>f.finish(review,{output:parentReviewOutput(p),native_id:'ancestor-observed-N'}),code('REVIEW_INDEPENDENCE'));
  assert.deepEqual(state(f),before);
  assert.equal(rows(f.ledger,'reviews').length,0);
});

test('stale direct and grandparent references hold review and dispute resolution without receipts or protected-state mutations',t=>{
  for(const nested of [false,true]){
    const f=fixture(t);qualifyParentResolver(f,'publisher');
    f.run('founder','grant/create',{grant_id:'g-publisher',to_principal_id:'publisher',scope:'*',actions:['task/*','conflict/*'],resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional stale-parent inspection authority.'});
    const chain=transferredParentChild(f,{nested});
    const changed=seed(f,'tasks',chain.parent.id,{...chain.parent.value,reconstruction_marker:'Later exact parent version.'});
    assert.notEqual(changed.sha256,chain.parent.sha256);
    const p=f.propose(chain.owner,{input_refs:[ref('tasks',chain.leaf)]});
    const review=f.start('publisher',{stage:'review',role:'qa',review_of:ref('proposals',p)}),before=state(f);
    assert.throws(()=>f.finish(review,{output:parentReviewOutput(p),native_id:'independent-stale-parent-review'}),e=>e.code==='SOURCE_CHANGED'&&e.message===`Exact source changed: tasks/${chain.parent.id}`);
    assert.deepEqual(state(f),before);
    const conflict=parentConflict(f,chain,p),disputed=state(f);
    assert.throws(()=>f.run('publisher','conflict/resolve',{grant_id:'g-publisher',conflict_id:conflict.id,source_instruction:'Stale exact parent evidence cannot qualify independence.'}),code('SOURCE_CHANGED'));
    assert.deepEqual(state(f),disputed);
    assert.deepEqual(get(f,'tasks',chain.parent.id),changed);
    assert.deepEqual(get(f,'tasks',chain.leaf.id),chain.leaf);
    assert.equal(get(f,'homes','fact'),null);
  }
});

test('missing parent production context or protected observation holds otherwise independent review and resolution',t=>{
  for(const parentDefect of ['missing-context','missing-observation']){
    const f=fixture(t);qualifyParentResolver(f,'reviewer');
    const chain=transferredParentChild(f,{parentDefect}),p=f.propose(chain.owner,{input_refs:[ref('tasks',chain.leaf)]});
    const review=f.start('reviewer',{stage:'review',role:'qa',review_of:ref('proposals',p)}),before=state(f);
    assert.throws(()=>f.finish(review,{output:parentReviewOutput(p),native_id:`independent-${parentDefect}`}),code('LINEAGE_REQUIRED'));
    assert.deepEqual(state(f),before);
    const conflict=parentConflict(f,chain,p),held=state(f);
    assert.throws(()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Missing protected parent provenance must hold.'}),code('LINEAGE_REQUIRED'));
    assert.deepEqual(state(f),held);
    assert.equal(get(f,'homes','fact'),null);
    assert.deepEqual(get(f,'tasks',chain.leaf.id),chain.leaf);
  }
});

test('removing or relabelling a declared parent edge cannot erase its original contribution',t=>{
  for(const defect of ['removed-ref','removed-id','wrong-family']){
    const f=fixture(t);qualifyParentResolver(f,'reviewer');
    const chain=transferredParentChild(f);
    const value=defect==='removed-ref'?{...chain.leaf.value,parent_ref:null}:defect==='removed-id'?{...chain.leaf.value,parent_task_id:null}:{...chain.leaf.value,parent_ref:{...chain.leaf.value.parent_ref,family:'homes'}};
    const bad=seed(f,'tasks',chain.leaf.id,value),p=f.propose(chain.owner,{input_refs:[ref('tasks',bad)]});
    const review=f.start('reviewer',{stage:'review',role:'qa',review_of:ref('proposals',p)}),before=state(f);
    assert.throws(()=>f.finish(review,{output:parentReviewOutput(p),native_id:`independent-${defect}`}),code('LINEAGE_REQUIRED'));
    assert.deepEqual(state(f),before);
    const conflict=parentConflict(f,{...chain,leaf:bad},p),held=state(f);
    assert.throws(()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Inconsistent declared parent provenance cannot qualify independence.'}),code('LINEAGE_REQUIRED'));
    assert.deepEqual(state(f),held);
  }
});

test('a missing exact parent row and a contributor-reference cycle fail closed in real SQLite',t=>{
  // Fictional missing-parent definition has no attempt or output; the exact
  // reference still requires resolution rather than silent omission.
  const f=fixture(t);qualifyParentResolver(f,'reviewer');
  const original=f.submit('cos-b'),missing={family:'tasks',id:'absent-exact-parent',revision:1,sha256:'0'.repeat(64)};
  const definition={...original.value.definition,parent_task_id:missing.id,parent_ref:missing};
  const bad=seed(f,'tasks',original.id,{...original.value,parent_task_id:missing.id,parent_ref:missing,definition,definition_sha256:digest(definition)});
  const p=f.propose('cos-b',{input_refs:[ref('tasks',bad)]});
  const review=f.start('reviewer',{stage:'review',role:'qa',review_of:ref('proposals',p)}),before=state(f);
  assert.throws(()=>f.finish(review,{output:parentReviewOutput(p),native_id:'missing-parent-independent'}),code('SOURCE_CHANGED'));
  assert.deepEqual(state(f),before);
  const conflict=f.run('cos-b','conflict/create',{grant_id:'g-cos-b',scope:'alpha',input_refs:[ref('tasks',bad),ref('proposals',p)],summary:'Missing exact parent.',clearing_condition:'Recover exact parent.'}),held=state(f);
  assert.throws(()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,source_instruction:'Cannot skip an absent parent.'}),code('SOURCE_CHANGED'));
  assert.deepEqual(state(f),held);
  // A legacy immutable body can contain a self-reference by row identity; an
  // exact self-hash cycle is impractical. Exercise cycle detection with a
  // transaction seam that changes only reference resolution for this isolated
  // malformed fictional evidence, delegating writes and all other reads to P1.
  const cyclic=f.propose('cos-b',{home_id:'other',content:'Synthetic traversal seam; not a hash-consistent cyclic SQLite fixture.'});
  const self=ref('proposals',cyclic);
  const cyclicView=row=>({...row,value:{...row.value,readset:[self]}});
  const wrap=tx=>Object.freeze({...tx,get:(family,id)=>{
    const row=tx.get(family,id);
    return family==='proposals'&&id===cyclic.id?cyclicView(row):row;
  },getVersion:r=>{
    const row=tx.getVersion(r);
    return r.family==='proposals'&&r.id===cyclic.id?cyclicView(row):row;
  }});
  const seam={read:fn=>f.ledger.read(tx=>fn(wrap(tx))),write:(type,principal,fn)=>f.ledger.write(type,principal,tx=>fn(wrap(tx)))};
  const cycleConflict=f.run('cos-b','conflict/create',{grant_id:'g-cos-b',scope:'alpha',input_refs:[self,ref('proposals',p)],summary:'Malformed fictional reference cycle.',clearing_condition:'Recover acyclic exact evidence.'});
  const cycleBefore=state(f);
  assert.throws(()=>execute(seam,actor('reviewer'),'conflict/resolve',{operation_id:'cycle-resolution-hold',grant_id:'g-reviewer',conflict_id:cycleConflict.id,source_instruction:'A cycle cannot establish independent resolution.'}),e=>e.code==='LINEAGE_REQUIRED'&&e.message==='Contributor reference cycle');
  assert.deepEqual(state(f),cycleBefore);
});

// External source-proposal regressions, using actual model operations and
// accepted P1 SQLite. Protected observations are fictional host inputs only.
const {createHash:indexedCreateHash}=await import('node:crypto');
function externalMember(f,id,{qualifications=[]}={}){
  const old=get(f,'principals',id);
  if(!old)seed(f,'principals',id,{principal_id:id,kind:'cos',status:'active',generation:1,native_id:`registered-${id}`,host:'codex',session_id:`session-${id}`,qualifications});
  else if(qualifications.length)seed(f,'principals',id,{...old.value,qualifications});
  if(!get(f,'grants',`g-${id}`))f.run('founder','grant/create',{grant_id:`g-${id}`,to_principal_id:id,scope:'*',actions:['task/*','home/*','conflict/*','message/*'],resources:['repo:owner/repo','home:fact','home:other','home:dependency'],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional external regression authority.'});
}
function externalReview(f,proposal,who,args={}){
  const admitted=f.start(who,{role:'qa',stage:'review',scope:proposal.value.scope,review_of:ref('proposals',proposal)});
  const output=canonical({review:{subject:ref('proposals',proposal),verdict:'Pass',reason:'Independent fictional source-graph assessment.',blockers:[]}});
  return {admitted,output,finished:f.finish(admitted,{output,native_id:`observed-review-${admitted.task.id}`,...args})};
}
function externalPublish(f,author,reviewer,home_id,content,args={}){
  const current=get(f,'homes',home_id),proposal=f.propose(author,{home_id,scope:'alpha',expected_revision:current?.revision??0,content,...args});
  const review=externalReview(f,proposal,reviewer);assert.equal(review.finished.accepted,true);
  return {home:f.run(author,'home/publish',{grant_id:`g-${author}`,proposal_id:proposal.id,review_id:review.finished.review.id}),proposal,...review};
}
function externalAtomicReject(f,operation,expected){
  const before=state(f);assert.throws(operation,typeof expected==='string'?code(expected):expected);
  assert.deepEqual(state(f),before,'Rejection must preserve receipts, observations, reviews, reservations, budgets, events and immutable versions');
}
const externalProofFailure=e=>['LINEAGE_REQUIRED','REVIEW_REQUIRED','SOURCE_CHANGED','CONTEXT_CHANGED','GRANT_INVALID','GRANT_CHANGED','PRINCIPAL_INACTIVE'].includes(e.code);
function externalTransferredReview(f){
  externalMember(f,'review-c');externalMember(f,'review-d',{qualifications:['conflict/resolve']});
  const original=f.start('cos-a'),produced=f.finish(original,{native_id:'original-produced-native-N'});
  const transferred=f.run('cos-a','task/transfer',{task_id:original.task.id,to_principal_id:'cos-b',to_grant_id:'g-cos-b'});
  const upstream=f.propose('cos-b',{input_refs:[ref('tasks',transferred)]}),review=externalReview(f,upstream,'review-c');
  assert.equal(review.finished.accepted,true);assert.equal(get(f,'homes','fact'),null,'Upstream remains unpublished; no ambient home masks missing review edges');
  const downstream=f.propose('cos-b',{home_id:'other',input_refs:[ref('reviews',review.finished.review)]});
  assert.deepEqual(downstream.value.readset.map(r=>r.family),['reviews']);
  return {original,produced,transferred,upstream,review,downstream};
}

test('external: review-mediated transferred production excludes original principal and permits independent actors',t=>{
  const f=fixture(t);externalMember(f,'cos-a',{qualifications:['conflict/resolve']});
  const chain=externalTransferredReview(f),p=chain.downstream;
  const interested=f.start('cos-a',{role:'qa',stage:'review',scope:p.value.scope,review_of:ref('proposals',p)});
  externalAtomicReject(f,()=>f.finish(interested,{output:parentReviewOutput(p),native_id:'fresh-original-principal-session-M'}),'REVIEW_INDEPENDENCE');
  assert.equal(externalReview(f,p,'review-d').finished.accepted,true);
  const dispute=f.run('cos-b','conflict/create',{grant_id:'g-cos-b',scope:'alpha',input_refs:[ref('reviews',chain.review.finished.review),ref('proposals',p)],summary:'Review-mediated production dispute.',clearing_condition:'Independent source-graph disposition.'});
  externalAtomicReject(f,()=>f.run('cos-a','conflict/resolve',{grant_id:'g-cos-a',conflict_id:dispute.id,source_instruction:'Original contributor cannot independently resolve.'}),'INDEPENDENT_RESOLUTION');
  assert.equal(f.run('review-d','conflict/resolve',{grant_id:'g-review-d',conflict_id:dispute.id,source_instruction:'Uninvolved qualified actor resolves.'}).value.status,'resolved');
  assert.equal(get(f,'homes','fact'),null);assert.equal(get(f,'homes','other'),null);
});

test('external: review carriers retain native and reviewer aliases and shared DAGs remain valid',t=>{
  for(const alias of ['original-native','reviewer-principal']){
    const f=fixture(t),chain=externalTransferredReview(f),p=chain.downstream;
    const admitted=f.start(alias==='original-native'?'review-d':'review-c',{role:'qa',stage:'review',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(admitted,{output:parentReviewOutput(p),native_id:alias==='original-native'?'original-produced-native-N':'fresh-review-c-session'}),'REVIEW_INDEPENDENCE');
  }
  const f=fixture(t),chain=externalTransferredReview(f);
  const diamond=f.propose('cos-b',{home_id:'other',input_refs:[ref('reviews',chain.review.finished.review),ref('tasks',chain.transferred)]});
  assert.equal(externalReview(f,diamond,'review-d').finished.accepted,true);
});

test('external: H1 H2 H3 stay qualified and preserve historical authors',t=>{
  const f=fixture(t);externalMember(f,'publisher');externalMember(f,'future-reviewer');
  const h1=externalPublish(f,'cos-a','cos-b','fact','Historical fact H1.'),h2=externalPublish(f,'cos-a','reviewer','fact','Reviewed replacement H2.'),h3=externalPublish(f,'cos-a','publisher','fact','Reviewed replacement H3.');
  assert.deepEqual(h2.home.value.previous,ref('homes',h1.home));assert.deepEqual(h3.home.value.previous,ref('homes',h2.home));
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref('homes',h1.home))).value,h1.home.value);
  const ordinary=f.start('future-reviewer',{scope:'beta'});
  assert(!ordinary.context.sources.some(r=>r.family==='homes'&&r.id==='fact'),'Valid qualified foreign H3 must not become compulsory because historical H1/H2 changed');
  assert.equal(f.finish(ordinary).accepted,true);
  const p=f.propose('cos-a',{home_id:'other',scope:'beta',input_refs:[ref('homes',h3.home)]});
  const interested=f.start('cos-b',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
  externalAtomicReject(f,()=>f.finish(interested,{output:parentReviewOutput(p),native_id:'new-old-H1-reviewer-session'}),'REVIEW_INDEPENDENCE');
  assert.equal(externalReview(f,p,'future-reviewer').finished.accepted,true);assert.deepEqual(get(f,'homes','fact'),h3.home);
});

test('external: historical D1 existence cannot authorize pending current D1 after D2',t=>{
  const f=fixture(t);externalMember(f,'publisher');
  const d1=externalPublish(f,'cos-a','cos-b','dependency','Dependency D1.'),p=f.propose('cos-a',{dependencies:[ref('homes',d1.home)]}),review=externalReview(f,p,'reviewer');
  const d2=externalPublish(f,'cos-a','publisher','dependency','Legitimate dependency D2.');
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref('homes',d1.home))).value,d1.home.value);
  assert.deepEqual(review.admitted.context.sources.find(r=>r.family==='homes'&&r.id==='dependency').value,d1.home.value);
  externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id}),e=>['SOURCE_CHANGED','CONTEXT_CHANGED'].includes(e.code));
  assert.deepEqual(get(f,'homes','dependency'),d2.home);assert.equal(get(f,'homes','fact'),null);
});

test('external: ambient source retains its old-scope author after legitimate replacement',t=>{
  const f=fixture(t);externalMember(f,'ambient-independent');
  const h1=externalPublish(f,'cos-a','cos-b','fact','Ambient alpha H1.'),admitted=f.start('cos-b',{scope:'alpha'}),produced=f.finish(admitted,{native_id:'ambient-input-production'});
  assert.deepEqual(admitted.task.value.definition.input_refs,[]);assert(admitted.context.sources.some(r=>r.family==='homes'&&r.sha256===h1.home.sha256));
  const h2=externalPublish(f,'cos-a','reviewer','fact','Ambient alpha H2.');
  const p=f.propose('cos-b',{home_id:'other',scope:'beta',input_refs:[ref('tasks',produced.task)]});
  assert(!p.value.readset.some(r=>r.family==='homes'),'Recover the old author from ancestor context rather than a current foreign home');
  const interested=f.start('cos-a',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
  externalAtomicReject(f,()=>f.finish(interested,{output:parentReviewOutput(p),native_id:'ambient-author-fresh-session'}),'REVIEW_INDEPENDENCE');
  assert.equal(externalReview(f,p,'ambient-independent').finished.accepted,true);assert.deepEqual(get(f,'homes','fact'),h2.home);
});

test('external: altered automatic source bytes and admitted identity fail closed',t=>{
  for(const defect of ['source-body','admitted-principal']){
    const f=fixture(t),ambient=seed(f,'homes','ambient',{status:'current',scope:'alpha',principal_id:'cos-a',content:'Exact fictional ambient body.'});
    const a=f.start('cos-b'),produced=f.finish(a),context=structuredClone(produced.task.value.attempt.context);
    if(defect==='source-body')context.sources.find(s=>s.id===ambient.id).value.content='Not the delivered body.';else context.principal.id='reviewer';
    const bad=seed(f,'tasks',produced.task.id,{...produced.task.value,attempt:{...produced.task.value.attempt,context}}),p=f.propose('cos-b',{home_id:'other',input_refs:[ref('tasks',bad)]});
    const review=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(review,{output:parentReviewOutput(p)}),'LINEAGE_REQUIRED');
  }
});

test('external: completed review transfer retains original eligibility and ignores only grant usage',t=>{
  const f=fixture(t),p=f.propose(),review=externalReview(f,p,'cos-b'),sealed=review.finished.task;
  const moved=f.run('cos-b','task/transfer',{task_id:sealed.id,to_principal_id:'reviewer',to_grant_id:'g-reviewer'});
  assert.deepEqual(moved.value.definition,sealed.value.definition);assert.deepEqual(moved.value.attempt,sealed.value.attempt);assert.deepEqual(moved.value.result,sealed.value.result);
  const unrelated=f.start('cos-b');assert.equal(f.finish(unrelated).accepted,true);assert.equal(get(f,'grants','g-cos-b').value.used_model_calls,2);
  const home=f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id});
  assert.equal(home.value.status,'current');assert.equal(review.finished.review.value.reviewer_principal_id,'cos-b');assert.equal(moved.value.owner_principal_id,'reviewer');assert.deepEqual(get(f,'reviews',review.finished.review.id),review.finished.review);
});

test('external: review transfer cannot hide original authority or immutable proof drift',t=>{
  for(const defect of ['revoked-grant','changed-grant','inactive-reviewer','task-result','task-attempt','membership','review-alias']){
    const f=fixture(t),p=f.propose(),review=externalReview(f,p,'cos-b'),sealed=review.finished.task;
    const moved=f.run('cos-b','task/transfer',{task_id:sealed.id,to_principal_id:'reviewer',to_grant_id:'g-reviewer'});
    if(defect==='revoked-grant')f.run('founder','grant/revoke',{grant_id:'g-cos-b'});
    else if(defect==='changed-grant'){const g=get(f,'grants','g-cos-b');seed(f,'grants',g.id,{...g.value,source_instruction:'Changed grant meaning, not usage.'});}
    else if(defect==='inactive-reviewer'){const p=get(f,'principals','cos-b');seed(f,'principals',p.id,{...p.value,status:'inactive'});}
    else if(defect==='task-result')seed(f,'tasks',moved.id,{...moved.value,result:{...moved.value.result,output:'Changed immutable output.'}});
    else if(defect==='task-attempt')seed(f,'tasks',moved.id,{...moved.value,attempt:{...moved.value.attempt,request_sha256:'0'.repeat(64)}});
    else if(defect==='membership')f.run('publisher','notice/create',{scope:'alpha',content:'New applicable current condition.'});
    else seed(f,'reviews',review.finished.review.id,{...review.finished.review.value,native_id:'Forged review alias.'});
    // Indexed-P1 reconciliation: a contradictory current review alias is now
    // globally integrity-unknown before the later P2 publication proof gate.
    externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id}),defect==='review-alias'?'REVIEW_SELECTION_INTEGRITY':defect==='inactive-reviewer'?'REVIEW_REQUIRED':externalProofFailure);assert.equal(get(f,'homes','fact'),null);
  }
});

test('external: every private semantic family rejects direct and nested use without mutation',t=>{
  const privateFamilies=['control','principals','grants','commands','slots','claims','effects','subscriptions','work_items','unknown-family'];
  for(const family of privateFamilies){
    const f=fixture(t),started=f.start('cos-a',{resources:['path:tree1:private-carrier']}),produced=f.finish(started),p=f.propose('cos-b');
    let row;
    if(family==='control')row=get(f,'control','company');
    else if(family==='principals')row=get(f,'principals','cos-a');
    else if(family==='grants')row=get(f,'grants','g-cos-a');
    else if(family==='effects')row=get(f,'effects',produced.task.value.result.observation.id);
    else if(family==='slots')row=get(f,'slots',started.task.id);
    else if(family==='claims'||family==='commands')row=rows(f.ledger,family)[0];
    else if(family!=='unknown-family')row=seed(f,family,`private-${family}`,{status:'active',principal_id:'cos-a',scope:'alpha',content:'Fictional private control row.'});
    const forbidden=row?ref(family,row):{family,id:'absent-unknown',revision:1,sha256:'0'.repeat(64)};
    externalAtomicReject(f,()=>f.propose('cos-b',{home_id:'other',input_refs:[forbidden]}),'SOURCE_INVALID');
    externalAtomicReject(f,()=>f.submit('cos-b',{input_refs:[forbidden]}),'SOURCE_INVALID');
    externalAtomicReject(f,()=>f.run('cos-b','conflict/create',{grant_id:'g-cos-b',scope:'alpha',input_refs:[ref('proposals',p),forbidden],summary:'Unsupported direct carrier.',clearing_condition:'Use supported semantic evidence.'}),'SOURCE_INVALID');
    // A valid current outer row does not launder a private nested readset.
    // This is controlled ledger-valid fixture mutation, not a fabricated seal.
    const nested=seed(f,'proposals',p.id,{...p.value,readset:[...p.value.readset,forbidden]});
    const q=f.propose('cos-b',{home_id:'other',input_refs:[ref('proposals',nested)]});
    const review=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',q)});
    externalAtomicReject(f,()=>f.finish(review,{output:parentReviewOutput(q)}),'SOURCE_INVALID');
  }
});

test('external: resolved conflict retains the resolver and material resolution-evidence author',t=>{
  const f=fixture(t);externalMember(f,'reviewer',{qualifications:['conflict/resolve']});externalMember(f,'resolution-author',{qualifications:['conflict/resolve']});externalMember(f,'uninvolved-resolver',{qualifications:['conflict/resolve']});
  const a=f.propose('cos-a'),b=f.propose('cos-b',{home_id:'other'}),e=f.propose('resolution-author',{home_id:'other',scope:'beta'});
  const conflict=f.run('cos-a','conflict/create',{grant_id:'g-cos-a',scope:'alpha',input_refs:[ref('proposals',a),ref('proposals',b)],summary:'Fictional opposed evidence.',clearing_condition:'Independent disposition with evidence.'});
  const resolved=f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:conflict.id,evidence_refs:[ref('proposals',e)],source_instruction:'Independent fictional resolution with explicit evidence.'});
  assert.equal(resolved.value.resolution.principal_id,'reviewer');
  const p=f.propose('cos-b',{home_id:'other',scope:'gamma',input_refs:[ref('conflicts',resolved)]});
  for(const who of ['reviewer','resolution-author']){
    const admitted=f.start(who,{role:'qa',stage:'review',scope:'gamma',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(admitted,{output:parentReviewOutput(p),native_id:`new-${who}-session`}),'REVIEW_INDEPENDENCE');
  }
  assert.equal(externalReview(f,p,'uninvolved-resolver').finished.accepted,true);
  const downstream=f.run('cos-b','conflict/create',{grant_id:'g-cos-b',scope:'gamma',input_refs:[ref('conflicts',resolved),ref('proposals',p)],summary:'Downstream use of resolved evidence.',clearing_condition:'Independent downstream resolution.'});
  externalAtomicReject(f,()=>f.run('reviewer','conflict/resolve',{grant_id:'g-reviewer',conflict_id:downstream.id,source_instruction:'Prior resolver remains a contributor.'}),'INDEPENDENT_RESOLUTION');
  assert.equal(f.run('uninvolved-resolver','conflict/resolve',{grant_id:'g-uninvolved-resolver',conflict_id:downstream.id,source_instruction:'Uninvolved downstream resolution.'}).value.status,'resolved');
});

test('external: resolved notice includes founder resolver while unrelated review remains possible',t=>{
  const f=fixture(t),notice=f.run('cos-a','notice/create',{scope:'alpha',content:'Retained historical restriction.'});
  const resolved=f.run('founder','notice/resolve',{notice_id:notice.id,source_instruction:'Attributable notice disposition.'});
  const p=f.propose('cos-b',{home_id:'other',scope:'beta',input_refs:[ref('notices',resolved)]});
  const founderReview=f.start('founder',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
  externalAtomicReject(f,()=>f.finish(founderReview,{output:parentReviewOutput(p),native_id:'founder-new-session'}),'REVIEW_INDEPENDENCE');
  assert.equal(externalReview(f,p,'reviewer').finished.accepted,true);
  assert.deepEqual(get(f,'notices',notice.id),resolved);
});

test('external: delivery follows historical notice author and does not attribute its recipient',t=>{
  const f=fixture(t);externalMember(f,'publisher');
  const notice=f.run('cos-a','notice/create',{scope:'alpha',content:'Delivered original condition.'});
  const delivery=f.run('scheduler','notice/deliver',{notice_id:notice.id,to_principal_id:'cos-b',channel:'fictional-delivery'});
  f.run('founder','notice/resolve',{notice_id:notice.id,source_instruction:'Later notice disposition does not rewrite the delivered version.'});
  const p=f.propose('publisher',{home_id:'other',scope:'beta',input_refs:[ref('deliveries',delivery)]});
  const author=f.start('cos-a',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
  externalAtomicReject(f,()=>f.finish(author,{output:parentReviewOutput(p),native_id:'notice-author-new-session'}),'REVIEW_INDEPENDENCE');
  assert.equal(externalReview(f,p,'cos-b').finished.accepted,true,'Recipient alone is not the notice author or business contributor');
});

test('external: message sender contributes and recipient alone remains independent',t=>{
  const f=fixture(t);externalMember(f,'publisher');
  const message=f.run('cos-a','message/send',{grant_id:'g-cos-a',scope:'alpha',to_principal_id:'cos-b',content:'Source-grounded fictional message.'});
  const p=f.propose('publisher',{home_id:'other',scope:'beta',input_refs:[ref('messages',message)]});
  const sender=f.start('cos-a',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
  externalAtomicReject(f,()=>f.finish(sender,{output:parentReviewOutput(p),native_id:'sender-fresh-session'}),'REVIEW_INDEPENDENCE');
  assert.equal(externalReview(f,p,'cos-b').finished.accepted,true);
});

test('external: home publication and qualification aliases must agree even when old versions exist',t=>{
  for(const defect of ['home-review','qualification-review','qualification-proposal','qualification-binding']){
    const f=fixture(t);externalMember(f,'unrelated-home-reviewer');
    const published=externalPublish(f,'cos-a','cos-b','fact','Qualified exact home.'),other=f.propose('cos-a',{home_id:'other'}),otherReview=externalReview(f,other,'reviewer');
    const value=structuredClone(published.home.value);
    if(defect==='home-review')value.review=ref('reviews',otherReview.finished.review);
    else if(defect==='qualification-review')value.scope_qualification.review=ref('reviews',otherReview.finished.review);
    else if(defect==='qualification-proposal')value.scope_qualification.proposal=ref('proposals',other);
    else value.scope_qualification.home_binding_sha256='0'.repeat(64);
    const bad=seed(f,'homes',published.home.id,value),p=f.propose('cos-a',{home_id:'other',scope:'beta',input_refs:[ref('homes',bad)]});
    const admitted=f.start('unrelated-home-reviewer',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
    assert(admitted.context.sources.some(r=>r.family==='homes'&&r.id===bad.id),'Invalid qualification must not omit a foreign home');
    externalAtomicReject(f,()=>f.finish(admitted,{output:parentReviewOutput(p)}),externalProofFailure);
  }
});

test('external: review subject, proof task, context, native and observation aliases cannot be substituted',t=>{
  for(const defect of ['subject','proof-task','context','native','observation-head']){
    const f=fixture(t),upstream=f.propose(),review=externalReview(f,upstream,'cos-b');
    let evidence=review.finished.review;
    if(defect==='observation-head'){
      const old=get(f,'effects',evidence.value.proof.observation.id);seed(f,'effects',old.id,{...old.value,unexpected_mutation:'Changed immutable observation head.'});
      assert.deepEqual(f.ledger.read(tx=>tx.getVersion(evidence.value.proof.observation)).value,old.value);
    }else{
      const value=structuredClone(evidence.value);
      if(defect==='subject')value.subject=ref('proposals',f.propose('cos-a',{home_id:'other'}));
      else if(defect==='proof-task'){const another=f.start('reviewer');value.proof.task=ref('tasks',f.finish(another).task);}
      else if(defect==='context')value.context_sha256='0'.repeat(64);
      else value.native_id='Different observed review identity.';
      evidence=seed(f,'reviews',evidence.id,value);
    }
    if(defect!=='observation-head'){
      // Indexed-P1 reconciliation: exact review aliases hold at the first
      // context-producing intake; no consumer task may be admitted afterward.
      externalAtomicReject(f,()=>f.propose('cos-a',{home_id:'other',input_refs:[ref('reviews',evidence)]}),'REVIEW_SELECTION_INTEGRITY');
      externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:upstream.id,review_id:evidence.id}),'REVIEW_SELECTION_INTEGRITY');
      assert.deepEqual(get(f,'reviews',evidence.id),evidence,'the contradictory current evidence is retained rather than normalized');
      assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref('reviews',review.finished.review))).value,review.finished.review.value,'the exact original protected review remains available');
      continue;
    }
    const p=f.propose('cos-a',{home_id:'other',input_refs:[ref('reviews',evidence)]}),admitted=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(admitted,{output:parentReviewOutput(p)}),defect==='observation-head'?'SOURCE_CHANGED':externalProofFailure);
  }
});

test('external: a succeeded effect status cannot replace its immutable admission bindings',t=>{
  for(const defect of ['scope','grant_id','grant_generation','policy_generation','pause_generation','request']){
    const f=fixture(t),a=f.start('cos-a'),produced=f.finish(a),effect=get(f,'effects',a.task.value.attempt.effect_id),value=structuredClone(effect.value);
    if(defect==='scope')value.scope='other-scope';
    else if(defect==='grant_id')value.grant_id='g-cos-b';
    else if(defect==='request'){value.request.extra='Not the admitted request';value.request_sha256=digest(value.request);}
    else value[defect]+=1;
    assert.equal(value.status,'succeeded');seed(f,'effects',effect.id,value);
    const p=f.propose('cos-b',{home_id:'other',input_refs:[ref('tasks',produced.task)]}),admitted=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(admitted,{output:parentReviewOutput(p)}),'LINEAGE_REQUIRED');
  }
});

test('external: separate-connection current intake between review and final publication prevents acceptance',t=>{
  const f=fixture(t),p=f.propose(),review=externalReview(f,p,'cos-b'),other=new PeerLedger(f.root);t.after(()=>other.close());
  execute(other,actor('publisher'),'notice/create',{operation_id:'external-other-connection-notice',scope:'alpha',content:'New required semantic intake after the prior review.'});
  externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id}),'CONTEXT_CHANGED');
  assert.equal(get(f,'homes','fact'),null);
});

test('external: lawful postpublication transfer or cancellation preserves history while proof drift holds',t=>{
  // Reconciled with actual native Architect bb8546bb temporal clarification:
  // a lawful later cancellation is not a typed revocation of past publication.
  for(const change of ['transfer','cancel','result','context','invalid-cancel']){
    const f=fixture(t),published=externalPublish(f,'cos-a','cos-b','fact','Historically reviewed alpha home.'),task=published.finished.task;
    if(change==='transfer')f.run('cos-b','task/transfer',{task_id:task.id,to_principal_id:'reviewer',to_grant_id:'g-reviewer'});
    else if(change==='cancel')f.run('cos-b','task/cancel',{task_id:task.id,reason:'Explicitly revoke the completed review task.'});
    else if(change==='result')seed(f,'tasks',task.id,{...task.value,result:{...task.value.result,output:'Changed sealed review result.'}});
    else if(change==='context')seed(f,'tasks',task.id,{...task.value,attempt:{...task.value.attempt,context:{...task.value.attempt.context,sha256:'0'.repeat(64)}}});
    else seed(f,'tasks',task.id,{...task.value,status:'cancelled',cancelled_at:'not-a-date',cancellation:'A malformed transition cannot qualify retained proof.'});
    const ordinary=f.start('cos-a',{scope:'beta'}),contains=ordinary.context.sources.some(r=>r.family==='homes'&&r.id==='fact');
    assert.equal(contains,!['transfer','cancel'].includes(change),`${change}: lawful historical transitions differ from immutable proof conflicts or unsupported transitions`);
    assert.deepEqual(get(f,'homes','fact'),published.home);
    if(['transfer','cancel'].includes(change)){
      externalMember(f,'post-transition-independent');
      const p=f.propose('cos-a',{home_id:'other',scope:'beta',input_refs:[ref('homes',published.home)]}),prior=f.start('cos-b',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
      externalAtomicReject(f,()=>f.finish(prior,{output:parentReviewOutput(p),native_id:'prior-reviewer-after-lawful-transition'}),'REVIEW_INDEPENDENCE');
      assert.equal(externalReview(f,p,'post-transition-independent').finished.accepted,true);
    }
  }
});

function externalNegative(f,subject,family,who,scope,verdict='Fail'){
  const admitted=f.start(who,{role:'qa',stage:'review',scope,review_of:ref(family,subject)});
  const output=canonical({review:{subject:ref(family,subject),verdict,reason:'Material exact-subject adverse evidence.',blockers:['Reassess this exact evidence before relying on qualification.']}});
  const result=f.finish(admitted,{output,native_id:`negative-${admitted.task.id}`});assert.equal(result.accepted,true);assert.equal(result.review.value.verdict,verdict);return result;
}
function externalPacket(f,scope='alpha'){
  const task=f.submit('cos-a',{scope});
  return inspect(f.ledger,actor('cos-a'),'task/context',{task_id:task.id});
}

test('external: cancellation before publication prevents acceptance without erasing the historical review',t=>{
  const f=fixture(t),p=f.propose(),review=externalReview(f,p,'cos-b');
  const cancelled=f.run('cos-b','task/cancel',{task_id:review.finished.task.id,reason:'Cancel current eligibility before publication.'});
  assert.equal(cancelled.value.status,'cancelled');assert.deepEqual(f.ledger.read(tx=>tx.getVersion(review.finished.review.value.proof.task)).value,review.finished.task.value);
  externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id}),externalProofFailure);
  assert.equal(get(f,'homes','fact'),null);assert.deepEqual(get(f,'reviews',review.finished.review.id),review.finished.review);
});

test('external: software publication is not authorship but genuine publisher-kind native contribution remains',t=>{
  const f=fixture(t);externalMember(f,'publisher',{qualifications:['conflict/resolve']});externalMember(f,'independent-next');externalMember(f,'downstream-author');
  const p=f.propose(),review=externalReview(f,p,'cos-b');
  const home=f.run('publisher','home/publish',{grant_id:'g-publisher',proposal_id:p.id,review_id:review.finished.review.id});
  assert.equal(home.value.principal_id,'publisher');
  const downstream=f.propose('downstream-author',{home_id:'other',scope:'beta',input_refs:[ref('homes',home)]});
  const conflict=f.run('cos-a','conflict/create',{grant_id:'g-cos-a',scope:'beta',input_refs:[ref('homes',home),ref('proposals',downstream)],summary:'Software delivery does not add a business author.',clearing_condition:'Independent material contributor disposition.'});
  assert.equal(f.run('publisher','conflict/resolve',{grant_id:'g-publisher',conflict_id:conflict.id,source_instruction:'Software-only publisher remains an uninvolved resolver.'}).value.status,'resolved');
  const original=f.start('cos-a',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',downstream)});
  externalAtomicReject(f,()=>f.finish(original,{output:parentReviewOutput(downstream),native_id:'original-business-author-fresh-native'}),'REVIEW_INDEPENDENCE');
  const nativeReview=externalReview(f,downstream,'publisher');assert.equal(nativeReview.finished.accepted,true);
  const third=f.propose('cos-a',{home_id:'other',scope:'gamma',input_refs:[ref('reviews',nativeReview.finished.review)]}),interested=f.start('publisher',{role:'qa',stage:'review',scope:'gamma',review_of:ref('proposals',third)});
  externalAtomicReject(f,()=>f.finish(interested,{output:parentReviewOutput(third),native_id:'publisher-kind-fresh-native'}),'REVIEW_INDEPENDENCE');
  assert.equal(externalReview(f,third,'independent-next').finished.accepted,true);
  const genuine=fixture(t);externalMember(genuine,'publisher');
  const authored=seed(genuine,'homes','genuine-publisher-authored',{status:'current',scope:'alpha',principal_id:'publisher',content:'Unqualified but explicitly genuinely authored material.'});
  const q=genuine.propose('cos-a',{home_id:'other',scope:'beta',input_refs:[ref('homes',authored)]}),self=genuine.start('publisher',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',q)});
  externalAtomicReject(genuine,()=>genuine.finish(self,{output:parentReviewOutput(q)}),'REVIEW_INDEPENDENCE');
});

test('external: typed proposal dependencies and base reject allowed but incorrect semantic families',t=>{
  for(const defect of ['proposal-dependency','review-dependency','proposal-base','wrong-home-base']){
    const f=fixture(t),home=seed(f,'homes','dependency',{status:'current',scope:'alpha',principal_id:'founder',content:'Valid differently named home.'}),other=f.propose('cos-a',{home_id:'other'}),otherReview=externalReview(f,other,'cos-b');
    const p=f.propose(),originalReview=externalReview(f,p,'reviewer'),value=structuredClone(p.value);
    if(defect==='proposal-dependency')value.dependencies=[ref('proposals',other)];
    else if(defect==='review-dependency')value.dependencies=[ref('reviews',otherReview.finished.review)];
    else value.base=defect==='proposal-base'?ref('proposals',other):ref('homes',home);
    const bad=seed(f,'proposals',p.id,value),q=f.propose('cos-a',{home_id:'other',input_refs:[ref('proposals',bad)]}),admitted=f.start('cos-b',{role:'qa',stage:'review',review_of:ref('proposals',q)});
    externalAtomicReject(f,()=>f.finish(admitted,{output:parentReviewOutput(q)}),'LINEAGE_REQUIRED');
    externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:bad.id,review_id:originalReview.finished.review.id}),externalProofFailure);
    const dispute=f.run('cos-a','conflict/create',{grant_id:'g-cos-a',scope:'alpha',input_refs:[ref('proposals',bad),ref('proposals',other)],summary:'Invalid typed proposal edge.',clearing_condition:'Recover correct typed evidence.'});
    externalAtomicReject(f,()=>f.run('founder','conflict/resolve',{conflict_id:dispute.id,source_instruction:'Even founder cannot bless malformed typed edges.'}),'LINEAGE_REQUIRED');
  }
});

function externalProduction(f,kind){
  const a=f.start('cos-a',{resources:['path:tree1:retained-result']});let finished;
  if(kind==='quarantined')f.run('publisher','notice/create',{scope:'alpha',content:'Current intake changes after production admission.'});
  if(kind==='unknown'||kind==='late-closure')finished=f.finish(a,{error:{code:'TIMEOUT'},termination_confirmed:false,observed_process:f.process(a,false)});
  else if(kind==='failed')finished=f.finish(a,{error:{code:'FICTIONAL_FAILURE'}});
  else finished=f.finish(a);
  let task=finished.task;
  if(kind==='late-closure')task=f.observe('task/closure',{task_id:a.task.id,attempt_id:a.task.value.attempt.id,termination_confirmed:true,observed_process:f.process(a,true)});
  return {admitted:a,finished,task};
}

test('external: returned first finish, failed, quarantined and unknown late closure retain exact result bindings',t=>{
  for(const kind of ['returned','failed','quarantined','unknown','late-closure']){
    const f=fixture(t),flow=externalProduction(f,kind),task=flow.task;
    assert.equal(flow.admitted.task.value.attempt.process,undefined);assert.equal(task.value.attempt.model_calls,1);assert(Number.isFinite(Date.parse(task.value.attempt.admitted_at)));
    assert.equal(task.value.attempt.termination_confirmed,task.value.result.termination_confirmed);
    assert.equal(get(f,'effects',task.value.attempt.effect_id).value.result_sha256,digest(task.value.result));
    if(kind==='late-closure'){assert.equal(task.value.attempt.termination_confirmed,false);assert.equal(task.value.result.termination_confirmed,false);assert.equal(task.value.closure.termination_confirmed,true);}
    const p=f.propose('cos-b',{home_id:'other',scope:'beta',input_refs:[ref('tasks',task)]});assert.equal(externalReview(f,p,'reviewer').finished.accepted,true);
    if(kind==='unknown')assert.equal(get(f,'slots',task.id).value.status,'unknown','Independent analysis does not establish original process closure');
    assert.deepEqual(get(f,'tasks',task.id),task);
  }
});

test('external: retained attempt flags, call count and admission date cannot contradict valid returned proof',t=>{
  for(const defect of ['termination','model-calls','admitted-at']){
    const f=fixture(t),flow=externalProduction(f,'returned'),attempt={...flow.task.value.attempt};
    if(defect==='termination')attempt.termination_confirmed=false;else if(defect==='model-calls')attempt.model_calls=0;else attempt.admitted_at='not-a-date';
    const bad=seed(f,'tasks',flow.task.id,{...flow.task.value,attempt}),p=f.propose('cos-b',{home_id:'other',input_refs:[ref('tasks',bad)]}),review=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(review,{output:parentReviewOutput(p)}),'LINEAGE_REQUIRED');
  }
});

test('external: missing or altered result hash never qualifies any retained result status',t=>{
  for(const kind of ['returned','failed','quarantined','unknown','late-closure'])for(const defect of ['missing','changed']){
    const f=fixture(t),flow=externalProduction(f,kind),effect=get(f,'effects',flow.task.value.attempt.effect_id),value={...effect.value};
    if(defect==='missing')delete value.result_sha256;else value.result_sha256='0'.repeat(64);seed(f,'effects',effect.id,value);
    const p=f.propose('cos-b',{home_id:'other',scope:'beta',input_refs:[ref('tasks',flow.task)]}),review=f.start('reviewer',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(review,{output:parentReviewOutput(p)}),'LINEAGE_REQUIRED');
  }
});

test('external: late closure cannot lose or contradict its native-effect closure aliases',t=>{
  for(const defect of ['missing','changed','termination']){
    const f=fixture(t),flow=externalProduction(f,'late-closure'),effect=get(f,'effects',flow.task.value.attempt.effect_id),value=structuredClone(effect.value);
    assert.equal(flow.task.value.result.termination_confirmed,false);assert.equal(flow.task.value.attempt.termination_confirmed,false);
    if(defect==='missing')delete value.closure;else if(defect==='changed')value.closure.observation.sha256='0'.repeat(64);else value.termination_confirmed=false;
    seed(f,'effects',effect.id,value);
    const p=f.propose('cos-b',{home_id:'other',scope:'beta',input_refs:[ref('tasks',flow.task)]}),admitted=f.start('reviewer',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(admitted,{output:parentReviewOutput(p)}),'LINEAGE_REQUIRED');
  }
});

test('external: cross-scope negative binds full current evidence and blocks the exact old proposal',t=>{
  for(const verdict of ['Fail','Blocked']){
    const f=fixture(t);externalMember(f,'later-reviewer');externalMember(f,'second-negative');externalMember(f,'last-pass');
    const h=externalPublish(f,'cos-a','cos-b','fact','Originally current alpha fact.'),pending=f.start('cos-b');
    const negative=externalNegative(f,h.proposal,'proposals','reviewer','beta',verdict);
    const stale=f.finish(pending);assert.equal(stale.accepted,false);assert.equal(stale.task.value.status,'quarantined');assert.equal(stale.task.value.result.termination_confirmed,true);
    const packet=externalPacket(f),entry=packet.sources.find(r=>r.family==='reviews'&&r.id===negative.review.id);
    assert(entry);assert.deepEqual(entry.value,negative.review.value);assert.equal(entry.sha256,negative.review.sha256);
    assert.deepEqual(get(f,'homes','fact'),h.home);
    const old=f.propose('cos-a',{home_id:'other'}),pass=externalReview(f,old,'later-reviewer');
    externalNegative(f,old,'proposals','second-negative','beta',verdict);
    const laterPass=externalReview(f,old,'last-pass');assert.equal(laterPass.finished.accepted,true);
    externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:old.id,review_id:pass.finished.review.id}),'CONTEXT_CHANGED');
    externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:old.id,review_id:laterPass.finished.review.id}),'REVIEW_HELD');
  }
});

test('external: exact foreign home or bound proposal negative is discovered before omission',t=>{
  for(const [family,verdict] of [['homes','Fail'],['proposals','Blocked']]){
    const f=fixture(t),h=externalPublish(f,'cos-a','cos-b','fact','Qualified foreign beta home.',{scope:'beta'}),before=externalPacket(f,'alpha');
    assert(!before.sources.some(r=>r.family==='homes'&&r.id===h.home.id));
    const adverse=externalNegative(f,family==='homes'?h.home:h.proposal,family,'reviewer','gamma',verdict),after=externalPacket(f,'alpha');
    assert(after.sources.some(r=>r.family==='homes'&&r.sha256===h.home.sha256));
    assert.deepEqual(after.sources.find(r=>r.family==='reviews'&&r.id===adverse.review.id).value,adverse.review.value);
    assert.deepEqual(get(f,'homes','fact'),h.home);assert.deepEqual(get(f,'reviews',h.finished.review.id),h.finished.review);
  }
});

test('external: foreign current dependency negative propagates through qualification closure',t=>{
  for(const family of ['homes','proposals']){
    const f=fixture(t);externalMember(f,'home-reviewer');externalMember(f,'dependency-negative');
    const d=externalPublish(f,'cos-a','cos-b','dependency','Beta dependency.',{scope:'beta'}),h=externalPublish(f,'cos-a','home-reviewer','fact','Alpha depends on beta.',{dependencies:[ref('homes',d.home)]});
    assert(!externalPacket(f,'omega').sources.some(r=>r.family==='homes'));
    const adverse=externalNegative(f,family==='homes'?d.home:d.proposal,family,'dependency-negative','gamma','Fail'),after=externalPacket(f,'omega');
    assert(after.sources.some(r=>r.family==='homes'&&r.sha256===h.home.sha256));assert(after.sources.some(r=>r.family==='homes'&&r.sha256===d.home.sha256));
    assert.deepEqual(after.sources.find(r=>r.family==='reviews'&&r.id===adverse.review.id).value,adverse.review.value);
  }
});

test('external: global unknown and requested-scope negative seeds carry subjects and implicated homes',t=>{
  for(const applicability of ['*','unknown','alpha']){
    const f=fixture(t);externalMember(f,'seed-repair-reviewer');
    const h=externalPublish(f,'cos-a','cos-b','fact','Otherwise omittable beta home.',{scope:'beta'}),p=f.propose('cos-a',{home_id:'other',scope:'gamma',input_refs:[ref('homes',h.home)]});
    assert(!externalPacket(f,'alpha').sources.some(r=>r.family==='homes'&&r.id===h.home.id));
    const adverse=externalNegative(f,p,'proposals','reviewer',applicability,'Blocked'),packet=externalPacket(f,'alpha');
    for(const [family,row] of [['reviews',adverse.review],['homes',h.home]]){
      const entry=packet.sources.find(r=>r.family===family&&r.id===row.id);assert(entry,`${applicability}: include implicated ${family}`);assert.equal(entry.sha256,row.sha256);assert.deepEqual(entry.value,row.value);
    }
    const identities=packet.sources.map(r=>canonical([r.family,r.id]));assert.equal(new Set(identities).size,identities.length);
    assert.deepEqual(adverse.review.value.subject,ref('proposals',p));
    assert.deepEqual(f.ledger.read(tx=>tx.getVersion(adverse.review.value.subject)).value,p.value);
    // The adverse subject remains exact typed historical support. Promoting it
    // into a pending live readset would incorrectly revalidate old readsets.
    const repair=f.propose('cos-a',{home_id:'other',scope:'alpha',content:'New proposal explicitly considers the adverse current evidence.'});
    assert(!repair.value.readset.some(r=>r.family==='proposals'&&r.id===p.id));
    assert(repair.value.readset.some(r=>r.family==='reviews'&&r.id===adverse.review.id));
    assert.equal(externalReview(f,repair,'seed-repair-reviewer').finished.accepted,true);
  }
});

test('external: claimed Pass cannot hide protected raw negative evidence during foreign omission',t=>{
  for(const verdict of ['Fail','Blocked']){
    const f=fixture(t),h=externalPublish(f,'cos-a','cos-b','fact','Otherwise qualified foreign home.',{scope:'beta'});
    const adverse=externalNegative(f,h.proposal,'proposals','reviewer','gamma',verdict);
    const relabelled=seed(f,'reviews',adverse.review.id,{...adverse.review.value,verdict:'Pass',blockers:[]});
    const task=f.submit('cos-a',{scope:'alpha'});
    // Indexed-P1 reconciliation: raw/stored verdict contradiction is a strict
    // global integrity Hold before a packet or qualified omission can be made.
    externalAtomicReject(f,()=>inspect(f.ledger,actor('cos-a'),'task/context',{task_id:task.id}),'REVIEW_SELECTION_INTEGRITY');
    assert.deepEqual(get(f,'reviews',relabelled.id),relabelled);
    assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref('reviews',adverse.review))).value,adverse.review.value);
    assert.deepEqual(get(f,'homes','fact'),h.home);
  }
});

test('external: unrelated historical foreign negative is not a permanent global veto',t=>{
  const f=fixture(t);for(const id of ['h1-reviewer','h2-reviewer','d2-reviewer','historical-negative','future-independent'])externalMember(f,id);
  const d1=externalPublish(f,'cos-a','cos-b','dependency','Old beta dependency D1.',{scope:'beta'});
  externalPublish(f,'cos-a','h1-reviewer','fact','Alpha H1 depends on D1.',{dependencies:[ref('homes',d1.home)]});
  const h2=externalPublish(f,'cos-a','h2-reviewer','fact','Alpha H2 drops the live dependency.',{dependencies:[]});
  const d2=externalPublish(f,'cos-a','d2-reviewer','dependency','Current beta dependency D2.',{scope:'beta'});
  const adverse=externalNegative(f,d1.proposal,'proposals','historical-negative','gamma','Fail');
  const obligation=f.run('publisher','notice/create',{scope:'*',content:'An unresolved authoritative obligation from the older finding remains binding.'}),packet=externalPacket(f,'omega');
  assert(!packet.sources.some(r=>r.family==='homes'&&[h2.home.id,d2.home.id].includes(r.id)),'A sealed historical dependency is not a live dependency');
  assert(!packet.sources.some(r=>r.family==='reviews'&&r.id===adverse.review.id));
  assert.deepEqual(packet.sources.find(r=>r.family==='notices'&&r.id===obligation.id).value,obligation.value);
  const p=f.propose('cos-a',{home_id:'other',scope:'omega',input_refs:[ref('homes',h2.home)]}),old=f.start('cos-b',{role:'qa',stage:'review',scope:'omega',review_of:ref('proposals',p)});
  externalAtomicReject(f,()=>f.finish(old,{output:parentReviewOutput(p),native_id:'old-D1-reviewer-fresh-session'}),'REVIEW_INDEPENDENCE');
  assert.equal(externalReview(f,p,'future-independent').finished.accepted,true);assert.deepEqual(get(f,'reviews',adverse.review.id),adverse.review);
});

function externalNegativeOnConnection(ledger,subject,family,who,scope){
  let operation=0;const run=(principal,action,args)=>execute(ledger,actor(principal),action,{operation_id:`external-other-negative-${++operation}`,...args});
  const task=run(who,'task/submit',{grant_id:`g-${who}`,scope,role:'qa',stage:'review',instructions:'Review exact retained fixture evidence.',acceptance:'Report actual adverse result.',review_of:ref(family,subject)});
  run(who,'task/claim',{task_id:task.id});const admitted=run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
  const output=canonical({review:{subject:ref(family,subject),verdict:'Fail',reason:'Material evidence committed on another SQLite connection.',blockers:['Reassess pending current use.']}});
  return createRuntimeObserver(ledger).record('task/finish',{operation_id:'external-other-negative-finish',task_id:task.id,attempt_id:admitted.task.value.attempt.id,output,native_id:'other-connection-review-native',termination_confirmed:true,observed_process:{pid:2468,started_at:admitted.task.value.attempt.admitted_at,close_observed:true}});
}

test('external: final publication sees second-connection negative after a successful preliminary check',t=>{
  for(const intervening of [false,true]){
    const f=fixture(t);externalMember(f,'publisher');
    const h=externalPublish(f,'cos-a','cos-b','fact','Current alpha home.'),p=f.propose('cos-a',{home_id:'other',content:'Pending next proposal.'}),review=externalReview(f,p,'publisher');
    assert.equal(f.ledger.read(tx=>validateContext(tx,review.admitted.context)),true);
    if(intervening){
      const other=new PeerLedger(f.root);try{assert.equal(externalNegativeOnConnection(other,h.home,'homes','reviewer','beta').accepted,true);}finally{other.close();}
      externalAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id}),externalProofFailure);assert.equal(get(f,'homes','other'),null);
    }else assert.equal(f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:p.id,review_id:review.finished.review.id}).value.status,'current');
  }
});

test('external: conflict resolution requires newly relevant adverse evidence explicitly and can then reassess',t=>{
  const f=fixture(t);externalMember(f,'publisher',{qualifications:['conflict/resolve']});
  const h=externalPublish(f,'cos-a','cos-b','fact','Current alpha home.'),p=f.propose('cos-a',{home_id:'other'});
  const dispute=f.run('cos-a','conflict/create',{grant_id:'g-cos-a',scope:'alpha',input_refs:[ref('homes',h.home),ref('proposals',p)],summary:'Current material dispute.',clearing_condition:'Independent reassessment with complete current evidence.'});
  // A dispute has no saved admission/context snapshot. Its resolution must
  // recompute current closure and require explicit evidence, not invent one.
  const adverse=externalNegative(f,h.proposal,'proposals','reviewer','beta','Fail');
  externalAtomicReject(f,()=>f.run('publisher','conflict/resolve',{grant_id:'g-publisher',conflict_id:dispute.id,source_instruction:'Cannot omit the newly relevant adverse row.'}),'EVIDENCE_CHANGED');
  const resolved=f.run('publisher','conflict/resolve',{grant_id:'g-publisher',conflict_id:dispute.id,evidence_refs:[ref('reviews',adverse.review)],source_instruction:'Explicitly reassess the exact newly relevant adverse evidence.'});
  assert.equal(resolved.value.status,'resolved');assert.deepEqual(resolved.value.resolution.evidence,[ref('reviews',adverse.review)]);
});

test('external: current shared home DAG reuses exact refs before graph analysis and planner work stays bounded',t=>{
  const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:200000,max_model_calls:100}}}),homes=[];
  f.ledger.write('fixture.external-shared-homes','founder',tx=>{
    for(let i=0;i<32;i++)homes.push(tx.put('homes',`dag-${String(i).padStart(2,'0')}`,{status:'current',scope:'alpha',principal_id:'founder',content:`Shared DAG node ${i}.`,dependencies:homes.slice(Math.max(0,i-2)).map(row=>ref('homes',row))},0));
  });
  const task=f.submit('cos-a');let gets=0;
  const readSeam={read:fn=>f.ledger.read(tx=>fn(Object.freeze({...tx,get:(family,id)=>{if(family==='homes')gets++;return tx.get(family,id);}})))};
  const started=performance.now(),packet=inspect(readSeam,actor('cos-a'),'task/context',{task_id:task.id});
  assert.equal(packet.sources.filter(r=>r.family==='homes').length,32);assert(packet.utf8_bytes<=200000);
  assert(gets<=32*100,`Direct exact-home accesses must be bounded by distinct refs, observed ${gets}`);
  assert(performance.now()-started<10000,'Generous liveness ceiling, not a portable performance benchmark');
  const before=performance.now(),proposal=f.propose('cos-a',{home_id:'other'}),review=externalReview(f,proposal,'cos-b');
  assert.equal(review.finished.accepted,true);assert(performance.now()-before<10000,'Planner caches must not hide repeated exponential CPU traversal');
});

test('external: deep current home closure holds at real context capacity without stack failure or mutations',t=>{
  const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:200000,max_model_calls:100}}});let previous=null;
  for(let start=0;start<1500;start+=50)f.ledger.write('fixture.external-deep-homes','founder',tx=>{
    for(let i=start;i<start+50;i++)previous=tx.put('homes',`deep-${String(i).padStart(4,'0')}`,{status:'current',scope:'alpha',principal_id:'founder',content:'Complete deep current condition.',dependencies:previous?[ref('homes',previous)]:[]},0);
  });
  const task=f.submit('cos-a'),started=performance.now();
  externalAtomicReject(f,()=>inspect(f.ledger,actor('cos-a'),'task/context',{task_id:task.id}),'CONTEXT_CAPACITY');
  f.claim(task);const admitted=f.admit(task);
  assert.equal(admitted.admitted,false);assert.equal(admitted.code,'CONTEXT_CAPACITY');
  assert.equal(get(f,'tasks',task.id).value.attempt,null);assert.equal(get(f,'control','usage'),null);assert.equal(get(f,'grants','g-cos-a').value.used_model_calls,0);
  // An admission Hold has an attributable command receipt; it is neither a
  // consumed model attempt nor a reason to assert literally no ledger writes.
  assert(performance.now()-started<10000,'Deep traversal is bounded; this is a generous liveness check, not a benchmark');
});

test('external: missing or wrong historical home ancestry cannot be replaced by a current row',t=>{
  for(const defect of ['missing','wrong-hash']){
    const f=fixture(t),h1=externalPublish(f,'cos-a','cos-b','fact','Exact historical H1.'),h2=externalPublish(f,'cos-a','reviewer','fact','Exact current H2.');
    const previous=defect==='missing'?{family:'homes',id:'absent-historical-home',revision:1,sha256:'0'.repeat(64)}:{...ref('homes',h1.home),sha256:'0'.repeat(64)};
    const bad=seed(f,'homes',h2.home.id,{...h2.home.value,previous}),p=f.propose('cos-a',{home_id:'other',scope:'beta',input_refs:[ref('homes',bad)]});
    externalMember(f,'historical-independent');
    const admitted=f.start('historical-independent',{role:'qa',stage:'review',scope:'beta',review_of:ref('proposals',p)});
    externalAtomicReject(f,()=>f.finish(admitted,{output:parentReviewOutput(p)}),externalProofFailure);
    assert.deepEqual(f.ledger.read(tx=>tx.getVersion(ref('homes',h1.home))).value,h1.home.value);
  }
});

test('external: exactly 10000 semantic references work and 10001 holds atomically',t=>{
  const f=fixture(t),prototype=f.propose('cos-a',{content:'Fictional bounded graph leaf.'});let previous=prototype;
  // Seed only ordinary fictional proposal rows through actual P1. Batches of
  // 50 keep each creation event small; a single 10k-change event would make
  // P1's per-row creation-event verification needlessly quadratic. No accepted
  // review, producer proof, history row or semantic judgment is fabricated.
  for(let start=1;start<9999;start+=50){
    f.ledger.write('fixture.external-bounded-chain','founder',tx=>{
      for(let i=start;i<Math.min(start+50,9999);i++)previous=tx.put('proposals',`external-boundary-${String(i).padStart(5,'0')}`,{...prototype.value,content:'Fictional bounded graph link.',readset:[ref('proposals',previous)]},0);
    });
  }
  const atLimit=f.propose('cos-b',{home_id:'other',input_refs:[ref('proposals',previous)]});
  assert.equal(externalReview(f,atLimit,'reviewer').finished.accepted,true,'9999 chain nodes plus pending subject is exactly 10000 semantic references');
  // Indexed-LIVE-discovery reconciliation: the successful 10000-reference
  // review now exists. Reusing its subject must also acquire its exact current
  // Pass candidate (and protected producer support), so the FIRST over-budget
  // operation is proposal intake, before any further model attempt is admitted.
  const before=indexedSQLState(f),usage=get(f,'control','usage'),reviewerGrant=get(f,'grants','g-reviewer');
  assert.throws(()=>f.propose('cos-b',{home_id:'other',input_refs:[ref('proposals',atLimit)]}),code('LOOKUP_CAPACITY'));
  assert.deepEqual(indexedSQLState(f),before);
  assert.deepEqual(get(f,'control','usage'),usage);assert.equal(usage.value.model_calls,1);
  assert.deepEqual(get(f,'grants','g-reviewer'),reviewerGrant);
  assert.equal(rows(f.ledger,'slots',{status:'active'}).length,0,'the earlier closed positive is retained; no failing-operation attempt is created');
});

test('external: one source closure shares its reference budget across negative discovery and current homes',t=>{
  const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:200000,max_model_calls:100}}});
  const prototype=f.propose('cos-a',{scope:'foreign-proof',content:'Fictional historical subject leaf.'});let previous=prototype;
  // Ordinary fixture source data only. No accepted review/protected proof is
  // seeded: the single global adverse review below uses the real model API.
  for(let start=1;start<9900;start+=50)f.ledger.write('fixture.external-shared-budget-subject','founder',tx=>{
    for(let i=start;i<Math.min(start+50,9900);i++)previous=tx.put('proposals',`shared-budget-${String(i).padStart(5,'0')}`,{...prototype.value,content:'Fictional historical subject link.',readset:[ref('proposals',previous)]},0);
  });
  const adverse=externalNegative(f,previous,'proposals','cos-b','*','Fail');
  assert.equal(adverse.review.value.verdict,'Fail');assert.equal(adverse.review.value.scope,'*');
  const addHomes=(first,last)=>f.ledger.write('fixture.external-shared-budget-homes','founder',tx=>{
    for(let i=first;i<last;i++)tx.put('homes',`budget-home-${String(i).padStart(3,'0')}`,{status:'current',scope:'isolated',principal_id:'founder',content:'Compact independently current fixture condition.'},0);
  });
  addHomes(0,40);addHomes(40,80);
  const task=f.submit('cos-a',{scope:'isolated'}),beforePacket=inspect(f.ledger,actor('cos-a'),'task/context',{task_id:task.id});
  assert(beforePacket.utf8_bytes<200000,'The complete delivered packet fits; this is a reference-work bound, not a byte-overflow test');
  assert.equal(beforePacket.sources.filter(r=>r.family==='homes').length,80);
  assert(beforePacket.sources.some(r=>r.family==='reviews'&&r.id===adverse.review.id));
  addHomes(80,120);
  // Each source family and each isolated proof/discovery phase remains below
  // 10000, but their exact union (9900 proposals + proof/review +120 homes)
  // exceeds it. All caches/purposes in this one context must share the bound.
  const snapshot=()=>Object.fromEntries([
    ['peer_rows','family,id'],['peer_versions','family,id,revision'],['peer_events','seq'],['peer_outbox','seq'],['peer_membership','family,selector'],['peer_generations','family'],['peer_meta','id']
  ].map(([table,order])=>[table,digest(JSON.stringify(f.ledger.db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()))]));
  const before=snapshot();
  assert.throws(()=>inspect(f.ledger,actor('cos-a'),'task/context',{task_id:task.id}),code('LOOKUP_CAPACITY'));
  assert.deepEqual(snapshot(),before);assert.equal(get(f,'tasks',task.id).value.attempt,null);assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('external: founder resolution exception does not waive current evidence integrity',t=>{
  const f=fixture(t),chain=transferredParentChild(f);
  seed(f,'tasks',chain.parent.id,{...chain.parent.value,reconstruction_marker:'Changed exact parent before resolution.'});
  const p=f.propose(chain.owner,{input_refs:[ref('tasks',chain.leaf)]}),conflict=parentConflict(f,chain,p);
  externalAtomicReject(f,()=>f.run('founder','conflict/resolve',{conflict_id:conflict.id,source_instruction:'Founder cannot erase stale source integrity.'}),e=>e.code==='SOURCE_CHANGED'&&e.message===`Exact source changed: tasks/${chain.parent.id}`);
  const valid=fixture(t),a=valid.propose('founder'),b=valid.propose('cos-b',{home_id:'other'}),own=valid.run('founder','conflict/create',{scope:'alpha',input_refs:[ref('proposals',a),ref('proposals',b)],summary:'Founder is explicitly involved.',clearing_condition:'Founder disposition permitted for valid evidence.'});
  assert.equal(valid.run('founder','conflict/resolve',{conflict_id:own.id,source_instruction:'Explicit founder exception with valid current evidence.'}).value.status,'resolved');
});

test('external: late negative home review is full current evidence and quarantines older pending work',t=>{
  for(const verdict of ['Fail','Blocked']){
    const f=fixture(t);externalMember(f,'publisher');externalMember(f,'future-reviewer');
    const h1=externalPublish(f,'cos-a','cos-b','fact','Initially published H1.'),proposal=f.propose('cos-a',{home_id:'other',content:'Pending review before later counterevidence.'});
    const producer=f.start('cos-b',{resources:['path:tree1:pending-before-negative']}),pendingReview=f.start('publisher',{role:'qa',stage:'review',review_of:ref('proposals',proposal)});
    const late=f.start('reviewer',{role:'qa',stage:'review',review_of:ref('proposals',h1.proposal)}),output=canonical({review:{subject:ref('proposals',h1.proposal),verdict,reason:'New exact-subject material counterevidence.',blockers:['A material condition now requires a changed proposal.']}});
    const negative=f.finish(late,{output,native_id:`late-${verdict}-native`});
    assert.equal(negative.accepted,true);assert.equal(negative.review.value.verdict,verdict);
    assert(!producer.context.sources.some(r=>r.family==='reviews'&&r.id===negative.review.id));
    const usage=get(f,'control','usage'),producerGrant=get(f,'grants','g-cos-b'),reviewGrant=get(f,'grants','g-publisher');
    const quarantined=f.finish(producer),quarantinedReview=f.finish(pendingReview,{output:parentReviewOutput(proposal)});
    for(const [original,result] of [[producer,quarantined],[pendingReview,quarantinedReview]]){
      assert.equal(result.accepted,false);assert.equal(result.task.value.status,'quarantined');
      assert.equal(result.task.value.attempt.id,original.task.value.attempt.id);assert.equal(result.task.value.attempt.model_calls,1);
      assert.deepEqual(result.task.value.attempt.context,original.context);assert.equal(result.task.value.result.termination_confirmed,true);
      assert.equal(get(f,'slots',original.task.id).value.status,'released');assert.equal(rows(f.ledger,'claims',{task_id:original.task.id,status:'held'}).length,0);
    }
    assert.equal(quarantinedReview.review,null,'Stale returned review text is retained without creating an accepted review');
    assert.deepEqual(get(f,'control','usage'),usage);assert.deepEqual(get(f,'grants','g-cos-b'),producerGrant);assert.deepEqual(get(f,'grants','g-publisher'),reviewGrant);
    assert.deepEqual(get(f,'homes','fact'),h1.home,'Counterevidence changes required evidence, without rewriting the already published home');
    const fresh=f.start('future-reviewer'),entry=fresh.context.sources.find(r=>r.family==='reviews'&&r.id===negative.review.id);
    assert(entry,'Fresh same-scope packet must carry the complete exact negative review');assert.deepEqual(entry.value,negative.review.value);assert.equal(entry.sha256,negative.review.sha256);
    assert.deepEqual(fresh.context.membership,producer.context.membership,'Negative review sources do not invent a new membership schema');
    assert.equal(f.finish(fresh).accepted,true);
    const changed=externalPublish(f,'cos-a','future-reviewer','fact',`Changed H2 explicitly addresses ${verdict} counterevidence.`);
    assert.equal(changed.home.value.status,'current');assert(changed.proposal.value.readset.some(r=>r.family==='reviews'&&r.id===negative.review.id));
    assert.deepEqual(get(f,'reviews',negative.review.id),negative.review);
  }
});

// Indexed-consumer prototype only. The bulk records below prove P1 extraction
// and selection mechanics, never P2 authority, independence or native approval.
// Every semantic negative sentinel uses f.observe through externalNegative().
function indexedSQLState(f){
 const result={},db=f.ledger.db;
 result.schema=digest(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name LIKE 'peer_%' ORDER BY type,name").all()));
 for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'peer_%' ORDER BY name").all()){
  const hash=indexedCreateHash('sha256');
  for(const row of db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).iterate())hash.update(JSON.stringify(row)+'\n');
  result[name]=hash.digest('hex');
 }
 return result;
}
function indexedAtomicReject(f,operation,expected){
 const before=indexedSQLState(f);assert.throws(operation,code(expected));
 assert.deepEqual(indexedSQLState(f),before,'a scale Hold cannot append commands, history, observations, attempts or derived metadata');
}
function indexedStructuralReview(i,subject){
 const suffix=String(i).padStart(5,'0'),taskId=`indexed-bulk-task-${suffix}`,attemptId=`indexed-bulk-attempt-${suffix}`,native=`synthetic-indexed-bulk-native-${suffix}`,scope='indexed-bulk-foreign';
 const reviewId=peerDigest(['review',taskId,attemptId]),context=peerDigest(['synthetic-indexed-bulk-context',i]);
 const raw={subject,verdict:'Fail',reason:'Synthetic P1 index mechanics only.',blockers:['Synthetic unrelated finding.']},output=canonical({review:raw}),outputHash=digest(output);
 const observation={kind:'runtime_observation',status:'recorded',action:'task/finish',task_id:taskId,attempt_id:attemptId,scope,native_id:native,context_sha256:context,output_sha256:outputHash,termination_confirmed:true,review:raw};
 const observationRow={family:'effects',id:peerDigest(['runtime-observation',taskId,attemptId,'task/finish']),revision:1,sha256:peerDigest(observation),value:observation};
 const task={status:'returned',scope,definition:{scope},review_id:reviewId,review_of:subject,attempt:{id:attemptId,native_id:native,termination_confirmed:true,context:{sha256:context}},result:{output,output_sha256:outputHash,native_id:native,error:null,termination_confirmed:true,observation:ref('effects',observationRow)}};
 const taskRow={family:'tasks',id:taskId,revision:1,sha256:peerDigest(task),value:task};
 const review={status:'accepted',scope,task_id:taskId,...raw,native_id:native,context_sha256:context,output_sha256:outputHash,termination_confirmed:true,proof:{protocol:'peer-runtime-observation-v1',task:ref('tasks',taskRow),observation:ref('effects',observationRow)}};
 return [observationRow,taskRow,{family:'reviews',id:reviewId,revision:1,sha256:peerDigest(review),value:review}];
}
function indexedBodyTrace(ledger,bulk){
 const original=ledger.query,forbidden=new Set(),reviewBodies=new Set();
 const remember=(family,id)=>{if(bulk[family]?.has(id))forbidden.add(`${family}/${id}`);if(family==='reviews')reviewBodies.add(id);};
 ledger.query=function(sql,...parameters){
  const statement=Reflect.apply(original,this,[sql,...parameters]);
  return new Proxy(statement,{get(object,key){
   const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
   if(!['get','all'].includes(key))return value.bind(object);
   return (...args)=>{
    const result=Reflect.apply(value,object,args),rows=key==='all'?result:result?[result]:[];
    for(const row of rows)if(typeof row?.bytes==='string'){
     if(row.family&&row.id)remember(row.family,row.id);
     else if(/peer_rows|peer_versions/.test(sql)){
      if(bulk[args[0]]&&typeof args[1]==='string')remember(args[0],args[1]);
      else{const literal=sql.match(/family='(reviews|tasks|effects)'/);if(literal&&typeof args[0]==='string')remember(literal[1],args[0]);}
     }
    }
    return result;
   };
  }});
 };
 return {forbidden,reviewBodies,restore(){ledger.query=original;}};
}

test('external indexed scale: 10001 unrelated structural reviews preserve real workflows and exact negative completeness',t=>{
 const f=fixture(t),bulk={reviews:new Set(),tasks:new Set(),effects:new Set()};
 for(const id of ['scale-home-negative','scale-pass-before','scale-pass-after','scale-proposal-negative','scale-seed-global','scale-seed-unknown','scale-seed-requested','scale-fresh-worker'])externalMember(f,id);
 const u=f.propose('cos-a',{home_id:'other',scope:'indexed-subject-u',content:'Real typed unpublished archive subject U.'});
 const v=f.propose('cos-a',{home_id:'other',scope:'indexed-subject-v',content:'Real typed unpublished archive subject V.'});
 const foreign=externalPublish(f,'cos-a','cos-b','fact','Qualified foreign beta home.',{scope:'beta'});
 const proposal=f.propose('cos-a',{home_id:'other',content:'Independently reviewed publication before unrelated history.'}),pass=externalReview(f,proposal,'reviewer');
 const ordinary=f.start('cos-a',{resources:['path:tree1:indexed-before-bulk']}),beforeContext=ordinary.context,usage=get(f,'control','usage');
 assert(!beforeContext.sources.some(r=>r.family==='homes'&&r.id===foreign.home.id));
 for(let offset=0;offset<10001;offset+=25){
  const batch=[];
  for(let i=offset;i<Math.min(10001,offset+25);i++){
   const records=indexedStructuralReview(i,ref('proposals',i<5000?u:v));batch.push(records);
   for(const row of records)bulk[row.family].add(row.id);
  }
  f.ledger.write('fixture.indexed-structural-review-mechanics','founder',tx=>{
   for(const records of batch)for(const row of records)tx.put(row.family,row.id,row.value,0);
  });
 }
 assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_review_selection p JOIN peer_rows r ON r.family='reviews' AND r.id=p.review_id WHERE r.task_id LIKE 'indexed-bulk-task-%' AND p.outcome='PROTECTED'").get().n,10001,'all bulk rows satisfy real P1 extraction; this is not P2 qualification');
 assert.equal(f.ledger.db.prepare('SELECT COUNT(*) AS n FROM peer_review_errors').get().n,0);
 assert.deepEqual(get(f,'control','usage'),usage,'fictional P1 index fixtures consume no model attempts');
 const trace=indexedBodyTrace(f.ledger,bulk);
 try{
  const afterContext=inspect(f.ledger,actor('cos-a'),'task/context',{task_id:ordinary.task.id});
  assert.equal(afterContext.text,beforeContext.text);assert.equal(afterContext.sha256,beforeContext.sha256);
  assert.equal(f.finish(ordinary).accepted,true);
  assert(!externalPacket(f).sources.some(r=>r.family==='homes'&&r.id===foreign.home.id),'qualified foreign omission survives unrelated review scale');
  const published=f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:proposal.id,review_id:pass.finished.review.id});
  assert.equal(published.value.status,'current');assert.deepEqual(get(f,'homes',foreign.home.id),foreign.home);
  assert.equal(trace.forbidden.size,0,'ordinary context, closure, omission and publication hydrate no unrelated review/task/observation body');

  const pending=f.start('cos-a',{resources:['path:tree1:indexed-pending-negative']});
  const homeNegative=externalNegative(f,foreign.proposal,'proposals','scale-home-negative','gamma','Fail');
  const spent=get(f,'control','usage'),quarantined=f.finish(pending);
  assert.equal(quarantined.accepted,false);assert.equal(quarantined.task.value.status,'quarantined');
  assert.equal(quarantined.task.value.attempt.id,pending.task.value.attempt.id);assert.equal(quarantined.task.value.result.termination_confirmed,true);
  assert.equal(get(f,'slots',pending.task.id).value.status,'released');assert.equal(rows(f.ledger,'claims',{task_id:pending.task.id,status:'held'}).length,0);assert.deepEqual(get(f,'control','usage'),spent);
  const exactPacket=externalPacket(f),homeEntry=exactPacket.sources.find(r=>r.family==='homes'&&r.id===foreign.home.id),negativeEntry=exactPacket.sources.find(r=>r.family==='reviews'&&r.id===homeNegative.review.id);
  assert.deepEqual(homeEntry?.value,foreign.home.value);assert.deepEqual(negativeEntry?.value,homeNegative.review.value);assert.equal(negativeEntry.sha256,homeNegative.review.sha256);
  assert(trace.reviewBodies.has(homeNegative.review.id),'the body instrumentation observes the selected real sentinel');

  const target=f.propose('cos-a',{home_id:'other',expected_revision:published.revision,content:'Separate pending subject for cross-scope veto.'});
  const prior=externalReview(f,target,'scale-pass-before');
  externalNegative(f,target,'proposals','scale-proposal-negative','gamma','Blocked');
  indexedAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:target.id,review_id:prior.finished.review.id}),'CONTEXT_CHANGED');
  const later=externalReview(f,target,'scale-pass-after');assert.equal(later.finished.accepted,true);
  indexedAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:target.id,review_id:later.finished.review.id}),'REVIEW_HELD');

  const unpublished=f.propose('cos-a',{home_id:'dependency',scope:'indexed-unpublished',content:'Unpublished material subject.',input_refs:[ref('homes',foreign.home)]});
  for(const [scope,who] of [['*','scale-seed-global'],['unknown','scale-seed-unknown'],['alpha','scale-seed-requested']]){
   const negative=externalNegative(f,unpublished,'proposals',who,scope,'Blocked'),packet=externalPacket(f),entry=packet.sources.find(r=>r.family==='reviews'&&r.id===negative.review.id);
   assert.deepEqual(entry?.value,negative.review.value);assert.equal(entry.sha256,negative.review.sha256);assert.equal(entry.revision,negative.review.revision);
   assert.deepEqual(negative.review.value.subject,ref('proposals',unpublished));
   assert.deepEqual(f.ledger.read(tx=>tx.getVersion(negative.review.value.subject)).value,unpublished.value);
   assert(!packet.sources.some(r=>r.family==='proposals'&&r.id===unpublished.id),'historical negative subjects are not promoted into ordinary live source bodies');
   assert(trace.reviewBodies.has(negative.review.id));
  }
  const fresh=f.start('scale-fresh-worker');assert.equal(f.finish(fresh).accepted,true,'complete adverse evidence permits unrelated ordinary work');
  assert.equal(trace.forbidden.size,0,'every exact/scoped real-negative workflow still excludes all bulk bodies');

  // Both exact-subject arms are below 10k; their distinct union is 10001.
  // Request it last, without ever attempting to approve the mechanical rows.
  const union=f.submit('cos-a',{input_refs:[ref('proposals',u),ref('proposals',v)]});f.claim(union);
  const before=indexedSQLState(f),beforeUsage=get(f,'control','usage');
  assert.throws(()=>f.admit(union),code('LOOKUP_CAPACITY'));
  assert.deepEqual(indexedSQLState(f),before);assert.deepEqual(get(f,'control','usage'),beforeUsage);
  assert.equal(get(f,'tasks',union.id).value.attempt,null);assert.equal(get(f,'tasks',union.id).value.status,'pending');
  assert.equal(trace.forbidden.size,0,'aggregate matching capacity is checked before any truncated bulk page is hydrated');
 }finally{trace.restore();}
});

const {reviewScope:indexedReviewScope}=await import('../plugins/soloco/runtime/peers/review-selection.mjs');
function indexedProviderError(kind){
 if(kind==='capacity-code')return Object.assign(Error('Actual provider read failed while carrying a context-capacity code.'),{code:'CONTEXT_CAPACITY'});
 let failure;try{indexedReviewScope(42);}catch(error){failure=error;}
 assert.ok(failure instanceof Error);return failure;
}
test('external indexed provider faults: qualification and physical freshness preserve error identity and retry without another model call',t=>{
 for(const kind of ['helper-fact','capacity-code']){
  const f=fixture(t);externalMember(f,`provider-negative-${kind}`);
  const h1=externalPublish(f,'cos-a','cos-b','fact','Historical beta H1.',{scope:'beta'});
  const h2=externalPublish(f,'cos-a','reviewer','fact','Current qualified beta H2.',{scope:'beta'});
  const probe=f.submit('cos-a',{scope:'alpha'}),injected=indexedProviderError(kind);
  const original=f.ledger.query;let armed=false,hits=0;
  f.ledger.query=function(sql,...parameters){
   const statement=Reflect.apply(original,this,[sql,...parameters]);
   if(sql!=='SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? AND revision=?')return statement;
   return new Proxy(statement,{get(object,key){
    const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
    if(key!=='get')return value.bind(object);
    return (...args)=>{
     const result=Reflect.apply(value,object,args);
     if(armed&&args[0]==='homes'&&args[1]===h1.home.id&&args[2]===h1.home.revision){
      assert.equal(result.sha256,h1.home.sha256,'the hook follows a real exact historical-predecessor SQLite read');
      armed=false;hits++;throw injected;
     }
     return result;
    };
   }});
  };
  try{
   const beforeProbe=indexedSQLState(f);armed=true;
   assert.throws(()=>inspect(f.ledger,actor('cos-a'),'task/context',{task_id:probe.id}),error=>{assert.equal(error,injected);return true;});
   assert.equal(hits,1);assert.deepEqual(indexedSQLState(f),beforeProbe);
   assert(!inspect(f.ledger,actor('cos-a'),'task/context',{task_id:probe.id}).sources.some(r=>r.family==='homes'&&r.id===h2.home.id),'with the hook off, authentic historical qualification still permits omission');

   const admitted=f.start('cos-a',{resources:['path:tree1:provider-read-fault']}),beforeFinish=indexedSQLState(f),spent=get(f,'control','usage'),grant=get(f,'grants','g-cos-a');
   assert(!admitted.context.sources.some(r=>r.family==='homes'&&r.id===h2.home.id));armed=true;
   assert.throws(()=>f.finish(admitted),error=>{assert.equal(error,injected);return true;});
   assert.equal(hits,2);assert.deepEqual(indexedSQLState(f),beforeFinish,'a provider failure cannot become a persisted quarantined physical finish');
   assert.deepEqual(get(f,'tasks',admitted.task.id),admitted.task);assert.equal(get(f,'slots',admitted.task.id).value.status,'active');
   assert.equal(rows(f.ledger,'claims',{task_id:admitted.task.id,status:'held'}).length,1);
   assert.deepEqual(get(f,'control','usage'),spent);assert.deepEqual(get(f,'grants','g-cos-a'),grant);
   const retry=f.finish(admitted);assert.equal(retry.accepted,true);assert.equal(retry.task.value.attempt.id,admitted.task.value.attempt.id);
   assert.equal(retry.task.value.attempt.model_calls,1);assert.deepEqual(get(f,'control','usage'),spent);assert.deepEqual(get(f,'grants','g-cos-a'),grant);
   assert.equal(get(f,'slots',admitted.task.id).value.status,'released');assert.equal(rows(f.ledger,'claims',{task_id:admitted.task.id,status:'held'}).length,0);

   const pending=f.start('cos-a',{resources:['path:tree1:provider-real-negative']});
   const adverse=externalNegative(f,h2.home,'homes',`provider-negative-${kind}`,'gamma','Fail'),afterNegativeUsage=get(f,'control','usage');
   const stale=f.finish(pending);
   assert.equal(stale.accepted,false);assert.equal(stale.task.value.status,'quarantined');assert.equal(stale.task.value.result.termination_confirmed,true);
   assert.deepEqual(stale.task.value.attempt.context,pending.context);assert.equal(stale.task.value.attempt.model_calls,1);
   assert.equal(get(f,'slots',pending.task.id).value.status,'released');assert.equal(rows(f.ledger,'claims',{task_id:pending.task.id,status:'held'}).length,0);
   assert.deepEqual(get(f,'control','usage'),afterNegativeUsage);assert.deepEqual(get(f,'reviews',adverse.review.id),adverse.review);
  }finally{armed=false;f.ledger.query=original;}
 }
});

const {REVIEW_PREPARATION_BYTES:indexedPreparationLimit}=await import('../plugins/soloco/runtime/peers/model.mjs');
test('external indexed own capacity: preparation exhaustion still records a closed quarantine and releases physical reservations',t=>{
 assert.equal(indexedPreparationLimit,16*1024*1024,'explicit prototype preparation contract, independent of provider errors');
 const f=fixture(t),admitted=f.start('cos-a',{resources:['path:tree1:own-preparation-exhaustion']});
 const usage=get(f,'control','usage'),grant=get(f,'grants','g-cos-a');
 f.ledger.write('fixture.indexed-own-preparation-capacity','founder',tx=>{
  for(let i=0;i<19;i++)tx.put('homes',`indexed-large-home-${String(i).padStart(2,'0')}`,{status:'current',scope:'isolated',principal_id:'founder',content:'x'.repeat(900000)},0);
 });
 const before=indexedSQLState(f);
 assert.throws(()=>inspect(f.ledger,actor('cos-a'),'task/context',{task_id:admitted.task.id}),error=>{
  assert.equal(error.code,'CONTEXT_CAPACITY');assert(error.message.includes(String(indexedPreparationLimit)),'the Hold must come from the encoded preparation bound');return true;
 });
 assert.deepEqual(indexedSQLState(f),before);
 const finished=f.finish(admitted);
 assert.equal(finished.accepted,false);assert.equal(finished.task.value.status,'quarantined');assert.equal(finished.task.value.result.termination_confirmed,true);
 assert.deepEqual(finished.task.value.attempt.context,admitted.context);assert.equal(finished.task.value.attempt.model_calls,1);assert.equal(finished.review,null);
 assert.equal(get(f,'slots',admitted.task.id).value.status,'released');assert.equal(rows(f.ledger,'claims',{task_id:admitted.task.id,status:'held'}).length,0);
 assert.equal(get(f,'effects',admitted.task.value.attempt.effect_id).value.termination_confirmed,true);
 assert.deepEqual(get(f,'control','usage'),usage);assert.deepEqual(get(f,'grants','g-cos-a'),grant);
 assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='homes'").get().n,19,'no required large source was truncated or rewritten');
});

test('external indexed discovery: live task parents acquire foreign negatives while review history does not become live',t=>{
 const live=fixture(t),parent=live.finish(live.start('cos-a')).task;
 const child=live.submit('cos-a',{parent_task_id:parent.id});
 assert.deepEqual(child.value.definition.parent_ref,ref('tasks',parent));assert.deepEqual(child.value.parent_ref,ref('tasks',parent));
 const adverse=externalNegative(live,parent,'tasks','cos-b','gamma','Fail');
 const consumer=live.submit('reviewer',{scope:'alpha',input_refs:[ref('tasks',child)]}),packet=inspect(live.ledger,actor('reviewer'),'task/context',{task_id:consumer.id});
 const finding=packet.sources.find(r=>r.family==='reviews'&&r.id===adverse.review.id);
 assert.equal(adverse.review.value.scope,'gamma');assert.equal(consumer.value.scope,'alpha');
 assert.deepEqual(finding?.value,adverse.review.value);assert.equal(finding.sha256,adverse.review.sha256);
 assert(packet.sources.some(r=>r.family==='tasks'&&r.id===child.id));
 assert.deepEqual(live.ledger.read(tx=>tx.getVersion(ref('tasks',parent))).value,parent.value);

 const historical=fixture(t);externalMember(historical,'history-transfer-recipient');
 const produced=historical.finish(historical.start('cos-a')).task,reviewTask=historical.start('cos-b',{role:'qa',stage:'review',scope:'carrier-foreign',review_of:ref('tasks',produced)});
 const output=canonical({review:{subject:ref('tasks',produced),verdict:'Pass',reason:'Protected fixture review of exact returned production.',blockers:[]}});
 const carrier=historical.finish(reviewTask,{output,native_id:`historical-carrier-${reviewTask.task.id}`});assert.equal(carrier.accepted,true);
 const foreignFinding=externalNegative(historical,produced,'tasks','reviewer','gamma','Fail');
 const contextFromCarrier=()=>{
  const task=historical.submit('cos-a',{scope:'alpha',input_refs:[ref('reviews',carrier.review)]});
  return inspect(historical.ledger,actor('cos-a'),'task/context',{task_id:task.id});
 };
 const beforeTransfer=contextFromCarrier();
 assert(beforeTransfer.sources.some(r=>r.family==='reviews'&&r.id===carrier.review.id));
 assert(!beforeTransfer.sources.some(r=>r.family==='reviews'&&r.id===foreignFinding.review.id),'a current but purely historical review subject is not a LIVE discovery edge');
 const transferred=historical.run('cos-a','task/transfer',{task_id:produced.id,to_principal_id:'history-transfer-recipient',to_grant_id:'g-history-transfer-recipient'});
 assert(transferred.revision>produced.revision);assert.equal(transferred.value.owner_principal_id,'history-transfer-recipient');
 const after=contextFromCarrier();
 assert(after.sources.some(r=>r.family==='reviews'&&r.id===carrier.review.id));
 assert(!after.sources.some(r=>r.family==='reviews'&&r.id===foreignFinding.review.id));
 assert(!after.sources.some(r=>r.family==='tasks'&&(r.id===produced.id||r.id===carrier.review.value.proof.task.id)),'subject/proof-task history is not promoted into current source bodies');
 assert.deepEqual(historical.ledger.read(tx=>tx.getVersion(ref('tasks',produced))).value,produced.value);
 assert.deepEqual(carrier.review.value.subject,ref('tasks',produced));assert.deepEqual(foreignFinding.review.value.subject,ref('tasks',produced));
 const next=historical.propose('cos-a',{home_id:'other',input_refs:[ref('reviews',carrier.review)]});
 assert(next.value.readset.some(r=>r.family==='reviews'&&r.id===carrier.review.id));
 assert(!next.value.readset.some(r=>r.family==='tasks'&&r.id===produced.id));
 assert(!next.value.readset.some(r=>r.family==='reviews'&&r.id===foreignFinding.review.id));
});

test('external indexed pagination: more than 100 exact subjects and 16 real negative matches remain complete through the write planner',t=>{
 const f=fixture(t),prototype=f.propose('cos-a',{content:'Compact typed pagination source.'}),subjects=[prototype];let previous=prototype;
 for(let offset=1;offset<101;offset+=25)f.ledger.write('fixture.indexed-page-subjects','founder',tx=>{
  for(let i=offset;i<Math.min(101,offset+25);i++){
   previous=tx.put('proposals',`indexed-page-subject-${String(i).padStart(3,'0')}`,{...prototype.value,content:'Compact typed pagination link.',readset:[ref('proposals',previous)]},0);subjects.push(previous);
  }
 });
 const negatives=[];
 for(const i of [...Array.from({length:17},(_,i)=>i),100])negatives.push(externalNegative(f,subjects[i],'proposals','cos-b','pagination-reviewers','Fail'));
 const calls=[],wrap=tx=>Object.freeze({...tx,queryCurrentReviews:options=>{
  calls.push({subjects:options.subjects?.length??0,ids:(options.subjects??[]).map(r=>r.id),scopes:options.scopes??[],cursor:options.cursor??null,limit:options.limit});
  return tx.queryCurrentReviews(options);
 }});
 // Observe the actual P1 provider calls under the real model planner; every
 // result and cursor comes from SQLite, without a fabricated query response.
 const traced={read:fn=>f.ledger.read(tx=>fn(wrap(tx))),write:(type,principal,fn)=>f.ledger.write(type,principal,tx=>fn(wrap(tx)))};
 const proposal=execute(traced,actor('cos-a'),'home/propose',{operation_id:'indexed-real-pagination-proposal',grant_id:'g-cos-a',scope:'alpha',home_id:'other',expected_revision:0,content:'Complete paged negative evidence.',input_refs:[ref('proposals',previous)]});
 assert.equal(proposal.value.readset.length,1+18);
 assert(proposal.value.readset.some(r=>canonical(r)===canonical(ref('proposals',previous))));
 for(const negative of negatives)assert(proposal.value.readset.some(r=>canonical(r)===canonical(ref('reviews',negative.review))));
 assert.equal(new Set(proposal.value.readset.map(canonical)).size,proposal.value.readset.length);
 assert(calls.some(call=>call.subjects===100&&call.cursor),'a full subject batch must traverse the second real provider page');
 assert(calls.some(call=>call.subjects===1&&call.ids.some(id=>subjects.some(row=>row.id===id))),'the final subject outside the first batch must also be acquired');
 for(const call of calls){assert(call.subjects<=100);assert(call.scopes.length<=16);if(call.cursor)assert(call.cursor.length<=16000);}
 const consumer=f.submit('cos-a',{input_refs:[ref('proposals',previous)]}),packet=inspect(f.ledger,actor('cos-a'),'task/context',{task_id:consumer.id});
 for(const negative of negatives)assert.deepEqual(packet.sources.find(r=>r.family==='reviews'&&r.id===negative.review.id)?.value,negative.review.value);
});

test('external indexed cache guard: a real same-handle write after cached scope discovery cannot bypass final eligibility',t=>{
 const f=fixture(t),operation='indexed-cached-snapshot-mutation',proposalId=digest(['proposal','cos-a',operation]);
 const original=f.ledger.query;let rawHandle,armed=true,sawScope=false,hits=0,fenceFailure;
 const wrap=tx=>{
  rawHandle=tx;
  return Object.freeze({...tx,queryCurrentReviews:options=>{
   try{return tx.queryCurrentReviews(options);}catch(error){fenceFailure=error;throw error;}
  }});
 };
 const seam={read:fn=>f.ledger.read(fn),write:(type,principal,fn)=>f.ledger.write(type,principal,tx=>fn(wrap(tx)))};
 f.ledger.query=function(sql,...parameters){
  if(sql.startsWith('SELECT review_id FROM peer_review_selection INDEXED BY peer_review_scope'))sawScope=true;
  const statement=Reflect.apply(original,this,[sql,...parameters]);
  if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
  return new Proxy(statement,{get(object,key){
   const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
   if(key!=='get')return value.bind(object);
   return (...args)=>{
    const result=Reflect.apply(value,object,args);
    if(armed&&sawScope&&args[0]==='proposals'&&args[1]===proposalId){
     assert.equal(result,undefined);armed=false;hits++;
     rawHandle.put('notices','indexed-cache-late-notice',{status:'pending',scope:'alpha',principal_id:'founder',content:'A real same-handle mutation after selection.'},0);
    }
    return result;
   };
  }});
 };
 const args={operation_id:operation,grant_id:'g-cos-a',scope:'alpha',home_id:'other',expected_revision:0,content:'Requires a still-eligible selection snapshot.'};
 try{
  const before=indexedSQLState(f);
  assert.throws(()=>execute(seam,actor('cos-a'),'home/propose',args),error=>{
   assert.equal(error,fenceFailure);assert.match(error.message,/pending writes|after.*write/i);return true;
  });
  assert.equal(hits,1);assert.equal(sawScope,true);
  assert.deepEqual(indexedSQLState(f),before,'the surprise mutation and all proposed model writes roll back');
  assert.throws(()=>rawHandle.queryCurrentReviews({subjects:[],scopes:[]}),/expired/i);
  assert.equal(get(f,'notices','indexed-cache-late-notice'),null);assert.equal(get(f,'proposals',proposalId),null);
  const retried=execute(seam,actor('cos-a'),'home/propose',args);
  assert.equal(retried.id,proposalId);assert.deepEqual(retried.value.readset,[]);
  assert.equal(get(f,'notices','indexed-cache-late-notice'),null);
 }finally{armed=false;f.ledger.query=original;}
});

// Final external regression preparation only. These tests use fictional local
// SQLite fixtures; their results do not constitute native QA or adoption of the
// prospective P1 dependency. The entire preceding 90-test source is preserved.
function finalAllSQLState(f){
 const result={},db=f.ledger.db;
 result.schema=digest(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()));
 for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
  const hash=indexedCreateHash('sha256'),quoted=name.replaceAll('"','""');
  for(const row of db.prepare(`SELECT * FROM "${quoted}" ORDER BY rowid`).iterate())hash.update(JSON.stringify(row)+'\n');
  result[name]=hash.digest('hex');
 }
 return result;
}

test('external final regression: late physical publication mutation rolls back atomically and preserves required-notice freshness',t=>{
 const f=fixture(t),proposal=f.propose(),positive=f.review(proposal);
 assert.equal(positive.finished.accepted,true);
 const noticeId=digest(['notices','cos-a','late-physical-notice']),notice={status:'pending',scope:'alpha',principal_id:'cos-a',content:'New required publication context.',kind:'must_know',created_at:new Date().toISOString()};
 const args={operation_id:'final-late-physical-publication',grant_id:'g-cos-a',proposal_id:proposal.id,review_id:positive.finished.review.id};
 let rawHandle,armed=true,hits=0,nestedFailure;
 const seam={read:fn=>f.ledger.read(fn),write:(type,principal,fn)=>f.ledger.write(type,principal,tx=>{rawHandle=tx;return fn(tx);})};
 const originalHook=f.ledger.onQuery;
 f.ledger.onQuery=event=>{
  originalHook?.(event);
  if(armed&&event.sql==='INSERT INTO peer_versions VALUES(?,?,?,?,?)'){
   armed=false;hits++;
   try{rawHandle.put('notices',noticeId,notice,0);}catch(error){nestedFailure=error;throw error;}
  }
 };
 try{
  const before=finalAllSQLState(f);
  assert.throws(()=>execute(seam,actor('cos-a'),'home/publish',args),error=>{
   // Accepted native P1 preserves the callback error together with terminal
   // poison. Require both exact causes; a generic rejection is insufficient.
   assert(error instanceof AggregateError);
   assert.equal(error.message,'Peer put failed after its transaction boundary changed');
   assert.equal(error.errors.length,2);assert.equal(error.errors[0],nestedFailure);
   assert(nestedFailure instanceof Error);assert.equal(nestedFailure.message,'Reentrant peer row mutation is forbidden; rollback required');
   assert(error.errors[1] instanceof Error);assert.equal(error.errors[1].message,'Peer transaction contains a failed row mutation; rollback required');
   return true;
  });
  assert.equal(hits,1,'the real physical peer_versions INSERT must reach the supported SQL hook');
  assert.deepEqual(finalAllSQLState(f),before,'all user tables, receipts, replay rows and schema roll back');
  assert.equal(get(f,'homes','fact'),null);assert.equal(get(f,'notices',noticeId),null);
  assert.deepEqual(get(f,'proposals',proposal.id),proposal);assert.deepEqual(get(f,'reviews',positive.finished.review.id),positive.finished.review);
 }finally{armed=false;f.ledger.onQuery=originalHook;}
 const retried=execute(seam,actor('cos-a'),'home/publish',args);
 assert.equal(retried.value.status,'current');assert.equal(retried.id,'fact');assert.equal(get(f,'notices',noticeId),null);

 // The same notice is a real mandatory context change when committed before
 // publication. This pair pins the bypassed semantic check, not just a fence.
 const precommitted=fixture(t),pending=precommitted.propose(),review=precommitted.review(pending);
 const required=seed(precommitted,'notices',noticeId,notice),before=finalAllSQLState(precommitted);
 assert.throws(()=>precommitted.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:pending.id,review_id:review.finished.review.id}),code('CONTEXT_CHANGED'));
 assert.deepEqual(finalAllSQLState(precommitted),before);assert.equal(get(precommitted,'homes','fact'),null);
 assert.deepEqual(get(precommitted,'notices',noticeId),required);
});

test('external final regression: late shared semantic overflow preserves physical completion on the admitted attempt',t=>{
 const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:200000,max_model_calls:100}}});
 const prototype=f.propose('cos-a',{scope:'foreign-proof',content:'Compact historical subject leaf.'});let previous=prototype;
 // These are ordinary typed source rows. The protected negative below is
 // produced through the model and trusted fixture observer, never seeded.
 for(let start=1;start<9900;start+=50)f.ledger.write('fixture.final-semantic-subject','founder',tx=>{
  for(let i=start;i<Math.min(start+50,9900);i++)previous=tx.put('proposals',`final-semantic-source-${String(i).padStart(5,'0')}`,{...prototype.value,content:'Compact historical link.',readset:[ref('proposals',previous)]},0);
 });
 const adverse=externalNegative(f,previous,'proposals','cos-b','*','Fail');
 const addHomes=(first,last)=>f.ledger.write('fixture.final-semantic-homes','founder',tx=>{
  for(let i=first;i<last;i++)tx.put('homes',`final-semantic-home-${String(i).padStart(3,'0')}`,{status:'current',scope:'isolated',principal_id:'founder',content:'Compact current fixture condition.'},0);
 });
 addHomes(0,40);addHomes(40,80);
 const pending=f.propose('cos-a',{home_id:'other',scope:'isolated',content:'Pending exact-subject review before later capacity change.'});
 const producer=f.start('cos-a',{scope:'isolated',resources:['path:tree1:final-semantic-produce']});
 const reviewer=f.start('reviewer',{scope:'isolated',role:'qa',stage:'review',review_of:ref('proposals',pending),resources:['path:tree1:final-semantic-review']});
 for(const admitted of [producer,reviewer]){
  assert.equal(admitted.admitted,true);assert(admitted.context.utf8_bytes<200000);
  assert.equal(admitted.context.sources.filter(row=>row.family==='homes').length,80);
  assert(admitted.context.sources.some(row=>row.family==='reviews'&&row.id===adverse.review.id));
  assert.equal(get(f,'slots',admitted.task.id).value.status,'active');
  assert.equal(rows(f.ledger,'claims',{task_id:admitted.task.id,status:'held'}).length,1);
 }
 const usage=get(f,'control','usage'),principalUsage=new Map(['cos-a','cos-b','reviewer'].map(id=>[id,get(f,'control',`usage:${id}`)]));
 const grants=new Map(['g-cos-a','g-cos-b','g-reviewer'].map(id=>[id,get(f,'grants',id)]));
 assert.equal(usage.value.model_calls,3,'one protected adverse review and the two legitimately admitted attempts are charged once');
 addHomes(80,120);
 for(const row of f.ledger.db.prepare('SELECT family,COUNT(*) AS n FROM peer_rows GROUP BY family').all())assert(row.n<10000,`${row.family} alone fits the matching-row bound`);
 let retainedEncodedBytes=0;
 for(const row of f.ledger.db.prepare('SELECT family,id,revision,sha256,bytes FROM peer_versions ORDER BY family,id,revision').iterate())retainedEncodedBytes+=Buffer.byteLength(canonical({family:row.family,id:row.id,revision:row.revision,sha256:row.sha256,value:JSON.parse(row.bytes)}));
 assert(retainedEncodedBytes<indexedPreparationLimit,'even all retained exact versions fit the separate encoded preparation bound; this is not an RSS claim');
 const beforeProbe=finalAllSQLState(f);
 for(const admitted of [producer,reviewer])assert.throws(()=>inspect(f.ledger,actor(admitted.task.value.owner_principal_id),'task/context',{task_id:admitted.task.id}),error=>{
  assert.equal(error.code,'LOOKUP_CAPACITY');return true;
 });
 assert.deepEqual(finalAllSQLState(f),beforeProbe,'the late semantic-bound inspection itself makes no writes');
 const completed=[[producer,f.finish(producer)],[reviewer,f.finish(reviewer,{output:parentReviewOutput(pending)})]];
 for(const [admitted,result] of completed){
  const task=result.task.value,attempt=task.attempt,physical=task.result;
  assert.equal(result.accepted,false);assert.equal(task.status,'quarantined');assert.equal(result.review,null);assert.equal(task.review_id,null);
  assert.equal(attempt.id,admitted.task.value.attempt.id);assert.equal(attempt.model_calls,1);assert.deepEqual(attempt.context,admitted.context);
  assert.equal(attempt.termination_confirmed,true);assert.equal(physical.termination_confirmed,true);assert.equal(physical.observed_process.close_observed,true);
  assert.deepEqual(physical.observed_process,f.process(admitted));assert.equal(physical.output_sha256,digest(physical.output));
  const observation=get(f,'effects',physical.observation.id);
  assert.deepEqual(ref('effects',observation),physical.observation);assert.equal(observation.value.kind,'runtime_observation');assert.equal(observation.value.action,'task/finish');
  assert.equal(observation.value.task_id,admitted.task.id);assert.equal(observation.value.attempt_id,attempt.id);assert.equal(observation.value.termination_confirmed,true);
  assert.equal(observation.value.process.close_observed,true);assert.equal(observation.value.context_sha256,admitted.context.sha256);assert.equal(observation.value.output_sha256,physical.output_sha256);
  const effect=get(f,'effects',attempt.effect_id),slot=get(f,'slots',admitted.task.id),claims=rows(f.ledger,'claims',{task_id:admitted.task.id});
  assert.equal(effect.value.termination_confirmed,true);assert.equal(effect.value.result_sha256,digest(physical));assert.equal(effect.value.status,'succeeded');
  assert.equal(slot.value.status,'released');assert.equal(slot.value.attempt_id,attempt.id);assert.equal(slot.value.termination_confirmed,true);
  assert.equal(claims.length,1);assert.equal(claims[0].value.status,'released');assert.equal(claims[0].value.closure.termination_confirmed,true);
  assert.equal(rows(f.ledger,'claims',{task_id:admitted.task.id,status:'held'}).length,0);
 }
 assert.deepEqual(get(f,'control','usage'),usage);
 for(const [id,row] of principalUsage)assert.deepEqual(get(f,'control',`usage:${id}`),row);
 for(const [id,row] of grants)assert.deepEqual(get(f,'grants',id),row);
 assert.deepEqual(get(f,'proposals',pending.id),pending);assert.deepEqual(get(f,'reviews',adverse.review.id),adverse.review);
 assert.equal(rows(f.ledger,'reviews').length,1,'quarantined review output cannot create a new review');assert.equal(get(f,'homes','other'),null);
 assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='homes'").get().n,120);
 assert.equal(rows(f.ledger,'slots',{status:'active'}).length,0);
 // Existing provider-fault tests require identity-preserving rollback. This
 // owned semantic limit instead retains protected physical completion.
});

test('external final regression: grant scopes reject isolated UTF-16 and preserve exact indexed Unicode text',t=>{
 const f=fixture(t),expiry=new Date(Date.now()+3600000).toISOString();
 const grantArgs=(operation_id,grant_id,scope)=>({operation_id,grant_id,to_principal_id:'cos-a',scope,actions:['task/*'],resources:[],expires_at:expiry,source_instruction:'Fictional exact-text scope authority.'});
 for(const [label,scope] of [['high','bad-\ud800'],['low','bad-\udc00']]){
  const args=grantArgs(`final-invalid-scope-${label}`,`final-invalid-scope-${label}`,scope),before=finalAllSQLState(f);
  for(let retry=0;retry<2;retry++){
   assert.throws(()=>execute(f.ledger,actor('founder'),'grant/create',args),code('INVALID_INPUT'));
   assert.deepEqual(finalAllSQLState(f),before,'invalid scope cannot consume replay/receipt state or write any table');
  }
  assert.equal(get(f,'grants',args.grant_id),null);
  const corrected=execute(f.ledger,actor('founder'),'grant/create',{...args,scope:`valid-${label}`});
  assert.equal(corrected.value.scope,`valid-${label}`,'the rejected operation did not consume its replay key');
 }
 const scopes=['literal-\ufffd','范围/é','emoji-\ud83d\ude80',' repo / app ','repo  app','é','e\u0301'];
 for(const [i,scope] of scopes.entries()){
  const args=grantArgs(`final-valid-scope-${i}`,`final-valid-scope-${i}`,scope),grant=execute(f.ledger,actor('founder'),'grant/create',args);
  assert.equal(grant.value.scope,scope);assert.equal(get(f,'grants',grant.id).value.scope,scope);
  const physical=f.ledger.db.prepare("SELECT scope,bytes,sha256 FROM peer_rows WHERE family='grants' AND id=?").get(grant.id),stored=JSON.parse(physical.bytes);
  assert.equal(physical.scope,scope);assert.equal(stored.scope,scope);assert.equal(peerDigest(stored),physical.sha256);
  const page=f.ledger.read(tx=>tx.list('grants',{scope,limit:100}));
  assert.equal(page.complete,true);assert.deepEqual(page.items.map(row=>row.id),[grant.id]);assert.equal(page.items[0].value.scope,scope);
  const beforeReplay=finalAllSQLState(f),replayed=execute(f.ledger,actor('founder'),'grant/create',args);
  assert.deepEqual(replayed,grant);assert.deepEqual(finalAllSQLState(f),beforeReplay);
  const task=f.submit('cos-a',{grant_id:grant.id,scope,resources:[]});
  assert.equal(task.value.scope,scope);assert.equal(task.value.definition.scope,scope);
 }
});

// External no-review preflush regressions. Supported real read/result hooks
// delegate to SQLite and use only the owning P1 handle for controlled writes.
function preflushTaskArgs(operation){return {operation_id:operation,task_id:`task-${operation}`,grant_id:'g-cos-a',scope:'alpha',role:'engineer',instructions:'Inspect fictional current authority.',acceptance:'Return bounded evidence.',resources:[],input_refs:[]};}
function preflushCapture(f){
 const trace={raw:null,versions:[],versionFailure:null,reviewQueries:0};
 const wrap=tx=>{
  trace.raw=tx;
  return Object.freeze({...tx,getVersion:r=>{
   trace.versions.push(structuredClone(r));
   try{return tx.getVersion(r);}catch(error){trace.versionFailure=error;throw error;}
  },queryCurrentReviews:options=>{trace.reviewQueries++;return tx.queryCurrentReviews(options);}});
 };
 trace.ledger={read:fn=>f.ledger.read(fn),write:(type,principal,fn)=>f.ledger.write(type,principal,tx=>fn(wrap(tx)))};
 return trace;
}
function preflushReadResult(f,family,id,callback){
 const original=f.ledger.query;let armed=true,hits=0;
 f.ledger.query=function(sql,...parameters){
  const statement=Reflect.apply(original,this,[sql,...parameters]);
  if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
  return new Proxy(statement,{get(object,key){
   const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;if(key!=='get')return value.bind(object);
   return (...args)=>{
    const result=Reflect.apply(value,object,args);
    if(armed&&args[0]===family&&args[1]===id){armed=false;hits++;callback(result);}
    return result;
   };
  }});
 };
 return {get hits(){return hits;},restore(){armed=false;f.ledger.query=original;}};
}
function preflushPause(tx){const c=tx.get('control','company');assert.equal(c.value.paused,false);return tx.put('control','company',{...c.value,paused:true,pause_generation:c.value.pause_generation+1},c.revision);}
function preflushBeforeWrites(error){assert.equal(error.message,'Peer historical lookup requires an owning snapshot before pending writes; external transactions are excluded');return true;}

test('external preflush currentness: changed cached control founder and grant during real no-review reads cannot commit stale authority',t=>{
 for(const scenario of ['pause','inactive-founder','revoked-grant']){
  const f=fixture(t),trace=preflushCapture(f),operation=`preflush-${scenario}`;
  const args=scenario==='inactive-founder'?{operation_id:operation,grant_id:'late-founder-grant',to_principal_id:'cos-a',scope:'alpha',actions:['task/*'],resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Current founder required.'}:preflushTaskArgs(operation);
  const who=scenario==='inactive-founder'?'founder':'cos-a',action=scenario==='inactive-founder'?'grant/create':'task/submit';
  const target=scenario==='pause'?['grants','g-cos-a']:scenario==='inactive-founder'?['principals','cos-a']:['tasks',args.task_id];
  const actorRow=get(f,'principals',who),before=finalAllSQLState(f);
  const hook=preflushReadResult(f,...target,result=>{
   if(scenario==='revoked-grant')assert.equal(result,undefined);else assert.ok(result?.sha256,'the actual different row was selected');
   if(scenario==='pause')preflushPause(trace.raw);
   else if(scenario==='inactive-founder'){
    const p=trace.raw.get('principals','founder');trace.raw.put('principals',p.id,{...p.value,status:'inactive'},p.revision);
   }else{const g=trace.raw.get('grants','g-cos-a');trace.raw.put('grants',g.id,{...g.value,status:'revoked',generation:g.value.generation+1},g.revision);}
  });
  try{
   assert.throws(()=>execute(trace.ledger,actor(who),action,args),error=>{assert.equal(error,trace.versionFailure);return preflushBeforeWrites(error);});
   assert.equal(hook.hits,1);assert.equal(trace.reviewQueries,0,'no review-index query supplies this authority fence');
   assert.deepEqual(trace.versions,[ref('principals',actorRow)],'the final uncached check binds the actual committed actor');
   assert.deepEqual(finalAllSQLState(f),before,'authority mutation, output rows, history and replay/receipt state all roll back');
   assert.throws(()=>trace.raw.get('control','company'),/expired/);
  }finally{hook.restore();}
  const retried=execute(trace.ledger,actor(who),action,args);
  assert.equal(retried.id,scenario==='inactive-founder'?args.grant_id:args.task_id,'failed planning consumed no operation key');
  assert.equal(get(f,'control','usage'),null,'submission/grant creation and retries dispatch no model');

  const precommitted=fixture(t);
  if(scenario==='pause')precommitted.run('founder','company/pause',{source_instruction:'A genuinely precommitted pause.'});
  else if(scenario==='inactive-founder'){const p=get(precommitted,'principals','founder');seed(precommitted,'principals',p.id,{...p.value,status:'inactive'});}
  else precommitted.run('founder','grant/revoke',{grant_id:'g-cos-a'});
  const semanticBefore=finalAllSQLState(precommitted);
  assert.throws(()=>execute(precommitted.ledger,actor(who),action,args),code(scenario==='pause'?'PAUSED':scenario==='inactive-founder'?'PRINCIPAL_INACTIVE':'GRANT_INVALID'));
  assert.deepEqual(finalAllSQLState(precommitted),semanticBefore);
 }
});

test('external preflush currentness: read-only and successful no-op hooks preserve ordinary submission and control-independent replay',t=>{
 for(const mode of ['read-only','noop']){
  const f=fixture(t),trace=preflushCapture(f),args=preflushTaskArgs(`preflush-positive-${mode}`),control=get(f,'control','company'),grant=get(f,'grants','g-cos-a');
  const hook=preflushReadResult(f,'grants','g-cos-a',result=>{
   assert.equal(result.sha256,grant.sha256);const actual=trace.raw.get('control','company');assert.deepEqual(actual,control);
   if(mode==='noop')assert.deepEqual(trace.raw.put('control','company',actual.value,actual.revision),actual);
  });
  let submitted;
  try{submitted=execute(trace.ledger,actor('cos-a'),'task/submit',args);assert.equal(hook.hits,1);}finally{hook.restore();}
  assert.equal(submitted.value.status,'planned');assert.equal(submitted.value.attempt,null);assert.equal(trace.reviewQueries,0);
  assert.deepEqual(get(f,'control','company'),control);assert.deepEqual(get(f,'grants','g-cos-a'),grant);assert.equal(get(f,'control','usage'),null);
  const beforeReplay=finalAllSQLState(f),probeCount=trace.versions.length;let unexpectedControlReads=0;
  const unavailable=preflushReadResult(f,'control','company',()=>{unexpectedControlReads++;throw Error('Replay must not acquire a new control dependency.');});
  try{assert.deepEqual(execute(trace.ledger,actor('cos-a'),'task/submit',args),submitted);}finally{unavailable.restore();}
  assert.equal(unexpectedControlReads,0);assert.equal(trace.versions.length,probeCount+1,'replay still reaches the uncached owning-snapshot probe');
  assert.deepEqual(finalAllSQLState(f),beforeReplay);
 }
});

test('external preflush currentness: replay cannot commit a real authority change hidden in its later receipt read',t=>{
 const f=fixture(t),args=preflushTaskArgs('preflush-mutating-replay'),submitted=execute(f.ledger,actor('cos-a'),'task/submit',args),trace=preflushCapture(f);
 const receiptId=digest(['peer-command-v1','cos-a',args.operation_id]),receipt=get(f,'commands',receiptId),before=finalAllSQLState(f);
 const hook=preflushReadResult(f,'commands',receiptId,result=>{assert.equal(result.sha256,receipt.sha256);preflushPause(trace.raw);});
 try{
  assert.throws(()=>execute(trace.ledger,actor('cos-a'),'task/submit',args),error=>{assert.equal(error,trace.versionFailure);return preflushBeforeWrites(error);});
  assert.equal(hook.hits,1);assert.equal(trace.reviewQueries,0);assert.deepEqual(finalAllSQLState(f),before);
 }finally{hook.restore();}
 assert.deepEqual(get(f,'tasks',args.task_id),submitted);assert.deepEqual(get(f,'commands',receiptId),receipt);
 assert.deepEqual(execute(trace.ledger,actor('cos-a'),'task/submit',args),submitted);assert.deepEqual(finalAllSQLState(f),before);
});

const {PeerLedger:PreflushLegacyLedger}=await import('../reference-accepted48/plugins/soloco/runtime/peers/ledger.mjs');
test('external preflush currentness: unknown or dirty review selection leaves founder pause and required notice controls available',t=>{
 for(const mode of ['unknown','dirty']){
  const f=fixture(t),p=f.propose(),review=f.review(p);assert.equal(review.finished.accepted,true);
  if(mode==='unknown')seed(f,'reviews',review.finished.review.id,{...review.finished.review.value,native_id:'Contradictory current alias retained for correction.'});
  else{
   // A real older cooperating P1 writer commits an ordinary review revision.
   // Current accepted triggers mark it dirty; no raw SQL or missing body is fabricated.
   const legacy=new PreflushLegacyLedger(f.root);try{
    legacy.write('fixture.preflush.older-writer','founder',tx=>{const old=tx.get('reviews',review.finished.review.id);tx.put('reviews',old.id,{...old.value,fixture_dirty_revision:true},old.revision);});
   }finally{legacy.close();}
  }
  const expected=mode==='unknown'?'REVIEW_SELECTION_INTEGRITY':'REVIEW_SELECTION_DIRTY';
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),code(expected));
  const trace=preflushCapture(f),pauseArgs={operation_id:`preflush-control-pause-${mode}`,source_instruction:'Required founder pause remains available.'};
  const paused=execute(trace.ledger,actor('founder'),'company/pause',pauseArgs);assert.equal(paused.value.paused,true);
  const noticeArgs={operation_id:`preflush-control-notice-${mode}`,scope:'alpha',content:'Required intake remains available despite unrelated review uncertainty.'};
  const notice=execute(trace.ledger,actor('cos-a'),'notice/create',noticeArgs);assert.equal(notice.value.status,'pending');assert.equal(notice.value.scope,'alpha');
  const stable=finalAllSQLState(f);
  assert.deepEqual(execute(trace.ledger,actor('cos-a'),'notice/create',noticeArgs),notice);assert.deepEqual(finalAllSQLState(f),stable);
  assert.equal(trace.reviewQueries,0);assert(trace.versions.length>=3,'each control write/replay probes its owning snapshot without an index');
  const resumed=execute(trace.ledger,actor('founder'),'company/resume',{operation_id:`preflush-control-resume-${mode}`,source_instruction:'Resume after complete required intake.'});assert.equal(resumed.value.paused,false);
  assert.throws(()=>f.ledger.read(tx=>tx.queryCurrentReviews({subjects:[],scopes:[]})),code(expected),'control availability does not clear unrelated dirty/unknown evidence');
  assert.equal(get(f,'reviews',review.finished.review.id).revision,2);
 }
});

test('external preflush currentness: real final-probe failures preserve provider identity or exact composed causes and roll back',t=>{
 for(const mode of ['helper-fact','capacity-code','source-code','mutation-and-error','transaction-loss']){
  const f=fixture(t),trace=preflushCapture(f),args=preflushTaskArgs(`preflush-provider-${mode}`),before=finalAllSQLState(f),original=f.ledger.onQuery;
  const injected=mode==='helper-fact'?indexedProviderError('helper-fact'):Object.assign(Error(`Real final-probe provider failure: ${mode}`),{code:mode==='source-code'?'SOURCE_CHANGED':'CONTEXT_CAPACITY'});
  let armed=true,hits=0;
  f.ledger.onQuery=q=>{
   original?.(q);
   if(!armed||q.sql!=='SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? AND revision=?')return;
   armed=false;hits++;
   if(mode==='transaction-loss'){f.ledger.db.exec('ROLLBACK');return;}
   if(mode==='mutation-and-error')preflushPause(trace.raw);
   throw injected;
  };
  try{
   assert.throws(()=>execute(trace.ledger,actor('cos-a'),'task/submit',args),error=>{
    if(mode==='transaction-loss'){
     assert(error instanceof AggregateError);assert.equal(error.errors[0],trace.versionFailure);assert.match(trace.versionFailure.message,/transaction connection is no longer active/);
    }else{
     assert.equal(error,trace.versionFailure);
     if(mode==='mutation-and-error'){
      assert(error instanceof AggregateError);assert.equal(error.errors.length,2);assert.equal(error.errors[0],injected);preflushBeforeWrites(error.errors[1]);
     }else assert.equal(error,injected);
    }
    return true;
   });
   assert.equal(hits,1);assert.equal(trace.reviewQueries,0);assert.deepEqual(finalAllSQLState(f),before);
   assert.equal(get(f,'tasks',args.task_id),null);assert.equal(get(f,'commands',digest(['peer-command-v1','cos-a',args.operation_id])),null);
  }finally{armed=false;f.ledger.onQuery=original;}
  const retried=execute(trace.ledger,actor('cos-a'),'task/submit',args);assert.equal(retried.id,args.task_id);assert.equal(retried.value.attempt,null);assert.equal(get(f,'control','usage'),null);
 }
});

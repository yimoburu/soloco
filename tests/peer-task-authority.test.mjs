import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,PeerLedger} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {bindPeerPrincipal,createRuntimeObserver,digest,execute,TASK_EFFECT_LEASE_MS} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Real source commands and two isolated SQLite connections. Runtime/process
// observations below are explicitly SYNTHETIC trusted-host fixtures. They do
// not qualify a native executor, process closure, company adoption or a task
// effect client; positive task-client composition is checked separately.
const actor=principal_id=>({principal_id});
const reference=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const code=expected=>error=>error?.code===expected;

function fixture(t,{grant_remaining_ms=3600000}={}){
  let clock=Date.parse('2030-01-02T03:04:05.000Z'),sequence=0;
  t.mock.method(Date,'now',()=>clock);
  const f=peerFixture(),other=new PeerLedger(f.root);
  t.after(()=>{other.close();f.close();});
  const run=(who,action,args={},ledger=f.ledger)=>execute(ledger,actor(who),action,{operation_id:'authority-fixture-'+(++sequence),...args});
  const grant_expiry=new Date(clock+grant_remaining_ms).toISOString();
  for(const who of ['cos-a','cos-b'])run('founder','grant/create',{
    grant_id:'grant-'+who,to_principal_id:who,scope:'alpha',actions:['task/*'],resources:['home:fact'],
    expires_at:grant_expiry,source_instruction:'Fictional bounded offline authority lifecycle test.'
  });
  const submit=(args={},who='cos-a')=>run(who,'task/submit',{
    grant_id:'grant-'+who,scope:'alpha',role:'engineer',instructions:'Inspect supplied fictional evidence.',
    acceptance:'Return attributable bounded evidence.',resources:['home:fact'],...args
  });
  const claim=task=>run(task.value.owner_principal_id,'task/claim',{task_id:task.id});
  const admit=(task,args={})=>run('scheduler','task/admit',{task_id:task.id,...args});
  const start=()=>{const task=submit();claim(task);const result=admit(task);assert.equal(result.admitted,true);return result;};
  const get=(family,id,ledger=f.ledger)=>ledger.read(tx=>tx.get(family,id));
  const observed_process=admitted=>({pid:45678,started_at:admitted.task.value.attempt.admitted_at,close_observed:true});
  const observe=(action,admitted,args={},ledger=other)=>createRuntimeObserver(ledger).record(action,{
    operation_id:'synthetic-authority-observation-'+(++sequence),task_id:admitted.task.id,
    attempt_id:admitted.task.value.attempt.id,observed_process:observed_process(admitted),...args
  });
  const finish=(admitted,args={})=>observe('task/finish',admitted,{
    output:'Synthetic observed authority-test output.',native_id:'synthetic-authority-test-native',
    termination_confirmed:true,...args
  });
  return {...f,other,run,submit,claim,admit,start,get,observe,finish,observed_process,grant_expiry,
    get clock(){return clock;},set clock(value){clock=value;}};
}

function logicalSQLState(f){
  const schema=f.ledger.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const tables=f.ledger.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return {schema,tables:Object.fromEntries(tables.map(({name})=>[name,
    f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(canonical).sort()
  ]))};
}
function reservations(f,admitted){
  return {
    slot:f.get('slots',admitted.task.id),effect:f.get('effects',admitted.task.value.attempt.effect_id),
    claims:f.ledger.read(tx=>tx.list('claims',{task_id:admitted.task.id,limit:100})),
    usage:f.get('control','usage'),principal_usage:f.get('control','usage:cos-a'),grant:f.get('grants','grant-cos-a')
  };
}
function unchanged(f,operation,expected){
  const before=logicalSQLState(f);assert.throws(operation,code(expected));assert.deepEqual(logicalSQLState(f),before);
}

test('submit, claim and admission source-produce monotonic authority and one finite nonrenewable lease',t=>{
  const f=fixture(t),task=f.submit();assert.equal(task.value.authority_epoch,1);assert.equal(task.value.attempt,null);
  const pending=f.claim(task);assert.equal(pending.value.authority_epoch,1);
  const admitted=f.admit(task);assert.equal(admitted.admitted,true);
  const current=admitted.task,authority=current.value.attempt.effect_authority;
  assert.equal(current.value.authority_epoch,2);
  assert.deepEqual(authority,{
    protocol:'peer-task-effect-authority-v1',epoch:2,issued_at:new Date(f.clock).toISOString(),
    expires_at:new Date(f.clock+TASK_EFFECT_LEASE_MS).toISOString()
  });
  assert.equal(TASK_EFFECT_LEASE_MS,120000);assert.equal(current.value.attempt.admitted_at,authority.issued_at);
  assert.equal(f.get('control','usage').value.model_calls,1);
  assert.equal(f.get('control','usage:cos-a').value.model_calls,1);
  assert.equal(f.get('grants','grant-cos-a').value.used_model_calls,1);
  assert.equal(f.get('slots',task.id).value.status,'active');
  assert.equal(f.get('effects',current.value.attempt.effect_id).value.status,'reserved');
  assert.equal(f.ledger.read(tx=>tx.list('claims',{task_id:task.id,status:'held',limit:100})).items.length,1);
  // Existing native effect request/history semantics are kept separate from
  // the new task-effect authority producer, rather than silently redefined.
  const request={kind:'native',task_id:task.id,definition_sha256:task.value.definition_sha256,context_sha256:admitted.context.sha256};
  assert.deepEqual(f.get('effects',current.value.attempt.effect_id).value.request,request);
  assert.equal(current.value.attempt.request_sha256,digest(request));
});

test('admission lease is clamped to the actual current grant expiry',t=>{
  const f=fixture(t,{grant_remaining_ms:45000}),admitted=f.start(),authority=admitted.task.value.attempt.effect_authority;
  assert.equal(authority.expires_at,f.grant_expiry);
  assert.equal(Date.parse(authority.expires_at)-Date.parse(authority.issued_at),45000);
  assert(Date.parse(authority.expires_at)<f.clock+TASK_EFFECT_LEASE_MS);
  assert.equal(f.get('control','usage').value.model_calls,1);
});

test('founder task admission also receives the finite source lease without a grant deadline',t=>{
  const f=fixture(t),task=f.submit({resources:[]},'founder');assert.equal(task.value.grant_id,null);
  f.claim(task);const admitted=f.admit(task);assert.equal(admitted.admitted,true);
  assert.equal(admitted.task.value.attempt.effect_authority.expires_at,new Date(f.clock+TASK_EFFECT_LEASE_MS).toISOString());
  assert.equal(admitted.task.value.attempt.effect_authority.epoch,admitted.task.value.authority_epoch);
});

test('caller-shaped authority fields cannot choose the source epoch or extend the admission lease',t=>{
  const f=fixture(t),fake={authority_epoch:999,effect_authority:{protocol:'peer-task-effect-authority-v1',epoch:999,issued_at:'2099-01-01T00:00:00.000Z',expires_at:'2099-01-02T00:00:00.000Z'},available:true,executor_incarnation:'caller-shaped',lease_ms:Number.MAX_SAFE_INTEGER};
  const task=f.submit(fake);assert.equal(task.value.authority_epoch,1);
  for(const key of Object.keys(fake))assert.equal(Object.hasOwn(task.value.definition,key),false);
  assert.equal(Object.hasOwn(task.value,'effect_authority'),false);
  f.claim(task);const admitted=f.admit(task,fake);assert.equal(admitted.admitted,true);
  const authority=admitted.task.value.attempt.effect_authority;
  assert.equal(authority.epoch,2);assert.equal(authority.issued_at,new Date(f.clock).toISOString());
  assert.equal(authority.expires_at,new Date(f.clock+TASK_EFFECT_LEASE_MS).toISOString());
  assert.equal(Object.hasOwn(admitted.task.value.attempt,'executor_incarnation'),false);
  assert.equal(Object.hasOwn(admitted.task.value.attempt,'available'),false);
});

test('inspection and generic principal rebinding do not renew an existing or expired effect lease',t=>{
  const f=fixture(t),admitted=f.start(),authority=structuredClone(admitted.task.value.attempt.effect_authority),before=logicalSQLState(f);
  for(const instant of [f.clock+1000,Date.parse(authority.expires_at),Date.parse(authority.expires_at)+1]){
    f.clock=instant;
    const connection=bindPeerPrincipal(f.ledger,{principal_id:'cos-a',generation:1,native_id:'cos-a-native'});
    const current=connection.inspect('task/get',{task_id:admitted.task.id});
    assert.deepEqual(current.value.attempt.effect_authority,authority);
    assert.equal(current.value.authority_epoch,authority.epoch);
    connection.inspect('task/context',{task_id:admitted.task.id});
    assert.deepEqual(f.get('tasks',admitted.task.id).value.attempt.effect_authority,authority);
    assert.deepEqual(logicalSQLState(f),before);
  }
  // These are generic read/bind APIs, not positive effect-client permission.
});

const transitions=[
  {name:'transfer',status:'running',change:(f,a)=>f.run('cos-a','task/transfer',{task_id:a.task.id,to_principal_id:'cos-b',to_grant_id:'grant-cos-b'},f.other),reserved:true},
  {name:'cancellation',status:'cancelled',change:(f,a)=>f.run('cos-a','task/cancel',{task_id:a.task.id,reason:'Synthetic cancellation from second connection.'},f.other),reserved:true},
  {name:'successful finish',status:'returned',change:(f,a)=>f.finish(a)},
  {name:'failed finish',status:'failed',change:(f,a)=>f.finish(a,{error:{code:'SYNTHETIC_FAILURE'}})},
  {name:'unknown finish',status:'unknown',change:(f,a)=>f.finish(a,{error:{code:'SYNTHETIC_TIMEOUT'},termination_confirmed:false,observed_process:{...f.observed_process(a),close_observed:false}}),reserved:true}
];
for(const transition of transitions)test('actual second-connection '+transition.name+' invalidates the old epoch without renewing its lease',t=>{
  const f=fixture(t),admitted=f.start(),original=structuredClone(admitted.task.value.attempt.effect_authority);
  f.clock+=1000;transition.change(f,admitted);const current=f.get('tasks',admitted.task.id);
  assert.equal(current.value.status,transition.status);assert.equal(current.value.authority_epoch,original.epoch+1);
  assert.deepEqual(current.value.attempt.effect_authority,original,'an invalidated attempt retains its exact original authority record');
  assert.notEqual(current.value.authority_epoch,current.value.attempt.effect_authority.epoch);
  assert.equal(f.ledger.read(tx=>tx.getVersion(reference('tasks',admitted.task))).value.authority_epoch,original.epoch);
  assert.equal(f.get('control','usage').value.model_calls,1);assert.equal(f.get('grants','grant-cos-a').value.used_model_calls,1);
  if(transition.reserved){
    assert(['active','unknown'].includes(f.get('slots',admitted.task.id).value.status));
    assert(['reserved','unknown'].includes(f.get('effects',admitted.task.value.attempt.effect_id).value.status));
    assert.equal(f.ledger.read(tx=>tx.list('claims',{task_id:admitted.task.id,status:'held',limit:100})).items.length,1);
  }else{
    assert.equal(f.get('slots',admitted.task.id).value.status,'released');
    assert.equal(f.ledger.read(tx=>tx.list('claims',{task_id:admitted.task.id,status:'held',limit:100})).items.length,0);
  }
});

test('synthetic protected closure after unknown execution advances authority again while retaining the failed result',t=>{
  const f=fixture(t),admitted=f.start(),authority=structuredClone(admitted.task.value.attempt.effect_authority);
  const finished=f.finish(admitted,{error:{code:'SYNTHETIC_TIMEOUT'},termination_confirmed:false,observed_process:{...f.observed_process(admitted),close_observed:false}});
  assert.equal(finished.task.value.authority_epoch,authority.epoch+1);
  const result=structuredClone(finished.task.value.result);f.clock+=1000;
  const closed=f.observe('task/closure',admitted,{termination_confirmed:true});
  assert.equal(closed.value.authority_epoch,authority.epoch+2);assert.equal(closed.value.status,'quarantined');
  assert.deepEqual(closed.value.attempt.effect_authority,authority);assert.deepEqual(closed.value.result,result);
  assert.equal(closed.value.result.termination_confirmed,false);assert.equal(closed.value.closure.termination_confirmed,true);
  assert.equal(f.get('slots',admitted.task.id).value.status,'released');
  assert.equal(f.get('control','usage').value.model_calls,1);
});

test('recording the original process retains the admission epoch and lease, while duplicate process evidence rolls back',t=>{
  const f=fixture(t),admitted=f.start(),authority=structuredClone(admitted.task.value.attempt.effect_authority);f.clock+=1000;
  const current=f.observe('task/process',admitted,{observed_process:{...f.observed_process(admitted),close_observed:false}});
  assert.equal(current.value.authority_epoch,authority.epoch);assert.deepEqual(current.value.attempt.effect_authority,authority);
  assert.equal(current.value.attempt.process.pid,45678);
  const before=reservations(f,admitted);
  unchanged(f,()=>f.observe('task/process',admitted,{observed_process:{...f.observed_process(admitted),close_observed:false}}),'PROCESS_RECORDED');
  assert.deepEqual(reservations(f,admitted),before);
});

test('exact admission replay returns the original expired authority without another model charge or lease renewal',t=>{
  const f=fixture(t),task=f.submit();f.claim(task);
  const args={operation_id:'stable-admission-replay'},admitted=f.admit(task,args);assert.equal(admitted.admitted,true);
  const authority=structuredClone(admitted.task.value.attempt.effect_authority),before=logicalSQLState(f);
  f.clock=Date.parse(authority.expires_at)+1;
  assert.deepEqual(f.admit(task,args),admitted);assert.deepEqual(logicalSQLState(f),before);
  assert.deepEqual(f.get('tasks',task.id).value.attempt.effect_authority,authority);
  assert.equal(f.get('control','usage').value.model_calls,1);
});

for(const invalid of [0,-1,1.5,Number.MAX_SAFE_INTEGER])test('invalid or exhausted persisted epoch '+invalid+' cannot spend an admission or replace reservations',t=>{
  const f=fixture(t),task=f.submit();f.claim(task);
  f.other.write('synthetic-authority-corruption-negative-control','founder',tx=>{
    const current=tx.get('tasks',task.id);return tx.put('tasks',task.id,{...current.value,authority_epoch:invalid},current.revision);
  });
  unchanged(f,()=>f.admit(task),'TASK_AUTHORITY_CHANGED');
  assert.equal(f.get('tasks',task.id).value.attempt,null);assert.equal(f.get('control','usage'),null);
  assert.equal(f.get('slots',task.id),null);
  assert.equal(f.ledger.read(tx=>tx.list('claims',{task_id:task.id,status:'held',limit:100})).items.length,1);
});

test('an expired grant cannot issue authority, consume another model call or release the pending claim',t=>{
  const f=fixture(t,{grant_remaining_ms:45000}),task=f.submit();f.claim(task);f.clock=Date.parse(f.grant_expiry);
  const before=f.ledger.read(tx=>tx.list('claims',{task_id:task.id,status:'held',limit:100}));
  const result=f.admit(task);assert.equal(result.admitted,false);assert.equal(result.code,'GRANT_INVALID');
  assert.equal(f.get('tasks',task.id).value.attempt,null);assert.equal(f.get('tasks',task.id).value.authority_epoch,1);
  assert.equal(f.get('control','usage'),null);assert.equal(f.get('grants','grant-cos-a').value.used_model_calls,0);
  assert.equal(f.get('slots',task.id),null);
  assert.deepEqual(f.ledger.read(tx=>tx.list('claims',{task_id:task.id,status:'held',limit:100})),before);
});

test('an attempted or unknown task cannot obtain a second claim and silently refresh its authority',t=>{
  const f=fixture(t),admitted=f.start();
  for(const unknown of [false,true]){
    if(unknown)f.finish(admitted,{error:{code:'SYNTHETIC_TIMEOUT'},termination_confirmed:false,observed_process:{...f.observed_process(admitted),close_observed:false}});
    const before=reservations(f,admitted),authority=structuredClone(f.get('tasks',admitted.task.id).value.attempt.effect_authority);
    unchanged(f,()=>f.run('cos-a','task/claim',{task_id:admitted.task.id}),'ATTEMPT_CONSUMED');
    assert.deepEqual(reservations(f,admitted),before);
    assert.deepEqual(f.get('tasks',admitted.task.id).value.attempt.effect_authority,authority);
  }
});

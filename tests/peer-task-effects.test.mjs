import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {bindPeerPrincipal,bindPeerTaskEffects,digest} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerTaskEffectsFixture as fixture,reference,rows,logicalSQLState} from './peer-task-effects-fixture.mjs';

// Real source admission, source-issued opaque executor handles and two real
// temporary SQLite connections. The original no-I/O host observer below is
// explicitly SYNTHETIC: no child, model, provider, account or native boundary
// is exercised or qualified, and no live company state is read or modified.
const code=expected=>error=>error?.code===expected;
const message=operation_id=>({operation_id,to_principal_id:'cos-b',content:'Useful bounded synthetic task handoff.'});
function rejectedUnchanged(f,operation,expected){
  const before=logicalSQLState(f);assert.throws(operation,code(expected));assert.deepEqual(logicalSQLState(f),before);
}
function taskCommand(f,a,operation_id){
  const commands=rows(f,'commands',{task_id:a.task.id}).filter(row=>row.value.operation_id===operation_id);
  assert.equal(commands.length,1);return commands[0];
}
function watchRows(f,observe){
  const original=f.ledger.query;
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='get')return(...values)=>{const result=target.get(...values);observe(values,result);return result;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  return()=>{f.ledger.query=original;};
}
function watchBoundaries(f){
  const original=f.ledger.db.exec,seen=[];
  f.ledger.db.exec=function(sql){seen.push(sql);return Reflect.apply(original,this,[sql]);};
  return {seen,restore:()=>{f.ledger.db.exec=original;}};
}

test('original source handles support own-task inspection and a useful committed message with exact replay',t=>{
  const f=fixture(t),a=f.start(),before=logicalSQLState(f);
  assert(Object.isFrozen(a.client));assert.deepEqual(Object.keys(a.client).sort(),['execute','inspect']);
  assert.deepEqual(a.client.inspect('task/get',{task_id:a.task.id}),f.get('tasks',a.task.id));
  assert.equal(a.client.inspect('task/context',{}).sha256,a.context.sha256);
  assert.deepEqual(logicalSQLState(f),before,'guarded inspection does not add receipts or events');
  const eventsBefore=f.ledger.db.prepare('SELECT COUNT(*) AS n FROM peer_events').get().n;
  const result=a.client.execute('message/send',message('positive-message'));
  assert.equal(result.value.content,message('positive-message').content);
  assert.equal(result.value.task_id,a.task.id);assert.equal(result.value.attempt_id,a.task.value.attempt.id);
  assert.equal(result.value.task_effect.task_id,a.task.id);
  assert.equal(result.value.task_effect.authority_epoch,a.task.value.authority_epoch);
  const command=taskCommand(f,a,'positive-message');
  assert.equal(command.value.task_id,a.task.id);assert.equal(command.value.attempt_id,a.task.value.attempt.id);
  assert.deepEqual(command.value.task_effect,result.value.task_effect);
  assert.deepEqual(f.get('messages',result.id),result);
  const event=f.ledger.db.prepare('SELECT seq,type,principal_id,bytes FROM peer_events ORDER BY seq DESC LIMIT 1').get();
  assert.equal(event.type,'message/send');assert.equal(event.principal_id,'cos-a');assert.equal(event.seq,eventsBefore+1);
  const changes=JSON.parse(event.bytes).changes;assert(changes.some(row=>row.family==='messages'&&row.id===result.id));
  assert(changes.some(row=>row.family==='commands'&&row.id===command.id));
  assert.equal(f.ledger.db.prepare('SELECT status FROM peer_outbox WHERE seq=?').get(event.seq).status,'pending');
  const committed=logicalSQLState(f);assert.deepEqual(a.client.execute('message/send',message('positive-message')),result);
  assert.deepEqual(logicalSQLState(f),committed);assert(a.observerCalls()>3);
  assert.equal(f.get('control','usage').value.model_calls,1);assert.equal(f.get('grants','grant-cos-a').value.used_model_calls,1);
});

test('generic and different-task receipts cannot masquerade as this admission\'s effect',t=>{
  const f=fixture(t),operation='same-client-operation';
  const ordinary=f.connection.execute('message/send',{...message(operation),scope:'alpha',grant_id:'grant-cos-a'});
  const a=f.start({resources:[]}),b=f.start({resources:[]});
  const first=a.client.execute('message/send',message(operation)),second=b.client.execute('message/send',message(operation));
  assert.notEqual(first.id,ordinary.id);assert.notEqual(first.id,second.id);assert.notEqual(second.id,ordinary.id);
  const commandA=taskCommand(f,a,operation),commandB=taskCommand(f,b,operation);
  assert.notEqual(commandA.id,commandB.id);assert.notDeepEqual(commandA.value.task_effect,commandB.value.task_effect);
  assert.equal(rows(f,'messages').length,3);
  const before=logicalSQLState(f);
  assert.deepEqual(a.client.execute('message/send',message(operation)),first);
  assert.deepEqual(b.client.execute('message/send',message(operation)),second);
  assert.deepEqual(logicalSQLState(f),before);assert.equal(f.get('control','usage').value.model_calls,2);
});

test('lease expiry rejects before the business command lookup, including an otherwise exact replay',t=>{
  const f=fixture(t),a=f.start(),args=message('expiry-replay');a.client.execute('message/send',args);
  const receipt=taskCommand(f,a,args.operation_id),businessId=digest(['peer-task-command-v1','cos-a',receipt.value.task_effect,'expired-new-operation']);
  f.clock=Date.parse(a.task.value.attempt.effect_authority.expires_at);
  const before=logicalSQLState(f),taskReads=[],businessReads=[],boundary=watchBoundaries(f);
  const restore=watchRows(f,values=>{
    if(values[0]==='tasks')taskReads.push(f.ledger.db.isTransaction);
    if(values[0]==='commands'&&[receipt.id,businessId].includes(values[1]))businessReads.push(values[1]);
  });
  try{
    assert.throws(()=>a.client.execute('message/send',args),code('TASK_EFFECT_EXPIRED'));
    assert.throws(()=>a.client.execute('message/send',message('expired-new-operation')),code('TASK_EFFECT_EXPIRED'));
    assert.throws(()=>a.client.inspect('task/get',{}),code('TASK_EFFECT_EXPIRED'));
  }finally{restore();boundary.restore();}
  assert(taskReads.length>0);assert(taskReads.every(Boolean));assert.deepEqual(businessReads,[]);
  assert(boundary.seen.some(sql=>/^BEGIN IMMEDIATE\b/.test(sql)));assert(boundary.seen.some(sql=>/^ROLLBACK\b/.test(sql)));
  assert(!boundary.seen.some(sql=>/^COMMIT\b/.test(sql)));assert.deepEqual(logicalSQLState(f),before);
});

test('expiry after the actual final metadata SQL rolls back output, replay state, history and outbox before COMMIT',t=>{
  const f=fixture(t),a=f.start();a.client.execute('message/send',message('physical-cutoff-baseline'));
  const before=logicalSQLState(f),original=f.ledger.query,boundary=watchBoundaries(f);let finalUpdates=0;
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='run')return(...values)=>{const result=target.run(...values);finalUpdates++;f.clock=a.association.deadline_at_ms;return result;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  try{assert.throws(()=>a.client.execute('message/send',message('after-final-physical-sql')),code('TASK_EFFECT_EXPIRED'));}
  finally{f.ledger.query=original;boundary.restore();}
  assert.equal(finalUpdates,1,'the real metadata update completed before the clock crossed expiry');
  assert(boundary.seen.some(sql=>/^ROLLBACK\b/.test(sql)));assert(!boundary.seen.some(sql=>/^COMMIT\b/.test(sql)));
  assert.deepEqual(logicalSQLState(f),before);
});

test('executor revocation after final metadata SQL is rechecked before physical commit',t=>{
  const f=fixture(t),a=f.start();a.client.execute('message/send',message('late-revocation-baseline'));
  const before=logicalSQLState(f),original=f.ledger.query,boundary=watchBoundaries(f);let revocations=0;
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='run')return(...values)=>{const result=target.run(...values);revocations++;f.source.revoke(a.handle);return result;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  try{assert.throws(()=>a.client.execute('message/send',message('late-revocation')),code('EXECUTOR_INCARNATION_REVOKED'));}
  finally{f.ledger.query=original;boundary.restore();}
  assert.equal(revocations,1);assert(boundary.seen.some(sql=>/^ROLLBACK\b/.test(sql)));
  assert(!boundary.seen.some(sql=>/^COMMIT\b/.test(sql)));assert.deepEqual(logicalSQLState(f),before);
});

const staleChanges=[
  {name:'cancellation',code:'TASK_INACTIVE',change:(f,a)=>f.run('cos-a','task/cancel',{task_id:a.task.id},f.other)},
  {name:'owner transfer',code:'TASK_OWNER',change:(f,a)=>f.run('cos-a','task/transfer',{task_id:a.task.id,to_principal_id:'cos-b',to_grant_id:'grant-cos-b'},f.other)},
  {name:'returned result',code:'TASK_INACTIVE',change:(f,a)=>f.finish(a)},
  {name:'unknown result',code:'TASK_INACTIVE',change:(f,a)=>f.finish(a,{error:{code:'SYNTHETIC_TIMEOUT'},termination_confirmed:false,observed_process:{...f.process(a),close_observed:false}})},
  {name:'principal incarnation',code:'PRINCIPAL_CHANGED',change:f=>f.seed('principals','cos-a',v=>({...v,generation:v.generation+1,native_id:'replacement-native'}))},
  {name:'principal deactivation',code:'PRINCIPAL_INACTIVE',change:f=>f.seed('principals','cos-a',v=>({...v,status:'inactive'}))},
  {name:'company pause',code:'PAUSED',change:f=>f.run('founder','company/pause',{source_instruction:'Fictional pause before task action.'},f.other)},
  {name:'policy generation',code:'AUTHORITY_CHANGED',change:f=>f.seed('control','company',v=>({...v,policy_generation:v.policy_generation+1}))},
  {name:'pause generation',code:'AUTHORITY_CHANGED',change:f=>f.seed('control','company',v=>({...v,pause_generation:v.pause_generation+1}))},
  {name:'grant revocation',code:'GRANT_INVALID',change:f=>f.run('founder','grant/revoke',{grant_id:'grant-cos-a'},f.other)},
  {name:'authority epoch',code:'TASK_AUTHORITY_CHANGED',change:(f,a)=>f.seed('tasks',a.task.id,v=>({...v,authority_epoch:v.authority_epoch+1}))},
  {name:'attempt replacement',code:'TASK_AUTHORITY_CHANGED',change:(f,a)=>f.seed('tasks',a.task.id,v=>({...v,attempt:{...v.attempt,id:'synthetic-replacement-attempt'}}))},
  {name:'context alias replacement',code:'TASK_AUTHORITY_CHANGED',change:(f,a)=>f.seed('tasks',a.task.id,v=>({...v,attempt:{...v.attempt,context:{...v.attempt.context,sha256:'0'.repeat(64)}}}))},
  {name:'new required context',code:'CONTEXT_CHANGED',change:f=>f.run('cos-b','notice/create',{scope:'alpha',content:'New required synthetic condition.'},f.other)}
];
for(const scenario of staleChanges)test('a second connection\'s '+scenario.name+' blocks fresh actions and cached replay atomically',t=>{
  const f=fixture(t),a=f.start(),args=message('stale-replay');a.client.execute('message/send',args);
  const receipt=taskCommand(f,a,args.operation_id);scenario.change(f,a);const before=logicalSQLState(f);let businessReads=0;
  const restore=watchRows(f,values=>{if(values[0]==='commands'&&values[1]===receipt.id)businessReads++;});
  try{
    assert.throws(()=>a.client.execute('message/send',args),code(scenario.code));
    assert.throws(()=>a.client.execute('message/send',message('stale-fresh')),code(scenario.code));
    assert.throws(()=>a.client.inspect('task/context',{}),code(scenario.code));
  }finally{restore();}
  assert.equal(businessReads,0);assert.deepEqual(logicalSQLState(f),before);
  assert.equal(f.get('control','usage').value.model_calls,1);
});

const tampering=[
  {name:'broader resources without an epoch change',code:'TASK_AUTHORITY_CHANGED',family:'tasks',change:v=>({...v,resources:[...v.resources,{kind:'home',id:'other',key:'home:other'}]})},
  {name:'broader scope without an epoch change',code:'TASK_AUTHORITY_CHANGED',family:'tasks',change:v=>({...v,scope:'*'})},
  {name:'changed task purpose',code:'TASK_AUTHORITY_CHANGED',family:'tasks',change:v=>({...v,instructions:'A different task purpose.'})},
  {name:'changed native request hash',code:'TASK_RESERVATION_CHANGED',family:'tasks',change:v=>({...v,attempt:{...v.attempt,request_sha256:'0'.repeat(64)}})},
  {name:'changed native effect alias',code:'TASK_RESERVATION_CHANGED',family:'tasks',change:v=>({...v,attempt:{...v.attempt,effect_id:'other-native-effect'}})},
  {name:'changed attempt definition revision',code:'TASK_AUTHORITY_CHANGED',family:'tasks',change:v=>({...v,attempt:{...v.attempt,definition_revision:v.attempt.definition_revision+1}})},
  {name:'context source bodies appended without changing the admitted bytes or hash',code:'TASK_AUTHORITY_CHANGED',family:'tasks',wire_unchanged:true,change:v=>({...v,attempt:{...v.attempt,context:{...v.attempt.context,sources:[...v.attempt.context.sources,{family:'homes',id:'synthetic-unsealed-body',revision:1,sha256:'0'.repeat(64),value:{status:'current',scope:'alpha',content:'Unsealed supplied body.'}}]}}})},
  {name:'context control body changed without changing the admitted bytes or hash',code:'TASK_AUTHORITY_CHANGED',family:'tasks',wire_unchanged:true,change:v=>({...v,attempt:{...v.attempt,context:{...v.attempt.context,control:{...v.attempt.context.control,paused:!v.attempt.context.control.paused}}}})},
  {name:'rewritten native effect request',code:'TASK_RESERVATION_CHANGED',family:'effects',change:v=>({...v,request:{...v.request,context_sha256:'0'.repeat(64)}})},
  {name:'rewritten native effect scope',code:'TASK_RESERVATION_CHANGED',family:'effects',change:v=>({...v,scope:'*'})},
  {name:'rewritten original admission command',code:'TASK_ADMISSION_REQUIRED',family:'commands',change:v=>({...v,synthetic_rewrite:true})}
];
for(const scenario of tampering)test('source guard rejects '+scenario.name+' instead of accepting producer-shaped rows',t=>{
  const f=fixture(t),a=f.start();a.client.execute('message/send',message('tamper-baseline'));
  const namespace=taskCommand(f,a,'tamper-baseline').value.task_effect;
  const id=scenario.family==='tasks'?a.task.id:scenario.family==='effects'?a.task.value.attempt.effect_id:namespace.admission_producer.command.id;
  f.seed(scenario.family,id,scenario.change);
  const current=f.get('tasks',a.task.id);assert.equal(current.value.authority_epoch,a.task.value.authority_epoch);
  if(scenario.wire_unchanged){
    const context=current.value.attempt.context;assert.notDeepEqual(context,a.context);
    for(const field of ['text','sha256','hash','utf8_bytes'])assert.deepEqual(context[field],a.context[field]);
  }
  rejectedUnchanged(f,()=>a.client.execute('message/send',message('tampered-action')),scenario.code);
});

test('only the original connection and source-issued executor handle can bind this task',t=>{
  const f=fixture(t),a=f.start(),before=logicalSQLState(f);let traps=0;
  const proxy=new Proxy(a.handle,{get(){traps++;throw Error('Unreachable handle getter');},getPrototypeOf(){traps++;throw Error('Unreachable handle prototype');}});
  for(const handle of [null,{},Object.freeze({...a.handle}),Object.create(a.handle),proxy])
    assert.throws(()=>bindPeerTaskEffects(f.connection,{task_id:a.task.id},handle),code('EXECUTOR_INCARNATION_REQUIRED'));
  for(const connection of [{},Object.freeze({...f.connection}),Object.create(f.connection),new Proxy(f.connection,{})])
    assert.throws(()=>bindPeerTaskEffects(connection,{task_id:a.task.id},a.handle),code('AUTHENTICATION_REQUIRED'));
  for(const patch of [{authority_epoch:1},{executor_incarnation:a.handle},{expires_at:new Date(f.clock+3600000).toISOString()}])
    assert.throws(()=>bindPeerTaskEffects(f.connection,{task_id:a.task.id,...patch},a.handle));
  assert.equal(traps,0);assert.deepEqual(logicalSQLState(f),before);
  assert.equal(a.client.inspect('task/get',{}).id,a.task.id);
  const foreign=bindPeerPrincipal(f.other,{principal_id:'cos-a',generation:1,native_id:'cos-a-native'});
  rejectedUnchanged(f,()=>bindPeerTaskEffects(foreign,{task_id:a.task.id},a.handle),'EXECUTOR_INCARNATION_CHANGED');
});

test('task clients enforce closed actions, authority arguments, admitted resources and own-task inspections',t=>{
  const f=fixture(t),a=f.start(),before=logicalSQLState(f);
  for(const action of ['task/submit','task/finish','home/publish','github/publish','notice/resolve','company/pause'])
    assert.throws(()=>a.client.execute(action,{}),code('TASK_EFFECT_ACTION_HELD'));
  for(const [patch,expected] of [
    [{principal_id:'founder'},'ACTOR_ARGUMENT'],[{authority_epoch:999},'ACTOR_ARGUMENT'],[{executor_incarnation:{}},'ACTOR_ARGUMENT'],
    [{deadline_at_ms:f.clock+3600000},'ACTOR_ARGUMENT'],[{task_effect:{available:true}},'ACTOR_ARGUMENT'],
    [{resources:['home:other']},'INVALID_INPUT'],[{scope:'beta'},'TASK_EFFECT_SCOPE'],[{grant_id:'grant-cos-b'},'TASK_EFFECT_SCOPE'],
    [{task_id:'other-task'},'TASK_OWNER']
  ])assert.throws(()=>a.client.execute('message/send',{...message('closed-request'),...patch}),code(expected));
  assert.throws(()=>a.client.execute('home/propose',{operation_id:'outside-resource',home_id:'other',content:'Outside the admitted task resource.'}),code('RESOURCE_AUTHORITY'));
  for(const [action,args] of [['runtime/status',{}],['list',{family:'principals'}],['task/get',{task_id:'other-task'}],['task/context',{task_id:a.task.id,family:'tasks'}]])
    assert.throws(()=>a.client.inspect(action,args),code('TASK_EFFECT_ACTION_HELD'));
  let accesses=0;const getter={operation_id:'no-getter',to_principal_id:'cos-b'};
  Object.defineProperty(getter,'content',{enumerable:true,get(){accesses++;return 'Untrusted accessor';}});
  assert.throws(()=>a.client.execute('message/send',getter));assert.equal(accesses,0);
  assert.deepEqual(logicalSQLState(f),before);
});

for(const kind of ['Error','AggregateError'])test('task entries retain the original provider '+kind+' identity and causes',t=>{
  const f=fixture(t),a=f.start(),cause=Error('Original backend cause.'),member=Error('Original backend member.');
  const failure=Object.assign(kind==='Error'?new Error('Original provider failure.',{cause}):new AggregateError([member],'Original provider group.',{cause}),{code:'GRANT_INVALID'});
  const before=logicalSQLState(f),restore=watchRows(f,values=>{if(values[0]==='grants'&&values[1]==='grant-cos-a')throw failure;});
  try{
    for(const invoke of [()=>a.client.execute('message/send',message('provider-failure')),()=>a.client.inspect('task/get',{}),()=>bindPeerTaskEffects(f.connection,{task_id:a.task.id},a.handle)])
      assert.throws(invoke,error=>{assert.equal(error,failure);assert.equal(error.cause,cause);if(kind==='AggregateError')assert.equal(error.errors[0],member);return true;});
  }finally{restore();}
  assert.deepEqual(logicalSQLState(f),before);
  assert.equal(a.client.execute('message/send',message('provider-restored')).value.content,message('provider-restored').content);
});

test('unknown execution keeps reservations and blocks a competing task after denied effects',t=>{
  const f=fixture(t),a=f.start();a.client.execute('message/send',message('unknown-baseline'));
  f.finish(a,{error:{code:'SYNTHETIC_TIMEOUT'},termination_confirmed:false,observed_process:{...f.process(a),close_observed:false}});
  rejectedUnchanged(f,()=>a.client.execute('message/send',message('unknown-denied')),'TASK_INACTIVE');
  rejectedUnchanged(f,()=>a.client.inspect('task/get',{}),'TASK_INACTIVE');
  const slot=f.get('slots',a.task.id),effect=f.get('effects',a.task.value.attempt.effect_id),claims=rows(f,'claims',{task_id:a.task.id,status:'held'});
  assert.equal(slot.value.status,'unknown');assert.equal(effect.value.status,'unknown');assert.equal(claims.length,1);
  assert.equal(effect.value.termination_confirmed,false);assert.equal(f.get('control','usage').value.model_calls,1);
  const competitor=f.submit({},'cos-b');
  rejectedUnchanged(f,()=>f.run('cos-b','task/claim',{task_id:competitor.id}),'RESOURCE_BUSY');
  assert.deepEqual(f.get('slots',a.task.id),slot);assert.deepEqual(f.get('effects',effect.id),effect);
  assert.deepEqual(rows(f,'claims',{task_id:a.task.id,status:'held'}),claims);
});

test('guarded home proposals preserve admitted out-of-scope input lineage even when the request omits it',t=>{
  const f=fixture(t),foreign=f.run('cos-b','notice/create',{scope:'beta',content:'Explicit differently scoped contributor.'});
  const input=reference('notices',foreign),a=f.start({input_refs:[input]});
  assert(a.context.sources.some(row=>row.family==='notices'&&row.id===foreign.id));
  const proposal=a.client.execute('home/propose',{operation_id:'useful-proposal',home_id:'fact',expected_revision:0,content:'Useful scoped proposed fact.',input_refs:[]});
  assert.equal(proposal.value.status,'proposed');assert.equal(proposal.value.home_id,'fact');
  assert.equal(proposal.value.task_id,a.task.id);assert.equal(proposal.value.attempt_id,a.task.value.attempt.id);
  assert(proposal.value.readset.some(row=>canonical(row)===canonical(input)),'required original contributor must survive request omission');
  assert.deepEqual(taskCommand(f,a,'useful-proposal').value.task_effect,proposal.value.task_effect);
  assert.equal(f.get('control','usage').value.model_calls,1);
  const unadmitted=f.run('cos-b','notice/create',{scope:'gamma',content:'A later source absent from admission.'});
  rejectedUnchanged(f,()=>a.client.execute('home/propose',{operation_id:'unadmitted-input',home_id:'fact',content:'Cannot add unreviewed supplied evidence.',input_refs:[reference('notices',unadmitted)]}),'SOURCE_INVALID');
});

test('a useful task notice commits once, then its new required context fences further calls',t=>{
  const f=fixture(t),a=f.start(),notice=a.client.execute('notice/create',{operation_id:'new-task-condition',content:'A useful new required condition.'});
  assert.equal(notice.value.status,'pending');assert.equal(notice.value.scope,'alpha');assert.equal(notice.value.task_id,a.task.id);
  assert.deepEqual(f.get('notices',notice.id),notice);
  rejectedUnchanged(f,()=>a.client.execute('message/send',message('after-new-required-notice')),'CONTEXT_CHANGED');
  rejectedUnchanged(f,()=>a.client.inspect('task/context',{}),'CONTEXT_CHANGED');
  assert.equal(f.get('control','usage').value.model_calls,1);
});

for(const mode of ['revoke','stop','observer drift'])test('original executor '+mode+' cannot retain a useful task capability',t=>{
  const f=fixture(t),a=f.start();a.client.execute('message/send',message('executor-baseline'));
  if(mode==='revoke')f.source.revoke(a.handle);
  else if(mode==='stop')f.source.stop();
  else a.setCurrent({...structuredClone(a.association),turn_id:'synthetic-different-turn'});
  rejectedUnchanged(f,()=>a.client.execute('message/send',message('executor-invalid')),mode==='observer drift'?'EXECUTOR_INCARNATION_CHANGED':'EXECUTOR_INCARNATION_REVOKED');
  rejectedUnchanged(f,()=>a.client.inspect('task/get',{}),'EXECUTOR_INCARNATION_REVOKED');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../plugins/soloco/runtime/peers/model.mjs';
import {PeerScheduler} from '../plugins/soloco/runtime/peers/scheduler.mjs';
import {peerTaskEffectsFixture,actor,reference,rows,logicalSQLState} from './peer-task-effects-fixture.mjs';

// Temporary P1 ledgers and source-issued synthetic host handles only. These
// cases qualify owner-fence source mechanics, not a native host, process,
// provider, actual company handover, or release of an older UNKNOWN claim.
const legacyOwner={host:'codex',session_id:'synthetic-owner',epoch:1};
const code=expected=>error=>error?.code===expected;
const message=operation_id=>({operation_id,to_principal_id:'cos-b',content:'Synthetic production-owner-bound handoff.'});

function fixture(t,options={}){
  const f=peerTaskEffectsFixture(t,{peerFixtureOptions:{principals:{founder:{legacy_owner:legacyOwner}}},...options});
  const facade=model.bindPeerProductionScheduler(f.ledger);let sequence=0;
  const pending=(args={})=>{
    const task=f.submit(args);f.run(task.value.owner_principal_id,'task/claim',{task_id:task.id});return task;
  };
  const admit=(task,args={})=>facade.execute(f.ledger,actor('scheduler'),'task/admit',{
    operation_id:'production-admit-'+(++sequence),task_id:task.id,...args
  });
  const bind=admitted=>{
    const association={task_id:admitted.task.id,attempt_id:admitted.task.value.attempt.id,context_sha256:admitted.context.sha256,
      principal_id:f.binding.principal_id,generation:f.binding.generation,native_id:f.binding.native_id,
      turn_id:'synthetic-production-turn-'+admitted.task.id,process:{pid:62500,started_at:admitted.task.value.attempt.admitted_at},
      deadline_at_ms:Date.parse(admitted.task.value.attempt.effect_authority.expires_at)};
    const handle=f.source.observe(association,()=>association);
    const client=model.bindPeerTaskEffects(f.connection,{task_id:admitted.task.id},handle);
    return {...admitted,association,handle,client};
  };
  const start=(args={})=>{const admitted=admit(pending(args));assert.equal(admitted.admitted,true);return bind(admitted);};
  return Object.assign(f,{facade,pending,admit,bind,productionStart:start});
}

function unchanged(f,operation,expected){
  const before=logicalSQLState(f);assert.throws(operation,code(expected));assert.deepEqual(logicalSQLState(f),before);
}

function afterOwnedCallback(f,type,change){
  const original=f.ledger.guardedWrite;let hits=0;
  f.ledger.guardedWrite=function(action,principal,callback,terminal){
    return Reflect.apply(original,this,[action,principal,tx=>{
      const result=callback(tx);
      if(action===type){change(tx);hits++;}
      return result;
    },terminal]);
  };
  return {get hits(){return hits;},restore:()=>{f.ledger.guardedWrite=original;}};
}

function currentContext(f,admitted,facade=f.facade){
  return f.ledger.read(tx=>facade.validateContext(tx,admitted.context));
}

function messageCommand(f,a,operation){
  const commands=rows(f,'commands',{task_id:a.task.id}).filter(row=>row.value.operation_id===operation);
  assert.equal(commands.length,1);return commands[0];
}

function watchCommand(f,id,observe){
  const ids=new Set(Array.isArray(id)?id:[id]);
  const original=f.ledger.query;
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='get')return(...values)=>{const value=target.get(...values);if(values[0]==='commands'&&ids.has(values[1]))observe();return value;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  return()=>{f.ledger.query=original;};
}

test('production scheduler captures canonical owner DATA and source-produces sealed useful task effects',t=>{
  const f=fixture(t),founder=f.get('principals','founder');
  assert(Object.isFrozen(f.facade));assert.deepEqual(Object.keys(f.facade).sort(),['assertCurrent','execute','inspect','membershipWrite','validateContext']);
  assert.doesNotThrow(()=>f.facade.assertCurrent());
  const a=f.productionStart(),seal=a.task.value.attempt.effect_authority.production_authority;
  assert.deepEqual(seal,{protocol:'peer-production-authority-v1',company_id:f.ledger.company_id,root_sha256:model.digest(f.ledger.root),
    founder:reference('principals',founder),legacy_owner:legacyOwner});
  assert.equal(currentContext(f,a),true);assert.equal(f.ledger.read(tx=>model.validateContext(tx,a.context)),true);
  const args=message('valid-production-effect'),result=a.client.execute('message/send',args);
  assert.equal(result.value.task_id,a.task.id);assert.equal(result.value.attempt_id,a.task.value.attempt.id);
  assert.equal(result.value.task_effect.task_id,a.task.id);
  const command=messageCommand(f,a,args.operation_id);assert.deepEqual(command.value.result,result);
  const before=logicalSQLState(f);assert.deepEqual(a.client.execute('message/send',args),result);
  assert.deepEqual(logicalSQLState(f),before);assert.equal(f.get('control','usage').value.model_calls,1);
});

test('matching caller production DATA cannot produce the private admission seal through a generic command',t=>{
  const f=fixture(t),task=f.pending(),founder=f.get('principals','founder');
  const fake={protocol:'peer-production-authority-v1',company_id:f.ledger.company_id,root_sha256:model.digest(f.ledger.root),
    founder:reference('principals',founder),legacy_owner:legacyOwner};
  const admitted=f.run('scheduler','task/admit',{task_id:task.id,production_authority:fake,effect_authority:{production_authority:fake}});
  assert.equal(admitted.admitted,true);assert.equal(Object.hasOwn(admitted.task.value.attempt.effect_authority,'production_authority'),false);
  assert.equal(f.ledger.read(tx=>model.validateContext(tx,admitted.context)),true,'ordinary component context remains ordinary component evidence');
  assert.equal(currentContext(f,admitted),false,'production launch cannot adopt an unsealed generic admission');
  const before=logicalSQLState(f);
  assert.throws(()=>f.admit(task,{operation_id:rows(f,'commands').find(row=>row.value.action==='task/admit').value.operation_id,
    production_authority:fake,effect_authority:{production_authority:fake}}),code('PRODUCTION_OWNER_CHANGED'));
  assert.deepEqual(logicalSQLState(f),before,'a generic receipt cannot be replayed into a sealed production admission');
});

test('production facade preserves founder and scheduler authorization and a closed action surface',t=>{
  const f=fixture(t),task=f.pending(),before=logicalSQLState(f);
  for(const action of ['company/pause','task/submit','task/cancel','message/send','notice/create'])
    assert.throws(()=>f.facade.execute(f.ledger,actor('founder'),action,{}),code('PRODUCTION_ACTION_HELD'));
  for(const action of ['task/get','task/context','list'])
    assert.throws(()=>f.facade.inspect(f.ledger,actor('scheduler'),action,{}),code('PRODUCTION_ACTION_HELD'));
  assert.throws(()=>f.facade.execute(f.ledger,actor('cos-a'),'task/admit',{operation_id:'non-scheduler-admit',task_id:task.id}),code('SCHEDULER_REQUIRED'));
  for(const action of ['task/assign','grant/create','grant/revoke'])
    assert.throws(()=>f.facade.execute(f.ledger,actor('cos-a'),action,{operation_id:'non-founder-'+action,scope:'alpha'}),code('FOUNDER_REQUIRED'));
  assert.throws(()=>f.facade.inspect(f.ledger,actor('cos-a'),'task/peek',{}),code('SCHEDULER_REQUIRED'));
  assert.deepEqual(logicalSQLState(f),before);
  const grant=f.facade.execute(f.ledger,actor('founder'),'grant/create',{
    operation_id:'valid-production-grant',grant_id:'production-grant',to_principal_id:'cos-a',scope:'alpha',actions:['task/*'],
    resources:['home:fact'],expires_at:new Date(f.clock+60000).toISOString(),source_instruction:'Synthetic bounded founder authority.'
  });
  assert.equal(grant.value.status,'active');
  assert.equal(f.facade.execute(f.ledger,actor('founder'),'grant/revoke',{
    operation_id:'valid-production-revoke',grant_id:grant.id
  }).value.status,'revoked');
  assert.equal(f.get('control','usage'),null);
});

test('foreign ledger objects and matching owner DATA cannot substitute for the captured production ledger',t=>{
  const f=fixture(t),task=f.pending(),before=logicalSQLState(f);
  const data={company_id:f.ledger.company_id,root:f.ledger.root,founder:reference('principals',f.get('principals','founder')),legacy_owner:legacyOwner};
  for(const foreign of [f.other,data,{...f.ledger},new Proxy(f.ledger,{})]){
    assert.throws(()=>f.facade.execute(foreign,actor('scheduler'),'task/admit',{operation_id:'foreign-ledger',task_id:task.id}),code('PRODUCTION_OWNER_CHANGED'));
    assert.throws(()=>f.facade.inspect(foreign,actor('scheduler'),'runtime/status',{}),code('PRODUCTION_OWNER_CHANGED'));
  }
  assert.throws(()=>model.bindPeerProductionScheduler(data),code('PRODUCTION_OWNER_CHANGED'));
  assert.deepEqual(logicalSQLState(f),before);
});

test('the membership join accepts only the original facade identity and its exact ledger',t=>{
  const f=fixture(t),before=logicalSQLState(f);let traps=0;
  assert.doesNotThrow(()=>model.assertOriginalPeerProductionScheduler(f.facade,f.ledger));
  const proxy=new Proxy(f.facade,{get(){traps++;throw Error('Unreachable facade getter');},getPrototypeOf(){traps++;throw Error('Unreachable facade prototype');}});
  for(const facade of [null,{},Object.freeze({...f.facade}),Object.create(f.facade),proxy])
    assert.throws(()=>model.assertOriginalPeerProductionScheduler(facade,f.ledger),code('PRODUCTION_OWNER_CHANGED'));
  for(const ledger of [f.other,{root:f.ledger.root,company_id:f.ledger.company_id},new Proxy(f.ledger,{})])
    assert.throws(()=>model.assertOriginalPeerProductionScheduler(f.facade,ledger),code('PRODUCTION_OWNER_CHANGED'));
  assert.equal(traps,0);assert.deepEqual(logicalSQLState(f),before);
  f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:2}}));
  // This assertion authenticates the fixed join's original object, while the
  // continuing owner check occurs on operator writes. Retained host evidence
  // does not become inaccessible solely because the owner changed.
  assert.doesNotThrow(()=>model.assertOriginalPeerProductionScheduler(f.facade,f.ledger));
  assert.throws(()=>f.facade.assertCurrent(),code('PRODUCTION_OWNER_CHANGED'));
});

test('membership operator types gate their real callbacks and cached lookup branches before any replay',t=>{
  const f=fixture(t),types=['membership/enroll','membership/admit','membership/activate','membership/revoke'];
  const calls=new Map(),receipts=new Map();
  const callback=type=>tx=>{
    calls.set(type,(calls.get(type)??0)+1);
    const id='synthetic-membership-seam-'+type,prior=tx.get('work_items',id);
    if(prior)return prior;
    return tx.put('work_items',id,{protocol:'synthetic-membership-owner-seam-v1',status:'retained',type,content:'Real local callback receipt; not native membership acceptance.'},0);
  };
  for(const type of types){
    const first=f.facade.membershipWrite(type,'operator',callback(type));receipts.set(type,first);
    assert.deepEqual(f.get('work_items',first.id),first);
    const event=f.ledger.db.prepare('SELECT type,principal_id FROM peer_events ORDER BY seq DESC LIMIT 1').get();
    assert.equal(event.type,type);assert.equal(event.principal_id,'operator');
    const before=logicalSQLState(f);
    assert.deepEqual(f.facade.membershipWrite(type,'operator',callback(type)),first);
    assert.equal(calls.get(type),2);assert.deepEqual(logicalSQLState(f),before);
  }
  f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:2}}));
  const before=logicalSQLState(f);calls.clear();let receiptReads=0;
  const original=f.ledger.query,ids=new Set([...receipts.values()].map(row=>row.id));
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='get')return(...values)=>{const result=target.get(...values);if(values[0]==='work_items'&&ids.has(values[1]))receiptReads++;return result;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  try{
    for(const type of types)assert.throws(()=>f.facade.membershipWrite(type,'operator',callback(type)),code('PRODUCTION_OWNER_CHANGED'));
  }finally{f.ledger.query=original;}
  assert.equal(calls.size,0,'the owner guard runs before the trusted callback can inspect its cached receipt');
  assert.equal(receiptReads,0);assert.deepEqual(logicalSQLState(f),before);assert.equal(f.get('control','usage'),null);
});

test('membership operator seam rejects nonoperator types or identities without intercepting host retention',t=>{
  const f=fixture(t),before=logicalSQLState(f);let calls=0;
  const callback=()=>{calls++;assert.fail('a rejected operator callback must not run');};
  for(const type of ['membership/bind','membership/finish','membership/closure','task/admit','notice/create'])
    assert.throws(()=>f.facade.membershipWrite(type,'operator',callback),code('PRODUCTION_ACTION_HELD'));
  for(const principal of ['founder','scheduler','cos-a',{principal_id:'operator'}])
    assert.throws(()=>f.facade.membershipWrite('membership/enroll',principal,callback),code('PRODUCTION_ACTION_HELD'));
  for(const fn of [undefined,null,{},'callback'])
    assert.throws(()=>f.facade.membershipWrite('membership/enroll','operator',fn),code('PRODUCTION_ACTION_HELD'));
  assert.equal(calls,0);assert.deepEqual(logicalSQLState(f),before);
  // The separately tested runtime observer continues to retain late results
  // and closures. Host retention is not routed through this operator seam.
});

test('a membership write rolls back its real callback row and late owning-transaction owner mutation',t=>{
  const f=fixture(t),before=logicalSQLState(f);let callbacks=0;
  const hook=afterOwnedCallback(f,'membership/enroll',tx=>{
    const founder=tx.get('principals','founder');tx.put('principals',founder.id,{
      ...founder.value,legacy_owner:{...founder.value.legacy_owner,epoch:2}
    },founder.revision);
  });
  try{
    assert.throws(()=>f.facade.membershipWrite('membership/enroll','operator',tx=>{
      callbacks++;return tx.put('work_items','synthetic-late-membership-write',{
        protocol:'synthetic-membership-owner-seam-v1',status:'retained',content:'Real staged callback row.'
      },0);
    }),code('PRODUCTION_OWNER_CHANGED'));
  }finally{hook.restore();}
  assert.equal(callbacks,1);assert.equal(hook.hits,1);
  assert.deepEqual(logicalSQLState(f),before);assert.equal(f.get('work_items','synthetic-late-membership-write'),null);
  assert.equal(f.get('principals','founder').value.legacy_owner.epoch,1);assert.equal(f.get('control','usage'),null);
});

for(const legacy_owner of [null,{host:'codex',session_id:'synthetic-owner',epoch:0},{host:'codex',session_id:'',epoch:1},{host:'unknown',session_id:'synthetic-owner',epoch:1}])
  test('missing or malformed adopted owner cannot create a production facade: '+JSON.stringify(legacy_owner),t=>{
    const f=peerTaskEffectsFixture(t,{peerFixtureOptions:{principals:{founder:{legacy_owner}}}}),before=logicalSQLState(f);
    assert.throws(()=>model.bindPeerProductionScheduler(f.ledger),code('PRODUCTION_OWNER_CHANGED'));
    assert.deepEqual(logicalSQLState(f),before);assert.equal(f.get('control','usage'),null);
  });

const ownerChanges=[
  {name:'founder row revision',change:f=>f.seed('principals','founder',v=>({...v,synthetic_new_owner_fact:true}))},
  {name:'founder generation',change:f=>f.seed('principals','founder',v=>({...v,generation:v.generation+1}))},
  {name:'founder native identity',change:f=>f.seed('principals','founder',v=>({...v,native_id:'replacement-founder-native'}))},
  {name:'founder inactive status',change:f=>f.seed('principals','founder',v=>({...v,status:'inactive'}))},
  {name:'adopted owner epoch',change:f=>f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:v.legacy_owner.epoch+1}}))},
  {name:'adopted owner session',change:f=>f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,session_id:'replacement-owner-session'}}))},
  {name:'adopted owner host',change:f=>f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,host:'claude'}}))},
  {name:'founder host',change:f=>f.seed('principals','founder',v=>({...v,host:'claude'}))},
  {name:'control founder selection',change:f=>f.seed('control','company',v=>({...v,founder_principal_id:'cos-b'}))}
];
for(const scenario of ownerChanges)test('committed '+scenario.name+' fences the old factory and task client before replay',t=>{
  const f=fixture(t),a=f.productionStart(),args=message('old-production-replay');a.client.execute('message/send',args);
  const command=messageCommand(f,a,args.operation_id),effect=f.get('effects',a.task.value.attempt.effect_id),slot=f.get('slots',a.task.id),claims=rows(f,'claims',{task_id:a.task.id,status:'held'});
  const admission=rows(f,'commands').find(row=>row.value.action==='task/admit'&&row.value.result?.task?.id===a.task.id);assert(admission);
  scenario.change(f);const before=logicalSQLState(f);let replayReads=0;
  const restore=watchCommand(f,[command.id,admission.id],()=>{replayReads++;});
  try{
    assert.throws(()=>f.facade.assertCurrent(),code('PRODUCTION_OWNER_CHANGED'));
    assert.throws(()=>f.facade.inspect(f.ledger,actor('scheduler'),'task/peek',{}),code('PRODUCTION_OWNER_CHANGED'));
    assert.throws(()=>f.facade.execute(f.ledger,actor('scheduler'),'task/admit',{operation_id:'owner-changed-admit',task_id:a.task.id}),code('PRODUCTION_OWNER_CHANGED'));
    assert.throws(()=>f.facade.execute(f.ledger,actor('scheduler'),'task/admit',{operation_id:admission.value.operation_id,task_id:a.task.id}),code('PRODUCTION_OWNER_CHANGED'));
    assert.throws(()=>a.client.execute('message/send',args),code('PRODUCTION_OWNER_CHANGED'));
    assert.throws(()=>a.client.execute('message/send',message('owner-changed-fresh')),code('PRODUCTION_OWNER_CHANGED'));
    assert.throws(()=>a.client.inspect('task/get',{}),code('PRODUCTION_OWNER_CHANGED'));
    assert.throws(()=>model.bindPeerTaskEffects(f.connection,{task_id:a.task.id},a.handle),code('PRODUCTION_OWNER_CHANGED'));
  }finally{restore();}
  assert.equal(replayReads,0);assert.equal(currentContext(f,a),false);
  assert.equal(f.ledger.read(tx=>model.validateContext(tx,a.context)),false);
  assert.equal(f.facade.inspect(f.ledger,actor('scheduler'),'runtime/status',{}).active_slots,1,'bounded diagnostics remain available');
  assert.deepEqual(logicalSQLState(f),before);assert.equal(f.get('control','usage').value.model_calls,1);
  assert.deepEqual(f.get('slots',a.task.id),slot);assert.deepEqual(f.get('effects',effect.id),effect);
  assert.deepEqual(rows(f,'claims',{task_id:a.task.id,status:'held'}),claims);
});

for(const operation of ['task/admit','message/send'])test('owner mutation after real '+operation+' puts rolls back every staged row before commit',t=>{
  const f=fixture(t),task=operation==='task/admit'?f.pending():null,a=operation==='message/send'?f.productionStart():null;
  const before=logicalSQLState(f),hook=afterOwnedCallback(f,operation,tx=>{
    const founder=tx.get('principals','founder');tx.put('principals',founder.id,{
      ...founder.value,legacy_owner:{...founder.value.legacy_owner,epoch:founder.value.legacy_owner.epoch+1}
    },founder.revision);
  });
  try{
    assert.throws(()=>operation==='task/admit'?f.admit(task):a.client.execute('message/send',message('late-owner-drift')),code('PRODUCTION_OWNER_CHANGED'));
  }finally{hook.restore();}
  assert.equal(hook.hits,1);assert.deepEqual(logicalSQLState(f),before);
  assert.equal(f.get('principals','founder').value.legacy_owner.epoch,1);
  if(task){assert.equal(f.get('tasks',task.id).value.attempt,null);assert.equal(f.get('control','usage'),null);assert.equal(f.get('slots',task.id),null);}
  else{assert.equal(f.get('control','usage').value.model_calls,1);assert.equal(f.get('slots',a.task.id).value.status,'active');}
});

test('actual scheduler rechecks production ownership after readiness and before admission without starting execution',async t=>{
  const f=fixture(t),task=f.pending(),beforeClaims=rows(f,'claims',{task_id:task.id,status:'held'});let probes=0,executions=0;
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'scheduler',observer:model.createRuntimeObserver(f.ledger),model:f.facade,readiness_ms:0,
    executor:{
      async probe(){probes++;f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:v.legacy_owner.epoch+1}}));return {available:true,authenticated:true};},
      execute(){executions++;assert.fail('owner race must hold before any executor start');}
    }});
  const result=await scheduler.tick();assert.equal(result.held,true);assert.equal(result.error.code,'PRODUCTION_OWNER_CHANGED');
  assert.equal(probes,1);assert.equal(executions,0);assert.equal(f.get('tasks',task.id).value.attempt,null);
  assert.equal(f.get('control','usage'),null);assert.equal(f.get('slots',task.id),null);
  assert.deepEqual(rows(f,'claims',{task_id:task.id,status:'held'}),beforeClaims);
});

test('owner drift after committed admission fences prelaunch without refunding its occupied attempt',t=>{
  const f=fixture(t),admitted=f.admit(f.pending());assert.equal(admitted.admitted,true);
  const effect=f.get('effects',admitted.task.value.attempt.effect_id),slot=f.get('slots',admitted.task.id),claims=rows(f,'claims',{task_id:admitted.task.id,status:'held'});
  f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:2}}));const before=logicalSQLState(f);
  assert.equal(currentContext(f,admitted),false);
  assert.throws(()=>f.bind(admitted),code('PRODUCTION_OWNER_CHANGED'));
  assert.deepEqual(logicalSQLState(f),before);assert.equal(f.get('control','usage').value.model_calls,1);
  assert.equal(f.get('tasks',admitted.task.id).value.status,'running');
  assert.deepEqual(f.get('effects',effect.id),effect);assert.deepEqual(f.get('slots',slot.id),slot);
  assert.deepEqual(rows(f,'claims',{task_id:admitted.task.id,status:'held'}),claims);
});

test('a late closed observation is retained but quarantined after the production owner changes',t=>{
  const f=fixture(t),a=f.productionStart();f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:2}}));
  const finished=f.finish(a,{output:'Exact late synthetic output.'});
  assert.equal(finished.accepted,false);assert.equal(finished.task.value.status,'quarantined');
  assert.equal(finished.task.value.result.output,'Exact late synthetic output.');assert.equal(finished.task.value.result.termination_confirmed,true);
  const observation=f.get('effects',finished.task.value.result.observation.id);
  assert.equal(observation.value.action,'task/finish');assert.equal(observation.value.output_sha256,model.digest('Exact late synthetic output.'));
  assert.equal(f.get('control','usage').value.model_calls,1);
});

test('unknown late observation and its subsequent synthetic closure stay retainable after owner replacement',t=>{
  const f=fixture(t),a=f.productionStart();f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:2}}));
  const finished=f.finish(a,{error:{code:'SYNTHETIC_TIMEOUT'},termination_confirmed:false,observed_process:{...f.process(a),close_observed:false}});
  assert.equal(finished.accepted,false);assert.equal(finished.task.value.status,'unknown');
  assert.equal(f.get('slots',a.task.id).value.status,'unknown');
  const original=structuredClone(finished.task.value.result),closed=model.createRuntimeObserver(f.other).record('task/closure',{
    operation_id:'late-production-closure',task_id:a.task.id,attempt_id:a.task.value.attempt.id,
    termination_confirmed:true,observed_process:f.process(a)
  });
  assert.equal(closed.value.status,'quarantined');assert.deepEqual(closed.value.result,original);
  assert.equal(closed.value.result.termination_confirmed,false);assert.equal(closed.value.closure.termination_confirmed,true);
  assert.equal(f.get('effects',closed.value.closure.observation.id).value.action,'task/closure');
  assert.equal(f.get('control','usage').value.model_calls,1);
});

const strippedAuthorities=[
  {name:'only the production seal is stripped before owner replacement',replace_owner:true,strip_all:false},
  {name:'the complete current effect authority is stripped before owner replacement',replace_owner:true,strip_all:true},
  {name:'only the production seal is stripped while the owner stays unchanged',replace_owner:false,strip_all:false}
];
for(const scenario of strippedAuthorities)test('immutable production admission remains binding when '+scenario.name,t=>{
  const f=fixture(t),a=f.productionStart(),authority=structuredClone(a.task.value.attempt.effect_authority);
  assert.equal(authority.production_authority.protocol,'peer-production-authority-v1');
  assert.equal(currentContext(f,a),true);assert.equal(f.ledger.read(tx=>model.validateContext(tx,a.context)),true);
  const command=rows(f,'commands').find(row=>row.value.action==='task/admit'&&row.value.result?.task?.id===a.task.id);assert(command);
  const immutable=reference('commands',command);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(immutable)).value.result.task.value.attempt.effect_authority,authority);
  f.seed('tasks',a.task.id,v=>{
    const attempt={...v.attempt};
    if(scenario.strip_all)delete attempt.effect_authority;
    else{
      const effect_authority={...attempt.effect_authority};delete effect_authority.production_authority;
      attempt.effect_authority=effect_authority;
    }
    return {...v,attempt};
  });
  if(scenario.replace_owner)f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:2}}));
  else assert.doesNotThrow(()=>f.facade.assertCurrent());
  assert.deepEqual(f.get('commands',command.id),command,'the mutable task edit does not rewrite the original admission command');
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(immutable)).value.result.task.value.attempt.effect_authority,authority);
  const before=logicalSQLState(f);
  assert.equal(currentContext(f,a),false);
  assert.equal(f.ledger.read(tx=>model.validateContext(tx,a.context)),false,'missing mutable authority must not fall back to generic validation');
  assert.deepEqual(logicalSQLState(f),before,'validation is a read, not authority repair');
  const output='Exact retained synthetic output after stripped authority: '+scenario.name;
  const finished=f.finish(a,{output});
  assert.equal(finished.accepted,false);assert.equal(finished.task.value.status,'quarantined');
  assert.equal(finished.task.value.result.output,output);assert.equal(finished.task.value.result.output_sha256,model.digest(output));
  assert.equal(finished.task.value.result.native_id,f.binding.native_id);
  assert.equal(finished.task.value.result.termination_confirmed,true);
  assert.deepEqual(finished.task.value.result.observed_process,f.process(a));
  assert.equal(finished.task.value.attempt.termination_confirmed,true);
  const observation=f.get('effects',finished.task.value.result.observation.id);
  assert.equal(observation.value.action,'task/finish');assert.equal(observation.value.output_sha256,model.digest(output));
  assert.equal(observation.value.termination_confirmed,true);assert.deepEqual(observation.value.process,f.process(a));
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(immutable)).value.result.task.value.attempt.effect_authority,authority);
  assert.equal(f.get('control','usage').value.model_calls,1);
});

test('a genuinely generic original admission remains valid without a production owner seal',t=>{
  const f=fixture(t),task=f.pending(),admitted=f.run('scheduler','task/admit',{task_id:task.id});
  assert.equal(admitted.admitted,true);assert.equal(Object.hasOwn(admitted.task.value.attempt.effect_authority,'production_authority'),false);
  const command=rows(f,'commands').find(row=>row.value.action==='task/admit'&&row.value.result?.task?.id===task.id);assert(command);
  const original=f.ledger.read(tx=>tx.getVersion(reference('commands',command))).value.result.task.value.attempt.effect_authority;
  assert.deepEqual(original,admitted.task.value.attempt.effect_authority);assert.equal(Object.hasOwn(original,'production_authority'),false);
  assert.equal(f.ledger.read(tx=>model.validateContext(tx,admitted.context)),true);
  assert.equal(currentContext(f,admitted),false,'production dispatch still requires a genuinely production-produced seal');
  f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:2}}));
  assert.equal(f.ledger.read(tx=>model.validateContext(tx,admitted.context)),true,'an ordinary component admission does not acquire a new production-owner dependency');
  assert.equal(currentContext(f,admitted),false);assert.equal(f.get('control','usage').value.model_calls,1);
});

test('a fresh-owner-shaped mutable seal cannot replace the original immutable production owner',t=>{
  const f=fixture(t),a=f.productionStart(),original=structuredClone(a.task.value.attempt.effect_authority);
  assert.equal(f.ledger.read(tx=>model.validateContext(tx,a.context)),true);
  const command=rows(f,'commands').find(row=>row.value.action==='task/admit'&&row.value.result?.task?.id===a.task.id);assert(command);
  const immutable=reference('commands',command);
  f.seed('principals','founder',v=>({...v,legacy_owner:{...v.legacy_owner,epoch:2}}));
  const founder=f.get('principals','founder'),replacement={...original.production_authority,
    founder:reference('principals',founder),legacy_owner:structuredClone(founder.value.legacy_owner)};
  f.seed('tasks',a.task.id,v=>({...v,attempt:{...v.attempt,effect_authority:{...v.attempt.effect_authority,production_authority:replacement}}}));
  assert.deepEqual(f.get('tasks',a.task.id).value.attempt.effect_authority.production_authority,replacement);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(immutable)).value.result.task.value.attempt.effect_authority,original);
  const currentOwnerFacade=model.bindPeerProductionScheduler(f.ledger);assert.doesNotThrow(()=>currentOwnerFacade.assertCurrent());
  const before=logicalSQLState(f);
  assert.equal(currentContext(f,a),false);assert.equal(currentContext(f,a,currentOwnerFacade),false);
  assert.equal(f.ledger.read(tx=>model.validateContext(tx,a.context)),false,'the original immutable admission still supplies the governing owner seal');
  assert.deepEqual(logicalSQLState(f),before);
  const output='Exact retained synthetic output after a fresh-owner-shaped mutable seal.';
  const finished=f.finish(a,{output});assert.equal(finished.accepted,false);assert.equal(finished.task.value.status,'quarantined');
  assert.equal(finished.task.value.result.output,output);assert.equal(finished.task.value.result.output_sha256,model.digest(output));
  assert.equal(finished.task.value.result.termination_confirmed,true);assert.deepEqual(finished.task.value.result.observed_process,f.process(a));
  const observation=f.get('effects',finished.task.value.result.observation.id);
  assert.equal(observation.value.termination_confirmed,true);assert.deepEqual(observation.value.process,f.process(a));
  assert.deepEqual(f.get('commands',command.id),command);
  assert.deepEqual(f.ledger.read(tx=>tx.getVersion(immutable)).value.result.task.value.attempt.effect_authority,original);
  assert.equal(f.get('control','usage').value.model_calls,1);
});

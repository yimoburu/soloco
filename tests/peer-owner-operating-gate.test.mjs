import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {bindPeerProductionScheduler,digest,execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {inspectPeerOwnerOperatingState} from '../plugins/soloco/runtime/peers/owner-operating-state.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {logicalSQLState} from './peer-task-effects-fixture.mjs';
import {ownerGateFixture,beginOwnerGate,activateOwnerGate,resumeOwnerGate,disposeOwnerGateFixture,core,prepare,qualify,recover,diagnostic} from './peer-owner-operating-gate-fixture.mjs';

// Real model + frozen owner-core state transitions in temporary SQLite. Native,
// deployment and origin substitution is explicitly SYNTHETIC source composition;
// these results establish no native qualification or actual company adoption.
test.after(disposeOwnerGateFixture);
const code=expected=>error=>error?.code===expected;
function unchanged(f,operation,predicate){const before=logicalSQLState(f);assert.throws(operation,typeof predicate==='string'?code(predicate):predicate);assert.deepEqual(logicalSQLState(f),before);}
function prelude(f){
  f.cachedMessageArgs=f.messageArgs();f.cachedMessage=f.client.execute('message/send',f.cachedMessageArgs);
  f.cachedGrantArgs={operation_id:'gate-cached-grant',grant_id:'gate-old-receipt-grant',to_principal_id:'cos-b',scope:'alpha',actions:['message/*'],resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'SYNTHETIC original standing message authority.'};
  f.cachedGrant=f.run('founder','grant/create',f.cachedGrantArgs);
  f.cachedResumeArgs={operation_id:'gate-cached-generic-resume',source_instruction:'SYNTHETIC original same-owner resume.'};
  f.cachedResume=f.run('founder','company/resume',f.cachedResumeArgs);
}
function observeBusinessCommandReads(f,ids){
  const original=f.ledger.query,reads=[];
  f.ledger.query=function(sql,...parameters){
    const statement=Reflect.apply(original,this,[sql,...parameters]);
    if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='get')return(...values)=>{if(values[0]==='commands'&&ids.has(values[1]))reads.push(values[1]);return target.get(...values);};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  return {reads,restore:()=>{f.ledger.query=original;}};
}

for(const phase of ['pending','activated'])test(`actual ${phase} owner state fences ordinary mutations and replay before business command lookup`,async t=>{
  const f=ownerGateFixture(t,{prelude});beginOwnerGate(f);if(phase==='activated')await activateOwnerGate(f);
  assert.equal(f.ledger.read(inspectPeerOwnerOperatingState).status,phase);
  const grant={...f.cachedGrantArgs},resume={...f.cachedResumeArgs},message={...f.cachedMessageArgs};
  const cases=[
    ['founder','grant/create',grant,phase==='pending'?'PRINCIPAL_INACTIVE':'OWNER_NOT_RESUMED'],
    ['scheduler','task/admit',{operation_id:'gate-held-admission'},'OWNER_NOT_RESUMED'],
    ['cos-a','home/publish',{operation_id:'gate-held-publication',grant_id:'gate-grant-cos-a',proposal_id:f.proposal.id,review_id:'not-a-substitute-for-real-review'},'OWNER_NOT_RESUMED'],
    ['cos-a','message/send',message,'OWNER_NOT_RESUMED'],
    ['founder','company/resume',resume,phase==='pending'?'PRINCIPAL_INACTIVE':'OWNER_DEDICATED_RESUME_REQUIRED']
  ];
  const ids=new Set(cases.map(([who,,args])=>digest(['peer-command-v1',who,args.operation_id]))),watch=observeBusinessCommandReads(f,ids);
  try{for(const [who,action,args,expected]of cases)unchanged(f,()=>execute(f.ledger,{principal_id:who},action,args),expected);}
  finally{watch.restore();}
  assert.deepEqual(watch.reads,[]);assert.deepEqual(f.get('commands',digest(['peer-command-v1','cos-a',message.operation_id])).value.result,f.cachedMessage);
  assert.equal(f.get('control','company').value.paused,true);
});

test('activated founder production facade cannot run or enter a raw membership callback before dedicated resume',async t=>{
  const f=ownerGateFixture(t,{prelude});await activateOwnerGate(f);const facade=bindPeerProductionScheduler(f.ledger);let callbacks=0;
  unchanged(f,()=>facade.execute(f.ledger,{principal_id:'founder'},'grant/create',f.cachedGrantArgs),'OWNER_NOT_RESUMED');
  unchanged(f,()=>facade.membershipWrite('membership/enroll','operator',()=>{callbacks++;return {unreachable:true};}),'OWNER_NOT_RESUMED');
  assert.equal(callbacks,0);assert.equal(f.get('control','company').value.paused,true);
});

test('dedicated real core resume permits ordinary fresh work and historical replay while retaining the original legacy origin hold',async t=>{
  const f=ownerGateFixture(t,{prelude});await resumeOwnerGate(f);
  assert.equal(f.ledger.read(inspectPeerOwnerOperatingState).status,'resumed');
  const beforeReplay=logicalSQLState(f);
  assert.deepEqual(f.client.execute('message/send',f.cachedMessageArgs),f.cachedMessage);
  assert.deepEqual(execute(f.ledger,{principal_id:'founder'},'grant/create',f.cachedGrantArgs),f.cachedGrant);
  assert.deepEqual(logicalSQLState(f),beforeReplay);
  const args=f.messageArgs(),message=f.client.execute('message/send',args);assert.equal(message.value.content,args.content);
  const committed=logicalSQLState(f);assert.deepEqual(f.client.execute('message/send',args),message);assert.deepEqual(logicalSQLState(f),committed);
  unchanged(f,()=>execute(f.ledger,{principal_id:'founder'},'company/resume',f.cachedResumeArgs),'OWNER_DEDICATED_RESUME_REQUIRED');
  unchanged(f,()=>f.run('scheduler','task/admit',{}),'AUTHORITY_CHANGED');
  unchanged(f,()=>f.run('cos-a','home/publish',{grant_id:'gate-grant-cos-a',proposal_id:f.proposal.id,review_id:'no-origin-bypass'}),'AUTHORITY_CHANGED');
});

test('controlled ordinary work upgrades only a read-only transaction and reads immutable owner proof before every put',async t=>{
  const f=ownerGateFixture(t);await resumeOwnerGate(f);const args=f.messageArgs(),commands=observeBusinessCommandReads(f,new Set([digest(['peer-command-v1','cos-a',args.operation_id])])),exec=f.ledger.db.exec,seen=[];
  const methods=['write','guardedWrite'],originals=Object.fromEntries(methods.map(name=>[name,f.ledger[name]])),abortedReceiptReads=[];let historicalReads=0,lateHistory=0;
  for(const name of methods)f.ledger[name]=function(type,principal,callback,...rest){return Reflect.apply(originals[name],this,[type,principal,raw=>{
    let wrote=false;const view={...raw,put(...values){wrote=true;return raw.put(...values);},getVersion(...values){historicalReads++;if(wrote)lateHistory++;return raw.getVersion(...values);}};
    return callback(Object.freeze(view));
  },...rest]);};
  f.ledger.db.exec=function(sql){if(/^(BEGIN IMMEDIATE|ROLLBACK|COMMIT)\b/.test(sql))seen.push(sql);if(sql==='ROLLBACK')abortedReceiptReads.push(commands.reads.length);return Reflect.apply(exec,this,[sql]);};
  let result;try{result=f.client.execute('message/send',args);}finally{commands.restore();f.ledger.db.exec=exec;for(const name of methods)f.ledger[name]=originals[name];}
  assert.equal(result.value.content,args.content);assert.deepEqual(seen,['BEGIN IMMEDIATE','ROLLBACK','BEGIN IMMEDIATE','COMMIT']);
  assert.deepEqual(abortedReceiptReads,[0],'the aborted transaction cannot inspect the business receipt');
  assert(commands.reads.length>0,'the guarded retry checks the receipt and its planned commit bindings');assert(historicalReads>0);assert.equal(lateHistory,0);
});

test('controlled source plans seal writes and roll back a caught late owner mutation',async t=>{
  const f=ownerGateFixture(t);await resumeOwnerGate(f);const before=logicalSQLState(f),guarded=f.ledger.guardedWrite;let hits=0,caught;
  f.ledger.guardedWrite=function(type,principal,callback,terminal){return Reflect.apply(guarded,this,[type,principal,tx=>{
    const result=callback(tx);if(type==='message/send'){hits++;const current=tx.get('control','company');try{tx.put('control','company',{...current.value,paused:true},current.revision);}catch(error){caught=error;}}return result;
  },terminal]);};
  try{assert.throws(()=>f.client.execute('message/send',f.messageArgs()),code('AUTHORITY_CHANGED'));}finally{f.ledger.guardedWrite=guarded;}
  assert.equal(hits,1);assert.equal(caught?.code,'AUTHORITY_CHANGED');assert.deepEqual(logicalSQLState(f),before);
});

for(const kind of ['Error','AggregateError'])test(`owner proof provider ${kind} identity is preserved without an upgrade retry`,t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);const before=logicalSQLState(f),cause=Error('Original owner proof backend cause.'),member=Error('Original grouped owner proof failure.');
  const failure=Object.assign(kind==='Error'?new Error('Original owner proof backend error.',{cause}):new AggregateError([member],'Original owner proof backend errors.',{cause}),{code:'OWNER_NOT_RESUMED'});
  const write=f.ledger.write,guarded=f.ledger.guardedWrite;let writes=0,guards=0;
  f.ledger.write=function(type,principal,callback){writes++;return Reflect.apply(write,this,[type,principal,tx=>callback(Object.freeze({...tx,getVersion(){throw failure;}}))]);};
  f.ledger.guardedWrite=function(...args){guards++;return Reflect.apply(guarded,this,args);};
  try{assert.throws(()=>f.client.execute('message/send',f.messageArgs()),error=>{assert.equal(error,failure);assert.equal(error.cause,cause);if(kind==='AggregateError')assert.equal(error.errors[0],member);return true;});}
  finally{f.ledger.write=write;f.ledger.guardedWrite=guarded;}
  assert.equal(writes,1);assert.equal(guards,0);assert.deepEqual(logicalSQLState(f),before);
});

test('required notice intake remains available through the actual shared model during pending custody',t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);const handover=f.get('control','company').value.owner_handover,owner=f.get('principals','founder');
  const notice=f.client.execute('notice/create',{operation_id:'required-intake-during-custody',scope:'alpha',kind:'decision_required',content:'Required exact intake survives unresumed owner custody.'});
  assert.equal(notice.value.status,'pending');assert.equal(notice.value.principal_id,'cos-a');
  assert.deepEqual(f.get('control','company').value.owner_handover,handover);assert.deepEqual(f.get('principals','founder'),owner);
  assert.equal(f.ledger.read(inspectPeerOwnerOperatingState).status,'pending');
  unchanged(f,()=>f.client.execute('message/send',f.messageArgs()),'OWNER_NOT_RESUMED');
});

test('original protected observations survive canonical handover while old business authority stays fenced',t=>{
  let admitted,first,oldFacade;
  const f=ownerGateFixture(t,{prelude:f=>{
    admitted=f.start();oldFacade=bindPeerProductionScheduler(f.ledger);
    first=f.observe(admitted,'task/finish',{output:'SYNTHETIC original uncertain output.',error:'SYNTHETIC interrupted original process.',native_id:'cos-a-native',termination_confirmed:false});
  }});
  const usage=f.get('control','usage'),grant=f.get('grants','gate-grant-cos-a'),result=first.task.value.result;
  assert.equal(f.get('slots',admitted.task.id).value.status,'unknown');
  beginOwnerGate(f);assert.equal(f.ledger.read(inspectPeerOwnerOperatingState).status,'pending');
  unchanged(f,()=>oldFacade.execute(f.ledger,{principal_id:'founder'},'grant/create',{}),'PRODUCTION_OWNER_CHANGED');
  unchanged(f,()=>f.client.execute('message/send',f.messageArgs()),'OWNER_NOT_RESUMED');
  unchanged(f,()=>f.observe(admitted,'task/finish',{output:'Cannot replace the original result.',native_id:'cos-a-native',termination_confirmed:true}),'RESULT_RECORDED');
  unchanged(f,()=>execute(f.ledger,{principal_id:'scheduler'},'task/process',{operation_id:f.op(),task_id:admitted.task.id}),'OBSERVER_REQUIRED');
  const process=f.observe(admitted,'task/process');assert.equal(process.value.status,'unknown');
  assert.deepEqual(process.value.result,result);assert.equal(f.get('slots',admitted.task.id).value.status,'unknown');
  const closure=f.observe(admitted,'task/closure',{termination_confirmed:true});
  assert.equal(closure.value.status,'quarantined');assert.deepEqual(closure.value.result,result);
  assert.equal(closure.value.closure.termination_confirmed,true);assert.equal(f.get('slots',admitted.task.id).value.status,'released');
  assert.deepEqual(f.get('control','usage'),usage);assert.deepEqual(f.get('grants','gate-grant-cos-a'),grant);
  assert.equal(f.get('principals','founder').value.status,'pending');
});

test('late diagnostics after dedicated recovery resume preserve ordinary work and all original uncertainty',async t=>{
  const f=ownerGateFixture(t);beginOwnerGate(f);f.reconstruct();const original=prepare(f);
  core.holdOriginalPeerOwnerMaintenance(original.cap,{error:'SYNTHETIC original uncertain maintenance attempt.'});
  recover(f);const reviewed=await qualify(f);
  f.incoming.activate({operation_id:f.op(),epoch:8,review_ref:reviewed.result.result_ref,source_instruction:'SYNTHETIC exact recovered reconstruction activation.'});
  f.incoming.resume({operation_id:f.op(),epoch:8,source_instruction:'SYNTHETIC dedicated recovery resume.'});
  const before=f.client.execute('message/send',f.messageArgs());assert.equal(before.value.status,'pending');
  const usage=f.get('control','usage'),late=await core.recordOriginalPeerOwnerMaintenanceLateEvidence(original.cap,diagnostic(f,original));
  assert.equal(late.invalidated_current_handover,false);assert.equal(late.reservations_released,false);
  assert.equal(f.get('control','company').value.paused,false);assert.equal(f.get('principals','founder').value.status,'active');
  assert.equal(f.get('work_items',original.binding.admission_ref.id.replace('admission:','phase:')).value.status,'unknown');
  assert.equal(f.get('notices',late.notice_ref.id).value.required_handoff,true);
  const message=f.client.execute('message/send',f.messageArgs());assert.equal(message.value.status,'pending');
  assert.deepEqual(f.get('control','usage'),usage);assert.equal(f.ledger.read(inspectPeerOwnerOperatingState).ordinary_allowed,true);
  const resolved=f.run('founder','notice/resolve',{notice_id:late.notice_ref.id,source_instruction:'SYNTHETIC explicit disposition preserves all continuing uncertainty.'});
  assert.equal(resolved.value.status,'resolved');assert.equal(resolved.value.continuing_conditions_preserved,true);
  assert.equal(f.ledger.read(tx=>tx.getVersion(late.notice_ref)).value.status,'pending','original notice remains immutable producer evidence');
  assert.equal(f.client.execute('message/send',f.messageArgs()).value.status,'pending');
  assert.equal(f.get('work_items',original.binding.admission_ref.id.replace('admission:','phase:')).value.status,'unknown');
  assert.deepEqual(f.get('control','usage'),usage);
});

test('same-owner generic pause/resume behavior and original legacy origin hold are preserved',t=>{
  const f=peerFixture();t.after(()=>f.close());const run=(action,args={})=>execute(f.ledger,{principal_id:'founder'},action,{operation_id:action,source_instruction:'SYNTHETIC same-owner control.',...args});
  run('company/pause');assert.equal(f.ledger.read(tx=>tx.get('control','company')).value.paused,true);
  const resumed=run('company/resume');assert.equal(resumed.value.paused,false);
  const state=logicalSQLState(f);assert.deepEqual(run('company/resume'),resumed);assert.deepEqual(logicalSQLState(f),state);
  f.ledger.write('synthetic-original-origin-input','founder',tx=>{const c=tx.get('control','company');tx.put('control','company',{...c.value,legacy_source_cut_sha256:digest('still-unqualified-origin')},c.revision);});
  unchanged(f,()=>execute(f.ledger,{principal_id:'founder'},'company/resume',{operation_id:'new-origin-held-resume',source_instruction:'No origin waiver.'}),'AUTHORITY_CHANGED');
});


// A malicious SOURCE fixture may write plausible DATA; it still supplies no
// original typed resume event, human approval, qualification or Native proof.
test('a typed-looking ordinary resume receipt cannot replace the original owner producer',async t=>{
 const f=ownerGateFixture(t);await resumeOwnerGate(f);
 f.ledger.write('SYNTHETIC-forged-ordinary-owner-receipt','founder',tx=>{
  const c=tx.get('control','company'),h=tx.get('work_items',c.value.owner_handover.id),cmd=tx.put('commands','SYNTHETIC-forged-new-resume',{kind:'origin_ordinary_task_command',action:'resumed',actor:h.value.incoming,request:{epoch:h.value.epoch,qualification_ref:{family:'work_items',id:'not-issued',revision:1,sha256:'a'.repeat(64)}},result:{paused:false,epoch:h.value.epoch,control:h.value.resume_control_ref}},0);
  tx.put('work_items',h.id,{...h.value,resume_command_ref:{family:'commands',id:cmd.id,revision:cmd.revision,sha256:cmd.sha256}},h.revision);
 });
 assert.throws(()=>f.ledger.read(inspectPeerOwnerOperatingState));
});

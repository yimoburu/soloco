// AUTHORED/UNRUN SOURCE mechanics. All companies, prompts and child emitters are
// temporary fictional fixtures. Standard Node child_process mocks are the only
// process seam; no real CLI, provider, account, compiler or Native issuer runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {freshInventoryStore,historicalInventoryStore,fictionalInventoryState,fictionalInventoryJob} from './original-global-worker-inventory-fixture.mjs';
import {contractModel} from './helpers/upgrade-incremental-model.mjs';
import * as storeModule from '../plugins/soloco/runtime/store.mjs';
import {installedTeam,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {bind} from '../plugins/soloco/runtime/engine.mjs';
import {upgrade,rehearse,inspectOriginalUpgradeLaunchCutoffFrom} from '../plugins/soloco/runtime/upgrade.mjs';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
import {assertOriginalModelLaunchToken,prepareOriginalUpgradeModelLaunchFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';

async function sourceFixture(t,{historical=false,review_window_minutes=45,call_timeout_minutes=10,failModelCommit=false}={}){
  const team={...installedTeam(),plugin_version:'0.7.7'};
  const f=historical?await historicalInventoryStore(t,{sourceState:fictionalInventoryState(storeModule,{extra:{...team,team_sha256:teamHash(team)}})}):await freshInventoryStore(t,{stateOptions:{extra:{...team,team_sha256:teamHash(team)}}});
  const oldData=process.env.COMPANY_PLUGIN_DATA,ownedData=path.join(f.root,'SOURCE-managed-data');process.env.COMPANY_PLUGIN_DATA=ownedData;
  t.after(()=>{if(oldData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=oldData;});
  const a={root:f.root,session_id:f.state().owner.session_id,expected_epoch:f.state().owner.epoch};bind(f.root,a.session_id,'codex');
  const children=[],calls=[],controls=[],failure=new Error('SYNTHETIC failure after original Popen before birth COMMIT');let commitFailureArmed=false;
  const originalExec=DatabaseSync.prototype.exec;
  if(failModelCommit)t.mock.method(DatabaseSync.prototype,'exec',function(sql,...args){if(commitFailureArmed&&sql==='COMMIT'){commitFailureArmed=false;throw failure;}return Reflect.apply(originalExec,this,[sql,...args]);});
  const spawn=t.mock.method(childProcess,'spawn',(command,args,options)=>{
    const carrier=command===process.execPath&&args[1]?.endsWith('/runtime/upgrade.mjs');
    assert.ok(carrier||command==='/SYNTHETIC/codex','unexpected executable must never run');
    const child=new EventEmitter();child.pid=carrier?process.pid:process.pid+100+children.length;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.signals=[];child.unref=()=>{};
    child.kill=signal=>{child.signals.push(signal);return true;};child.complete=(code=0)=>{if(child.sourceClosed)return;child.sourceClosed=true;child.stdout.end();child.stderr.end();child.emit('exit',code,null);child.emit('close',code,null);};
    children.push({child,carrier,command,args,options});
    if(carrier)process.nextTick(()=>child.emit('spawn'));
    else {
      if(failModelCommit)commitFailureArmed=true;
      let prompt='';child.stdin.on('data',chunk=>{prompt+=chunk;});child.stdin.on('finish',()=>{
        const input=JSON.parse(prompt);calls.push(input);process.nextTick(()=>child.emit('spawn'));
        const native=args[1]==='resume'?args.at(-2):null;
        Promise.resolve(contractModel({proposalSize:100})(null,native,prompt)).then(output=>{
          child.stdout.write([{type:'thread.started',thread_id:output.native_id},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:output.text}},{type:'turn.completed'}].map(v=>JSON.stringify(v)).join('\n')+'\n');child.complete();
        }).catch(error=>{child.emit('error',error);child.complete(1);});
      });
    }
    return child;
  });
  for(const method of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])t.mock.method(childProcess,method,()=>{throw Error('SOURCE fixture forbids real '+method);});
  syncBuiltinESMExports();t.after(()=>{for(const {child}of children)child.complete();spawn.restore();syncBuiltinESMExports();});
  const prepare=()=>{
    const current=f.state(),candidate=upgrade({...a,expected_epoch:current.owner.epoch,action:'inspect'},'codex');
    const prepared=upgrade({...a,expected_epoch:current.owner.epoch,action:'prepare',candidate_hash:candidate.candidate_hash,context_mode:'full',workflow:'incremental-v2',review_window_minutes,call_timeout_minutes,source_instruction:'SYNTHETIC fresh upgrade Source test; no actual company or Native authority.'},'codex',{check:()=>({available:true,authenticated:true})});
    return {uid:prepared.upgrade.id,worker_token:f.state().upgrade.worker.token};
  };
  // These dependencies affect only executable metadata and cosmetic naming.
  // The actual adapter, original Store, issuing token, Popen and close path run.
  const adapter=(...args)=>{const options=args[6];controls.push(options);return runModel(...args.slice(0,6),{...options,resolveExecutable:()=>'/SYNTHETIC/codex',renameSession:async()=>({status:'SOURCE-cosmetic-only'})});};
  return {...f,a,children,calls,controls,failure,prepare,adapter,ownedData};
}

test('fresh upgrade default carrier and actual model adapter share original worker/step history',{concurrency:false},async t=>{
  const f=await sourceFixture(t),p=f.prepare();assert.equal(f.children.length,1);assert.equal(f.inspect().upgrade_assignments,2);
  await rehearse(f.root,p.uid,f.adapter,p.worker_token);
  const u=f.state().upgrade;assert.equal(u.status,'ready',u.error);assert.ok(f.calls.length>=2);assert.ok(u.steps.every(s=>s.state==='returned'&&s.original_execution.birth&&s.original_execution.closure));
  assert.deepEqual(new Set(u.steps.map(s=>s.role)),new Set(['cos','qa']));assert.equal(f.inspect().upgrade_assignments,2,'carrier UNKNOWN still occupies both assignment units');
  f.children[0].child.complete();assert.equal(f.inspect().upgrade_assignments,0);assert.equal(f.inspect().raw_carrier_closure_unknown,0);
  const events=f.store.db.prepare('SELECT value FROM events ORDER BY seq').all();assert.ok(events.every(e=>Array.isArray(JSON.parse(e.value).original_execution.upgrade_changes)));
  assert.equal(Object.keys(f.state().jobs).length,0,'upgrade does not fabricate ordinary jobs');
});

test('no-overall-deadline carrier preserves null while every model call keeps its finite cap',{concurrency:false},async t=>{
  const f=await sourceFixture(t,{review_window_minutes:null,call_timeout_minutes:30}),p=f.prepare();assert.equal(f.state().upgrade.worker.original_execution.deadline_at_ms,null);
  await rehearse(f.root,p.uid,f.adapter,p.worker_token);const u=f.state().upgrade;assert.equal(u.status,'ready',u.error);
  assert.ok(u.steps.every(s=>s.original_execution.deadline_at_ms-Date.parse(s.started_at)===1800000));assert.equal(u.review_deadline_policy,'none');assert.equal(u.deadline_ms,null);f.children[0].child.complete();
});

test('copied upgrade token, foreign input and consumed original cannot create another child',{concurrency:false},async t=>{
  const f=await sourceFixture(t),p=f.prepare();let first=true,saved;
  const model=async(...args)=>{
    const opts=args[6],before=f.children.length;saved=opts.originalExecutionLaunch;
    if(first){first=false;
      await assert.rejects(runModel(...args.slice(0,6),{...opts,originalExecutionLaunch:JSON.parse(JSON.stringify(saved))}),/original|PRIVATE|Original/i);
      await assert.rejects(runModel(args[0],args[1],args[2]+' changed',...args.slice(3,6),opts),/MODEL_INPUT_CHANGED/);
      await assert.rejects(runModel(args[0],'SYNTHETIC-foreign-native',...args.slice(2,6),opts),/MODEL_INPUT_CHANGED/);
      assert.equal(f.children.length,before);assert.throws(()=>inspectOriginalUpgradeLaunchCutoffFrom({},saved),/cutoff required/);
    }
    const result=await f.adapter(...args);await assert.rejects(f.adapter(...args),/PRIVATE_UPGRADE_LAUNCH_REQUIRED/);return result;
  };
  await rehearse(f.root,p.uid,model,p.worker_token);assert.equal(f.state().upgrade.status,'ready',f.state().upgrade.error);
  assert.throws(()=>assertOriginalModelLaunchToken(saved,{host:'codex',native_id:null,prompt:'foreign',cwd:f.root,selection:null}),/PRIVATE_UPGRADE_LAUNCH_REQUIRED/);f.children[0].child.complete();
});

test('a cold Store or copied worker nonce cannot reissue an existing started upgrade call',{concurrency:false},async t=>{
  const f=await sourceFixture(t),p=f.prepare();let checked=false;
  const model=async(...args)=>{
    if(!checked){checked=true;const step=f.state().upgrade.steps.at(-1),before=f.children.length;
      assert.throws(()=>f.store.transaction('upgrade.call_started',state=>{prepareOriginalUpgradeModelLaunchFrom(f.store,state,{call_id:step.id});return state;}),/ALREADY_REQUESTED/);
      await rehearse(f.root,p.uid,f.adapter,'SYNTHETIC-copied-wrong-worker');assert.equal(f.children.length,before);
    }
    return f.adapter(...args);
  };
  await rehearse(f.root,p.uid,model,p.worker_token);assert.equal(checked,true);assert.equal(f.state().upgrade.status,'ready',f.state().upgrade.error);f.children[0].child.complete();
});

test('deadline advancing inside the final inventory holds before actual model Popen',{concurrency:false},async t=>{
  const f=await sourceFixture(t),p=f.prepare(),realNow=Date.now,originalPrepare=DatabaseSync.prototype.prepare;let clock=realNow(),armed=false,reads=0,cutoff=null;
  t.mock.method(Date,'now',()=>clock);
  t.mock.method(DatabaseSync.prototype,'prepare',function(sql,...rest){const statement=Reflect.apply(originalPrepare,this,[sql,...rest]);if(sql==='SELECT seq,at,type,value FROM events ORDER BY seq'){
    const all=statement.all;t.mock.method(statement,'all',function(...args){const rows=Reflect.apply(all,this,args);if(armed&&++reads===2)clock=cutoff;return rows;});
  }return statement;});
  const model=(...args)=>{cutoff=f.state().upgrade.steps.at(-1).original_execution.deadline_at_ms;return runModel(...args.slice(0,6),{...args[6],resolveExecutable:()=>{armed=true;return '/SYNTHETIC/codex';},renameSession:async()=>({})});};
  await rehearse(f.root,p.uid,model,p.worker_token);assert.ok(reads>=2);assert.equal(f.children.filter(x=>!x.carrier).length,0);assert.equal(f.state().upgrade.status,'failed');assert.match(f.state().upgrade.error,/DEADLINE|cutoff/i);
  clock=realNow();assert.equal(f.inspect().upgrade_assignments,2);f.children[0].child.complete();
});

test('failed birth COMMIT cleans only the retained child and keeps UNKNOWN until its actual close',{concurrency:false},async t=>{
  const f=await sourceFixture(t,{failModelCommit:true}),p=f.prepare();let actualError;
  const model=(...args)=>f.adapter(...args).catch(error=>{actualError=error;throw error;});
  await rehearse(f.root,p.uid,model,p.worker_token);assert.equal(actualError,f.failure);const child=f.children.find(x=>!x.carrier).child;
  assert.deepEqual(child.signals,['SIGTERM']);assert.equal(f.calls.length,0,'failed birth must not send a model prompt');assert.equal(f.state().upgrade.status,'failed');assert.equal(f.inspect().unknown_invocations,1);assert.equal(f.inspect().upgrade_assignments,2);
  child.complete();assert.equal(f.inspect().unknown_invocations,0);assert.equal(f.inspect().upgrade_assignments,2,'carrier close remains separately required');f.children[0].child.complete();assert.equal(f.inspect().upgrade_assignments,0);
  assert.ok(f.state().upgrade.calls.some(c=>c.error===f.failure.message));assert.equal(f.state().upgrade.steps[0].state,'started','ambiguous failed attempt is never rewritten as returned');
});

test('terminal labels and worker self-report do not release the two upgrade assignments',{concurrency:false},async t=>{
  const f=await sourceFixture(t),p=f.prepare();await rehearse(f.root,p.uid,f.adapter,p.worker_token);const u=f.state().upgrade;assert.equal(u.worker.state,'closed');assert.equal(u.worker.original_execution.closure,null);assert.equal(f.inspect().upgrade_assignments,2);
  f.children[0].child.complete();assert.equal(f.inspect().upgrade_assignments,0);assert.throws(()=>upgrade({...f.a,expected_epoch:f.state().owner.epoch,action:'resume',upgrade_id:p.uid,candidate_hash:u.candidate_hash,source_instruction:'SYNTHETIC no retry'},'codex'),/interrupted nonfailed|Only interrupted/i);
});

test('historical unqualified upgrade input is held without retrospective origin or child creation',{concurrency:false},async t=>{
  const f=await sourceFixture(t,{historical:true});const before=f.state();assert.throws(()=>f.prepare(),/ORIGINAL|Original/i);assert.deepEqual(f.state(),before);assert.equal(f.children.length,0);assert.equal(Object.hasOwn(f.state(),'original_execution_origin'),false);
});

// The following successor controls preserve every a7 case body above. They
// exercise only temporary Original Store writers and the same original mocked
// ChildProcess handles; terminal labels are never a closure credential.
test('recovered upgrade retains both units while a model is UNKNOWN and leaves room for only one ordinary assignment',{concurrency:false},async t=>{
  const f=await sourceFixture(t,{failModelCommit:true}),p=f.prepare();await rehearse(f.root,p.uid,f.adapter,p.worker_token);
  const model=f.children.find(x=>!x.carrier).child;f.children[0].child.complete();
  assert.equal(f.inspect().raw_carrier_closure_unknown,0);assert.equal(f.inspect().unknown_invocations,1);assert.equal(f.inspect().upgrade_assignments,2,'one role closing never frees half the selected pair');
  upgrade({...f.a,expected_epoch:f.state().owner.epoch,action:'recover',upgrade_id:p.uid,source_instruction:'SYNTHETIC original recovery retains the old physical UNKNOWN; no retry or new allowance.'},'codex');
  assert.equal(f.state().upgrade.status,'recovered');assert.equal(f.inspect().upgrade_assignments,2);
  const job=f.queue();assert.ok(job.original_execution_assignment);assert.equal(f.inspect().occupied,3);assert.equal(f.inspect().remaining,0);
  const before=f.state(),events=f.store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all();
  assert.throws(()=>f.queue(),error=>error.code==='ORIGINAL_EXECUTION_CAPACITY_EXHAUSTED');
  assert.deepEqual(f.state(),before);assert.deepEqual(f.store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all(),events);assert.equal(Object.keys(f.state().jobs).length,1);
  model.complete();assert.equal(f.inspect().upgrade_assignments,0);assert.equal(f.inspect().occupied,1);assert.equal(f.state().upgrade.steps[0].state,'started','late close does not turn the failed call into a returned/retryable call');
});

test('same-write ordinary reservations count genuine pending admissions above the retained upgrade pair',{concurrency:false},async t=>{
  const f=await sourceFixture(t,{failModelCommit:true}),p=f.prepare();await rehearse(f.root,p.uid,f.adapter,p.worker_token);f.children[0].child.complete();
  upgrade({...f.a,expected_epoch:f.state().owner.epoch,action:'recover',upgrade_id:p.uid,source_instruction:'SYNTHETIC recovery without freeing unknown model custody.'},'codex');
  const before=f.state(),events=f.store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all();let firstIssued=false;
  assert.throws(()=>f.store.transaction('job.queued',state=>{
    const first=fictionalInventoryJob(state);f.producer.recordOriginalWorkerAssignmentFrom(f.store,state,first);state.jobs[first.id]=first;firstIssued=true;
    const second=fictionalInventoryJob(state);f.producer.recordOriginalWorkerAssignmentFrom(f.store,state,second);state.jobs[second.id]=second;return state;
  }),error=>error.code==='ORIGINAL_EXECUTION_CAPACITY_EXHAUSTED');
  assert.equal(firstIssued,true,'first original reservation reached the genuine pending map');assert.deepEqual(f.state(),before);assert.deepEqual(f.store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all(),events);
  assert.equal(f.inspect().occupied,2);assert.equal(f.inspect().upgrade_assignments,2);assert.equal(Object.keys(f.state().jobs).length,0,'both uncommitted ordinary reservations roll back');f.children.find(x=>!x.carrier).child.complete();assert.equal(f.inspect().occupied,0);
});

test('verify retains its applied preimage deadline after completed postimage and final history replay',{concurrency:false},async t=>{
  const f=await sourceFixture(t),p=f.prepare();await rehearse(f.root,p.uid,f.adapter,p.worker_token);assert.equal(f.state().upgrade.status,'ready',f.state().upgrade.error);
  upgrade({...f.a,expected_epoch:f.state().owner.epoch,action:'apply',upgrade_id:p.uid},'codex');assert.equal(f.state().upgrade.status,'applied');
  const before=f.state(),events=f.store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all(),deadline=before.upgrade.deadline_ms,realNow=Date.now,originalPrepare=DatabaseSync.prototype.prepare;
  let clock=realNow(),observedCompletedVerify=false;assert.ok(clock<deadline);t.mock.method(Date,'now',()=>clock);
  t.mock.method(DatabaseSync.prototype,'prepare',function(sql,...rest){
    const statement=Reflect.apply(originalPrepare,this,[sql,...rest]);
    if(sql==='SELECT seq,at,type,value FROM events ORDER BY seq'){
      const all=statement.all;t.mock.method(statement,'all',function(...args){
        const rows=Reflect.apply(all,this,args),last=rows.at(-1);
        if(last?.type==='upgrade.verify'){
          const witness=JSON.parse(last.value).original_execution,changed=witness.upgrade_changes.find(change=>change.id===p.uid);
          if(changed?.after.status==='completed'){observedCompletedVerify=true;clock=deadline;}
        }
        return rows;
      });
    }
    return statement;
  });
  assert.throws(()=>upgrade({...f.a,expected_epoch:before.owner.epoch,action:'verify',upgrade_id:p.uid},'codex'),error=>error.code==='ORIGINAL_EXECUTION_UPGRADE_DEADLINE');
  assert.equal(observedCompletedVerify,true,'actual pending verify event reached the original final replay after its completed postimage');
  assert.deepEqual(f.state(),before);assert.deepEqual(f.store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all(),events);assert.equal(f.state().upgrade.status,'applied');assert.equal(f.state().upgrade.deadline_ms,deadline);assert.equal(f.children.filter(x=>!x.carrier).length,before.upgrade.steps.length);
  // Restore only this fictional test clock for read/closure custody; no verify,
  // grant, model, retry or positive operation is invoked after that restoration.
  clock=realNow();f.children[0].child.complete();
});

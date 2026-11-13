// AUTHORED, UNRUN SOURCE controls. No actual company, Native, provider or child.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {denyInventoryExternalEffects,freshInventoryStore,historicalInventoryStore,fictionalInventoryState,fictionalInventoryJob,controlledInventoryChild,afterInventoryEventsRead} from './original-global-worker-inventory-fixture.mjs';

const originalHold=error=>error instanceof Error&&typeof error.code==='string'&&error.code.startsWith('ORIGINAL_EXECUTION_');
function complete(facts,occupied,remaining){
  assert.equal(facts.protocol,'original-local-execution-inventory-v1');
  assert.equal(facts.retained_row_census_complete,true);
  assert.equal(facts.admission_launch_coverage_complete,true);
  assert.equal(facts.cardinality_known,true);
  assert.equal(facts.unit,'legacy-standalone-assignment');
  assert.equal(facts.worker_cap,3);
  assert.ok(Number.isSafeInteger(facts.occupied)&&facts.occupied>=0);
  assert.ok(Number.isSafeInteger(facts.remaining)&&facts.remaining>=0);
  assert.equal(facts.occupied,occupied);assert.equal(facts.remaining,remaining);
  assert.notEqual(facts.authority_issued,true);
}

test('actual fresh Store creation supplies complete zero inventory without ready DATA',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);
  assert.ok(f.state().original_execution_origin);
  complete(f.inspect(),0,3);
});

test('actual Source storage migration preserves the original fresh coverage and occupied unit',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);f.queue();
  // This is the real migration of ONLY this temporary fictional database.
  // Its retained temporary backup is not historical launch evidence.
  const migrated=f.store.migrate();assert.equal(migrated.originals_preserved,true);
  complete(f.inspect(),1,2);
});

test('cold Store readback retains the original occupied assignment without minting a new zero baseline',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);f.queue();f.store.close();
  const reopened=new f.storeModule.Store(f.root);
  try{complete(reopened.readSnapshot(()=>f.producer.inspectOriginalLocalExecutionInventoryFrom(reopened.db)),1,2);}
  finally{reopened.close();}
});

test('real Source queue writer reserves one known original unit before any child exists',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue();
  assert.ok(job.original_execution_assignment);assert.equal(job.native_id,null);
  complete(f.inspect(),1,2);
  assert.equal(f.state().jobs[job.id].status,'queued');
});

test('repeated capacity inspection changes neither retained state nor spent history',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);f.queue();
  const before=JSON.stringify(f.state()),event=f.store.changeToken();
  for(let index=0;index<3;index++)complete(f.inspect(),1,2);
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),event);
});

test('actual private worker launch intent remains known UNKNOWN and counts the same assignment once',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue();let token;
  f.store.transaction('job.worker_launch_requested',state=>{
    token=f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;
  });
  assert.ok(token&&typeof token==='object');
  // No spawn is performed. Pending intent is not a closure or an absent unit;
  // the job reservation and its worker intent describe ONE occupied unit.
  const facts=f.inspect();complete(facts,1,2);
  assert.equal(facts.raw_carrier_closure_unknown,1);assert.equal(facts.physical_domain_closed,false);
});

test('duplicate worker launch preparation cannot create a second original identity for one assignment',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue();
  f.store.transaction('job.worker_launch_requested',state=>{f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;});
  const before=JSON.stringify(f.state());
  assert.throws(()=>f.store.transaction('job.worker_launch_requested',state=>{f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;}),originalHold);
  assert.equal(JSON.stringify(f.state()),before);complete(f.inspect(),1,2);
});

test('caller object cannot invoke the original private launch path',{concurrency:false},async t=>{
  const attempted=denyInventoryExternalEffects(t),f=await freshInventoryStore(t);
  assert.throws(()=>f.producer.spawnOriginalWorkerLaunch({protocol:'SYNTHETIC-caller-launch-token'},'SYNTHETIC-never-execute',[],{}),originalHold);
  assert.deepEqual(attempted,[]);complete(f.inspect(),0,3);
});

test('Codex, Claude and local Source assignments share the same complete capacity boundary',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);
  for(const host of ['codex','claude','local'])f.queue({host});
  complete(f.inspect(),3,0);
});

test('duplicate Source reservation callback Holds and rolls back instead of charging twice',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue(),before=JSON.stringify(f.state());
  assert.throws(()=>f.store.transaction('job.queued',state=>{
    f.producer.recordOriginalWorkerAssignmentFrom(f.store,state,state.jobs[job.id]);return state;
  }),originalHold);
  assert.equal(JSON.stringify(f.state()),before);complete(f.inspect(),1,2);
});

test('known-unit failed assignment without original closure remains occupied with known cardinality',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue();
  f.store.transaction('job.failed',state=>{
    state.jobs[job.id].status='failed';state.jobs[job.id].error='SOURCE fixture retains UNKNOWN execution; no closure observed.';
    state.jobs[job.id].coordination_release={termination_confirmed:false,reason:'SYNTHETIC-no-original-closure',at:new Date().toISOString()};
    return state;
  });
  complete(f.inspect(),1,2);
});

test('caller termination flag cannot release an originally reserved execution',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue();
  // Either the original writer rejects the fabricated release, or the reader
  // conservatively keeps the original unit occupied. A Boolean is never proof.
  try{
    f.store.transaction('job.failed',state=>{
      state.jobs[job.id].status='failed';state.jobs[job.id].coordination_release={termination_confirmed:true,reason:'SYNTHETIC-caller-only-Boolean',at:new Date().toISOString()};return state;
    });
    complete(f.inspect(),1,2);
  }catch(error){assert.ok(originalHold(error));}
});

test('caller-supplied fresh origin flags are rejected by the actual first writer',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t,{initialize:false});
  assert.throws(()=>f.store.transaction('company.created',()=>fictionalInventoryState(f.storeModule,{extra:{original_execution_origin:{
    protocol:'original-local-execution-inventory-v1',retained_row_census_complete:true,admission_launch_coverage_complete:true,cardinality_known:true,
    unit:'legacy-standalone-assignment',occupied:0,remaining:3
  }}})),originalHold);
});

test('pre-existing empty legacy rows cannot establish a missing historical launch prefix',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await historicalInventoryStore(t);
  assert.deepEqual(f.state().jobs,{});assert.throws(()=>f.inspect(),originalHold);
});

test('copied genuine fresh-origin DATA does not enroll another pre-existing database',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const original=await freshInventoryStore(t),copied=await historicalInventoryStore(t,{sourceState:original.state()});
  assert.ok(copied.state().original_execution_origin);
  assert.throws(()=>copied.inspect(),originalHold);
});

test('outside a real class-owned snapshot the exact database argument remains Held',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);
  assert.throws(()=>f.producer.inspectOriginalLocalExecutionInventoryFrom(f.store.db),originalHold);
  complete(f.inspect(),0,3);
});

test('manual ambient BEGIN is not an authenticated Store transaction',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);
  f.store.db.exec('BEGIN');
  try{assert.throws(()=>f.producer.inspectOriginalLocalExecutionInventoryFrom(f.store.db),originalHold);}
  finally{f.store.db.exec('ROLLBACK');}
  complete(f.inspect(),0,3);
});

test('another connection to the same file cannot borrow the original transaction capability',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),other=new DatabaseSync(f.file);
  try{
    other.exec('BEGIN');
    try{f.store.readSnapshot(()=>assert.throws(()=>f.producer.inspectOriginalLocalExecutionInventoryFrom(other),originalHold));}
    finally{other.exec('ROLLBACK');}
  }finally{other.close();}
  complete(f.inspect(),0,3);
});

test('Proxy or plain object cannot stand in for the original database argument',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);
  f.store.readSnapshot(()=>{
    for(const candidate of [new Proxy(f.store.db,{}),{},Object.create(DatabaseSync.prototype)])assert.throws(()=>f.producer.inspectOriginalLocalExecutionInventoryFrom(candidate),originalHold);
  });
  complete(f.inspect(),0,3);
});

test('caller-provided completeness object cannot supply a missing original legacy prefix',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await historicalInventoryStore(t);
  f.store.readSnapshot(()=>assert.throws(()=>f.producer.inspectOriginalLocalExecutionInventoryFrom(f.store.db,{
    retained_row_census_complete:true,admission_launch_coverage_complete:true,cardinality_known:true,occupied:0,remaining:3
  }),originalHold));
  assert.throws(()=>f.inspect(),originalHold);
});

test('removing an original committed event makes coverage stale rather than resetting inventory',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);f.queue();
  // Deliberate corruption of this isolated fictional DB only; no product writer
  // or test-only producer mint is used to make the negative look legitimate.
  f.store.db.prepare('DELETE FROM events WHERE seq=(SELECT MAX(seq) FROM events)').run();
  assert.throws(()=>f.inspect(),originalHold);
});

test('changing the original assignment unit is rejected rather than treated as known cardinality',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue();
  assert.throws(()=>{
    f.store.transaction('job.failed',state=>{
      const assignment=state.jobs[job.id].original_execution_assignment;
      assert.ok(assignment&&typeof assignment==='object');
      assert.equal(assignment.unit,'legacy-standalone-assignment');
      state.jobs[job.id].original_execution_assignment={...assignment,unit:'SYNTHETIC-unreviewed-unit'};return state;
    });
    f.inspect();
  },originalHold);
});

test('copying an existing reservation onto a different job cannot pass complete unique membership',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue();
  assert.throws(()=>{
    f.store.transaction('job.queued',state=>{
      state.jobs[job.id+'-copied']={...state.jobs[job.id],id:job.id+'-copied'};return state;
    });
    f.inspect();
  },originalHold);
});

test('late physical membership change in the original commit window rolls back the new reservation',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue(),before=JSON.stringify(f.state());
  assert.throws(()=>f.store.transaction('job.worker_launch_requested',state=>{
    f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;
  },{beforeCommit:(db,next)=>{
    // Deliberate hostile race in this isolated fictional DB, after Store has
    // written its intended state/event. The final Source fence must see it.
    const changed=JSON.parse(JSON.stringify(next));delete changed.jobs[job.id];
    db.prepare('UPDATE company SET value=? WHERE id=1').run(JSON.stringify(changed));
  }}),originalHold);
  assert.equal(JSON.stringify(f.state()),before);complete(f.inspect(),1,2);
});

for(const failureStage of ['callback','beforeCommit'])test('rollback revokes original bookkeeping on retained '+failureStage+' snapshots and inherited record buckets',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),committedJob=f.queue();
  const {proofJobSafe,currentExtensions}=await import('../plugins/soloco/runtime/current-state.mjs');
  const {inspectOriginalWorkerAssignmentBookkeepingFrom:inspectJob,inspectOriginalExecutionOriginBookkeepingFrom:inspectOrigin,
    inheritOriginalWorkerAssignmentBookkeepingFrom:inherit}=f.producer;
  const durable=f.state(),before=JSON.stringify(durable),beforeEvent=f.store.changeToken(),retained=[];
  assert.equal(inspectJob(durable,durable.jobs[committedJob.id]).historical_original,true);
  assert.equal(inspectOrigin(durable).historical_original,true);
  assert.equal(proofJobSafe(durable.jobs[committedJob.id],durable),true);
  assert.equal(Object.hasOwn(currentExtensions(durable),'original_execution_origin'),false);
  const stopped=Error('SYNTHETIC original bookkeeping rollback at '+failureStage);let newJobId;
  const retainViews=(state,label)=>{
    const job=state.jobs[newJobId];assert.ok(job?.original_execution_assignment);
    const unownedClone=JSON.parse(JSON.stringify(state));
    assert.equal(inspectJob(unownedClone,unownedClone.jobs[newJobId]),null);
    assert.equal(inspectOrigin(unownedClone),null);
    assert.equal(proofJobSafe(unownedClone.jobs[newJobId],unownedClone),false);
    assert.ok(Object.hasOwn(currentExtensions(unownedClone),'original_execution_origin'));
    const derived={...state,records:{...state.records},jobs:{...state.jobs}};
    assert.equal(inherit(state,derived),true,'derive through the actual Source bookkeeping API');
    const inheritedAgain={...derived,records:{...derived.records},jobs:{...derived.jobs}};
    assert.equal(inherit(derived,inheritedAgain),true,'the actual inherited proof must share its original lifetime');
    // This object is deliberately NOT passed through inherit(). It exercises
    // the supported shallow-view lookup through the exact original records
    // bucket, rather than a second direct WeakMap binding on the view itself.
    const bucketView={...state,jobs:{...state.jobs}};
    assert.equal(bucketView.records,state.records);
    for(const [kind,view]of [['state',state],['derived',derived],['inherited-again',inheritedAgain],['records-bucket',bucketView]]){
      const assignment=inspectJob(view,view.jobs[newJobId]),origin=inspectOrigin(view);
      assert.ok(assignment&&origin,label+' '+kind+' must exercise the actual live original lease');
      assert.equal(assignment.historical_original,false);assert.equal(assignment.active_original_snapshot,true);
      assert.equal(origin.historical_original,false);assert.equal(origin.active_original_snapshot,true);
      assert.equal(proofJobSafe(view.jobs[newJobId],view),true);
      assert.equal(Object.hasOwn(currentExtensions(view),'original_execution_origin'),false);
      retained.push({label:label+' '+kind,view,job:view.jobs[newJobId]});
    }
  };
  assert.throws(()=>f.store.transaction('job.queued',state=>{
    const job=fictionalInventoryJob(state);newJobId=job.id;
    f.producer.recordOriginalWorkerAssignmentFrom(f.store,state,job);state.jobs[job.id]=job;
    state.sessions[job.session_key]={instance_id:job.instance_id,role:job.role,host:job.host,native_id:null,model_selection:job.model_selection};
    retainViews(state,'callback');
    if(failureStage==='callback')throw stopped;
    return state;
  },{beforeCommit:()=>{
    assert.equal(failureStage,'beforeCommit');
    // The real Store has already staged the physical state and journal. A new
    // snapshot bound by its actual reader must still be provisional until the
    // physical COMMIT succeeds; mere visibility cannot make it historical.
    retainViews(f.store.read(),'physical-before-commit');throw stopped;
  }}),error=>error===stopped);
  assert.equal(retained.length,failureStage==='callback'?4:8);
  for(const {label,view,job}of retained){
    assert.equal(inspectJob(view,job),null,label+' must not retain an uncommitted assignment proof');
    assert.equal(inspectOrigin(view),null,label+' must not retain an uncommitted origin-view proof');
    assert.equal(proofJobSafe(job,view),false,label+' cannot hide never-committed assignment metadata');
    const extensions=currentExtensions(view);
    assert.ok(Object.hasOwn(extensions,'original_execution_origin'),label+' must keep unqualified origin metadata visible');
    assert.deepEqual(extensions.original_execution_origin,view.original_execution_origin);
  }
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);complete(f.inspect(),1,2);
  // Revoking the failed write must not revoke an independently authenticated
  // snapshot that was already committed before that write began.
  assert.equal(inspectJob(durable,durable.jobs[committedJob.id]).historical_original,true);
  assert.equal(inspectOrigin(durable).historical_original,true);
  assert.equal(proofJobSafe(durable.jobs[committedJob.id],durable),true);
  assert.equal(Object.hasOwn(currentExtensions(durable),'original_execution_origin'),false);
});

for(const hookPhase of ['afterWrite','beforeCommit'])test('finalized '+hookPhase+' hook cannot issue an unflushed original worker launch',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),job=f.queue();
  const {proofJobSafe,currentExtensions}=await import('../plugins/soloco/runtime/current-state.mjs');
  const {inspectOriginalWorkerAssignmentBookkeepingFrom:inspectJob,inspectOriginalExecutionOriginBookkeepingFrom:inspectOrigin,
    inheritOriginalWorkerAssignmentBookkeepingFrom:inherit}=f.producer;
  const durable=f.state(),before=JSON.stringify(durable),beforeEvent=f.store.changeToken();
  let retainedNext,derived,bucketView,lateError,returnedToken,hookCalls=0;
  const hook=(_db,next)=>{
    hookCalls++;assert.equal(next,retainedNext);
    const stampBefore=JSON.stringify(next.jobs[job.id].original_execution_assignment);
    assert.deepEqual(next.jobs[job.id].original_execution_assignment.launches,[]);
    // The actual writer loan is still alive, but issuance has already been
    // finalized before SQL flush. This is not a foreign/fake transaction test.
    const pending=inspectJob(next,next.jobs[job.id]);assert.ok(pending);
    assert.equal(pending.historical_original,false);assert.equal(pending.active_original_snapshot,true);
    try{returnedToken=f.producer.prepareOriginalWorkerLaunchFrom(f.store,next,{job_id:job.id,kind:'worker'});}
    catch(error){
      lateError=error;
      assert.ok(error instanceof Error&&/^ORIGINAL_EXECUTION_(?:WRITE|ISSUER)_/.test(error.code??''),'late issuance must fail at the original writer phase boundary');
      assert.equal(JSON.stringify(next.jobs[job.id].original_execution_assignment),stampBefore,'reject before changing the finalized stamp');
      assert.equal(returnedToken,undefined,'no new private launch token may escape the closed issuer');
      for(const view of [next,derived,bucketView]){
        const assignment=inspectJob(view,view.jobs[job.id]),origin=inspectOrigin(view);
        assert.notEqual(assignment?.historical_original,true);assert.notEqual(origin?.historical_original,true);
        if(assignment)assert.deepEqual(assignment.projection,JSON.parse(stampBefore),'late call cannot mint a new bookkeeping projection');
      }
      throw error;
    }
    assert.fail('late original launch issuer returned after finalized SQL state');
  };
  assert.throws(()=>f.store.transaction('job.worker_launch_requested',state=>{
    retainedNext=state;derived={...state,records:{...state.records},jobs:{...state.jobs}};
    assert.equal(inherit(state,derived),true);
    bucketView={...state,jobs:{...state.jobs}};
    // Deliberately no early prepareOriginalWorkerLaunchFrom: there is no
    // pending launch already authorized by the ordinary transaction callback.
    return state;
  },{[hookPhase]:hook}),error=>error===lateError&&/^ORIGINAL_EXECUTION_(?:WRITE|ISSUER)_/.test(error.code??''));
  assert.equal(hookCalls,1);assert.equal(returnedToken,undefined);
  for(const view of [retainedNext,derived,bucketView]){
    assert.deepEqual(view.jobs[job.id].original_execution_assignment.launches,[]);
    assert.equal(inspectJob(view,view.jobs[job.id]),null);
    assert.equal(inspectOrigin(view),null);
    assert.equal(proofJobSafe(view.jobs[job.id],view),false);
    assert.ok(Object.hasOwn(currentExtensions(view),'original_execution_origin'));
  }
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);complete(f.inspect(),1,2);
  assert.equal(inspectJob(durable,durable.jobs[job.id]).historical_original,true);
  assert.equal(inspectOrigin(durable).historical_original,true);
});

test('original worker intent cannot COMMIT after its last actual integrity read crosses the original queue deadline',{concurrency:false},async t=>{
  const attempted=denyInventoryExternalEffects(t),f=await freshInventoryStore(t),job=f.queue();
  const {STARTUP_TIMEOUT_MS}=await import('../plugins/soloco/runtime/timeout.mjs');
  const start=Date.parse(job.created_at),deadline=start+STARTUP_TIMEOUT_MS;
  let now=start,finalValidation=false,reads=0,commits=0,token;
  t.mock.method(Date,'now',()=>now);
  const before=JSON.stringify(f.state()),beforeEvent=f.store.changeToken();
  const exec=f.store.db.exec;
  t.mock.method(f.store.db,'exec',function(sql,...args){if(finalValidation&&sql==='COMMIT')commits++;return Reflect.apply(exec,this,[sql,...args]);});
  afterInventoryEventsRead(t,({count})=>{if(finalValidation){reads++;assert.equal(count,beforeEvent+1);now=deadline;}});
  assert.throws(()=>f.store.transaction('job.worker_launch_requested',state=>{
    token=f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;
  },{beforeCommit(){finalValidation=true;}}),error=>error.code==='ORIGINAL_EXECUTION_CUTOFF_EXPIRED');
  finalValidation=false;
  assert.equal(reads,1,'advance only after the actual final history rows were returned');assert.equal(now,deadline);
  assert.equal(commits,0);assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);
  assert.deepEqual(f.state().jobs[job.id].original_execution_assignment.launches,[]);
  // Rollback never promotes the privately prepared token, even if a later
  // clock sample is earlier. No retry or refreshed deadline is authorized.
  now=start;
  assert.throws(()=>f.producer.spawnOriginalWorkerLaunch(token,process.execPath,['SYNTHETIC-never-spawn'],{cwd:f.root}),originalHold);
  assert.deepEqual(attempted,[]);assert.equal(attempted.spawnCalls.length,0);complete(f.inspect(),1,2);
});

test('original worker Popen is denied when the owning last history read consumes its original startup window',{concurrency:false},async t=>{
  const child=controlledInventoryChild(),attempted=denyInventoryExternalEffects(t,{spawnChildren:[child]});
  const f=await freshInventoryStore(t),job=f.queue(),{STARTUP_TIMEOUT_MS}=await import('../plugins/soloco/runtime/timeout.mjs');
  const start=Date.parse(job.created_at),deadline=start+STARTUP_TIMEOUT_MS;let now=start,token;
  t.mock.method(Date,'now',()=>now);
  f.store.transaction('job.worker_launch_requested',state=>{token=f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;});
  const before=JSON.stringify(f.state()),beforeEvent=f.store.changeToken(),transaction=f.store.transaction,exec=f.store.db.exec;
  let inBirth=false,reads=0,commits=0,failure;
  t.mock.method(f.store,'transaction',function(type,fn,options){
    if(type!=='job.original_execution.born')return Reflect.apply(transaction,this,[type,fn,options]);
    inBirth=true;try{return Reflect.apply(transaction,this,[type,fn,options]);}finally{inBirth=false;}
  });
  t.mock.method(f.store.db,'exec',function(sql,...args){if(inBirth&&sql==='COMMIT')commits++;return Reflect.apply(exec,this,[sql,...args]);});
  afterInventoryEventsRead(t,({count})=>{if(inBirth){reads++;assert.equal(count,beforeEvent);now=deadline;}});
  try{f.producer.spawnOriginalWorkerLaunch(token,process.execPath,['SYNTHETIC-never-spawn'],{cwd:f.root});assert.fail('expired original launch returned');}
  catch(error){failure=error;assert.equal(error.code,'ORIGINAL_EXECUTION_CUTOFF_EXPIRED');}
  assert.ok(reads>=1,'the original owning history was really read before creation');assert.equal(now,deadline);assert.equal(commits,0);assert.equal(attempted.spawnCalls.length,0);
  assert.equal(f.producer.originalWorkerFailedLaunchChild(failure),null);assert.equal(f.producer.cleanupOriginalWorkerLaunchFailure(failure),false);
  assert.deepEqual(child.signals,[]);assert.equal(child.listenerCount('close'),0);
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);
  const pending=f.state().jobs[job.id].original_execution_assignment.launches[0];assert.equal(pending.birth,null);assert.equal(pending.closure,null);
  now=start;assert.throws(()=>f.producer.spawnOriginalWorkerLaunch(token,process.execPath,['SYNTHETIC-no-retry'],{cwd:f.root}),originalHold);
  assert.equal(attempted.spawnCalls.length,0);complete(f.inspect(),1,2);assert.equal(f.inspect().raw_carrier_closure_unknown,1);
});

function syntheticMechanicalDecision(f,expires_at){
  const owner=f.state().owner,quote='SYNTHETIC SOURCE FIXTURE ONLY: record finite mechanical QA decision metadata; no actual human, Native, grant or execution is established.';
  return {actor:{host:owner.host,session_id:owner.session_id,native_id:owner.session_id},epoch:owner.epoch,input:{
    operation_id:'SYNTHETIC-original-cutoff-decision',source_instruction:quote,
    primary_human_message:{host:owner.host,chat_id:owner.session_id,turn_id:'SYNTHETIC-cutoff-turn',message_id:'SYNTHETIC-cutoff-message',content_sha256:createHash('sha256').update(quote).digest('hex'),quote},
    expires_at,limits:{max_attempts:1,max_native_calls:1,max_context_utf8_bytes:512,timeout_ms:1000},
    model_selection:{mode:'explicit',model:'SYNTHETIC-source-test-model',reason:'Synthetic decision metadata; do not resolve or invoke this model.'}
  }};
}

test('real fixed policy commits a finite synthetic decision with original Source custody and no Native allowance claim',{concurrency:false},async t=>{
  const attempted=denyInventoryExternalEffects(t),f=await freshInventoryStore(t);
  const {recordPeerOriginMechanicalQaDecisionFrom}=await import('../plugins/soloco/runtime/peers/origin-mechanical-qa-policy.mjs');
  const now=Date.now();t.mock.method(Date,'now',()=>now);
  const expires_at=new Date(now+1000).toISOString(),request=syntheticMechanicalDecision(f,expires_at),beforeEvent=f.store.changeToken();
  const result=recordPeerOriginMechanicalQaDecisionFrom(f.store,request.actor,request.epoch,request.input);
  assert.equal(result.authority_issued,false);assert.equal(result.human_producer_authenticity,'not mechanically established');
  assert.equal(f.store.changeToken(),beforeEvent+1);
  const state=f.state(),decision=state.records[result.decision_ref.id],policy=state.records[result.policy_ref.id];
  assert.equal(decision.origin_mechanical_qa.expires_at,expires_at);assert.deepEqual(decision.origin_mechanical_qa.request,request.input);
  assert.equal(decision.origin_mechanical_qa.evidence_only,true);assert.equal(policy.origin_mechanical_qa.grant_ref,null);
  assert.equal(policy.origin_mechanical_qa.no_other_allowance,true);assert.deepEqual(state.jobs,{});
  assert.deepEqual(attempted,[]);complete(f.inspect(),0,3);
});

test('real policy finite expiry is rechecked after the actual final integrity read and immediately before COMMIT',{concurrency:false},async t=>{
  const attempted=denyInventoryExternalEffects(t),f=await freshInventoryStore(t);
  const {recordPeerOriginMechanicalQaDecisionFrom}=await import('../plugins/soloco/runtime/peers/origin-mechanical-qa-policy.mjs');
  const start=Date.now(),deadline=start+1000;let now=start,guardReturned=false,reads=0,commits=0;
  t.mock.method(Date,'now',()=>now);
  const request=syntheticMechanicalDecision(f,new Date(deadline).toISOString()),before=JSON.stringify(f.state()),beforeEvent=f.store.changeToken();
  const transaction=f.store.transaction,exec=f.store.db.exec;
  t.mock.method(f.store,'transaction',function(type,fn,hooks){
    assert.equal(type,'origin.mechanical_qa.decision_selected');assert.equal(typeof hooks?.beforeCommit,'function');
    return Reflect.apply(transaction,this,[type,fn,{...hooks,beforeCommit:(db,next)=>{
      assert.equal(hooks.beforeCommit(db,next),undefined,'the real fixed guard retains its private finite cutoff');guardReturned=true;
    }}]);
  });
  t.mock.method(f.store.db,'exec',function(sql,...args){if(guardReturned&&sql==='COMMIT')commits++;return Reflect.apply(exec,this,[sql,...args]);});
  afterInventoryEventsRead(t,({count})=>{if(guardReturned){reads++;assert.equal(count,beforeEvent+1);now=deadline;}});
  assert.throws(()=>recordPeerOriginMechanicalQaDecisionFrom(f.store,request.actor,request.epoch,request.input),error=>error.code==='ORIGIN_MECHANICAL_QA_EXPIRED');
  guardReturned=false;
  assert.equal(reads,1);assert.equal(now,deadline);assert.equal(commits,0);
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);
  assert.deepEqual(f.state().records,{});assert.deepEqual(f.state().jobs,{});assert.deepEqual(attempted,[]);complete(f.inspect(),0,3);
});

test('a missing original policy expiry cannot create a decision or a retained commit allowance',{concurrency:false},async t=>{
  const attempted=denyInventoryExternalEffects(t),f=await freshInventoryStore(t);
  const {recordPeerOriginMechanicalQaDecisionFrom}=await import('../plugins/soloco/runtime/peers/origin-mechanical-qa-policy.mjs');
  const before=JSON.stringify(f.state()),beforeEvent=f.store.changeToken(),request=syntheticMechanicalDecision(f,undefined);
  assert.throws(()=>recordPeerOriginMechanicalQaDecisionFrom(f.store,request.actor,request.epoch,request.input),error=>error.code==='ORIGIN_MECHANICAL_QA_EXPIRED');
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);
  assert.deepEqual(f.state().records,{});assert.deepEqual(attempted,[]);complete(f.inspect(),0,3);
});

for(const lateObservation of ['available','unavailable'])test('failed original birth COMMIT retains exact error/child custody and '+lateObservation+' late-close evidence',{concurrency:false},async t=>{
  const child=controlledInventoryChild(),attempted=denyInventoryExternalEffects(t,{spawnChildren:[child]}),f=await freshInventoryStore(t),job=f.queue();
  let now=Date.parse(job.created_at),token;t.mock.method(Date,'now',()=>now);
  f.store.transaction('job.worker_launch_requested',state=>{token=f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;});
  const before=JSON.stringify(f.state()),beforeEvent=f.store.changeToken(),transaction=f.store.transaction;
  const originalFailure=Object.assign(Error('SYNTHETIC exact original birth COMMIT rejection'),{code:'SYNTHETIC_ORIGINAL_COMMIT_REJECTED'});
  let birthGuardCalls=0;
  t.mock.method(f.store,'transaction',function(type,fn,hooks={}){
    if(type!=='job.original_execution.born')return Reflect.apply(transaction,this,[type,fn,hooks]);
    return Reflect.apply(transaction,this,[type,fn,{...hooks,beforeCommit:(db,next)=>{if(hooks.beforeCommit)assert.equal(hooks.beforeCommit(db,next),undefined);birthGuardCalls++;throw originalFailure;}}]);
  });
  assert.throws(()=>f.producer.spawnOriginalWorkerLaunch(token,process.execPath,['SYNTHETIC-fixed-Node-child-mock'],{cwd:f.root}),error=>error===originalFailure);
  assert.equal(birthGuardCalls,1);assert.equal(attempted.spawnCalls.length,1);
  assert.equal(f.producer.originalWorkerFailedLaunchChild(originalFailure),child);
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);
  let launch=f.state().jobs[job.id].original_execution_assignment.launches[0];assert.equal(launch.birth,null);assert.equal(launch.closure,null);
  complete(f.inspect(),1,2);assert.equal(f.inspect().raw_carrier_closure_unknown,1);
  assert.ok(child.listenerCount('close')>0,'actual original observation survives the throwing caller');
  const counterfeit=Object.assign(Error('SYNTHETIC copied diagnostic property'),{originalChild:child});
  assert.equal(f.producer.originalWorkerFailedLaunchChild(counterfeit),null);assert.equal(f.producer.cleanupOriginalWorkerLaunchFailure(counterfeit),false);assert.deepEqual(child.signals,[]);
  assert.equal(f.producer.cleanupOriginalWorkerLaunchFailure(originalFailure),true);assert.deepEqual(child.signals,['SIGTERM']);
  assert.equal(f.producer.cleanupOriginalWorkerLaunchFailure(originalFailure),true);assert.deepEqual(child.signals,['SIGTERM'],'idempotent exact-child cleanup cannot signal a reused handle');
  // The controlled Node emitter is the only physical observation. No OS PID
  // probe or caller closure flag substitutes for its actual close callback.
  const prepare=DatabaseSync.prototype.prepare;let observing=false,failedReads=0;
  if(lateObservation==='unavailable')t.mock.method(DatabaseSync.prototype,'prepare',function(sql,...args){
    if(observing&&sql==='SELECT value FROM company WHERE id=1'){failedReads++;throw Error('SYNTHETIC unavailable owning observation read');}
    return Reflect.apply(prepare,this,[sql,...args]);
  });
  observing=true;try{child.emit('close',null,'SIGTERM');}finally{observing=false;}
  launch=f.state().jobs[job.id].original_execution_assignment.launches[0];
  if(lateObservation==='available'){
    assert.equal(launch.birth.pid,child.pid);assert.equal(launch.birth.parent_pid,process.pid);
    assert.equal(launch.closure.pid,child.pid);assert.equal(launch.closure.signal,'SIGTERM');assert.equal(launch.closure.never_started,false);
    assert.equal(f.store.changeToken(),beforeEvent+2,'late birth and closure are distinct original Source observations');
    assert.equal(f.inspect().raw_carrier_closure_unknown,0);
  }else{
    assert.ok(failedReads>0);assert.equal(launch.birth,null);assert.equal(launch.closure,null);
    assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);assert.equal(f.inspect().raw_carrier_closure_unknown,1);
  }
  assert.equal(child.listenerCount('close'),0);assert.equal(child.listenerCount('spawn'),0);assert.equal(child.listenerCount('error'),0);
  assert.equal(f.producer.originalWorkerFailedLaunchChild(originalFailure),child);
  assert.equal(f.producer.cleanupOriginalWorkerLaunchFailure(originalFailure),true);assert.deepEqual(child.signals,['SIGTERM']);
  assert.throws(()=>f.producer.spawnOriginalWorkerLaunch(token,process.execPath,['SYNTHETIC-no-retry'],{cwd:f.root}),originalHold);
  assert.equal(attempted.spawnCalls.length,1);assert.equal(f.state().jobs[job.id].status,'queued');complete(f.inspect(),1,2);
});

test('all fixed cutoff issuers reject forged deadline DATA and foreign original scopes in an actual owning write',{concurrency:false},async t=>{
  const attempted=denyInventoryExternalEffects(t),f=await freshInventoryStore(t),other=await freshInventoryStore(t);
  const {retainOriginalStoreCommitCutoffFrom:retain,originalStoreRetainedCommitCutoffFrom:retained,originalStoreExecutionCustodyFrom:custody}=f.storeModule;
  const policy=await import('../plugins/soloco/runtime/peers/origin-mechanical-qa-policy.mjs');
  const engine=await import('../plugins/soloco/runtime/engine.mjs'),worker=await import('../plugins/soloco/runtime/worker.mjs'),development=await import('../plugins/soloco/runtime/develop.mjs');
  const issuers=[['mechanical-qa',policy.inspectOriginalMechanicalQaCommitCutoffFrom],['engine',engine.inspectOriginalEngineCommitCutoffFrom],['worker',worker.inspectOriginalWorkerCommitCutoffFrom],['development',development.inspectOriginalDevelopmentCommitCutoffFrom]];
  // This IS a genuine class-owned original read loan, but it is not a policy
  // proof. Its scope also ends before the different Store's owning write.
  const foreign=other.store.readSnapshot(()=>custody(other.store.db));
  assert.throws(()=>foreign.assert(),error=>error.code==='ORIGINAL_EXECUTION_STORE_EXPIRED');
  const before=JSON.stringify(f.state()),otherBefore=JSON.stringify(other.state()),beforeEvent=f.store.changeToken(),otherEvent=other.store.changeToken();
  const rollback=Error('SYNTHETIC terminate the denial-only write with no committed authority');
  assert.throws(()=>f.store.transaction('SYNTHETIC.cutoff-denial',state=>{
    const original=custody(f.store.db),forged=Object.freeze({deadline_at_ms:Date.now()+1000000,code:'SYNTHETIC_FORGED_PERMISSION',message:'Caller-selected future deadline',db:original.db,scope:original.scope});
    assert.equal(original.mode,'write');assert.equal(retained(f.store),null);
    for(const [issuer,inspect]of issuers){
      assert.equal(typeof inspect,'function','exercise the actual fixed supplier, not an unavailable-export fallback');
      const missingProof=error=>issuer==='mechanical-qa'?error.code==='ORIGIN_MECHANICAL_QA_ORIGINAL_CUTOFF_REQUIRED':error.message==='Original '+issuer+' commit cutoff custody required';
      assert.throws(()=>inspect(forged,f.store.db),missingProof);
      assert.throws(()=>retain(f.store.db,forged,issuer),missingProof);
      assert.throws(()=>retain(f.store.db,foreign,issuer),missingProof);
      assert.throws(()=>retain(other.store.db,forged,issuer),error=>error.code==='ORIGINAL_EXECUTION_STORE_EXPIRED');
      assert.equal(retained(f.store),null,'copied exact active scope/deadline fields confer no issuer custody');
    }
    assert.throws(()=>retain(f.store.db,forged,'SYNTHETIC-caller-factory'),error=>error.code==='ORIGINAL_EXECUTION_COMMIT_CUTOFF_REQUIRED');
    assert.equal(retained(f.store),null);throw rollback;
  }),error=>error===rollback);
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),beforeEvent);
  assert.equal(JSON.stringify(other.state()),otherBefore);assert.equal(other.store.changeToken(),otherEvent);
  assert.deepEqual(attempted,[]);complete(f.inspect(),0,3);complete(other.inspect(),0,3);
  // Genuine engine/worker/development bounded completion positives need their
  // adapted Original predecessor fixtures. This denial test establishes none.
});

for(const providerErrorKind of ['frozen','nonextensible'])test('real worker retains UNKNOWN for '+providerErrorKind+' original failed-launch Error with immutable public termination flag',{concurrency:false},async t=>{
  const carrier=controlledInventoryChild(process.pid),modelChild=controlledInventoryChild(),attempted=denyInventoryExternalEffects(t,{spawnChildren:[carrier,modelChild]});
  const f=await freshInventoryStore(t,{stateOptions:{extra:{paused:false}}});
  f.store.migrate();assert.equal(f.store.storageInfo().format,'normalized-v4');
  const job=f.queue(),unrelated=f.queue({task:'SYNTHETIC unrelated known UNKNOWN remains occupied.'});
  const previousData=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=f.root+'/SYNTHETIC-plugin-data';
  t.after(()=>{if(previousData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previousData;});
  const {work}=await import('../plugins/soloco/runtime/worker.mjs'),{runModel}=await import('../plugins/soloco/runtime/adapters.mjs');
  const {TERMINATION_GRACE_MS}=await import('../plugins/soloco/runtime/timeout.mjs');
  // Keep the real fixed cleanup schedule observable without sleeping or
  // creating a real process. Only its actual close callback may clear it.
  const cleanupTimers=new Map();
  t.mock.method(globalThis,'setTimeout',(fn,delay,...args)=>{assert.equal(delay,TERMINATION_GRACE_MS);const handle={unref(){return this;}};cleanupTimers.set(handle,()=>fn(...args));return handle;});
  t.mock.method(globalThis,'clearTimeout',handle=>cleanupTimers.delete(handle));
  let carrierToken;
  f.store.transaction('job.worker_launch_requested',state=>{carrierToken=f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;});
  assert.equal(f.producer.spawnOriginalWorkerLaunch(carrierToken,process.execPath,['SYNTHETIC-source-worker-carrier'],{cwd:f.root,stdio:'ignore'}),carrier);
  carrier.emit('spawn');const unchangedOther=JSON.stringify(f.state().jobs[unrelated.id]);
  const cause=Object.freeze(Error('SYNTHETIC immutable original physical-write cause'));
  const originalFailure=Object.assign(Error('SYNTHETIC original model birth COMMIT failed',{cause}),{code:'SYNTHETIC_PROVIDER_WRITE_FAILURE'});
  Object.defineProperty(originalFailure,'termination_confirmed',{value:true,writable:false,configurable:false,enumerable:true});
  if(providerErrorKind==='frozen')Object.freeze(originalFailure);else Object.preventExtensions(originalFailure);
  assert.equal(Object.isExtensible(originalFailure),false);
  const transaction=f.storeModule.Store.prototype.transaction;let rejectionPending=true,failedBirths=0,modelCalls=0,received,modelToken,promptWrites=0,timingCallbacks=0,closed=false;
  modelChild.stdin.end=()=>{promptWrites++;};modelChild.once('close',()=>{closed=true;});
  t.mock.method(f.storeModule.Store.prototype,'transaction',function(type,fn,hooks={}){
    if(this.root!==f.store.root||type!=='job.original_execution.born'||!rejectionPending)return Reflect.apply(transaction,this,[type,fn,hooks]);
    return Reflect.apply(transaction,this,[type,fn,{...hooks,beforeCommit:(db,next)=>{
      if(hooks.beforeCommit)assert.equal(hooks.beforeCommit(db,next),undefined);
      const launch=next.jobs[job.id]?.original_execution_assignment.launches.find(l=>l.kind==='model'&&l.birth?.pid===modelChild.pid);
      assert.ok(launch,'fail the actual original model-child birth, after Node creation and before physical COMMIT');
      rejectionPending=false;failedBirths++;throw originalFailure;
    }}]);
  });
  const model=(host,native,prompt,cwd,timeout,selection,options)=>{
    modelCalls++;modelToken=options.originalExecutionLaunch;assert.ok(modelToken);assert.equal(options.spawn,undefined);
    return runModel(host,native,prompt,cwd,timeout,selection,{...options,resolveExecutable:()=>process.execPath,onSpawn:timing=>{timingCallbacks++;return options.onSpawn?.(timing);}}).catch(error=>{
      received=error;assert.equal(error,originalFailure);assert.equal(error.cause,cause);throw error;
    });
  };
  try{
    // The canonical worker's established failure contract records state and
    // returns void; the actual adapter receives and rethrows the SAME Error.
    assert.equal(await work(f.root,job.id,model),undefined);
    assert.equal(received,originalFailure);assert.equal(received.cause,cause);assert.equal(modelCalls,1);assert.equal(failedBirths,1);
    assert.equal(attempted.spawnCalls.length,2,'one genuine Source carrier and one actual fixed model CP mock; no retry');
    assert.equal(promptWrites,0);assert.equal(timingCallbacks,0,'a failed physical birth cannot publish invocation timing');
    assert.equal(f.producer.originalWorkerFailedLaunchChild(originalFailure),modelChild);
    assert.equal(f.producer.originalWorkerFailedLaunchClosed(originalFailure),false);
    assert.equal(f.producer.originalWorkerFailedLaunchClosed(Object.freeze({termination_confirmed:true})),null);
    assert.equal(originalFailure.termination_confirmed,true,'immutable diagnostic DATA is unchanged, never authority');
    assert.equal(Object.hasOwn(originalFailure,'originalChild'),false,'nonextensible Error needs private custody');
    assert.equal(Object.getOwnPropertyDescriptor(originalFailure,'termination_confirmed').writable,false);
    let current=f.state().jobs[job.id],invocation=current.model_process_tracking.invocations[0];
    assert.equal(current.status,'failed');assert.equal(current.error,originalFailure.message);assert.equal(current.artifact_id,undefined);
    assert.equal(current.execution_failure.code,originalFailure.code);assert.equal(current.execution_failure.outcome,'failure');
    assert.equal(current.execution_failure.termination_confirmed,false);
    assert.equal(current.coordination_release.termination_confirmed,false);assert.equal(current.coordination_release.reason,'original_process_closure_unknown');
    assert.equal(current.model_process_tracking.invocations.length,1);assert.equal(invocation.birth.pid,modelChild.pid);assert.equal(invocation.closure,null);
    const rawLaunch=current.original_execution_assignment.launches.find(l=>l.kind==='model');assert.equal(rawLaunch.birth,null);assert.equal(rawLaunch.closure,null);
    assert.equal(JSON.stringify(f.state().jobs[unrelated.id]),unchangedOther);complete(f.inspect(),2,1);
    assert.deepEqual(modelChild.signals,['SIGTERM']);assert.equal(cleanupTimers.size,1);
    assert.throws(()=>f.producer.assertOriginalWorkerLaunchToken(modelToken,{kind:'model'}),originalHold);
    // Actual original close first persists its original birth/close, then the
    // real worker observer runs the unchanged all-invocation reconciler.
    modelChild.stdout.emit('end');modelChild.stderr.emit('end');modelChild.emit('exit',0,null);modelChild.emit('close',0,null);
    assert.equal(f.producer.originalWorkerFailedLaunchClosed(originalFailure),true);assert.equal(cleanupTimers.size,0);
    current=f.state().jobs[job.id];invocation=current.model_process_tracking.invocations[0];
    assert.equal(invocation.closure.exit_code,0);assert.equal(invocation.closure.signal,null);
    assert.equal(current.status,'failed');assert.equal(current.error,originalFailure.message);assert.equal(current.execution_failure.code,originalFailure.code);assert.equal(current.artifact_id,undefined);
    assert.equal(current.coordination_release.termination_confirmed,true);assert.equal(current.coordination_release.reason,'model_process_closed');
    const observed=current.original_execution_assignment.launches.find(l=>l.kind==='model');assert.equal(observed.birth.pid,modelChild.pid);assert.equal(observed.closure.pid,modelChild.pid);
    assert.equal(JSON.stringify(f.state().jobs[unrelated.id]),unchangedOther);complete(f.inspect(),1,2);
    assert.equal(received,originalFailure);assert.equal(originalFailure.cause,cause);assert.equal(originalFailure.termination_confirmed,true);
    assert.equal(f.producer.cleanupOriginalWorkerLaunchFailure(originalFailure),true);assert.deepEqual(modelChild.signals,['SIGTERM']);assert.equal(attempted.spawnCalls.length,2);
  }finally{
    if(!closed){modelChild.emit('exit',0,null);modelChild.emit('close',0,null);}
    carrier.emit('exit',0,null);carrier.emit('close',0,null);
  }
});

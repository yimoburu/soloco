import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createOriginalAdapterProcessFixture} from './original-adapter-process-fixture.mjs';
import {PeerLedger,installPeerSchema,peerDigest,canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {createObservationJournal,OBSERVATION_STATUS,OBSERVATION_PREFIX,OBSERVATION_PROTOCOL} from '../plugins/soloco/runtime/peers/observation-journal.mjs';
import * as model from '../plugins/soloco/runtime/peers/model.mjs';
import {PeerScheduler,createNativeExecutor} from '../plugins/soloco/runtime/peers/scheduler.mjs';

function fixture(t,n=2,{budget=100,hosts={}}={}) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'peer-scheduler-'))),directory=path.join(root,'.company');
  fs.mkdirSync(directory);
  const db=new DatabaseSync(path.join(directory,'company.sqlite'));
  db.exec('CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER NOT NULL); INSERT INTO company_layout VALUES(1,5); CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL);');
  installPeerSchema(db,{company_id:'scheduler-test'});db.close();
  const ledger=new PeerLedger(root),founder={principal_id:'founder'},actor={principal_id:'software'};
  const owners=Array.from({length:n},(_,i)=>`cos-${String(i).padStart(2,'0')}`);
  ledger.write('test.bootstrap','founder',tx=>{
    tx.put('control','company',{protocol:'peer-cos-v1',founder_principal_id:'founder',governance_sha256:peerDigest('fictional-governance'),policy_generation:1,pause_generation:1,paused:false,
      policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:1000,max_context_bytes:65536,max_model_calls:budget,review_aging_ms:0}},0);
    tx.put('principals','founder',{principal_id:'founder',kind:'founder',status:'active',host:'codex'},0);
    tx.put('principals','software',{principal_id:'software',kind:'scheduler',status:'active',host:'codex'},0);
    for(const id of owners)tx.put('principals',id,{principal_id:id,kind:'cos',status:'active',native_id:`fixture-${id}`,host:hosts[id]??'codex'},0);
  });
  for(const owner of owners)model.execute(ledger,founder,'grant/create',{operation_id:`grant-${owner}`,grant_id:`grant-${owner}`,to_principal_id:owner,scope:'*',actions:['task/*','home/*'],resources:[{kind:'home',id:'review-home'},{kind:'home',id:'candidate'}],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Isolated equal-budget test authority',max_model_calls:budget});
  t.after(()=>{ledger.close();fs.rmSync(root,{recursive:true,force:true});});
  let serial=0;
  const submit=(owner=owners[0],extra={})=>{
    const task=model.execute(ledger,{principal_id:owner},'task/submit',{operation_id:`submit-${++serial}`,task_id:`task-${String(serial).padStart(3,'0')}`,grant_id:`grant-${owner}`,scope:extra.scope??`scope-${serial}`,role:'research',instructions:'Produce an evidence-grounded result.',acceptance:'Preserve uncertainty and exact evidence.',resources:[],...extra});
    model.execute(ledger,{principal_id:owner},'task/claim',{operation_id:`claim-${serial}`,task_id:task.id});return task;
  };
  return {root,ledger,founder,actor,owners,submit,read:id=>ledger.read(tx=>tx.get('tasks',id))};
}

function controlledExecutor() {
  const jobs=[],probes=[];let active=0,maxActive=0;
  return {jobs,probes,get maxActive(){return maxActive;},
    async probe({host}){probes.push(host);return {host,available:true,authenticated:true};},
    execute(args){active++;maxActive=Math.max(maxActive,active);const observed_process={pid:4200+jobs.length,started_at:'2026-01-01T00:00:00.000Z',close_observed:false};args.onProcess(observed_process);return new Promise(resolve=>{
      jobs.push({...args,observed_process,finish(result={}){active--;const v=args.task.value;
        const output=canonical({content:'Observed isolated fixture result',...(v.review_of?{review:{subject:v.review_of,context_sha256:args.context.sha256,verdict:'Pass',reason:'Exact fixture subject checked',blockers:[]}}:{})});
        resolve({output,native_id:`native-${args.task.id}`,termination_confirmed:true,...result,observed_process:{...observed_process,close_observed:result.termination_confirmed!==false}});}});
    });}
  };
}

test('1/2/4/8 simulated CoSes share the same twelve-call budget and three slots',async t=>{
  for(const n of [1,2,4,8])await t.test(`${n} peers`,async t=>{
    const f=fixture(t,n,{budget:12}),executor=controlledExecutor(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
    for(let i=0;i<12;i++)f.submit(f.owners[i%n]);
    let finished=0;
    while(finished<12){await scheduler.tick();const batch=executor.jobs.slice(finished);assert.ok(batch.length>0&&batch.length<=3);for(const job of batch)job.finish();await scheduler.drain();finished=executor.jobs.length;}
    assert.equal(executor.jobs.length,12);assert.equal(executor.maxActive,3);
    assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,12);
    assert.equal(f.ledger.read(tx=>tx.count('tasks',{status:'returned'})),12);
    assert.equal((await scheduler.status()).available_slots,3);
  });
});

test('idle and saturated ticks perform no context admission or CLI/model probes',async t=>{
  const f=fixture(t),executor=controlledExecutor(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  await scheduler.tick();await scheduler.tick();assert.equal(executor.probes.length,0);assert.equal(executor.jobs.length,0);
  for(let i=0;i<4;i++)f.submit();await scheduler.tick();const probes=executor.probes.length;
  for(let i=0;i<5;i++)await scheduler.tick();assert.equal(executor.jobs.length,3);assert.equal(executor.probes.length,probes);
  for(const job of executor.jobs)job.finish();await scheduler.drain();
});

test('duplicate and concurrent scheduler ticks never launch the same attempt twice',async t=>{
  const f=fixture(t),executor=controlledExecutor(),one=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor}),two=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  for(let i=0;i<6;i++)f.submit(f.owners[i%2]);
  await Promise.all([...Array.from({length:10},()=>one.tick()),two.tick()]);
  assert.equal(executor.jobs.length,3);assert.equal(new Set(executor.jobs.map(x=>x.task.value.attempt.id)).size,3);
  for(const job of executor.jobs)job.finish();await Promise.all([one.drain(),two.drain()]);
});

test('three uncertain native processes retain all slots; late closure never accepts old output',async t=>{
  const f=fixture(t),executor=controlledExecutor(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  for(let i=0;i<4;i++)f.submit();await scheduler.tick();const attempts=executor.jobs.map(j=>j.task.value.attempt.id);
  for(const job of executor.jobs)job.finish({error:{code:'ROLE_PROCESS_ERROR',message:'Closure not observed'},termination_confirmed:false});
  await scheduler.drain();assert.equal((await scheduler.status()).available_slots,0);
  await scheduler.tick();assert.equal(executor.jobs.length,3);
  const first=executor.jobs[0];first.onClosure({...first.observed_process,close_observed:true});await scheduler.drain();
  assert.equal(f.read(first.task.id).value.status,'quarantined');assert.equal(f.read(first.task.id).value.attempt.id,attempts[0]);
  assert.equal(f.read(first.task.id).value.result.termination_confirmed,false);
  await scheduler.tick();assert.equal(executor.jobs.length,4);executor.jobs[3].finish();await scheduler.drain();
});

test('a restarted scheduler holds detached admitted attempts instead of reexecuting',async t=>{
  const f=fixture(t),executor=controlledExecutor(),old=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  for(let i=0;i<3;i++)f.submit();await old.tick();
  const replacement=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  const before=executor.probes.length;await replacement.tick();
  assert.equal(executor.jobs.length,3);assert.equal(executor.probes.length,before);assert.equal((await replacement.status()).detached_slots,3);
  for(const job of executor.jobs)job.finish();await old.drain();
});

test('pause remains responsive and late successful output is quarantined',async t=>{
  const f=fixture(t),executor=controlledExecutor(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  const task=f.submit();await scheduler.tick();
  model.execute(f.ledger,f.founder,'company/pause',{operation_id:'pause',source_instruction:'Stop new work'});
  assert.equal((await scheduler.status()).paused,true);await scheduler.tick();assert.equal(executor.jobs[0].signal.aborted,true);
  executor.jobs[0].finish();await scheduler.drain();assert.equal(f.read(task.id).value.status,'quarantined');
});

test('revoked grant between readiness and admission consumes no native attempt',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor();
  executor.probe=async()=>{model.execute(f.ledger,f.founder,'grant/revoke',{operation_id:'revoke',grant_id:`grant-${f.owners[0]}`});return {available:true,authenticated:true};};
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  await scheduler.tick();assert.equal(executor.jobs.length,0);assert.equal(f.read(task.id).value.attempt,null);
});

test('changed required context aborts running work and cannot publish late results',async t=>{
  const f=fixture(t),executor=controlledExecutor();
  f.ledger.write('test.home','founder',tx=>tx.put('homes','global-rule',{status:'current',scope:'*',content:'Required original rule'},0));
  const task=f.submit(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});await scheduler.tick();
  f.ledger.write('test.change','founder',tx=>{const row=tx.get('homes','global-rule');return tx.put('homes',row.id,{...row.value,content:'Changed mandatory rule'},row.revision);});
  await scheduler.tick();assert.equal(executor.jobs[0].signal.aborted,true);executor.jobs[0].finish();await scheduler.drain();
  assert.equal(f.read(task.id).value.status,'quarantined');
});

test('fair principal rotation admits scarce independent review and preserves native provenance',async t=>{
  const f=fixture(t),executor=controlledExecutor(),[author,reviewer]=f.owners;
  const proposal=model.execute(f.ledger,{principal_id:author},'home/propose',{operation_id:'proposal',grant_id:`grant-${author}`,scope:'review-scope',home_id:'review-home',expected_revision:0,content:'Exact candidate'});
  for(let i=0;i<5;i++)f.submit(author);
  const review=f.submit(reviewer,{scope:'review-scope',stage:'review',role:'qa',review_of:{family:'proposals',id:proposal.id,revision:proposal.revision,sha256:proposal.sha256}});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});await scheduler.tick();
  assert.ok(executor.jobs.some(j=>j.task.id===review.id));
  for(const job of executor.jobs)job.finish();await scheduler.drain();
  const row=f.read(review.id);assert.equal(row.value.status,'returned');assert.ok(row.value.review_id);
  const receipt=f.ledger.read(tx=>tx.get('reviews',row.value.review_id));assert.equal(receipt.value.native_id,`native-${review.id}`);assert.equal(receipt.value.reviewer_principal_id,reviewer);
  assert.equal(receipt.value.termination_confirmed,true);assert.equal((await scheduler.status()).available_slots,3);
});

test('unbound native review cannot create a canonical Pass',async t=>{
  const f=fixture(t),executor=controlledExecutor(),[author,reviewer]=f.owners;
  const proposal=model.execute(f.ledger,{principal_id:author},'home/propose',{operation_id:'candidate',grant_id:`grant-${author}`,scope:'review',home_id:'candidate',content:'Exact candidate'});
  const task=f.submit(reviewer,{scope:'review',stage:'review',review_of:{family:'proposals',id:proposal.id,revision:proposal.revision,sha256:proposal.sha256}});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});await scheduler.tick();
  executor.jobs[0].finish({output:JSON.stringify({content:'Looks good',review:{verdict:'Pass',reason:'No exact subject'}})});await scheduler.drain();
  assert.equal(f.read(task.id).value.status,'failed');assert.equal(f.read(task.id).value.review_id,null);
});

test('unavailable native host does not block a different ready host',async t=>{
  const f=fixture(t,2,{hosts:{'cos-00':'codex','cos-01':'claude'}}),executor=controlledExecutor();
  f.submit(f.owners[0]);const ready=f.submit(f.owners[1]);
  executor.probe=async({host})=>({host,available:host==='claude',authenticated:host==='claude'});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});await scheduler.tick();
  assert.equal(executor.jobs.length,1);assert.equal(executor.jobs[0].task.id,ready.id);assert.equal(executor.jobs[0].task.value.host,'claude');
  executor.jobs[0].finish();await scheduler.drain();
});

test('a held expired-grant candidate does not block unrelated ready work',async t=>{
  const f=fixture(t),executor=controlledExecutor(),held=f.submit(f.owners[0]),ready=f.submit(f.owners[1]);
  model.execute(f.ledger,f.founder,'grant/revoke',{operation_id:'revoke-held',grant_id:`grant-${f.owners[0]}`});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});await scheduler.tick();
  assert.equal(executor.jobs.length,1);assert.equal(executor.jobs[0].task.id,ready.id);assert.equal(f.read(held.id).value.attempt,null);
  executor.jobs[0].finish();await scheduler.drain();
});

test('unchanged per-task holds do not append an admission receipt every idle tick',async t=>{
  const f=fixture(t),executor=controlledExecutor();f.submit(f.owners[0]);
  model.execute(f.ledger,f.founder,'grant/revoke',{operation_id:'revoke-cache',grant_id:`grant-${f.owners[0]}`});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  await scheduler.tick();const count=f.ledger.read(tx=>tx.count('commands',{principal_id:'software'}));
  for(let i=0;i<5;i++)await scheduler.tick();
  assert.equal(f.ledger.read(tx=>tx.count('commands',{principal_id:'software'})),count);assert.equal(executor.jobs.length,0);
  const ready=f.submit(f.owners[1]);await scheduler.tick();assert.equal(executor.jobs.length,1);assert.equal(executor.jobs[0].task.id,ready.id);
  executor.jobs[0].finish();await scheduler.drain();
});

test('native executor starts a fresh CLI session and retains exact immutable evidence',async t=>{
  const f=fixture(t),calls=[],output=JSON.stringify({content:'Exact native fixture output'});
  const executor=createNativeExecutor({cwd:f.root,evidence_dir:path.join(f.root,'evidence'),probe:async()=>({available:true,authenticated:true}),
    runner:async(...args)=>{calls.push(args);return {native_id:'observed-standalone-id',text:output,model_evidence:{source:'fixture'}};}});
  const result=await executor.execute({task:{id:'t',value:{role:'research',attempt:{native_id:'must-not-resume'}}},context:{text:'Exact supplied context',sha256:'a'.repeat(64)}});
  assert.equal(calls.length,1);assert.equal(calls[0][1],null);assert.match(calls[0][2],/fresh standalone/);
  assert.equal(result.native_id,'observed-standalone-id');assert.equal(result.termination_confirmed,true);
  assert.equal(fs.readFileSync(result.result_evidence.path,'utf8'),output);assert.equal(result.result_evidence.bytes,Buffer.byteLength(output));
  assert.deepEqual(result.result_evidence.persistence,{write_closed:true,readback_verified:true,file_fsync:process.permission?'unavailable_node_permission_model':'performed'});
});

test('oversized native output is retained and held rather than truncated into success',async t=>{
  const f=fixture(t),raw='x'.repeat(2048),executor=createNativeExecutor({cwd:f.root,evidence_dir:path.join(f.root,'evidence'),max_result_bytes:1024,
    runner:async()=>({native_id:'observed-id',text:raw}),probe:async()=>({available:true,authenticated:true})});
  const result=await executor.execute({task:{value:{role:'research'}},context:{text:'Bounded exact context'}});
  assert.equal(result.error.code,'PEER_OUTPUT_LIMIT');assert.equal(result.output,undefined);assert.equal(result.termination_confirmed,true);
  assert.equal(fs.readFileSync(result.result_evidence.path,'utf8'),raw);
  assert.deepEqual(result.result_evidence.persistence,{write_closed:true,readback_verified:true,file_fsync:process.permission?'unavailable_node_permission_model':'performed'});
});

test('conditional standalone adapter lifecycle remains uncertain after escalation and observes later close separately',async t=>{
  // This dummy task has no P1 admission. The actual Original adapter lifecycle
  // is conditional SOURCE mechanics only, never qualified Native peer execution.
  const child=new EventEmitter(),timers=new Map(),processes=[],closures=[];let clock=1000000,seq=0,captureOriginalSpawn;
  child.pid=4242;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>true;
  const f=createOriginalAdapterProcessFixture({host:'codex',child,now:()=>clock,onLaunch:(...args)=>{
    // The fixed executor observer receives the SAME child already selected by
    // the standard Node CP mock. It creates no second process or permission.
    assert.equal(typeof captureOriginalSpawn,'function');assert.equal(captureOriginalSpawn(...args),child);
  }});t.after(()=>f.dispose());
  const executor=createNativeExecutor({cwd:f.root,evidence_dir:path.join(f.root,'evidence'),now:()=>clock,spawn_process:()=>child,
    probe:async()=>({available:true,authenticated:true}),runner:(host,id,prompt,cwd,timeout,selection,options)=>{
      const {spawn,...incoming}=options;captureOriginalSpawn=spawn;
      return f.run(host,id,prompt,cwd,timeout,selection,{...incoming,resolveExecutable:()=>'/fictional/codex',now:()=>clock,
        setTimeout:(fn,delay)=>{const key=++seq;timers.set(key,{fn,at:clock+delay});return key;},clearTimeout:key=>timers.delete(key)});
    }});
  const resultPromise=executor.execute({task:{value:{role:'research'}},context:{text:'Exact fixture context'},onProcess:p=>processes.push(p),onClosure:p=>closures.push(p)});
  child.emit('spawn');assert.equal(processes[0].pid,4242);assert.ok(processes[0].execution_deadline_at);
  child.emit('error',new Error('Simulated process failure'));
  const kill=[...timers.values()].sort((a,b)=>a.at-b.at)[0];clock=kill.at;kill.fn();
  const result=await resultPromise;assert.equal(result.termination_confirmed,false);assert.equal(result.error.code,'ROLE_PROCESS_ERROR');assert.equal(closures.length,0);
  child.emit('close',null);assert.equal(closures.length,1);assert.equal(closures[0].termination_confirmed,true);
});

test('lost finish acknowledgement retries the same receipt without another execution',async t=>{
  const f=fixture(t),executor=controlledExecutor(),task=f.submit();let held=true;
  const original=f.ledger.write.bind(f.ledger),failure=new Error('Committed finish journal ACK unavailable');
  f.ledger.write=(type,principal,fn)=>{
    if(type==='p3.observation.ack'&&held&&f.read(task.id).value.result)throw failure;
    return original(type,principal,fn);
  };
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',observer:model.createRuntimeObserver(f.ledger,f.actor),executor});
  await scheduler.tick();executor.jobs[0].finish();await scheduler.drain();
  assert.equal(f.read(task.id).value.status,'returned');
  // A physically closed worker need not occupy a local execution entry while
  // its independent journal delivery remains durably held.
  const pendingFinish=taskJournal(f,task.id).find(row=>row.value.payload.action==='task/finish');
  assert.equal(pendingFinish.value.status,OBSERVATION_STATUS.held);
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'released');
  const committed=f.ledger.read(tx=>tx.list('commands',{principal_id:'software',limit:100}).items);
  assert.equal(committed.length,3);assert.equal(committed.filter(c=>c.value.action==='task/finish').length,1);
  held=false;await scheduler.tick();assert.equal(scheduler.inflight.size,0);assert.equal(executor.jobs.length,1);
  assert.equal(taskJournal(f,task.id).find(row=>row.id===pendingFinish.id).value.status,OBSERVATION_STATUS.ack);
  assert.deepEqual(f.ledger.read(tx=>tx.list('commands',{principal_id:'software',limit:100}).items),committed);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
});

// Previously authored stop-barrier appendix. Its four cases and substantive
// assertions are retained; ordinary source preparation supplies the required
// trusted observer capability. The earlier fixture metadata is adapted above.
import {peerFixture as stopBarrierFixture} from './peer-fixture.mjs';

function stopBarrierDeferred(){
  let resolve;const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
function stopBarrierSnapshot(ledger,id){
  return ledger.read(tx=>({
    task:tx.get('tasks',id),slot:tx.get('slots',id),
    effects:tx.list('effects',{task_id:id,limit:100}).items,
    claims:tx.list('claims',{task_id:id,limit:100}).items,
    commands:tx.list('commands',{principal_id:'scheduler',limit:100}).items,
    usage:tx.get('control','usage'),owner_usage:tx.get('control','usage:cos-a'),
    grant:tx.get('grants','stop-barrier-grant'),fairness:tx.get('control','fairness'),
    active_slots:tx.count('slots',{status:['active','unknown']})
  }));
}
function stopBarrierAssertCommit(ledger,state,admission){
  assert.ok(admission,'BOUNDARY_SETUP: real admission did not commit');
  assert.equal(admission.result.admitted,true);
  assert.deepEqual(state.task,admission.result.task);
  assert.equal(state.task.value.status,'running');
  const attempt=state.task.value.attempt;
  assert.equal(attempt.model_calls,1);assert.equal(attempt.termination_confirmed,false);
  assert.equal(attempt.process,undefined);assert.equal(attempt.process_observation,undefined);
  assert.equal(state.task.value.result,undefined);assert.equal(state.task.value.closure,undefined);
  assert.equal(state.active_slots,1);assert.equal(state.slot.value.status,'active');
  assert.equal(state.slot.value.attempt_id,attempt.id);assert.equal(state.slot.value.effect_id,attempt.effect_id);
  assert.equal(state.effects.length,1);const effect=state.effects[0];
  assert.equal(effect.id,attempt.effect_id);assert.equal(effect.value.kind,'native');
  assert.equal(effect.value.status,'reserved');assert.equal(effect.value.termination_confirmed,false);
  assert.equal(effect.value.request_sha256,attempt.request_sha256);
  assert.equal(effect.value.request.context_sha256,admission.result.context.sha256);
  assert.deepEqual(state.claims.map(row=>[row.value.task_id,row.value.principal_id,row.value.status,row.value.resource.key]),
    [[state.task.id,'cos-a','held','home:stop-barrier-resource']]);
  assert.equal(state.usage.value.model_calls,1);assert.equal(state.owner_usage.value.model_calls,1);
  assert.equal(state.grant.value.used_model_calls,1);assert.equal(state.fairness.value.last_principal_id,'cos-a');
  assert.equal(state.commands.length,1);const command=state.commands[0];
  assert.equal(command.id,model.digest(['peer-command-v1','scheduler',admission.args.operation_id]));
  assert.equal(command.revision,1);assert.equal(command.value.action,'task/admit');
  assert.equal(command.value.operation_id,admission.args.operation_id);
  const payload={...admission.args};delete payload.operation_id;
  assert.equal(command.value.request_sha256,model.digest({channel:'model',action:'task/admit',args:payload}));
  assert.deepEqual(command.value.result,admission.result);
  // This connection is different from the admission writer. Readback includes
  // immutable versions and the actual event, not a manufactured return value.
  ledger.read(tx=>{
    const event=tx.events({after:command.created_seq-1,limit:1}).items[0];
    assert.equal(event.seq,command.created_seq);assert.equal(event.type,'task/admit');
    assert.equal(event.principal_id,'scheduler');
    assert.ok(event.payload.events.some(item=>item.type==='dispatch_admitted'&&item.payload.task_id===state.task.id&&item.payload.attempt_id===attempt.id&&item.payload.effect_id===effect.id));
    for(const [family,row] of [['commands',command],['tasks',state.task],['slots',state.slot],['effects',effect]]){
      const reference={family,id:row.id,revision:row.revision,sha256:row.sha256};
      assert.deepEqual(tx.getVersion(reference).value,row.value);
      assert.ok(event.payload.changes.some(change=>change.family===family&&change.id===row.id&&change.revision===row.revision&&change.sha256===row.sha256));
    }
  });
}
function stopBarrierAssertNoPidHold(observer,readback,state){
  // A deliberately invalid controlled observation proves the existing API
  // supplies no no-PID settlement. It must commit neither receipt nor release.
  assert.throws(()=>observer.record('task/finish',{
    operation_id:'stop-barrier-no-pid',task_id:state.task.id,attempt_id:state.task.value.attempt.id,
    observed_process:null,termination_confirmed:false,
    error:{code:'CONTROLLED_NO_PROCESS',message:'No process identity was observed in this fixture'}
  }),error=>error.code==='PROCESS_INVALID','BOUNDARY_SETUP: protected no-PID rejection changed');
  assert.deepEqual(stopBarrierSnapshot(readback,state.task.id),state);
}
async function stopBarrierCase(t,boundary,stop){
  const f=stopBarrierFixture(),gate=stopBarrierDeferred(),entered=stopBarrierDeferred(),execution=stopBarrierDeferred();
  const trace=[],launches=[],admissions=[];let scheduler,ticking,readback,admissionCalls=0,probes=0,released=false;
  t.after(async()=>{
    scheduler?.stop();gate.resolve({host:'codex',available:true,authenticated:true});
    // Settle only the controlled JS promise after substantive assertions. No
    // output, native ID, PID, start or closure is invented to release capacity.
    execution.resolve({error:{code:'CONTROLLED_TEARDOWN',message:'Fixture ended without process evidence'},termination_confirmed:false});
    try{if(ticking)await ticking;if(scheduler)await scheduler.drain();}
    finally{readback?.close();f.close();}
  });
  const founder={principal_id:'founder'},owner={principal_id:'cos-a'};
  const resources=[{kind:'home',id:'stop-barrier-resource'}];
  model.execute(f.ledger,founder,'grant/create',{
    operation_id:'stop-barrier-grant',grant_id:'stop-barrier-grant',to_principal_id:'cos-a',scope:'stop-barrier-scope',
    actions:['task/submit','task/claim'],resources,expires_at:new Date(Date.now()+3600000).toISOString(),
    source_instruction:'Fictional bounded stop-barrier fixture authority',max_model_calls:2
  });
  const submitted=model.execute(f.ledger,owner,'task/submit',{
    operation_id:'stop-barrier-submit',task_id:'stop-barrier-task',grant_id:'stop-barrier-grant',scope:'stop-barrier-scope',
    role:'engineer',instructions:'Controlled scheduler barrier experiment',acceptance:'Preserve admission and stop ordering',resources
  });
  const pending=model.execute(f.ledger,owner,'task/claim',{operation_id:'stop-barrier-claim',task_id:submitted.id});
  const observer=model.createRuntimeObserver(f.ledger,{principal_id:'scheduler'});
  readback=new PeerLedger(f.root);
  const before=stopBarrierSnapshot(readback,pending.id);
  assert.equal(before.task.value.status,'pending');assert.equal(before.task.value.attempt,null);
  assert.equal(before.slot,null);assert.equal(before.effects.length,0);assert.equal(before.commands.length,0);
  assert.equal(before.usage,null);assert.equal(before.owner_usage,null);assert.equal(before.grant.value.used_model_calls,0);
  assert.equal(before.claims.length,1);assert.equal(before.claims[0].value.status,'held');
  const api={...model,execute(...args){
    if(args[2]!=='task/admit')return model.execute(...args);
    admissionCalls++;
    const result=model.execute(...args);
    if(result.admitted){
      admissions.push({args:structuredClone(args[3]),result});trace.push('admission-committed');
      if(boundary==='admission'){
        entered.resolve();
        // Actual P2 has already returned from its committing transaction. Only
        // delivery to the scheduler is delayed; the actual result is unchanged.
        return gate.promise.then(()=>result);
      }
    }
    return result;
  }};
  const executor={
    probe({host,task}){
      probes++;assert.equal(task.id,pending.id);assert.equal(host,'codex');
      if(boundary==='readiness'){trace.push('readiness-pending');entered.resolve();return gate.promise;}
      return Promise.resolve({host,available:true,authenticated:true});
    },
    execute(args){launches.push(args);trace.push('executor-start');return execution.promise;}
  };
  scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'scheduler',observer,executor,model:api,readiness_ms:0});
  ticking=scheduler.tick();
  const reached=await Promise.race([entered.promise.then(()=>true),ticking.then(()=>false)]);
  assert.equal(reached,true,'BOUNDARY_SETUP: tick ended before the selected barrier');
  assert.equal(released,false);assert.equal(probes,1);assert.equal(launches.length,0);
  const atBarrier=stopBarrierSnapshot(readback,pending.id);
  if(boundary==='readiness'){
    assert.equal(admissionCalls,0);assert.equal(admissions.length,0);
    assert.deepEqual(atBarrier,before,'BOUNDARY_SETUP: readiness already consumed admission');
  }else{
    assert.equal(admissionCalls,1);assert.equal(admissions.length,1);
    stopBarrierAssertCommit(readback,atBarrier,admissions[0]);
    stopBarrierAssertNoPidHold(observer,readback,atBarrier);
  }
  if(stop){
    const stopped=scheduler.stop();assert.equal(stopped.stopped,true);assert.equal(stopped.local_inflight,0);
    trace.push('stop-returned');
  }
  assert.deepEqual(trace,[boundary==='readiness'?'readiness-pending':'admission-committed',...(stop?['stop-returned']:[])],
    'BOUNDARY_SETUP: stop/commit ordering was not established before release');
  released=true;trace.push('gate-released');gate.resolve({host:'codex',available:true,authenticated:true});
  const tickResult=await ticking,after=stopBarrierSnapshot(readback,pending.id);
  t.diagnostic(JSON.stringify({boundary,stop,trace,admissionCalls,committed:admissions.length,launches:launches.length,
    active_slots:after.active_slots,model_calls:after.usage?.value.model_calls??0,tick:tickResult}));
  if(stop&&boundary==='readiness'){
    assert.deepEqual({admissionCalls,committed:admissions.length,launches:launches.length,slots:after.active_slots,calls:after.usage?.value.model_calls??0},
      {admissionCalls:0,committed:0,launches:0,slots:0,calls:0},
      'STOP_READINESS_BARRIER: releasing readiness after stop must not admit, charge or launch');
    assert.deepEqual(after,before,'STOP_READINESS_BARRIER: canonical state changed after stop');
  }else if(stop){
    // Frozen P2 has active/reserved labels at this boundary. With no process
    // evidence these remain unresolved; no unsupported unknown transition,
    // fabricated finish, cancellation release or accounting refund is applied.
    assert.deepEqual(after,atBarrier,'STOP_ADMISSION_ACCOUNTING: preserve the exact charged reservation without process evidence');
    assert.equal(launches.length,0,'STOP_COMMITTED_ADMISSION_BARRIER: stop before admission return must prevent executor launch');
  }else{
    assert.equal(admissionCalls,1);assert.equal(admissions.length,1);
    stopBarrierAssertCommit(readback,after,admissions[0]);
    if(boundary==='readiness')stopBarrierAssertNoPidHold(observer,readback,after);
    else assert.deepEqual(after,atBarrier);
    assert.equal(tickResult.admitted,1);assert.equal(launches.length,1,'CONTROL: exactly one controlled executor launch required');
    assert.deepEqual(launches[0].task,admissions[0].result.task);
    assert.deepEqual(launches[0].context,admissions[0].result.context);
    assert.equal(launches[0].signal.aborted,false);
    assert.ok(trace.indexOf('executor-start')>trace.indexOf('gate-released'));
    assert.ok(trace.indexOf('executor-start')>trace.indexOf('admission-committed'));
  }
}

test('stop barrier: pending readiness cannot admit or launch after stop',{timeout:10000},t=>stopBarrierCase(t,'readiness',true));
test('stop barrier control: readiness release commits and launches once',{timeout:10000},t=>stopBarrierCase(t,'readiness',false));
test('stop barrier: stop after committed admission preserves charge and prevents launch',{timeout:10000},t=>stopBarrierCase(t,'admission',true));
test('stop barrier control: committed admission release launches exactly once',{timeout:10000},t=>stopBarrierCase(t,'admission',false));

// Ordinary external source-preparation regressions. These exercise real accepted
// P1/P2/journal state with controlled JS execution; they are not native evidence.
function preparedScheduler(f,executor,extra={}){
  return new PeerScheduler({ledger:f.ledger,principal_id:f.actor.principal_id,
    observer:model.createRuntimeObserver(f.ledger,f.actor),executor,...extra});
}
function taskJournal(f,id){
  return f.ledger.read(tx=>tx.list('work_items',{scope:'p3-runtime-observation-v1',principal_id:f.actor.principal_id,task_id:id,limit:100}).items)
    .sort((a,b)=>a.value.payload.ordinal-b.value.payload.ordinal);
}
function controlledProcess(pid=7001,closed=false){return {pid,started_at:'2026-01-01T00:00:00.000Z',close_observed:closed};}
function manualAdmission(f,task,operation){
  const result=model.execute(f.ledger,f.actor,'task/admit',{operation_id:operation,task_id:task.id});
  assert.equal(result.admitted,true);return result.task;
}

test('lost admission return reconciles its original real command without a second charge or launch',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),operations=[];let lost=false;
  const api={...model,execute(...args){
    if(args[2]==='task/admit')operations.push(args[3].operation_id);
    const result=model.execute(...args);
    if(args[2]==='task/admit'&&result.admitted&&!lost){lost=true;throw new Error('Actual admission committed before return loss');}
    return result;
  }};
  const scheduler=preparedScheduler(f,executor,{model:api});
  for(let i=0;i<3&&executor.jobs.length===0;i++)await scheduler.tick();
  assert.equal(lost,true);assert.equal(executor.jobs.length,1);assert.equal(new Set(operations).size,1);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
  assert.equal(f.ledger.read(tx=>tx.list('commands',{principal_id:'software',limit:100}).items.filter(c=>c.value.action==='task/admit').length),1);
  assert.equal(executor.jobs[0].task.value.attempt.id,f.read(task.id).value.attempt.id);
  executor.jobs[0].finish();await scheduler.drain();
  await scheduler.tick();assert.equal(executor.jobs.length,1);assert.equal(f.read(task.id).value.status,'returned');
});

test('identical process callbacks coalesce and a later close preserves the first unknown finish',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),scheduler=preparedScheduler(f,executor);
  await scheduler.tick();const job=executor.jobs[0];job.onProcess({...job.observed_process});
  job.finish({output:'original partial output',error:{code:'UNKNOWN',message:'Original uncertain return'},termination_confirmed:false});
  await scheduler.drain();const first=f.read(task.id),original=structuredClone(first.value.result);
  assert.equal(first.value.status,'unknown');assert.equal(original.termination_confirmed,false);
  const evidence=f.ledger.read(tx=>tx.list('work_items',{scope:'p3-runtime-evidence-v1',task_id:task.id,limit:100}).items);assert.ok(evidence.length>0);
  assert.deepEqual(taskJournal(f,task.id).map(r=>r.value.payload.action),['task/process','task/finish']);
  job.onClosure({...job.observed_process,close_observed:true});await scheduler.drain();
  const closed=f.read(task.id);assert.deepEqual(closed.value.result,original);assert.equal(closed.value.closure.termination_confirmed,true);
  assert.equal(closed.value.attempt.id,first.value.attempt.id);assert.equal(closed.value.status,'quarantined');
  const rows=taskJournal(f,task.id);assert.deepEqual(rows.map(r=>r.value.payload.action),['task/process','task/finish','task/closure']);
  assert.ok(rows.every(r=>r.value.status===OBSERVATION_STATUS.ack));
  for(const row of evidence)assert.deepEqual(f.ledger.read(tx=>tx.get('work_items',row.id)),row,'A later current readback must preserve the first immutable persistence observation');
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
});

test('conflicting process identity cannot replace an earlier accepted process packet',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),scheduler=preparedScheduler(f,executor);
  await scheduler.tick();const job=executor.jobs[0];
  job.onProcess({...job.observed_process,pid:99999});
  job.finish({error:{code:'UNCERTAIN',message:'Conflicting callback'},termination_confirmed:false});await scheduler.drain();
  const rows=taskJournal(f,task.id),process=rows.find(r=>r.value.payload.action==='task/process');
  assert.ok(process);assert.deepEqual(process.value.payload.args.observed_process,job.observed_process);
  assert.equal(rows.filter(r=>r.value.payload.action==='task/process').length,1);
  assert.ok(rows.every(r=>r.value.payload.args.observed_process?.pid!==99999));
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status!=='released',true);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
});

test('a no-PID executor result stays charged and occupied without manufactured settlement',async t=>{
  const f=fixture(t),task=f.submit();let executions=0;
  const executor={probe:async()=>({available:true,authenticated:true}),execute:async()=>{
    executions++;return {error:{code:'NO_CHILD',message:'No PID or start was observed'},termination_confirmed:true};
  }};
  const scheduler=preparedScheduler(f,executor);await scheduler.tick();await scheduler.drain();
  assert.equal(executions,1);assert.equal(f.read(task.id).value.result,undefined);
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'active');
  const effectId=f.read(task.id).value.attempt.effect_id;
  assert.equal(f.ledger.read(tx=>tx.get('effects',effectId)).value.status,'reserved');
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
  const rows=taskJournal(f,task.id);assert.equal(rows.length,0,'Do not send a knowingly invalid no-PID protected observation');
  const retained=f.ledger.read(tx=>tx.list('work_items',{scope:'p3-runtime-evidence-v1',task_id:task.id,limit:100}).items.find(row=>row.value.kind==='result'));
  assert.ok(retained,'No-PID output must remain durably inspectable even when no valid observation can be enqueued');
  const evidence=fs.readFileSync(retained.value.evidence.path);
  assert.equal(createHash('sha256').update(evidence).digest('hex'),retained.value.evidence.sha256);
  const raw=JSON.parse(evidence).payload;assert.equal(raw.error.code,'NO_CHILD');assert.equal(raw.termination_confirmed,true);
  const fresh=preparedScheduler(f,executor);await fresh.tick();assert.equal(executions,1);assert.equal((await fresh.status()).detached_slots,1);
});

test('cold scheduler reconciles a committed finish after durable journal ACK failure without probing or respawning',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor();let fail=true;
  const write=f.ledger.write.bind(f.ledger),failure=new Error('Finish ACK storage unavailable');
  f.ledger.write=(kind,principal,fn)=>{if(kind==='p3.observation.ack'&&fail&&f.read(task.id).value.result)throw failure;return write(kind,principal,fn);};
  const scheduler=preparedScheduler(f,executor);await scheduler.tick();executor.jobs[0].finish();await scheduler.drain();scheduler.stop();
  const returned=f.read(task.id),commands=f.ledger.read(tx=>tx.list('commands',{principal_id:'software',limit:100}).items);
  assert.equal(returned.value.status,'returned');assert.equal(taskJournal(f,task.id).at(-1).value.status,OBSERVATION_STATUS.held);
  fail=false;const freshLedger=new PeerLedger(f.root),freshFixture={...f,ledger:freshLedger};let probes=0,launches=0;
  try{
    const replacement=preparedScheduler(freshFixture,{probe:async()=>{probes++;throw Error('No probe for completed work');},execute:async()=>{launches++;throw Error('No respawn');}});
    await replacement.tick();await replacement.drain();
    assert.equal(probes,0);assert.equal(launches,0);assert.deepEqual(f.read(task.id),returned);
    assert.deepEqual(f.ledger.read(tx=>tx.list('commands',{principal_id:'software',limit:100}).items),commands);
    assert.ok(taskJournal(f,task.id).every(r=>r.value.status===OBSERVATION_STATUS.ack));
  }finally{freshLedger.close();}
});

test('cooperative readiness traversal reaches work beyond one hundred unavailable candidates',async t=>{
  // cos-99 is lexically last among these 112 real principals. Every earlier
  // candidate uses the unavailable Codex host; only that last principal uses
  // the ready Claude host. This permits host-readiness caching optimizations.
  const f=fixture(t,112,{budget:200,hosts:{'cos-99':'claude'}}),executor=controlledExecutor();
  const blocked=f.owners.filter(owner=>owner!=='cos-99').map(owner=>f.submit(owner)),ready=f.submit('cos-99');
  executor.probe=async({host})=>({host,available:host==='claude',authenticated:host==='claude'});
  const scheduler=preparedScheduler(f,executor,{readiness_ms:0});
  for(let i=0;i<5&&executor.jobs.length===0;i++)await scheduler.tick();
  assert.equal(executor.jobs.length,1);assert.equal(executor.jobs[0].task.id,ready.id);assert.equal(executor.jobs[0].task.value.host,'claude');
  assert.ok(blocked.every(task=>f.read(task.id).value.attempt===null));
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
  executor.jobs[0].finish();await scheduler.drain();
});

test('a held journal prefix cannot starve later independent durable delivery during cold recovery',async t=>{
  const f=fixture(t,1,{budget:200}),observer=model.createRuntimeObserver(f.ledger,f.actor),journal=createObservationJournal({ledger:f.ledger,principal_id:'software',observer});
  for(let i=0;i<101;i++){
    const task=manualAdmission(f,f.submit(undefined,{task_id:`aa-held-${String(i).padStart(3,'0')}`}),`seed-admit-${i}`);
    const entry=journal.enqueue({action:'task/process',args:{operation_id:`seed-process-${i}`,task_id:task.id,attempt_id:task.value.attempt.id,observed_process:null}});
    assert.equal(journal.deliver(entry.id).acknowledged,false);
    observer.record('task/finish',{operation_id:`seed-finish-${i}`,task_id:task.id,attempt_id:task.value.attempt.id,observed_process:controlledProcess(8000+i,true),termination_confirmed:true,error:{message:'Controlled closed fixture'},output:'Retained fixture output'});
  }
  const firstPage=journal.inspectPending({limit:100});assert.equal(firstPage.items.length,100);assert.equal(firstPage.total,101);assert.equal(firstPage.complete,false);
  const lastPage=journal.inspectPending({limit:100,cursor:firstPage.next_cursor});assert.equal(lastPage.items.length,1);
  const maxId=lastPage.items[0].id;let operation;
  for(let i=0;i<100000;i++){
    const candidate=`independent-finish-${i}`,id=OBSERVATION_PREFIX+model.digest([OBSERVATION_PROTOCOL,f.ledger.company_id,'software',candidate]);
    if(id>maxId){operation=candidate;break;}
  }
  assert.ok(operation,'Find a deterministic independent event after the entire held prefix');
  const task=manualAdmission(f,f.submit(undefined,{task_id:'zz-independent'}),'independent-admit');
  const event=journal.enqueue({action:'task/finish',args:{operation_id:operation,task_id:task.id,attempt_id:task.value.attempt.id,observed_process:controlledProcess(9001,true),termination_confirmed:true,native_id:'independent-fixture-native',output:'Exact independent result'}});
  assert.ok(event.id>maxId);assert.equal(journal.inspectPending({limit:100}).items.some(row=>row.id===event.id),false);
  let launches=0,probes=0;
  const scheduler=preparedScheduler(f,{probe:async()=>{probes++;return {available:true,authenticated:true};},execute:async()=>{launches++;throw Error('Detached admission must not respawn');}});
  for(let i=0;i<5&&journal.get(event.id).value.status!==OBSERVATION_STATUS.ack;i++)await scheduler.tick();
  assert.equal(journal.get(event.id).value.status,OBSERVATION_STATUS.ack);assert.equal(f.read(task.id).value.status,'returned');
  assert.equal(probes,0);assert.equal(launches,0);
  assert.equal(f.ledger.read(tx=>tx.count('work_items',{scope:'p3-runtime-observation-v1',principal_id:'software',status:OBSERVATION_STATUS.held})),101);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,102);
});

test('escaped finite output is preserved exactly through actual journal serialization',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),raw='\u0000'.repeat(48000),scheduler=preparedScheduler(f,executor);
  await scheduler.tick();executor.jobs[0].finish({output:raw});await scheduler.drain();
  const returned=f.read(task.id);assert.equal(returned.value.status,'returned');assert.equal(returned.value.result.output,raw);
  const finish=taskJournal(f,task.id).find(row=>row.value.payload.action==='task/finish');
  assert.equal(finish.value.payload.args.output,raw);assert.equal(finish.value.status,OBSERVATION_STATUS.ack);
  assert.ok(Buffer.byteLength(canonical(finish.value))>128000);assert.ok(Buffer.byteLength(canonical(finish.value))<=1000000);
});

test('one task observer failure retains its reservation without blocking independent finish delivery',async t=>{
  const f=fixture(t),first=f.submit(f.owners[0]),second=f.submit(f.owners[1]),executor=controlledExecutor();
  const cause=new Error('Scoped original provider cause'),inner=Object.assign(new Error('Scoped inner provider failure'),{code:'PROCESS_INVALID'});
  const actual=model.createRuntimeObserver(f.ledger,f.actor),failure=new AggregateError([inner],'Scoped finish persistence failure',{cause});
  const observer=Object.freeze({record(action,args){if(action==='task/finish'&&args.task_id===first.id)throw failure;return actual.record(action,args);}});
  const scheduler=preparedScheduler(f,executor,{observer});await scheduler.tick();
  for(const job of executor.jobs)job.finish();await scheduler.drain();
  assert.equal(f.read(first.id).value.result,undefined);assert.equal(f.read(second.id).value.status,'returned');
  assert.equal(f.ledger.read(tx=>tx.get('slots',first.id)).value.status,'active');
  assert.equal(f.ledger.read(tx=>tx.get('slots',second.id)).value.status,'released');
  assert.equal(taskJournal(f,first.id).at(-1).value.status,OBSERVATION_STATUS.held);
  assert.equal(taskJournal(f,second.id).at(-1).value.status,OBSERVATION_STATUS.ack);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,2);
  assert.ok(scheduler.errors.includes(failure));assert.equal(failure.cause,cause);assert.equal(failure.errors[0],inner);
});

test('a close observed behind a held unknown finish remains durable across scheduler replacement',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),actual=model.createRuntimeObserver(f.ledger,f.actor);let hold=true;
  const failure=new Error('Original finish provider unavailable');
  const observer=Object.freeze({record(action,args){if(action==='task/finish'&&hold)throw failure;return actual.record(action,args);}});
  const scheduler=preparedScheduler(f,executor,{observer});await scheduler.tick();const job=executor.jobs[0];
  job.finish({output:'original durable partial output',error:{code:'UNKNOWN',message:'Original unknown result'},termination_confirmed:false});await scheduler.drain();
  const original=structuredClone(taskJournal(f,task.id).find(r=>r.value.payload.action==='task/finish').value.payload);
  const evidence=f.ledger.read(tx=>tx.list('work_items',{scope:'p3-runtime-evidence-v1',task_id:task.id,limit:100}).items);assert.ok(evidence.length>0);
  assert.equal(original.args.termination_confirmed,false);assert.equal(f.read(task.id).value.result,undefined);
  job.onClosure({...job.observed_process,close_observed:true});await scheduler.drain();scheduler.stop();
  const pending=taskJournal(f,task.id);assert.deepEqual(pending.map(r=>r.value.payload.action),['task/process','task/finish','task/closure']);
  assert.deepEqual(pending[1].value.payload,original);assert.equal(pending[2].value.payload.predecessor_event_id,pending[1].id);
  hold=false;const ledger=new PeerLedger(f.root);let launches=0;
  try{
    const replacement=preparedScheduler({...f,ledger},{probe:async()=>{throw Error('No probe for detached observed work');},execute:async()=>{launches++;throw Error('No repeat execution');}});
    for(let i=0;i<3;i++)await replacement.tick();await replacement.drain();
    const result=f.read(task.id).value;assert.equal(launches,0);assert.equal(result.status,'quarantined');
    assert.equal(result.result.output,original.args.output);assert.deepEqual(result.result.error,original.args.error);
    assert.equal(result.result.termination_confirmed,false);assert.equal(result.closure.termination_confirmed,true);
    assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'released');
    assert.ok(taskJournal(f,task.id).every(r=>r.value.status===OBSERVATION_STATUS.ack));
    for(const row of evidence)assert.deepEqual(f.ledger.read(tx=>tx.get('work_items',row.id)),row,'Recovery must preserve the first immutable persistence observation');
    assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
  }finally{ledger.close();}
});

test('complete auxiliary result evidence remains hash-bound and inspectable after cold restart',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),scheduler=preparedScheduler(f,executor);
  const raw='exact auxiliary raw evidence\n\u0000"\\',file=path.join(f.root,'original-result.txt');
  fs.writeFileSync(file,raw);
  const resultEvidence={protocol:'controlled-result-v1',path:file,sha256:model.digest(raw),bytes:Buffer.byteLength(raw)};
  const modelEvidence={source:'controlled-fixture',nested:{marker:'original-model-evidence',values:[false,0,'\u0000"\\']}};
  const rejectedOutput={reason:'retained diagnostic only',evidence:resultEvidence,marker:'original-rejected-evidence'};
  await scheduler.tick();executor.jobs[0].finish({model_evidence:modelEvidence,result_evidence:resultEvidence,rejected_output:rejectedOutput});await scheduler.drain();
  const read=ledger=>ledger.read(tx=>tx.list('work_items',{scope:'p3-runtime-evidence-v1',task_id:task.id,limit:100}).items);
  const retained=read(f.ledger),result=retained.find(row=>row.value.kind==='result');assert.ok(result);
  assert.equal(result.value.protocol,'p3-runtime-evidence-v1');assert.equal(result.value.status,'retained');
  assert.equal(result.value.principal_id,'software');assert.equal(result.value.attempt_id,f.read(task.id).value.attempt.id);
  const bytes=fs.readFileSync(result.value.evidence.path),envelope=JSON.parse(bytes);
  assert.equal(bytes.length,result.value.evidence.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),result.value.evidence.sha256);
  assert.equal(bytes.toString(),canonical(envelope));
  assert.equal(envelope.company_id,f.ledger.company_id);assert.equal(envelope.principal_id,'software');
  assert.equal(envelope.task_id,task.id);assert.equal(envelope.attempt_id,result.value.attempt_id);assert.equal(envelope.kind,'result');
  const payload=canonical(envelope.payload);
  for(const expected of [modelEvidence,resultEvidence,rejectedOutput])assert.ok(payload.includes(canonical(expected)),'Retain the complete original diagnostic object');
  assert.equal(fs.readFileSync(file,'utf8'),raw);
  const freshLedger=new PeerLedger(f.root);let launches=0,probes=0;
  try{
    const replacement=preparedScheduler({...f,ledger:freshLedger},{probe:async()=>{probes++;throw Error('No readiness for completed evidence');},execute:async()=>{launches++;throw Error('Evidence cannot authorize launch');}});
    await replacement.tick();assert.equal(launches,0);assert.equal(probes,0);assert.deepEqual(read(freshLedger),retained);
    assert.deepEqual(fs.readFileSync(result.value.evidence.path),bytes);
  }finally{freshLedger.close();}
});

test('a provider exception with a hold-like code is not cached as a semantic task rejection',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),requests=[];
  const api={...model,execute(...args){if(args[2]==='task/admit')requests.push(structuredClone(args[3]));return model.execute(...args);}};
  const scheduler=preparedScheduler(f,executor,{model:api});
  const cause=new Error('Original command lookup cause'),failure=Object.assign(new Error('Actual P1 command lookup failed',{cause}),{code:'RESOURCE_BUSY'});
  const query=f.ledger.query.bind(f.ledger);let armed=true;
  f.ledger.query=(sql,...rest)=>{
    const statement=query(sql,...rest);
    if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='get')return (...args)=>{if(armed&&args[0]==='commands'){armed=false;throw failure;}return target.get(...args);};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  try{await scheduler.tick();}finally{f.ledger.query=query;}
  assert.equal(armed,false);assert.ok(executor.jobs.length<=1);
  assert.ok(scheduler.errors.includes(failure));assert.equal(failure.cause,cause);
  await scheduler.tick();assert.equal(executor.jobs.length,1);assert.equal(executor.jobs[0].task.id,task.id);
  assert.ok(requests.length>0);assert.ok(requests.every(request=>canonical(request)===canonical(requests[0])),'Any live retry uses the exact original admission request');
  assert.equal(f.ledger.read(tx=>tx.list('commands',{principal_id:'software',limit:100}).items.filter(row=>row.value.action==='task/admit').length),1);
  executor.jobs[0].finish();await scheduler.drain();assert.equal(f.read(task.id).value.status,'returned');
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
});

test('result retention failure holds charged work then recovers the original outcome without rerunning',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),directory=path.join(f.root,'retention-fault-evidence');
  const scheduler=preparedScheduler(f,executor,{evidence_dir:directory});await scheduler.tick();
  // Process evidence has its own real committed journal proof before the result
  // storage fault. Only actual opens beneath this fixture directory can fail.
  await scheduler.inflight.values().next().value.chain;
  assert.equal(taskJournal(f,task.id)[0].value.status,OBSERVATION_STATUS.ack);
  const open=fs.openSync,cause=new Error('Original controlled retention cause'),failure=Object.assign(new Error('Result evidence open failed',{cause}),{code:'EIO'});
  const output='Exact result survives failed evidence retention',metadata={trace:'must-survive-retention-failure',nested:[0,false,'\u0000']};
  let failures=0;
  fs.openSync=function(file,flags,...rest){
    if(typeof file==='string'&&file.startsWith(directory+path.sep)&&flags==='wx'){failures++;throw failure;}
    return Reflect.apply(open,this,[file,flags,...rest]);
  };
  try{
    executor.jobs[0].finish({output,model_evidence:metadata});await scheduler.drain();
    assert.ok(failures>0);assert.ok(scheduler.errors.includes(failure));assert.equal(failure.cause,cause);
    assert.equal(f.read(task.id).value.result,undefined);assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'active');
    assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
    assert.equal(executor.jobs.length,1);
  }finally{fs.openSync=open;}
  await scheduler.tick();await scheduler.drain();
  assert.equal(executor.jobs.length,1);assert.equal(f.read(task.id).value.status,'returned');assert.equal(f.read(task.id).value.result.output,output);
  const retained=f.ledger.read(tx=>tx.list('work_items',{scope:'p3-runtime-evidence-v1',task_id:task.id,limit:100}).items.find(row=>row.value.kind==='result'));
  assert.ok(retained);const bytes=fs.readFileSync(retained.value.evidence.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),retained.value.evidence.sha256);
  assert.ok(canonical(JSON.parse(bytes).payload).includes(canonical(metadata)));
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'released');
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
});

test('cancelled task labels do not hide unknown slots or authorize a replacement launch',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),scheduler=preparedScheduler(f,executor);
  await scheduler.tick();const job=executor.jobs[0];
  job.finish({output:'original uncertain cancelled output',error:{code:'UNKNOWN',message:'Process closure not observed'},termination_confirmed:false});
  await scheduler.drain();const original=structuredClone(f.read(task.id).value.result);
  assert.equal(original.termination_confirmed,false);
  model.execute(f.ledger,f.founder,'task/cancel',{operation_id:'cancel-uncertain-task',task_id:task.id,reason:'Stop further business work'});
  assert.equal(f.read(task.id).value.status,'cancelled');assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'unknown');
  const ledger=new PeerLedger(f.root);let probes=0,launches=0;
  try{
    const replacement=preparedScheduler({...f,ledger},{probe:async()=>{probes++;throw Error('No cancelled task probe');},execute:async()=>{launches++;throw Error('No cancelled task relaunch');}});
    await replacement.tick();const status=await replacement.status();
    assert.equal(status.active_slots,1);assert.equal(status.detached_slots,1);assert.equal(probes,0);assert.equal(launches,0);
    assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
    job.onClosure({...job.observed_process,close_observed:true});await scheduler.drain();await replacement.tick();
    assert.equal(f.read(task.id).value.status,'cancelled');assert.deepEqual(f.read(task.id).value.result,original);
    assert.equal(f.read(task.id).value.closure.termination_confirmed,true);assert.equal((await replacement.status()).active_slots,0);
    assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'released');
    assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);assert.equal(launches,0);
  }finally{ledger.close();}
});

test('native executor retention failure preserves the complete successful runner result and original failure',async t=>{
  const f=fixture(t),directory=path.join(f.root,'native-retention-fault'),cause=new Error('Original native evidence cause');
  const failure=Object.assign(new Error('Native raw evidence open failed',{cause}),{code:'EIO'});
  const original={native_id:'controlled-successful-native',text:canonical({content:'Exact successful raw output\u0000🙂'}),
    model_evidence:{marker:'complete-native-model-evidence',nested:[false,0,'\u0000🙂']},extra_diagnostic:{marker:'complete-original-success-result'}};
  let calls=0;const executor=createNativeExecutor({cwd:f.root,evidence_dir:directory,probe:async()=>({available:true,authenticated:true}),runner:async()=>{calls++;return original;}});
  const open=fs.openSync;
  fs.openSync=function(file,flags,...rest){if(typeof file==='string'&&file.startsWith(directory+path.sep)&&flags==='wx')throw failure;return Reflect.apply(open,this,[file,flags,...rest]);};
  let result;
  try{result=await executor.execute({task:{value:{role:'research'}},context:{text:'Controlled exact runner context'}});}finally{fs.openSync=open;}
  assert.equal(calls,1);assert.equal(result.original_error,failure);assert.equal(result.original_error.cause,cause);
  assert.deepEqual(result.original_result,original);assert.deepEqual(result.model_evidence,original.model_evidence);
  assert.equal(result.raw_output,original.text);assert.equal(result.native_id,original.native_id);
  assert.equal(result.result_evidence,undefined);assert.equal(result.error.code,'EIO');
});

for(const mode of ['oversized-error','local-retention-failure'])test('cold journal recovery isolates '+mode+' diagnostics from an independent valid delivery',async t=>{
  const f=fixture(t),first=manualAdmission(f,f.submit(undefined,{task_id:'aa-diagnostic-hold'}),'diagnostic-first-admit');
  const second=manualAdmission(f,f.submit(undefined,{task_id:'zz-independent-delivery'}),'diagnostic-second-admit');
  const actual=model.createRuntimeObserver(f.ledger,f.actor),cause=new Error('Original diagnostic provider cause');
  const original=new Error(mode==='oversized-error'?'x'.repeat(1050000):'Original local diagnostic failure',{cause});
  const observer=Object.freeze({record(action,args){if(args.task_id===first.id)throw original;return actual.record(action,args);}});
  const journal=createObservationJournal({ledger:f.ledger,principal_id:'software',observer});
  const held=journal.enqueue({action:'task/process',args:{operation_id:'diagnostic-held-process',task_id:first.id,attempt_id:first.value.attempt.id,observed_process:controlledProcess(9200)}});
  const ready=journal.enqueue({action:'task/finish',args:{operation_id:'diagnostic-ready-finish',task_id:second.id,attempt_id:second.value.attempt.id,observed_process:controlledProcess(9201,true),termination_confirmed:true,native_id:'independent-diagnostic-native',output:'Independent exact output'}});
  const directory=path.join(f.root,'isolated-diagnostics'),scheduler=preparedScheduler(f,{probe:async()=>{throw Error('No probe for admitted work');},execute:async()=>{throw Error('No relaunch');}},{observer,evidence_dir:directory});
  const open=fs.openSync;let failures=0;
  if(mode==='local-retention-failure')fs.openSync=function(file,flags,...rest){if(typeof file==='string'&&file.startsWith(directory+path.sep)&&flags==='wx'){failures++;throw Object.assign(new Error('Scoped diagnostic file failed'),{code:'EIO'});}return Reflect.apply(open,this,[file,flags,...rest]);};
  try{await scheduler.tick();}finally{fs.openSync=open;}
  assert.equal(journal.get(held.id).value.status,OBSERVATION_STATUS.held);
  assert.equal(journal.get(ready.id).value.status,OBSERVATION_STATUS.ack);assert.equal(f.read(second.id).value.status,'returned');
  assert.ok(scheduler.errors.includes(original));assert.equal(original.cause,cause);
  assert.ok(scheduler.errors.some(error=>error.code===(mode==='oversized-error'?'PEER_EVIDENCE_LIMIT':'EIO')));
  if(mode==='local-retention-failure')assert.ok(failures>0);
  assert.equal(f.ledger.read(tx=>tx.get('slots',first.id)).value.status,'active');
  assert.equal(f.ledger.read(tx=>tx.get('slots',second.id)).value.status,'released');
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,2);
});

for(const variant of ['revised-command','altered-context'])test('lost admission ACK refuses '+variant+' appended through real P1 before launch',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor();let originalCommand,rewritten,admission,lost;
  const api={...model,execute(...args){
    const result=model.execute(...args);
    if(args[2]==='task/admit'&&result.admitted&&!admission){
      admission=result;const id=model.digest(['peer-command-v1','software',args[3].operation_id]);
      originalCommand=f.ledger.read(tx=>tx.get('commands',id));
      rewritten=f.ledger.write('fixture.unrelated-admission-rewrite','founder',tx=>{
        const current=tx.get('commands',id),value=structuredClone(current.value);
        if(variant==='altered-context')value.result.context.text+='\nUnbound replacement instructions';
        else value.created_at='2026-01-02T00:00:00.000Z';
        return tx.put('commands',id,value,current.revision);
      });
      lost=new Error('Real admission committed before return loss');throw lost;
    }
    return result;
  }};
  const scheduler=preparedScheduler(f,executor,{model:api});await scheduler.tick();await scheduler.drain();
  assert.ok(admission);assert.equal(rewritten.revision,2);assert.equal(executor.jobs.length,0);
  assert.ok(scheduler.errors.includes(lost));assert.ok(scheduler.errors.some(error=>error.code==='ADMISSION_RECEIPT'));
  f.ledger.read(tx=>assert.deepEqual(tx.getVersion({family:'commands',id:originalCommand.id,revision:1,sha256:originalCommand.sha256}).value,originalCommand.value));
  assert.equal(f.read(task.id).value.attempt.id,admission.task.value.attempt.id);assert.equal(f.read(task.id).value.result,undefined);
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'active');assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
  const replacement=preparedScheduler(f,executor);await replacement.tick();assert.equal(executor.jobs.length,0);assert.equal((await replacement.status()).detached_slots,1);
});

for(const change of ['pause','grant-revoke','applicable-context'])test('post-admission '+change+' prevents launch while preserving the committed charge',{timeout:10000},async t=>{
  const f=fixture(t),executor=controlledExecutor(),entered=stopBarrierDeferred(),release=stopBarrierDeferred();
  if(change==='applicable-context')f.ledger.write('fixture.original-global-rule','founder',tx=>tx.put('homes','post-admit-rule',{status:'current',scope:'*',content:'Original applicable constraint'},0));
  const task=f.submit();let admission;
  const api={...model,execute(...args){const result=model.execute(...args);if(args[2]==='task/admit'&&result.admitted){admission=result;entered.resolve();return release.promise.then(()=>result);}return result;}};
  const scheduler=preparedScheduler(f,executor,{model:api}),ticking=scheduler.tick();
  assert.equal(await Promise.race([entered.promise.then(()=>true),ticking.then(()=>false)]),true,'BOUNDARY_SETUP: actual admission must commit before the mutation');
  assert.equal(executor.jobs.length,0);assert.equal(f.read(task.id).value.attempt.id,admission.task.value.attempt.id);
  if(change==='pause')model.execute(f.ledger,f.founder,'company/pause',{operation_id:'post-admit-pause',source_instruction:'Pause before physical execution'});
  else if(change==='grant-revoke')model.execute(f.ledger,f.founder,'grant/revoke',{operation_id:'post-admit-revoke',grant_id:`grant-${f.owners[0]}`});
  else f.ledger.write('fixture.changed-global-rule','founder',tx=>{const old=tx.get('homes','post-admit-rule');return tx.put('homes',old.id,{...old.value,content:'Changed applicable constraint'},old.revision);});
  release.resolve();await ticking;await scheduler.drain();assert.equal(executor.jobs.length,0);
  assert.equal(f.read(task.id).value.result,undefined);assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'active');
  assert.equal(f.ledger.read(tx=>tx.get('effects',admission.task.value.attempt.effect_id)).value.status,'reserved');
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
  assert.equal(f.ledger.read(tx=>tx.get('control',`usage:${f.owners[0]}`)).value.model_calls,1);
  assert.equal(f.ledger.read(tx=>tx.get('grants',`grant-${f.owners[0]}`)).value.used_model_calls,1);
});

function publishQualifiedUnrelatedHome(f,sequence){
  const author=f.owners[0],reviewer=f.owners[sequence],home=f.ledger.read(tx=>tx.get('homes','candidate'));
  const proposal=model.execute(f.ledger,{principal_id:author},'home/propose',{operation_id:`qualified-proposal-${sequence}`,grant_id:`grant-${author}`,scope:'unrelated-qualified-scope',home_id:'candidate',expected_revision:home?.revision??0,content:{text:`Independently accepted unrelated fact ${sequence}`}});
  const subject={family:'proposals',id:proposal.id,revision:proposal.revision,sha256:proposal.sha256};
  const task=manualAdmission(f,f.submit(reviewer,{scope:'unrelated-qualified-scope',stage:'review',role:'qa',review_of:subject}),`qualified-review-admit-${sequence}`);
  const finished=model.createRuntimeObserver(f.ledger,f.actor).record('task/finish',{operation_id:`qualified-review-finish-${sequence}`,task_id:task.id,attempt_id:task.value.attempt.id,native_id:`qualified-unit-review-${sequence}`,observed_process:controlledProcess(9300+sequence,true),termination_confirmed:true,output:canonical({review:{subject,verdict:'Pass',reason:'Independent controlled exact-subject review',blockers:[]}})});
  assert.equal(finished.accepted,true);assert.ok(finished.review);
  const published=model.execute(f.ledger,{principal_id:author},'home/publish',{operation_id:`qualified-home-publish-${sequence}`,grant_id:`grant-${author}`,proposal_id:proposal.id,review_id:finished.review.id});
  assert.equal(published.value.status,'current');assert.equal(published.value.scope_qualification.protocol,'peer-home-scope-v1');return published;
}

test('a genuinely qualified unrelated home update remains a positive prelaunch currentness control',{timeout:10000},async t=>{
  // The second reviewer must be independent of the first published home's
  // contributor history as well as the author of the new proposal.
  const f=fixture(t,3),old=publishQualifiedUnrelatedHome(f,1),task=f.submit(undefined,{scope:'main-independent-scope'}),executor=controlledExecutor();
  const entered=stopBarrierDeferred(),release=stopBarrierDeferred();let admission;
  const api={...model,execute(...args){const result=model.execute(...args);if(args[2]==='task/admit'&&result.admitted){admission=result;entered.resolve();return release.promise.then(()=>result);}return result;}};
  const scheduler=preparedScheduler(f,executor,{model:api}),ticking=scheduler.tick();
  assert.equal(await Promise.race([entered.promise.then(()=>true),ticking.then(()=>false)]),true,'BOUNDARY_SETUP: main admission committed');
  const updated=publishQualifiedUnrelatedHome(f,2);assert.equal(updated.revision,old.revision+1);
  assert.equal(f.ledger.read(tx=>model.validateContext(tx,admission.context)),true,'BOUNDARY_SETUP: accepted P2 must qualify this unrelated change as compatible');
  release.resolve();await ticking;assert.equal(executor.jobs.length,1);assert.equal(executor.jobs[0].task.id,task.id);
  executor.jobs[0].finish();await scheduler.drain();assert.equal(f.read(task.id).value.status,'returned');
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,3); // two real review admissions + main
});

const malformedReviews={
  pass_with_blockers:review=>({...review,blockers:['Unresolved real condition']}),
  nonstring_blocker:review=>({...review,verdict:'Blocked',blockers:[123]}),
  nul_reason:review=>({...review,reason:'Invalid\u0000reason'}),
  oversized_reason:review=>({...review,reason:'r'.repeat(12001)})
};
for(const [variant,mutate] of Object.entries(malformedReviews))test('malformed canonical review '+variant+' fails semantically without losing raw output or physical closure',async t=>{
  const f=fixture(t),executor=controlledExecutor(),[author,reviewer]=f.owners;
  const proposal=model.execute(f.ledger,{principal_id:author},'home/propose',{operation_id:'malformed-review-proposal',grant_id:`grant-${author}`,scope:'review-check',home_id:'candidate',content:'Exact controlled candidate'});
  const subject={family:'proposals',id:proposal.id,revision:proposal.revision,sha256:proposal.sha256};
  const task=f.submit(reviewer,{scope:'review-check',stage:'review',role:'qa',review_of:subject}),scheduler=preparedScheduler(f,executor);
  await scheduler.tick();assert.equal(executor.jobs.length,1);
  const output=canonical({content:'Retained original malformed review',review:mutate({subject,context_sha256:executor.jobs[0].context.sha256,verdict:'Pass',reason:'Exact reviewed evidence',blockers:[]})});
  executor.jobs[0].finish({output});await scheduler.drain();
  const result=f.read(task.id).value;assert.equal(result.status,'failed');assert.equal(result.review_id,null);
  assert.equal(result.result.output,output);assert.equal(result.result.termination_confirmed,true);
  assert.ok(result.result.error);assert.equal(f.ledger.read(tx=>tx.count('reviews',{})),0);
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'released');
  assert.ok(taskJournal(f,task.id).every(row=>row.value.status===OBSERVATION_STATUS.ack));
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);
});

test('escaped Unicode Error and complete cause graph fit the protected error bound without losing evidence',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),scheduler=preparedScheduler(f,executor);
  const deepest=new Error('Original deepest Unicode cause 🙂'),inner=new Error('Inner escaped cause\u0000'.repeat(100),{cause:deepest});
  const cause=new AggregateError([inner],'Original complete aggregate cause',{cause:deepest});
  const original=Object.assign(new Error('\u0000'.repeat(600)+'🙂'.repeat(100),{cause}),{code:'\u0000'.repeat(300)+'🙂'.repeat(40)});
  await scheduler.tick();executor.jobs[0].finish({error:original,output:'Exact original error-associated output'});await scheduler.drain();
  const result=f.read(task.id).value;assert.equal(result.status,'failed');assert.equal(result.result.termination_confirmed,true);
  assert.equal(result.result.output,'Exact original error-associated output');assert.ok(Buffer.byteLength(canonical(result.result.error))<=4000);
  assert.ok(scheduler.errors.includes(original));assert.equal(original.cause,cause);assert.equal(cause.errors[0],inner);assert.equal(inner.cause,deepest);
  const retained=f.ledger.read(tx=>tx.list('work_items',{scope:'p3-runtime-evidence-v1',task_id:task.id,limit:100}).items.find(row=>row.value.kind==='result'));
  assert.ok(retained);const bytes=fs.readFileSync(retained.value.evidence.path),payload=canonical(JSON.parse(bytes).payload);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),retained.value.evidence.sha256);
  for(const text of [original.message,original.code,deepest.message,inner.message])assert.ok(payload.includes(canonical(text)),'Retain complete original Error/cause text');
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'released');
  assert.ok(taskJournal(f,task.id).every(row=>row.value.status===OBSERVATION_STATUS.ack));
});

test('native review producer receives the compact recursively sorted contract and an exact canonical example',async t=>{
  const f=fixture(t),subject={family:'proposals',id:'controlled-review-subject',revision:7,sha256:'b'.repeat(64)},context={text:'Exact controlled independent review context',sha256:'a'.repeat(64)},calls=[];
  const executor=createNativeExecutor({cwd:f.root,evidence_dir:path.join(f.root,'producer-evidence'),probe:async()=>({available:true,authenticated:true}),
    runner:async(...args)=>{calls.push(args);return {native_id:'controlled-producer-native',text:canonical({content:'Controlled output'})};}});
  await executor.execute({task:{value:{role:'qa',review_of:subject}},context});
  assert.equal(calls.length,1);assert.equal(calls[0][1],null);
  const prompt=calls[0][2];assert.match(prompt,/RAW output must already be compact canonical JSON/);
  assert.match(prompt,/recursively sort every object's keys lexicographically/);assert.match(prompt,/include no formatting whitespace/);
  assert.match(prompt,/Pass requires an empty blockers array/);assert.match(prompt,/every blocker must be a nonempty string/);
  assert.match(prompt,/replace its content, reason, verdict and blockers with your actual evidence-based judgment/);
  const lines=prompt.split('\n').filter(line=>line.startsWith('{'));
  assert.equal(lines.length,1);const example=JSON.parse(lines[0]);assert.equal(canonical(example),lines[0]);
  assert.deepEqual(example.review.subject,subject);assert.equal(example.review.context_sha256,context.sha256);
  assert.equal(example.review.verdict,'Blocked');assert.ok(example.review.blockers.every(value=>typeof value==='string'&&value.trim()));
  assert.ok(prompt.endsWith(context.text));assert.match(prompt,/Never rewrite a negative judgment to satisfy formatting/);
});

test('protected observer commit then return loss recovers the exact finish without another execution or charge',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),actual=model.createRuntimeObserver(f.ledger,f.actor);
  const failure=new Error('Protected finish committed but its return was lost',{cause:new Error('Controlled observer return transport')});let lost=false,committed;
  const observer=Object.freeze({record(action,args){
    const result=actual.record(action,args);
    if(action==='task/finish'&&!lost){lost=true;committed=structuredClone(result);throw failure;}
    return result;
  }});
  const scheduler=preparedScheduler(f,executor,{observer});await scheduler.tick();
  const output='Exact original finish preceding protected observer return loss';executor.jobs[0].finish({output});await scheduler.drain();
  assert.equal(lost,true);assert.equal(committed.accepted,true);assert.equal(f.read(task.id).value.status,'returned');
  assert.deepEqual(f.read(task.id),committed.task);assert.equal(f.read(task.id).value.result.output,output);
  const commands=f.ledger.read(tx=>tx.list('commands',{principal_id:'software',limit:100}).items);
  assert.equal(commands.filter(row=>row.value.action==='task/finish').length,1);assert.equal(commands.length,3);
  assert.ok(scheduler.errors.includes(failure));assert.equal(failure.cause.message,'Controlled observer return transport');
  assert.ok(taskJournal(f,task.id).every(row=>row.value.status===OBSERVATION_STATUS.ack));
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'released');
  for(const key of ['usage',`usage:${f.owners[0]}`])assert.equal(f.ledger.read(tx=>tx.get('control',key)).value.model_calls,1);
  assert.equal(f.ledger.read(tx=>tx.get('grants',`grant-${f.owners[0]}`)).value.used_model_calls,1);
  await scheduler.tick();scheduler.stop();
  const replacement=preparedScheduler(f,executor),probes=executor.probes.length;await replacement.tick();await replacement.drain();
  assert.equal(executor.jobs.length,1);assert.equal(executor.probes.length,probes);
  assert.deepEqual(f.ledger.read(tx=>tx.list('commands',{principal_id:'software',limit:100}).items),commands);
  assert.deepEqual(f.read(task.id),committed.task);
});

test('closure callback before the first unknown result preserves that finish and releases only through separate closure',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor(),scheduler=preparedScheduler(f,executor);
  await scheduler.tick();const job=executor.jobs[0],output='Exact first uncertain output despite an already delivered close callback';
  const error={code:'ORIGINAL_UNCERTAIN',message:'First executor return explicitly reports uncertain termination'};
  job.onClosure({...job.observed_process,close_observed:true});
  job.finish({output,error,termination_confirmed:false});await scheduler.drain();
  const result=f.read(task.id).value;assert.equal(result.status,'quarantined');assert.equal(result.result.output,output);
  assert.equal(result.result.termination_confirmed,false);assert.deepEqual(result.result.error,error);
  assert.equal(result.closure.termination_confirmed,true);assert.equal(result.review_id,null);
  const rows=taskJournal(f,task.id);assert.deepEqual(rows.map(row=>row.value.payload.action),['task/process','task/finish','task/closure']);
  assert.equal(rows[1].value.payload.args.termination_confirmed,false);assert.equal(rows[1].value.payload.args.output,output);
  assert.deepEqual(rows[1].value.payload.args.error,error);assert.equal(rows[2].value.payload.args.termination_confirmed,true);
  assert.equal(rows[1].value.payload.predecessor_event_id,rows[0].id);assert.equal(rows[2].value.payload.predecessor_event_id,rows[1].id);
  assert.ok(rows.every(row=>row.value.status===OBSERVATION_STATUS.ack));
  const retained=f.ledger.read(tx=>tx.list('work_items',{scope:'p3-runtime-evidence-v1',task_id:task.id,limit:100}).items.find(row=>row.value.kind==='result'));
  const snapshot=JSON.parse(fs.readFileSync(retained.value.evidence.path,'utf8')).payload;
  assert.equal(snapshot.termination_confirmed,false);assert.equal(snapshot.output,output);assert.deepEqual(snapshot.error,error);
  assert.equal(f.ledger.read(tx=>tx.get('slots',task.id)).value.status,'released');
  assert.equal(f.ledger.read(tx=>tx.get('control','usage')).value.model_calls,1);await scheduler.tick();assert.equal(executor.jobs.length,1);
});

// Persistence claims distinguish an observed current write/close/readback from
// existing-file reuse, and never reinterpret arbitrary filesystem failures.
test('native evidence persistence verifies exact complete readback only after the observed write closes',async t=>{
  const f=fixture(t),directory=path.join(f.root,'post-close-evidence'),raw=canonical({content:'Complete write/close/readback evidence 你好🙂\u0000'}),trace=[];
  const original={native_id:'closed-readback-native',text:raw},executor=createNativeExecutor({cwd:f.root,evidence_dir:directory,probe:async()=>({available:true,authenticated:true}),runner:async()=>original});
  const open=fs.openSync,write=fs.writeFileSync,close=fs.closeSync,read=fs.readFileSync,sync=fs.fsyncSync;let observedFd,writeClosed=false;
  fs.openSync=function(file,flags,...rest){const fd=Reflect.apply(open,this,[file,flags,...rest]);if(typeof file==='string'&&file.startsWith(directory+path.sep)&&flags==='wx'){observedFd=fd;trace.push('exclusive-open');}return fd;};
  fs.writeFileSync=function(file,...rest){const result=Reflect.apply(write,this,[file,...rest]);if(file===observedFd)trace.push('complete-write');return result;};
  fs.fsyncSync=function(fd){if(fd===observedFd)trace.push('fsync');return Reflect.apply(sync,this,[fd]);};
  fs.closeSync=function(fd){const result=Reflect.apply(close,this,[fd]);if(fd===observedFd&&!writeClosed){trace.push('close');writeClosed=true;}return result;};
  fs.readFileSync=function(file,...rest){if(typeof file==='string'&&file.startsWith(directory+path.sep)){assert.ok(trace.includes('close'),'Readback must follow actual descriptor close');trace.push('readback');}return Reflect.apply(read,this,[file,...rest]);};
  let result;try{result=await executor.execute({task:{value:{role:'research'}},context:{text:'Exact complete readback context'}});}finally{fs.openSync=open;fs.writeFileSync=write;fs.closeSync=close;fs.readFileSync=read;fs.fsyncSync=sync;}
  assert.equal(result.error,undefined);assert.equal(result.output,raw);assert.equal(fs.readFileSync(result.result_evidence.path,'utf8'),raw);
  assert.deepEqual(trace,process.permission?['exclusive-open','complete-write','close','readback']:['exclusive-open','complete-write','fsync','close','readback']);
  assert.deepEqual(result.result_evidence.persistence,{write_closed:true,readback_verified:true,file_fsync:process.permission?'unavailable_node_permission_model':'performed'});
});

test('existing native evidence reuse verifies full bytes without claiming a new close or observed fsync',async t=>{
  const f=fixture(t),directory=path.join(f.root,'reused-evidence'),raw='Exact original reusable native evidence 你好🙂\r\n',executor=createNativeExecutor({cwd:f.root,evidence_dir:directory,probe:async()=>({available:true,authenticated:true}),runner:async()=>({native_id:'reused-evidence-native',text:raw})});
  const args={task:{value:{role:'research'}},context:{text:'Exact reuse fixture context'}},first=await executor.execute(args);
  assert.equal(first.error,undefined);assert.deepEqual(first.result_evidence.persistence,{write_closed:true,readback_verified:true,file_fsync:process.permission?'unavailable_node_permission_model':'performed'});
  const originalBytes=fs.readFileSync(first.result_evidence.path),sync=fs.fsyncSync;let syncCalls=0;
  fs.fsyncSync=function(...args){syncCalls++;return Reflect.apply(sync,this,args);};
  let second;try{second=await executor.execute(args);}finally{fs.fsyncSync=sync;}
  assert.equal(second.error,undefined);assert.equal(second.result_evidence.path,first.result_evidence.path);assert.equal(syncCalls,0);
  assert.deepEqual(second.result_evidence.persistence,{write_closed:false,readback_verified:true,file_fsync:'not_observed_existing_file'});
  assert.deepEqual(fs.readFileSync(second.result_evidence.path),originalBytes);assert.equal(second.result_evidence.sha256,createHash('sha256').update(originalBytes).digest('hex'));
});

for(const variant of ['write-EIO','write-EEXIST','fsync-EIO','fsync-ERR_ACCESS_DENIED','fsync-EEXIST','close-EIO','close-ERR_ACCESS_DENIED','close-EEXIST','readback-EIO','readback-ERR_ACCESS_DENIED'])test('native evidence preserves genuine '+variant+' without broad filesystem-error suppression',async t=>{
  const stage=variant.slice(0,variant.indexOf('-')),code=variant.slice(variant.indexOf('-')+1),f=fixture(t),directory=path.join(f.root,'persistence-fault');
  const cause=new Error('Original '+variant+' cause'),failure=Object.assign(new Error('Genuine controlled '+variant+' unrelated to disabled-API detection',{cause}),{code});
  const original={native_id:'persistence-original-native',text:'Complete original output retained after '+variant,model_evidence:{complete:'Original model diagnostics',nested:['你好🙂',false]},extra_diagnostic:{complete:true}};
  const executor=createNativeExecutor({cwd:f.root,evidence_dir:directory,probe:async()=>({available:true,authenticated:true}),runner:async()=>original});
  const open=fs.openSync,write=fs.writeFileSync,sync=fs.fsyncSync,close=fs.closeSync,read=fs.readFileSync;let observedFd,calls=0,closed=false;
  fs.openSync=function(file,flags,...rest){const fd=Reflect.apply(open,this,[file,flags,...rest]);if(typeof file==='string'&&file.startsWith(directory+path.sep)&&flags==='wx')observedFd=fd;return fd;};
  fs.writeFileSync=function(file,...rest){if(stage==='write'&&file===observedFd){calls++;throw failure;}return Reflect.apply(write,this,[file,...rest]);};
  fs.fsyncSync=function(fd){if(stage==='fsync'&&fd===observedFd){calls++;throw failure;}return Reflect.apply(sync,this,[fd]);};
  fs.closeSync=function(fd){const result=Reflect.apply(close,this,[fd]);if(stage==='close'&&fd===observedFd&&!closed){closed=true;calls++;throw failure;}return result;};
  fs.readFileSync=function(file,...rest){if(stage==='readback'&&typeof file==='string'&&file.startsWith(directory+path.sep)){calls++;throw failure;}return Reflect.apply(read,this,[file,...rest]);};
  let result;try{result=await executor.execute({task:{value:{role:'research'}},context:{text:'Exact persistence-fault context'}});}finally{fs.openSync=open;fs.writeFileSync=write;fs.fsyncSync=sync;fs.closeSync=close;fs.readFileSync=read;}
  if(stage==='fsync'&&process.permission){assert.equal(calls,0,'Permission Model route must never invoke the disabled fsync API');assert.equal(result.error,undefined);assert.deepEqual(result.result_evidence.persistence,{write_closed:true,readback_verified:true,file_fsync:'unavailable_node_permission_model'});}
  else{assert.equal(calls,1);assert.equal(result.original_error,failure);assert.equal(result.original_error.cause,cause);assert.equal(result.error.code,code);assert.deepEqual(result.original_result,original);assert.deepEqual(result.model_evidence,original.model_evidence);assert.equal(result.raw_output,original.text);assert.equal(result.native_id,original.native_id);assert.equal(result.result_evidence,undefined);assert.equal(result.termination_confirmed,true);}
  if(variant==='write-EIO'){
    // A close failure must not replace an already observed write failure.
    const bothDirectory=directory+'-simultaneous',closeFailure=Object.assign(new Error('Independent close failure',{cause:new Error('Original close cause')}),{code:'EIO'});
    const bothExecutor=createNativeExecutor({cwd:f.root,evidence_dir:bothDirectory,probe:async()=>({available:true,authenticated:true}),runner:async()=>original});let bothFd;
    fs.openSync=function(file,flags,...rest){const fd=Reflect.apply(open,this,[file,flags,...rest]);if(typeof file==='string'&&file.startsWith(bothDirectory+path.sep)&&flags==='wx')bothFd=fd;return fd;};
    fs.writeFileSync=function(file,...rest){if(file===bothFd)throw failure;return Reflect.apply(write,this,[file,...rest]);};
    fs.closeSync=function(fd){const result=Reflect.apply(close,this,[fd]);if(fd===bothFd)throw closeFailure;return result;};
    let both;try{both=await bothExecutor.execute({task:{value:{role:'research'}},context:{text:'Exact simultaneous write/close failure context'}});}finally{fs.openSync=open;fs.writeFileSync=write;fs.closeSync=close;}
    assert.ok(both.original_error instanceof AggregateError);assert.equal(both.original_error.cause,failure);assert.equal(both.original_error.errors[0],failure);assert.equal(both.original_error.errors[1],closeFailure);
    assert.deepEqual(both.original_result,original);assert.equal(both.raw_output,original.text);assert.equal(both.result_evidence,undefined);
  }
});

test('native evidence rejects altered post-close bytes instead of claiming verified persistence',async t=>{
  const f=fixture(t),directory=path.join(f.root,'changed-readback'),original={native_id:'altered-readback-native',text:'Complete original raw result must remain unchanged'};
  const executor=createNativeExecutor({cwd:f.root,evidence_dir:directory,probe:async()=>({available:true,authenticated:true}),runner:async()=>original}),read=fs.readFileSync;let altered=0;
  fs.readFileSync=function(file,...rest){if(typeof file==='string'&&file.startsWith(directory+path.sep)){altered++;fs.writeFileSync(file,'Different actual bytes after the observed close');}return Reflect.apply(read,this,[file,...rest]);};
  let result;try{result=await executor.execute({task:{value:{role:'research'}},context:{text:'Exact altered readback context'}});}finally{fs.readFileSync=read;}
  assert.equal(altered,1);assert.ok(result.original_error);assert.match(result.original_error.message,/evidence|readback|mismatch|collision/i);assert.equal(result.result_evidence,undefined);
  assert.equal(result.raw_output,original.text);assert.deepEqual(result.original_result,original);assert.equal(result.native_id,original.native_id);
});

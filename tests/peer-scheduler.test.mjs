import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
import {PeerLedger,installPeerSchema} from '../plugins/soloco/runtime/peers/ledger.mjs';
import * as model from '../plugins/soloco/runtime/peers/model.mjs';
import {PeerScheduler,createNativeExecutor} from '../plugins/soloco/runtime/peers/scheduler.mjs';

function fixture(t,n=2,{budget=100,hosts={}}={}) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'peer-scheduler-'))),directory=path.join(root,'.company');
  fs.mkdirSync(directory);
  const db=new DatabaseSync(path.join(directory,'company.sqlite'));
  db.exec('CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER NOT NULL); INSERT INTO company_layout VALUES(1,5);');
  installPeerSchema(db,{company_id:'scheduler-test'});db.close();
  const ledger=new PeerLedger(root),founder={principal_id:'founder'},actor={principal_id:'software'};
  const owners=Array.from({length:n},(_,i)=>`cos-${String(i).padStart(2,'0')}`);
  ledger.write('test.bootstrap','founder',tx=>{
    tx.put('control','company',{protocol:'peer-cos-v1',founder_principal_id:'founder',policy_generation:1,pause_generation:1,paused:false,
      policy:{worker_cap:3,queue_limit:100,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:budget,review_aging_ms:0}},0);
    tx.put('principals','founder',{kind:'founder',status:'active',host:'codex'},0);
    tx.put('principals','software',{kind:'scheduler',status:'active',host:'codex'},0);
    for(const id of owners)tx.put('principals',id,{kind:'cos',status:'active',host:hosts[id]??'codex'},0);
  });
  for(const owner of owners)model.execute(ledger,founder,'grant/create',{operation_id:`grant-${owner}`,grant_id:`grant-${owner}`,to_principal_id:owner,scope:'*',actions:['task/*','home/*'],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Isolated equal-budget test authority',max_model_calls:budget});
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
    execute(args){active++;maxActive=Math.max(maxActive,active);return new Promise(resolve=>{
      jobs.push({...args,finish(result={}){active--;const v=args.task.value;
        const output=JSON.stringify({content:'Observed isolated fixture result',...(v.review_of?{review:{subject:v.review_of,context_sha256:args.context.sha256,verdict:'Pass',reason:'Exact fixture subject checked',blockers:[]}}:{})});
        resolve({output,native_id:`native-${args.task.id}`,termination_confirmed:true,...result});}});
    });}
  };
}

test('1/2/4/8 simulated CoSes share the same twelve-call budget and three slots',async t=>{
  for(const n of [1,2,4,8])await t.test(`${n} peers`,async t=>{
    const f=fixture(t,n,{budget:12}),executor=controlledExecutor(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
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
  const f=fixture(t),executor=controlledExecutor(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
  await scheduler.tick();await scheduler.tick();assert.equal(executor.probes.length,0);assert.equal(executor.jobs.length,0);
  for(let i=0;i<4;i++)f.submit();await scheduler.tick();const probes=executor.probes.length;
  for(let i=0;i<5;i++)await scheduler.tick();assert.equal(executor.jobs.length,3);assert.equal(executor.probes.length,probes);
  for(const job of executor.jobs)job.finish();await scheduler.drain();
});

test('duplicate and concurrent scheduler ticks never launch the same attempt twice',async t=>{
  const f=fixture(t),executor=controlledExecutor(),one=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor}),two=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
  for(let i=0;i<6;i++)f.submit(f.owners[i%2]);
  await Promise.all([...Array.from({length:10},()=>one.tick()),two.tick()]);
  assert.equal(executor.jobs.length,3);assert.equal(new Set(executor.jobs.map(x=>x.task.value.attempt.id)).size,3);
  for(const job of executor.jobs)job.finish();await Promise.all([one.drain(),two.drain()]);
});

test('three uncertain native processes retain all slots; late closure never accepts old output',async t=>{
  const f=fixture(t),executor=controlledExecutor(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
  for(let i=0;i<4;i++)f.submit();await scheduler.tick();const attempts=executor.jobs.map(j=>j.task.value.attempt.id);
  for(const job of executor.jobs)job.finish({error:{code:'ROLE_PROCESS_ERROR',message:'Closure not observed'},termination_confirmed:false});
  await scheduler.drain();assert.equal((await scheduler.status()).available_slots,0);
  await scheduler.tick();assert.equal(executor.jobs.length,3);
  const first=executor.jobs[0];first.onClosure({pid:1234,termination_confirmed:true});await scheduler.drain();
  assert.equal(f.read(first.task.id).value.status,'quarantined');assert.equal(f.read(first.task.id).value.attempt.id,attempts[0]);
  assert.equal(f.read(first.task.id).value.result.termination_confirmed,false);
  await scheduler.tick();assert.equal(executor.jobs.length,4);executor.jobs[3].finish();await scheduler.drain();
});

test('a restarted scheduler holds detached admitted attempts instead of reexecuting',async t=>{
  const f=fixture(t),executor=controlledExecutor(),old=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
  for(let i=0;i<3;i++)f.submit();await old.tick();
  const replacement=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
  const before=executor.probes.length;await replacement.tick();
  assert.equal(executor.jobs.length,3);assert.equal(executor.probes.length,before);assert.equal((await replacement.status()).detached_slots,3);
  for(const job of executor.jobs)job.finish();await old.drain();
});

test('pause remains responsive and late successful output is quarantined',async t=>{
  const f=fixture(t),executor=controlledExecutor(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
  const task=f.submit();await scheduler.tick();
  model.execute(f.ledger,f.founder,'company/pause',{operation_id:'pause',source_instruction:'Stop new work'});
  assert.equal((await scheduler.status()).paused,true);await scheduler.tick();assert.equal(executor.jobs[0].signal.aborted,true);
  executor.jobs[0].finish();await scheduler.drain();assert.equal(f.read(task.id).value.status,'quarantined');
});

test('revoked grant between readiness and admission consumes no native attempt',async t=>{
  const f=fixture(t),task=f.submit(),executor=controlledExecutor();
  executor.probe=async()=>{model.execute(f.ledger,f.founder,'grant/revoke',{operation_id:'revoke',grant_id:`grant-${f.owners[0]}`});return {available:true,authenticated:true};};
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
  await scheduler.tick();assert.equal(executor.jobs.length,0);assert.equal(f.read(task.id).value.attempt,null);
});

test('changed required context aborts running work and cannot publish late results',async t=>{
  const f=fixture(t),executor=controlledExecutor();
  f.ledger.write('test.home','founder',tx=>tx.put('homes','global-rule',{status:'current',scope:'*',content:'Required original rule'},0));
  const task=f.submit(),scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});await scheduler.tick();
  f.ledger.write('test.change','founder',tx=>{const row=tx.get('homes','global-rule');return tx.put('homes',row.id,{...row.value,content:'Changed mandatory rule'},row.revision);});
  await scheduler.tick();assert.equal(executor.jobs[0].signal.aborted,true);executor.jobs[0].finish();await scheduler.drain();
  assert.equal(f.read(task.id).value.status,'quarantined');
});

test('fair principal rotation admits scarce independent review and preserves native provenance',async t=>{
  const f=fixture(t),executor=controlledExecutor(),[author,reviewer]=f.owners;
  const proposal=model.execute(f.ledger,{principal_id:author},'home/propose',{operation_id:'proposal',grant_id:`grant-${author}`,scope:'review-scope',home_id:'review-home',expected_revision:0,content:'Exact candidate'});
  for(let i=0;i<5;i++)f.submit(author);
  const review=f.submit(reviewer,{scope:'review-scope',stage:'review',role:'qa',review_of:{family:'proposals',id:proposal.id,revision:proposal.revision,sha256:proposal.sha256}});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});await scheduler.tick();
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
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});await scheduler.tick();
  executor.jobs[0].finish({output:JSON.stringify({content:'Looks good',review:{verdict:'Pass',reason:'No exact subject'}})});await scheduler.drain();
  assert.equal(f.read(task.id).value.status,'failed');assert.equal(f.read(task.id).value.review_id,null);
});

test('unavailable native host does not block a different ready host',async t=>{
  const f=fixture(t,2,{hosts:{'cos-00':'codex','cos-01':'claude'}}),executor=controlledExecutor();
  f.submit(f.owners[0]);const ready=f.submit(f.owners[1]);
  executor.probe=async({host})=>({host,available:host==='claude',authenticated:host==='claude'});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});await scheduler.tick();
  assert.equal(executor.jobs.length,1);assert.equal(executor.jobs[0].task.id,ready.id);assert.equal(executor.jobs[0].task.value.host,'claude');
  executor.jobs[0].finish();await scheduler.drain();
});

test('a held expired-grant candidate does not block unrelated ready work',async t=>{
  const f=fixture(t),executor=controlledExecutor(),held=f.submit(f.owners[0]),ready=f.submit(f.owners[1]);
  model.execute(f.ledger,f.founder,'grant/revoke',{operation_id:'revoke-held',grant_id:`grant-${f.owners[0]}`});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});await scheduler.tick();
  assert.equal(executor.jobs.length,1);assert.equal(executor.jobs[0].task.id,ready.id);assert.equal(f.read(held.id).value.attempt,null);
  executor.jobs[0].finish();await scheduler.drain();
});

test('unchanged per-task holds do not append an admission receipt every idle tick',async t=>{
  const f=fixture(t),executor=controlledExecutor();f.submit(f.owners[0]);
  model.execute(f.ledger,f.founder,'grant/revoke',{operation_id:'revoke-cache',grant_id:`grant-${f.owners[0]}`});
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor});
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
});

test('oversized native output is retained and held rather than truncated into success',async t=>{
  const f=fixture(t),raw='x'.repeat(2048),executor=createNativeExecutor({cwd:f.root,evidence_dir:path.join(f.root,'evidence'),max_result_bytes:1024,
    runner:async()=>({native_id:'observed-id',text:raw}),probe:async()=>({available:true,authenticated:true})});
  const result=await executor.execute({task:{value:{role:'research'}},context:{text:'Bounded exact context'}});
  assert.equal(result.error.code,'PEER_OUTPUT_LIMIT');assert.equal(result.output,undefined);assert.equal(result.termination_confirmed,true);
  assert.equal(fs.readFileSync(result.result_evidence.path,'utf8'),raw);
});

test('real adapter lifecycle remains uncertain after escalation and observes later close separately',async t=>{
  const f=fixture(t),child=new EventEmitter(),timers=new Map(),processes=[],closures=[];let clock=1000000,seq=0;
  child.pid=4242;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>true;
  const executor=createNativeExecutor({cwd:f.root,evidence_dir:path.join(f.root,'evidence'),now:()=>clock,spawn_process:()=>child,
    probe:async()=>({available:true,authenticated:true}),runner:(host,id,prompt,cwd,timeout,selection,options)=>runModel(host,id,prompt,cwd,timeout,selection,{...options,
      resolveExecutable:()=>'/fictional/codex',now:()=>clock,setTimeout:(fn,delay)=>{const key=++seq;timers.set(key,{fn,at:clock+delay});return key;},clearTimeout:key=>timers.delete(key)})});
  const resultPromise=executor.execute({task:{value:{role:'research'}},context:{text:'Exact fixture context'},onProcess:p=>processes.push(p),onClosure:p=>closures.push(p)});
  child.emit('spawn');assert.equal(processes[0].pid,4242);assert.ok(processes[0].execution_deadline_at);
  child.emit('error',new Error('Simulated process failure'));
  const kill=[...timers.values()].sort((a,b)=>a.at-b.at)[0];clock=kill.at;kill.fn();
  const result=await resultPromise;assert.equal(result.termination_confirmed,false);assert.equal(result.error.code,'ROLE_PROCESS_ERROR');assert.equal(closures.length,0);
  child.emit('close',null);assert.equal(closures.length,1);assert.equal(closures[0].termination_confirmed,true);
});

test('lost finish acknowledgement retries the same receipt without another execution',async t=>{
  const f=fixture(t),executor=controlledExecutor(),task=f.submit();let lose=true;
  const api={...model,execute(...args){const result=model.execute(...args);if(args[2]==='task/finish'&&lose){lose=false;throw new Error('Simulated acknowledgement loss');}return result;}};
  const scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'software',executor,model:api});await scheduler.tick();
  executor.jobs[0].finish();await scheduler.drain();assert.equal(f.read(task.id).value.status,'returned');assert.equal(scheduler.inflight.size,1);
  await scheduler.tick();assert.equal(scheduler.inflight.size,0);assert.equal(executor.jobs.length,1);
  assert.equal(f.ledger.read(tx=>tx.count('commands',{principal_id:'software'})),2);
});
